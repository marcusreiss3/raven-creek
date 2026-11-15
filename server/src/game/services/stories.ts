import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db, schema, type Tx } from '../../db/index.js';
import { MYSTERIES, fragmentById, type Mystery } from '../content/mysteries.js';
import { rng } from '../rules/rng.js';
import { assertCanAct, withCharacter } from './characters.js';
import { systemEmote } from './chat.js';
import { cfg, itemDef } from './config.js';
import { fail, gameLog } from './infra.js';
import { addItem, carryInfo, itemsOf, type CharRow } from './inventory.js';
import { emitAll, notify, pushScene, pushSelf } from './realtime.js';
import { getLocation } from './world.js';

const M = () => ({ findChance: 0.15, safeAttemptsPerHour: 4, muralMaxLength: 280, muralCooldownSeconds: 45, muralMaxPerLocation: 40, ...((cfg() as any).mysteries ?? {}) });
const fullName = (c: Pick<CharRow, 'firstName' | 'lastName'>) => `${c.firstName} ${c.lastName}`;

// ───────────────────────── Bilhetes ─────────────────────────
/** Texto de um bilhete (para o inventário). */
export function noteInfo(data: Record<string, unknown> | null | undefined) {
  const f = data?.fragmentId ? fragmentById(String(data.fragmentId)) : null;
  return f ? { mystery: f.mystery.title, title: f.fragment.title, text: f.fragment.text } : null;
}

/** Chamado ao terminar de vasculhar: talvez um bilhete de um mistério ainda não resolvido esteja aqui. */
export async function maybeFindNote(tx: Tx, ch: CharRow): Promise<string | null> {
  const here = MYSTERIES.flatMap((m) => m.fragments.filter((f) => f.locationIds.includes(ch.locationId)).map((f) => ({ m, f })));
  if (!here.length) return null;
  const found = await tx.select({ id: schema.mysteryFragments.fragmentId }).from(schema.mysteryFragments).where(inArray(schema.mysteryFragments.fragmentId, here.map((x) => x.f.id)));
  const left = here.filter((x) => !found.some((f) => f.id === x.f.id));
  if (!left.length || !rng.chance(M().findChance)) return null;
  const { m, f } = left[0];
  const ins = await tx.insert(schema.mysteryFragments).values({ fragmentId: f.id, mysteryId: m.id, foundBy: ch.id, foundByName: fullName(ch) }).onConflictDoNothing().returning();
  if (!ins.length) return null;
  await addItem(tx, 'character', ch.id, 'note', 1, { data: { fragmentId: f.id, mysteryId: m.id } });
  await tx.insert(schema.mysteries).values({ id: m.id }).onConflictDoNothing();
  const total = (await tx.select().from(schema.mysteryFragments).where(eq(schema.mysteryFragments.mysteryId, m.id))).length;
  await gameLog(tx, ch.id, 'event', `Você achou um bilhete: "${f.title}" (${m.title}, ${total}/${m.fragments.length}).`);
  notify(ch.userId, `Você achou um bilhete: "${f.title}". Leia na mochila; o texto também foi para o diário de todos (tecla J, aba Mistérios).`, 'success', 'note');
  emitAll('notify', { text: `${fullName(ch)} encontrou um bilhete de "${m.title}" (${total} de ${m.fragments.length}).`, level: 'info', icon: 'note', at: Date.now() });
  if (total >= m.fragments.length) await revealMystery(tx, m);
  return f.title;
}

async function revealMystery(tx: Tx, m: Mystery) {
  await tx.update(schema.mysteries).set({ status: 'revealed', revealedAt: new Date() }).where(eq(schema.mysteries.id, m.id));
  if (m.kind === 'stash') {
    const [ct] = await tx.insert(schema.containers).values({ locationId: m.locationId, name: m.targetName, kind: 'stash', capacity: 200, data: { mysteryId: m.id } }).returning();
    for (const r of m.reward) await addItem(tx, 'container', ct.id, r.itemId, r.qty);
    pushScene(m.locationId);
  }
  emitAll('notify', { icon: 'search', text: `Todas as peças de "${m.title}" foram encontradas. ${m.kind === 'safe' ? 'Os números estão nos bilhetes…' : 'Os bilhetes dizem onde procurar…'} (diário, aba Mistérios)`, level: 'warn', at: Date.now() });
}

/** Diário compartilhado: o que o servidor já descobriu de cada mistério. */
export async function listMysteries() {
  const frags = await db.select().from(schema.mysteryFragments).orderBy(asc(schema.mysteryFragments.foundAt));
  const states = await db.select().from(schema.mysteries);
  return MYSTERIES.map((m) => {
    const st = states.find((s) => s.id === m.id);
    const got = frags.filter((f) => f.mysteryId === m.id);
    const started = got.length > 0;
    return {
      id: m.id, title: started ? m.title : 'Mistério desconhecido', teaser: started ? m.teaser : 'Ninguém achou nenhum bilhete deste ainda. Vasculhe casas, escritórios, o hospital, a floresta…',
      total: m.fragments.length, found: got.length, status: st?.status ?? 'open', claimedBy: st?.claimedBy ?? null, kind: m.kind,
      fragments: m.fragments.map((f) => {
        const g = got.find((x) => x.fragmentId === f.id);
        return g ? { id: f.id, found: true, title: f.title, text: f.text, foundBy: g.foundByName, foundAt: g.foundAt } : { id: f.id, found: false, hint: started ? `Perdido em algum lugar: ${f.hint}.` : '???' };
      }),
    };
  });
}

/** Cofres de mistério visíveis num local (ainda fechados). */
export async function safesAt(locationId: string, tx: Tx = db) {
  const ms = MYSTERIES.filter((m) => m.kind === 'safe' && m.locationId === locationId);
  if (!ms.length) return [];
  const st = await tx.select().from(schema.mysteries).where(inArray(schema.mysteries.id, ms.map((m) => m.id)));
  return ms.filter((m) => st.find((s) => s.id === m.id)?.status !== 'claimed').map((m) => ({ mysteryId: m.id, name: m.targetName, digits: m.code?.length ?? 4 }));
}

const attempts = new Map<number, number[]>();
export async function openSafe(characterId: number, mysteryId: string, code: string) {
  const m = MYSTERIES.find((x) => x.id === mysteryId && x.kind === 'safe');
  if (!m) fail('Cofre desconhecido.');
  const res = await withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch);
    if (ch.locationId !== m!.locationId) fail('O cofre não está aqui.');
    const now = Date.now();
    const recent = (attempts.get(ch.id) ?? []).filter((t) => t > now - 3_600_000);
    if (recent.length >= M().safeAttemptsPerHour) fail('Seus dedos já estão dormentes de tanto girar o disco. Tente de novo mais tarde.');
    attempts.set(ch.id, [...recent, now]);
    await tx.insert(schema.mysteries).values({ id: m!.id }).onConflictDoNothing();
    const [st] = await tx.select().from(schema.mysteries).where(eq(schema.mysteries.id, m!.id)).for('update');
    if (st?.status === 'claimed') fail('O cofre já está aberto — e vazio.');
    if (code.replace(/\D/g, '') !== m!.code) {
      await systemEmote(ch.locationId, `${fullName(ch)} gira o disco do cofre… clique, clique. Nada.`);
      return { ok: true, opened: false, left: M().safeAttemptsPerHour - recent.length - 1 };
    }
    const items = await itemsOf(tx, 'character', ch.id); let carry = carryInfo(items, ch);
    for (const r of m!.reward) {
      const w = (itemDef(r.itemId)?.weight ?? 0) * r.qty; const over = carry.weight + w > carry.capacity * 1.5;
      await addItem(tx, over ? 'location' : 'character', over ? ch.locationId : ch.id, r.itemId, r.qty);
      if (!over) carry = { ...carry, weight: carry.weight + w };
    }
    await tx.update(schema.mysteries).set({ status: 'claimed', claimedBy: fullName(ch), claimedAt: new Date() }).where(eq(schema.mysteries.id, m!.id));
    await systemEmote(ch.locationId, `Clac. A porta do cofre se abre nas mãos de ${fullName(ch)}.`, 'system');
    await gameLog(tx, ch.id, 'event', `Você abriu "${m!.targetName}": ${m!.reward.map((r) => `${itemDef(r.itemId)?.name ?? r.itemId} ×${r.qty}`).join(', ')}.`);
    notify(ch.userId, `O cofre abriu! ${m!.reward.map((r) => `${itemDef(r.itemId)?.name ?? r.itemId}${r.qty > 1 ? ` ×${r.qty}` : ''}`).join(', ')}.`, 'success');
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true, opened: true, by: fullName(ch) };
  });
  if (res.opened) emitAll('notify', { icon: 'safe', text: `${res.by} abriu "${m!.targetName}" — o mistério "${m!.title}" foi resolvido.`, level: 'warn', at: Date.now() });
  return res;
}

/** Quando um esconderijo de mistério é esvaziado pela primeira vez, registra quem levou. */
export async function markStashClaimed(tx: Tx, containerId: number, ch: CharRow) {
  const [ct] = await tx.select().from(schema.containers).where(eq(schema.containers.id, containerId));
  const mid = ct?.kind === 'stash' ? String((ct.data as any)?.mysteryId ?? '') : '';
  if (!mid) return;
  const [st] = await tx.select().from(schema.mysteries).where(eq(schema.mysteries.id, mid));
  if (!st || st.status === 'claimed') return;
  await tx.update(schema.mysteries).set({ status: 'claimed', claimedBy: fullName(ch), claimedAt: new Date() }).where(eq(schema.mysteries.id, mid));
  const m = MYSTERIES.find((x) => x.id === mid);
  if (m) emitAll('notify', { icon: 'safe', text: `${fullName(ch)} achou "${m.targetName}" — o mistério "${m.title}" foi resolvido.`, level: 'warn', at: Date.now() });
}

// ───────────────────────── Mural de recados ─────────────────────────
export async function muralCount(locationId: string, tx: Tx = db) {
  return (await tx.select({ id: schema.muralPosts.id }).from(schema.muralPosts).where(eq(schema.muralPosts.locationId, locationId))).length;
}

export async function listMural(characterId: number) {
  const [ch] = await db.select().from(schema.characters).where(eq(schema.characters.id, characterId));
  if (!ch) fail('Personagem não encontrado.');
  if (ch!.state === 'traveling') fail('Você está na estrada.');
  const posts = await db.select().from(schema.muralPosts).where(eq(schema.muralPosts.locationId, ch!.locationId)).orderBy(desc(schema.muralPosts.createdAt)).limit(M().muralMaxPerLocation);
  return { ok: true, locationName: getLocation(ch!.locationId)?.name ?? ch!.locationId, posts: posts.map((p) => ({ id: p.id, authorName: p.authorName, content: p.content, createdAt: p.createdAt, characterId: p.characterId })) };
}

const lastPost = new Map<number, number>();
export async function postMural(characterId: number, raw: string) {
  const content = raw.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, M().muralMaxLength);
  if (content.length < 2) fail('Escreva alguma coisa.');
  const wait = (lastPost.get(characterId) ?? 0) + M().muralCooldownSeconds * 1000 - Date.now();
  if (wait > 0) fail(`Espere ${Math.ceil(wait / 1000)}s para escrever de novo.`);
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: true });
    if (ch.state === 'traveling') fail('Você está na estrada.');
    await tx.insert(schema.muralPosts).values({ locationId: ch.locationId, characterId: ch.id, userId: ch.userId, authorName: fullName(ch), content });
    const old = await tx.select({ id: schema.muralPosts.id }).from(schema.muralPosts).where(eq(schema.muralPosts.locationId, ch.locationId)).orderBy(desc(schema.muralPosts.createdAt)).offset(M().muralMaxPerLocation);
    if (old.length) await tx.delete(schema.muralPosts).where(inArray(schema.muralPosts.id, old.map((o) => o.id)));
    lastPost.set(characterId, Date.now());
    await systemEmote(ch.locationId, `${fullName(ch)} rabisca um recado no mural.`);
    pushScene(ch.locationId);
    return { ok: true };
  });
}

export async function deleteMural(characterId: number, postId: number, staff: boolean) {
  const [p] = await db.select().from(schema.muralPosts).where(eq(schema.muralPosts.id, postId));
  if (!p) fail('Recado não encontrado.');
  const [ch] = await db.select().from(schema.characters).where(eq(schema.characters.id, characterId));
  if (!staff && (p!.characterId !== characterId || ch?.locationId !== p!.locationId)) fail('Você só pode arrancar seus próprios recados, estando no local.');
  await db.delete(schema.muralPosts).where(eq(schema.muralPosts.id, postId));
  pushScene(p!.locationId);
  return { ok: true };
}
