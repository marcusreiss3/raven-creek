/**
 * Motor do Dia 1: prólogo jogável pelo celular, com hora marcada.
 *
 * Grupos avançam por batidas de roteiro (content/dia1). Mensagens chegam no celular com ritmo; perguntas viram enquetes
 * (grupo), escolhas individuais, segredos ou ligações; dados decidem testes; combates usam o tabuleiro tático. Grupos se
 * separam por escolhas e se juntam em pontos de encontro. No fim, cada um recebe a crônica do dia e cai no mundo aberto.
 *
 * Regras de morte: até o ato 3 ninguém morre (perda de sangue vira desmaio); nos atos 4–5 a morte da história marca o
 * jogador como espectador e é aplicada de verdade no fim da sessão.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema, type Tx } from '../../db/index.js';
import { AMBIENT } from '../content/dia1/ambient.js';
import { assignFamilies, familyById, type FamMsg, type FamilySlot } from '../content/dia1/family.js';
import { TIMELINE, SESSION_MINUTES, MARKS, getBeat, getTrack, trackForProfession, TRACKS, ACT_START, ACT_END, remainingInAct, mapDesignMinute, actAtMinute, isFreeTrack, freeLocalEvent, freeGlobalEvents } from '../content/dia1/index.js';
import type { Ask, Beat, Cond, Effect, Msg, Option, Who } from '../content/dia1/types.js';
import { REGIONS } from '../content/items.js';
import { makeWound } from '../rules/body.js';
import { rng } from '../rules/rng.js';
import { cfg, setGameTime } from './config.js';
import { addItem, itemsOf } from './inventory.js';
import { getLocation } from './world.js';
import { emitToUser, isUserOnline, pushScene, pushSelf } from './realtime.js';
import { gameLog, withLock } from './infra.js';
import { isPaused } from './serverStatus.js';

type GroupRow = typeof schema.prologueGroups.$inferSelect;
type MemberRow = typeof schema.prologueMembers.$inferSelect;
type CharRow = typeof schema.characters.$inferSelect;
type SessionRow = typeof schema.prologueSessions.$inferSelect;

// ───────────────────────────── Estado em memória
let session: SessionRow | null = null;
const members = new Set<number>(); // characterIds na sessão ativa
const lobby = new Map<number, number>(); // characterId → último "estou aqui" na sala de espera
/** Última pessoa escolhida/sorteada em cada grupo: é o {escolhido} das mensagens seguintes. */
const lastChooser = new Map<number, number>();

export const prologueRunning = () => !!session && session.status === 'running';
export const isPrologueMember = (characterId: number) => prologueRunning() && members.has(characterId);
export const activePrologue = () => (prologueRunning() ? session : null);
export function lobbyPing(characterId: number) { lobby.set(characterId, Date.now()); }
export const lobbyPresent = () => [...lobby.entries()].filter(([, t]) => Date.now() - t < 20_000).map(([id]) => id);

/** Minuto da história (acelerado pelo `speed` do ensaio). */
export function sessionMinute(s = session, now = Date.now()) {
  if (!s) return 0;
  return ((now - s.startedAt.getTime()) * s.speed) / 60_000;
}
/** Converte segundos de roteiro em ms reais (o ensaio acelera tudo). */
const ms = (seconds: number) => (seconds * 1000) / (session?.speed ?? 1);
export const actAt = actAtMinute;
/** Fim previsto (ms) — usado na tela de quem chegou atrasado. */
export const prologueEndsAt = () => (session ? session.startedAt.getTime() + (SESSION_MINUTES * 60_000) / session.speed : null);

/** Família (do celular) de cada personagem do Dia 1. */
const famOf = new Map<number, string>();
const famFromFlags = (flags: Record<string, boolean>) => Object.keys(flags ?? {}).find((k) => k.startsWith('fam:'))?.slice(4);

export async function loadPrologue() {
  const [s] = await db.select().from(schema.prologueSessions).where(eq(schema.prologueSessions.status, 'running')).limit(1);
  session = s ?? null; members.clear(); famOf.clear();
  if (s) for (const m of await db.select().from(schema.prologueMembers).where(eq(schema.prologueMembers.sessionId, s.id))) { members.add(m.characterId); const f = famFromFlags(m.flags); if (f) famOf.set(m.characterId, f); }
  const { allItemDefs } = await import('./config.js');
  setItemNames(Object.fromEntries(allItemDefs().map((d) => [d.id, d.name])));
}

// ───────────────────────────── Entrega de eventos
const first = (name: string) => name.split(' ')[0];
type Ctx = { names: Record<number, string>; chooser?: number; location?: string; others?: string[] };
function fill(text: string, recipient: number | null, ctx: Ctx) {
  const all = Object.values(ctx.names).map(first);
  return text
    .replaceAll('{nome}', recipient ? first(ctx.names[recipient] ?? '') : '')
    .replaceAll('{familiaA}', recipient ? familyById(famOf.get(recipient)).a : 'Família')
    .replaceAll('{grupo}', all.length > 1 ? `${all.slice(0, -1).join(', ')} e ${all.at(-1)}` : all[0] ?? '')
    .replaceAll('{escolhido}', ctx.chooser ? first(ctx.names[ctx.chooser] ?? '') : 'alguém')
    .replaceAll('{outros}', ctx.others?.length ? (ctx.others.length > 1 ? `${ctx.others.slice(0, -1).join(', ')} e ${ctx.others.at(-1)}` : ctx.others[0]) : 'Outros sobreviventes')
    .replaceAll('{local}', getLocation(ctx.location ?? '')?.name ?? '');
}

/** Mensagem da família para uma pessoa (com respostas prontas, se houver). `ref` permite achar a resposta depois. */
async function deliverFamily(tx: Tx, r: { characterId: number; userId: number }, msg: FamMsg, ref: string, firstName: string) {
  const fam = familyById(famOf.get(r.characterId));
  return deliver(tx, [r], 'msg', 'familia', {
    ref: `f|${ref}`, from: msg.from === 'a' ? fam.a : fam.b, text: msg.text.replaceAll('{nome}', firstName),
    ...(msg.replies?.length ? { replies: msg.replies.map((x) => x.text), famRef: `${fam.id}|${ref}` } : {}),
  });
}
function famMsgByRef(ref: string): FamMsg | undefined {
  const [fid, kind, a, b] = ref.split('|');
  const fam = familyById(fid);
  if (kind === 'slot') return fam.slots[a as FamilySlot];
  if (kind === 'amb') return fam.ambient[Number(a)]?.[Number(b)];
  return undefined;
}

/** Resposta pronta a uma mensagem da família: vai como SMS e o parente responde uma vez. */
export async function familyReply(characterId: number, eventId: number, idx: number) {
  if (!session) throw new Error('Você não está no Dia 1.');
  const [m] = await db.select().from(schema.prologueMembers).where(eq(schema.prologueMembers.characterId, characterId));
  if (!m || m.sessionId !== session.id || m.status !== 'active') throw new Error('Você não pode responder agora.');
  if (m.battery <= 0) throw new Error('O celular está sem bateria.');
  const [e] = await db.select().from(schema.prologueEvents).where(and(eq(schema.prologueEvents.id, eventId), eq(schema.prologueEvents.characterId, characterId)));
  const p = e?.payload as Record<string, any> | undefined;
  if (!e || !p?.replies || typeof p.famRef !== 'string') throw new Error('Essa mensagem não tem resposta.');
  if (p.replied !== undefined) throw new Error('Você já respondeu.');
  const text = p.replies[idx]; if (typeof text !== 'string') throw new Error('Resposta inválida.');
  const msg = famMsgByRef(p.famRef.split('|').slice(0).join('|'));
  const r = { characterId, userId: m.userId };
  const signal = session.data.signal ?? 4;
  await db.transaction(async (tx) => {
    await tx.update(schema.prologueEvents).set({ payload: { ...p, replied: idx } }).where(eq(schema.prologueEvents.id, eventId));
    await deliver(tx, [r], 'msg', 'familia', { from: 'Você', text, mine: true, ...(signal < 2 ? { failed: true } : {}) });
  });
  const answer = msg?.replies?.[idx]?.answer;
  if (answer && signal >= 2) {
    const sid = session.id;
    setTimeout(() => {
      if (!session || session.id !== sid) return;
      void db.transaction((tx) => deliver(tx, [r], 'msg', 'familia', { ref: `fa|${eventId}`, from: p.from, text: answer })).catch(() => undefined);
    }, ms(7 + Math.random() * 12));
  }
  return { ok: true };
}

/**
 * Entrega um evento no celular. Com `payload.ref`, cada personagem recebe aquela mensagem no máximo uma vez
 * (o banco recusa a repetida): reiniciar o servidor ou repetir uma transação não duplica nada.
 * Retorna quantos receberam de fato.
 */
async function deliver(tx: Tx, recipients: { characterId: number; userId: number }[], kind: string, thread: string, payload: Record<string, any>) {
  if (!session || !recipients.length) return 0;
  const values = recipients.map((r) => ({ sessionId: session!.id, characterId: r.characterId, kind, thread, payload }));
  const rows = payload.ref
    ? await tx.insert(schema.prologueEvents).values(values).onConflictDoNothing().returning()
    : await tx.insert(schema.prologueEvents).values(values).returning();
  for (const row of rows) { const r = recipients.find((x) => x.characterId === row.characterId); if (r) emitToUser(r.userId, 'prologue:event', row); }
  return rows.length;
}

async function groupMembers(tx: Tx, groupId: number) {
  return tx.select().from(schema.prologueMembers).where(eq(schema.prologueMembers.groupId, groupId));
}
async function charsOf(tx: Tx, ids: number[]) {
  return ids.length ? tx.select().from(schema.characters).where(inArray(schema.characters.id, ids)) : [];
}
const nameOf = (c: CharRow) => `${c.firstName} ${c.lastName}`;

// ───────────────────────────── Condições
async function condOk(tx: Tx, c: Cond | undefined, g: GroupRow, ms_: MemberRow[], chars: CharRow[], recipient?: MemberRow) {
  if (!c) return true;
  const alive = ms_.filter((m) => m.status === 'active');
  const flagSet = (f: string) => (f.startsWith('self:') ? (recipient ? !!recipient.flags[f.slice(5)] : alive.some((m) => m.flags[f.slice(5)])) : !!g.flags[f]);
  if (c.flag && !flagSet(c.flag)) return false;
  if (c.notFlag && flagSet(c.notFlag)) return false;
  if (c.prof) {
    const pool = recipient ? chars.filter((ch) => ch.id === recipient.characterId) : chars.filter((ch) => alive.some((m) => m.characterId === ch.id));
    if (!pool.some((ch) => c.prof!.includes(ch.profession))) return false;
  }
  if (c.min && alive.length < c.min) return false;
  if (c.others !== undefined) {
    const here = await othersHere(tx, g, ms_);
    if (c.others !== here.length > 0) return false;
  }
  if (c.item) {
    let has = false;
    for (const m of alive) if ((await itemsOf(tx, 'character', m.characterId)).some((i) => i.defId === c.item)) { has = true; break; }
    if (!has) return false;
  }
  return true;
}

// ───────────────────────────── Efeitos
function pickWho(who: Who | undefined, alive: MemberRow[], chars: CharRow[], chooser?: number, used?: Set<number>): MemberRow[] {
  if (!alive.length) return [];
  const w = who ?? 'each';
  if (w === 'each') return alive;
  if (w === 'chooser') { const c = alive.find((m) => m.characterId === chooser); return [c ?? rng.pick(alive)]; }
  if (w === 'one') {
    const fresh = used ? alive.filter((m) => !used.has(m.characterId)) : alive;
    const p = rng.pick(fresh.length ? fresh : alive); used?.add(p.characterId); return [p];
  }
  if (w.startsWith('flag:')) { const f = w.slice(5); return alive.filter((m) => m.flags[f]); }
  if (w.startsWith('prof:')) {
    const p = w.slice(5);
    return alive.filter((m) => chars.find((c) => c.id === m.characterId)?.profession === p);
  }
  return alive;
}

let _names: Record<string, string> = {};
export function setItemNames(map: Record<string, string>) { _names = map; }
const itemName = (id: string) => _names[id] ?? id;

async function applyEffects(tx: Tx, g: GroupRow, effects: Effect[] | undefined, act: number, ctx: Ctx) {
  if (!effects?.length) return;
  const ms_ = await groupMembers(tx, g.id);
  const alive = ms_.filter((m) => m.status === 'active');
  const chars = await charsOf(tx, alive.map((m) => m.characterId));
  const used = new Set<number>();
  for (const e of effects) {
    if ('flag' in e && (e.to === 'group' || e.to === undefined)) { g.flags = { ...g.flags, [e.flag]: true }; await tx.update(schema.prologueGroups).set({ flags: g.flags }).where(eq(schema.prologueGroups.id, g.id)); continue; }
    const targets = pickWho((e as { to?: Who }).to, alive, chars, ctx.chooser, used);
    for (const m of targets) {
      const ch = chars.find((c) => c.id === m.characterId)!; const to = [{ characterId: m.characterId, userId: m.userId }];
      if ('item' in e) {
        if (!_names[e.item]) continue;
        await addItem(tx, 'character', ch.id, e.item, e.qty ?? 1);
        await deliver(tx, to, 'system', 'sistema', { text: `Você guardou: ${itemName(e.item)}${(e.qty ?? 1) > 1 ? ` ×${e.qty}` : ''}.`, icon: 'inventory' });
        pushSelf(ch.id);
      } else if ('wound' in e) {
        const region = e.region ?? rng.pick(['left_arm', 'right_arm', 'left_leg', 'right_leg', 'torso', 'left_hand', 'right_hand']);
        if (!(REGIONS as readonly string[]).includes(region)) continue;
        const w = makeWound(e.wound, region, e.severity ?? 0.35, 'Dia 1');
        const [row] = await tx.insert(schema.wounds).values({ characterId: ch.id, ...w }).returning();
        if (e.infect && rng.chance(e.infect)) {
          const inf = cfg().infection; const speed = (inf.regionSpeed as Record<string, number>)[region] ?? 1;
          await tx.insert(schema.conditions).values({ characterId: ch.id, kind: 'zombie_infection', durationHours: inf.hoursToDeath * (1 + ((ch.attributes.endurance ?? 4) - 4) * 0.05), discovered: false, sourceWoundId: row.id, sourceRegion: region, data: { speed } });
        }
        pushSelf(ch.id);
      } else if ('stress' in e) {
        const n = { ...ch.needs, stress: Math.max(0, Math.min(100, (ch.needs.stress ?? 0) + e.stress)) };
        ch.needs = n;
        await tx.update(schema.characters).set({ needs: n }).where(eq(schema.characters.id, ch.id));
      } else if ('flag' in e) {
        m.flags = { ...m.flags, [e.flag]: true };
        await tx.update(schema.prologueMembers).set({ flags: m.flags }).where(eq(schema.prologueMembers.characterId, m.characterId));
      } else if ('mark' in e) {
        if (m.marks.includes(e.mark)) continue;
        m.marks = [...m.marks, e.mark];
        await tx.update(schema.prologueMembers).set({ marks: m.marks }).where(eq(schema.prologueMembers.characterId, m.characterId));
        const def = MARKS.find((x) => x.id === e.mark);
        await deliver(tx, to, 'mark', 'sistema', { mark: e.mark, name: def?.name ?? e.mark, text: def?.text ?? '' });
      } else if ('battery' in e) {
        m.battery = Math.max(0, Math.min(100, m.battery + e.battery));
        m.light = m.battery > 0 && m.light;
        await tx.update(schema.prologueMembers).set({ battery: m.battery, light: m.light }).where(eq(schema.prologueMembers.characterId, m.characterId));
        emitToUser(m.userId, 'prologue:me', { battery: m.battery, light: m.light });
      } else if ('death' in e) {
        if (act < 4) { // proteção dos atos 1–3: vira ferimento e susto
          await tx.insert(schema.wounds).values({ characterId: ch.id, ...makeWound('laceration', 'torso', 0.5, 'Dia 1') });
          continue;
        }
        await markDead(tx, m, e.death, ctx);
      }
    }
  }
}

async function markDead(tx: Tx, m: MemberRow, cause: string, ctx: Ctx) {
  if (m.status !== 'active') return;
  m.status = 'dead';
  await tx.update(schema.prologueMembers).set({ status: 'dead', deathCause: cause }).where(eq(schema.prologueMembers.characterId, m.characterId));
  const ms_ = await groupMembers(tx, m.groupId);
  await deliver(tx, ms_.map((x) => ({ characterId: x.characterId, userId: x.userId })), 'death', 'cena', { who: m.characterId, name: ctx.names[m.characterId] ?? '', cause });
  emitToUser(m.userId, 'prologue:me', { status: 'dead', deathCause: cause });
}

// ───────────────────────────── Testes de dados
async function chanceFor(tx: Tx, check: NonNullable<Option['check']>, who: CharRow[], ms_: MemberRow[]) {
  const val = (c: CharRow) => {
    const attr = (c.attributes as Record<string, number>)[check.stat];
    if (attr !== undefined) return (check.per ?? 6) * (attr - 4);
    return (check.per ?? 8) * ((c.skills as Record<string, { level: number }>)?.[check.stat]?.level ?? 0);
  };
  const best = who.reduce<CharRow | undefined>((a, c) => (!a || val(c) > val(a) ? c : a), undefined);
  let chance = check.base + (best ? val(best) : 0);
  if (check.light) {
    const lit = ms_.some((m) => m.status === 'active' && m.light && m.battery > 0);
    let torch = false;
    if (!lit) for (const c of who) if ((await itemsOf(tx, 'character', c.id)).some((i) => i.defId === 'flashlight')) { torch = true; break; }
    if (!lit && !torch) chance -= 25;
  }
  return { chance: Math.max(5, Math.min(95, Math.round(chance))), by: best };
}

// ───────────────────────────── Avanço dos grupos
/** Outros sobreviventes do Dia 1 no mesmo lugar que o grupo (fora dele). */
async function othersHere(tx: Tx, g: GroupRow, ms_: { characterId: number }[]) {
  const ids = [...members].filter((id) => !ms_.some((m) => m.characterId === id));
  if (!ids.length) return [] as CharRow[];
  return (await charsOf(tx, ids)).filter((c) => c.locationId === g.locationId && c.alive);
}
async function loadGroupCtx(tx: Tx, g: GroupRow) {
  const ms_ = await groupMembers(tx, g.id);
  const chars = await charsOf(tx, ms_.map((m) => m.characterId));
  const names: Record<number, string> = {}; for (const c of chars) names[c.id] = nameOf(c);
  const others = isFreeGroup(g) ? (await othersHere(tx, g, ms_)).map((c) => first(nameOf(c))) : [];
  return { ms_, chars, ctx: { names, location: g.locationId, chooser: lastChooser.get(g.id), others } as Ctx };
}

async function setGroup(tx: Tx, g: GroupRow, patch: Partial<GroupRow>) {
  Object.assign(g, patch);
  await tx.update(schema.prologueGroups).set(patch).where(eq(schema.prologueGroups.id, g.id));
}

/**
 * Ritmo: quanto esticar (ou encurtar) as pausas para o que falta do ato caber na janela do ato.
 * Grupos que vão para o mesmo ponto de encontro acabam chegando juntos, porque o que falta depois dele é igual para todos.
 */
export function paceFactor(trackId: string, beatId: string, minute = sessionMinute()) {
  if (isFreeTrack(trackId)) return 1;
  const b = getBeat(trackId, beatId); if (!b) return 1;
  const available = (ACT_END[b.act] - minute) * 60;
  const rem = Math.max(30, remainingInAct(trackId, beatId));
  return Math.max(0.5, Math.min(3, available / rem));
}

const FAR = () => new Date(Date.now() + 365 * 86_400_000);
const isFreeGroup = (g: GroupRow) => !!g.flags?.livre;
/** Fim de um evento de quem saiu do trabalho: volta a ficar livre (e não repete o mesmo evento). */
async function toIdle(tx: Tx, g: GroupRow) {
  const done = g.track !== 'livre' ? { [`ev:${g.track}`]: true } : {};
  await setGroup(tx, g, { track: 'livre', beatId: 'idle', step: 0, phase: 'free', ask: null, combatId: null, flags: { ...g.flags, ...done }, nextAt: FAR() });
  for (const m of await groupMembers(tx, g.id)) emitToUser(m.userId, 'prologue:me', { freeIdle: true });
}

async function gotoBeat(tx: Tx, g: GroupRow, beatId: string | undefined, delaySec = 2) {
  if (!beatId && isFreeGroup(g)) { await toIdle(tx, g); return; }
  if (!beatId) { await setGroup(tx, g, { phase: 'ended', status: 'ended' }); return; }
  const minute = sessionMinute();
  let at = Date.now() + ms(delaySec * paceFactor(g.track, g.beatId, minute));
  // portão de ato: quem terminou um ato cedo espera o próximo começar (a linha do tempo da cidade segue chegando)
  const nb = getBeat(g.track, beatId);
  if (nb && session && minute < ACT_START[nb.act] - 0.5) at = Math.max(at, session.startedAt.getTime() + (ACT_START[nb.act] * 60_000) / session.speed);
  await setGroup(tx, g, { beatId, step: 0, phase: 'say', ask: null, nextAt: new Date(at) });
}

async function moveGroup(tx: Tx, g: GroupRow, locationId: string) {
  if (!getLocation(locationId) || g.locationId === locationId) return;
  const old = g.locationId;
  const ms_ = await groupMembers(tx, g.id);
  await tx.update(schema.characters).set({ locationId }).where(inArray(schema.characters.id, ms_.map((m) => m.characterId)));
  await setGroup(tx, g, { locationId });
  for (const m of ms_) pushSelf(m.characterId);
  pushScene(old); pushScene(locationId);
}

/** Vida ambiente: grupos parados (esperando ato ou encontro) recebem uma linha a cada ~85 s, sem repetir. */
const ambientLast = new Map<number, number>();
const ambientUsed = new Map<number, Set<number>>();
const ambientTurn = new Map<number, number>();
const famAmbientUsed = new Map<string, number>();
async function maybeAmbient(tx: Tx, g: GroupRow, ms_: { characterId: number; userId: number; status: string }[], ctx: Ctx, now: number) {
  if (g.nextAt.getTime() - now < ms(50)) return;
  const last = ambientLast.get(g.id);
  if (last === undefined) { ambientLast.set(g.id, now - ms(45)); return; }
  if (now - last < ms(85)) return;
  const act = actAtMinute(sessionMinute());
  const turn = (ambientTurn.get(g.id) ?? 0) + 1; ambientTurn.set(g.id, turn);
  if (turn % 2 === 0) {
    ambientLast.set(g.id, now);
    for (const x of ms_) {
      if (x.status !== 'active') continue;
      const fam = familyById(famOf.get(x.characterId));
      const list = fam.ambient[act] ?? [];
      const key = `${x.characterId}:${act}`;
      // depois de reiniciar o servidor a memória zera: pula o que a pessoa já recebeu (o banco recusa repetidas)
      for (let i = famAmbientUsed.get(key) ?? 0; i < list.length; i++) {
        famAmbientUsed.set(key, i + 1);
        if (await deliverFamily(tx, { characterId: x.characterId, userId: x.userId }, list[i], `amb|${act}|${i}`, first(ctx.names[x.characterId] ?? ''))) break;
      }
    }
    return;
  }
  const pool = AMBIENT[act] ?? [];
  const used = ambientUsed.get(g.id) ?? new Set<number>();
  ambientUsed.set(g.id, used);
  ambientLast.set(g.id, now);
  const free = pool.map((_, i) => i).filter((i) => !used.has(i));
  const start = free.length ? hashStr(`${g.id}:${used.size}`) % free.length : 0;
  for (let k = 0; k < free.length; k++) {
    const i = free[(start + k) % free.length];
    used.add(i);
    const m = pool[i];
    let sent = 0;
    for (const x of ms_) if (x.status === 'active') sent += await deliver(tx, [{ characterId: x.characterId, userId: x.userId }], KIND_OF[m.thread] ?? 'msg', m.thread, { from: m.from, text: fill(m.text, x.characterId, ctx), ref: `a${act}_${i}`, ...postExtras(m, `a${act}_${i}`) });
    if (sent) break;
  }
}

/** Postagens da Raven Rede e notícias: chave comum a todos (para curtidas e comentários), imagem e comentários de NPCs. */
function postExtras(m: { thread: string; img?: string; comments?: { from: string; text: string }[] }, key: string) {
  if (m.thread !== 'social' && m.thread !== 'noticias') return {};
  return { postKey: key, ...(m.img ? { img: m.img } : {}), ...(m.comments?.length ? { npcComments: m.comments } : {}) };
}

// ───────────────────────────── Raven Rede: curtidas e comentários dos jogadores
async function socialOf(sessionId: number, postKey?: string) {
  const rows = await db.select().from(schema.prologueSocial).where(postKey ? and(eq(schema.prologueSocial.sessionId, sessionId), eq(schema.prologueSocial.postKey, postKey)) : eq(schema.prologueSocial.sessionId, sessionId)).orderBy(schema.prologueSocial.id);
  const ids = [...new Set(rows.map((r) => r.characterId))];
  const chars = ids.length ? await charsOf(db, ids) : [];
  const out: Record<string, { likedBy: number[]; comments: { id: number; by: number; name: string; text: string; at: number }[] }> = {};
  for (const r of rows) {
    const p = (out[r.postKey] ??= { likedBy: [], comments: [] });
    if (r.kind === 'like') p.likedBy.push(r.characterId);
    else p.comments.push({ id: r.id, by: r.characterId, name: (() => { const c = chars.find((x) => x.id === r.characterId); return c ? nameOf(c) : '?'; })(), text: r.text ?? '', at: r.createdAt.getTime() });
  }
  return out;
}
async function socialGuard(characterId: number, postKey: string) {
  if (!session) throw new Error('Você não está no Dia 1.');
  const [m] = await db.select().from(schema.prologueMembers).where(eq(schema.prologueMembers.characterId, characterId));
  if (!m || m.sessionId !== session.id || m.status !== 'active') throw new Error('Você não pode fazer isso agora.');
  if (m.battery <= 0) throw new Error('O celular está sem bateria.');
  if ((session.data.signal ?? 4) < 3) throw new Error('Sem internet. A rede social não carrega.');
  const [seen] = await db.select({ id: schema.prologueEvents.id }).from(schema.prologueEvents)
    .where(and(eq(schema.prologueEvents.characterId, characterId), sql`${schema.prologueEvents.payload}->>'postKey' = ${postKey}`)).limit(1);
  if (!seen) throw new Error('Essa postagem não apareceu para você.');
  return { session, member: m };
}
async function socialBroadcast(sessionId: number, postKey: string) {
  const data = (await socialOf(sessionId, postKey))[postKey] ?? { likedBy: [], comments: [] };
  const ms_ = await db.select({ userId: schema.prologueMembers.userId }).from(schema.prologueMembers).where(eq(schema.prologueMembers.sessionId, sessionId));
  for (const u of new Set(ms_.map((x) => x.userId))) emitToUser(u, 'prologue:social', { postKey, ...data });
}
/** Curtir ou descurtir uma postagem. */
export async function socialLike(characterId: number, postKey: string) {
  const { session: s } = await socialGuard(characterId, postKey);
  const where = and(eq(schema.prologueSocial.sessionId, s.id), eq(schema.prologueSocial.postKey, postKey), eq(schema.prologueSocial.characterId, characterId), eq(schema.prologueSocial.kind, 'like'));
  const [had] = await db.select({ id: schema.prologueSocial.id }).from(schema.prologueSocial).where(where);
  if (had) await db.delete(schema.prologueSocial).where(eq(schema.prologueSocial.id, had.id));
  else await db.insert(schema.prologueSocial).values({ sessionId: s.id, postKey, characterId, kind: 'like' });
  await socialBroadcast(s.id, postKey);
  return { ok: true, liked: !had };
}
/** Comentar numa postagem (todos do Dia 1 veem). */
export async function socialComment(characterId: number, postKey: string, text: string) {
  const clean = text.trim().slice(0, 240);
  if (!clean) throw new Error('Comentário vazio.');
  const { session: s } = await socialGuard(characterId, postKey);
  const recent = await db.select({ id: schema.prologueSocial.id }).from(schema.prologueSocial)
    .where(and(eq(schema.prologueSocial.sessionId, s.id), eq(schema.prologueSocial.characterId, characterId), eq(schema.prologueSocial.kind, 'comment'), sql`${schema.prologueSocial.createdAt} > now() - interval '5 seconds'`));
  if (recent.length) throw new Error('Calma: espere um pouco antes de comentar de novo.');
  await db.insert(schema.prologueSocial).values({ sessionId: s.id, postKey, characterId, kind: 'comment', text: clean });
  await socialBroadcast(s.id, postKey);
  return { ok: true };
}

const hashStr = (t: string) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const KIND_OF: Record<string, string> = { cena: 'scene', noticias: 'news', social: 'social', alerta: 'alert' };

/** Um passo do grupo. Retorna true se ainda há trabalho imediato. */
async function stepGroup(tx: Tx, g: GroupRow): Promise<boolean> {
  if (g.phase === 'free') return false;
  const now = Date.now();
  const beat = getBeat(g.track, g.beatId);
  if (!beat) { await setGroup(tx, g, { phase: 'ended', status: 'ended' }); return false; }
  const { ms_, chars, ctx } = await loadGroupCtx(tx, g);
  const alive = ms_.filter((m) => m.status === 'active');
  const everyone = ms_.map((m) => ({ characterId: m.characterId, userId: m.userId }));
  if (!alive.length) { await setGroup(tx, g, { phase: 'ended', status: 'ended' }); return false; }

  if ((g.phase === 'hub_wait' || (g.phase === 'say' && g.step === 0)) && now < g.nextAt.getTime()) await maybeAmbient(tx, g, ms_, ctx, now);
  if (g.phase === 'hub_wait') { if (now < g.nextAt.getTime()) return false; await setGroup(tx, g, { phase: 'say' }); return true; }
  if (g.phase === 'ask') {
    const a = g.ask!;
    const eligible = (a.recipients as number[]).filter((id) => alive.some((m) => m.characterId === id));
    const online = eligible.filter((id) => isUserOnline(ms_.find((m) => m.characterId === id)!.userId));
    const answered = Object.keys(a.votes ?? {}).map(Number);
    const allIn = online.length > 0 && online.every((id) => answered.includes(id));
    if (allIn || now >= a.deadline || !eligible.length) { await resolveAsk(tx, g, beat, ms_, chars, ctx); return true; }
    return false;
  }
  if (g.phase === 'combat') {
    const [c] = g.combatId ? await tx.select().from(schema.combats).where(eq(schema.combats.id, g.combatId)) : [];
    if (c && c.status === 'active') return false;
    const outcome = (c?.state as { result?: { outcome?: string } })?.result?.outcome ?? 'escaped';
    // atos 1–3: ninguém fica desacordado depois da luta
    if (beat.act < 4) for (const ch of chars) if (ch.needs.unconscious || ch.needs.blood < 45) await tx.update(schema.characters).set({ needs: { ...ch.needs, unconscious: false, blood: Math.max(ch.needs.blood, 45) } }).where(eq(schema.characters.id, ch.id));
    await setGroup(tx, g, { combatId: null });
    await gotoBeat(tx, g, outcome === 'defeat' ? beat.combat!.lose : beat.combat!.win);
    return true;
  }
  if (g.phase !== 'say' || now < g.nextAt.getTime()) return false;

  // entrada na batida
  if (g.step === 0) {
    if (beat.if && !(await condOk(tx, beat.if, g, ms_, chars))) { await gotoBeat(tx, g, beat.else, 0); return true; }
    if (beat.at) { await moveGroup(tx, g, beat.at); ctx.location = beat.at; }
    if (beat.closeHub && g.hubOpen) await setGroup(tx, g, { hubOpen: false });
    if (session && beat.act > (session.data.act ?? 1)) {
      session.data = { ...session.data, act: beat.act };
      await tx.update(schema.prologueSessions).set({ data: session.data }).where(eq(schema.prologueSessions.id, session.id));
      for (const r of everyone) emitToUser(r.userId, 'prologue:session', { act: beat.act });
    }
  }
  const msgs = beat.say ?? [];
  if (g.step < msgs.length) {
    const m: Msg = msgs[g.step];
    for (const x of ms_) {
      if (!(await condOk(tx, m.if, g, ms_, chars, x))) continue;
      if (m.thread === 'familia' && m.text.startsWith('@')) {
        const msg = familyById(famOf.get(x.characterId)).slots[m.text.slice(1) as FamilySlot];
        if (msg) await deliverFamily(tx, { characterId: x.characterId, userId: x.userId }, msg, `slot|${m.text.slice(1)}`, first(ctx.names[x.characterId] ?? ''));
        continue;
      }
      await deliver(tx, [{ characterId: x.characterId, userId: x.userId }], KIND_OF[m.thread] ?? 'msg', m.thread, { from: m.from, text: fill(m.text, x.characterId, ctx), media: m.media, ref: `b_${g.track}_${g.beatId}_${g.step}`, ...postExtras(m, `b_${g.track}_${g.beatId}_${g.step}`) });
    }
    const nextWait = g.step + 1 < msgs.length ? msgs[g.step + 1].wait ?? 6 : 3;
    await setGroup(tx, g, { step: g.step + 1, nextAt: new Date(now + ms(nextWait * paceFactor(g.track, g.beatId))) });
    return false;
  }
  // mensagens entregues: efeitos e saída da batida
  await applyEffects(tx, g, beat.effects, beat.act, ctx);
  if (beat.ask) { await openAsk(tx, g, beat, beat.ask, ms_, chars, ctx); return false; }
  if (beat.combat) {
    const rows = await tx.select().from(schema.characters).where(inArray(schema.characters.id, alive.map((m) => m.characterId))).for('update');
    const ready = rows.filter((r) => r.alive && !r.combatId);
    if (!ready.length) { await gotoBeat(tx, g, beat.combat.win); return true; }
    const { startCombat } = await import('./combat.js');
    const c = await startCombat(tx, { characters: ready, locationId: g.locationId, zombieCount: beat.combat.zombies, zombieTypes: beat.combat.types, reason: beat.combat.reason });
    await setGroup(tx, g, { phase: 'combat', combatId: c.id });
    return false;
  }
  if (beat.hub) { await enterHub(tx, g, beat.hub, ms_, ctx); return true; }
  if (beat.end && isFreeGroup(g)) { await toIdle(tx, g); return false; }
  if (beat.end) {
    await setGroup(tx, g, { phase: 'ended', status: 'ended' });
    await tx.update(schema.prologueMembers).set({ status: sql`case when ${schema.prologueMembers.status} = 'active' then 'ended' else ${schema.prologueMembers.status} end` }).where(eq(schema.prologueMembers.groupId, g.id));
    await deliver(tx, everyone, 'system', 'sistema', { text: 'Fim do Dia 1 para o seu grupo. Aguarde os outros sobreviventes…', end: true });
    return false;
  }
  await gotoBeat(tx, g, beat.next, beat.wait ?? 2);
  return true;
}

async function openAsk(tx: Tx, g: GroupRow, beat: Beat, a: Ask, ms_: MemberRow[], chars: CharRow[], ctx: Ctx) {
  const alive = ms_.filter((m) => m.status === 'active');
  const aliveChars = chars.filter((c) => alive.some((m) => m.characterId === c.id));
  const options: { id: string; label: string; icon?: string; check?: { label: string; chance: number } }[] = [];
  for (const o of a.options) {
    if (!(await condOk(tx, o.if, g, ms_, chars))) continue;
    let check: { label: string; chance: number } | undefined;
    if (o.check) { const { chance } = await chanceFor(tx, o.check, aliveChars, ms_); check = { label: o.check.label, chance }; }
    options.push({ id: o.id, label: fill(o.label, null, ctx), icon: o.icon, check });
  }
  if (!options.length) { await gotoBeat(tx, g, beat.next); return; }
  let recipients = alive;
  if (a.kind === 'secret' || a.kind === 'call') recipients = pickWho(a.target ?? 'one', alive, chars, ctx.chooser);
  if (a.kind !== 'poll' && recipients.length === 1) { lastChooser.set(g.id, recipients[0].characterId); ctx.chooser = recipients[0].characterId; }
  if (!recipients.length) { await gotoBeat(tx, g, beat.next); return; }
  // Tempo de sobra para conversar e fazer RP antes de decidir (a escolha fecha antes se todo mundo já votou).
  // Grupo atrasado em relação ao ato volta para um tempo mais curto, para não segurar a história.
  const base = a.timeout ?? (a.kind === 'poll' ? 60 : 45);
  const behind = paceFactor(g.track, beat.id) < 1;
  const timeout = behind ? Math.max(45, base * 1.3) : Math.min(a.kind === 'call' ? 120 : 180, Math.max(a.kind === 'poll' ? 120 : 90, base * 2.5));
  const free = isFreeGroup(g); // eventos de quem saiu do trabalho: a decisão é da cena, não de uma conversa no celular
  const askRow = { id: `${g.id}-${beat.id}-${Date.now().toString(36)}`, kind: a.kind, beatId: beat.id, thread: a.thread ?? (free ? 'cena' : a.kind === 'poll' ? 'grupo' : `dm:${a.from ?? 'desconhecido'}`),
    from: a.from ?? (free ? '' : a.kind === 'poll' ? 'Grupo' : 'Desconhecido'), options, deadline: Date.now() + ms(timeout), recipients: recipients.map((m) => m.characterId), votes: {} as Record<number, string> };
  await setGroup(tx, g, { phase: 'ask', ask: askRow });
  for (const r of recipients) {
    const famName = askRow.from === '@a' || askRow.from === '@b' ? familyById(famOf.get(r.characterId))[askRow.from.slice(1) as 'a' | 'b'] : askRow.from;
    await deliver(tx, [{ characterId: r.characterId, userId: r.userId }], 'ask', askRow.thread, {
      askId: askRow.id, kind: a.kind, from: famName, text: fill(a.text, r.characterId, ctx), options, deadline: askRow.deadline, group: a.kind === 'poll' ? alive.length : 1,
    });
  }
}

/** Voto/escolha de um jogador. */
export async function prologueVote(characterId: number, askId: string, optionId: string) {
  const [m] = await db.select().from(schema.prologueMembers).where(eq(schema.prologueMembers.characterId, characterId));
  if (!m || !prologueRunning() || m.sessionId !== session!.id) throw new Error('Você não está no Dia 1.');
  if (m.status !== 'active') throw new Error('Você não pode mais escolher.');
  const r = await withLock(`pgroup:${m.groupId}`, () => db.transaction(async (tx) => {
    const [g] = await tx.select().from(schema.prologueGroups).where(eq(schema.prologueGroups.id, m.groupId)).for('update');
    const a = g?.ask;
    if (!g || g.phase !== 'ask' || !a || a.id !== askId) throw new Error('Essa escolha já foi decidida.');
    if (!(a.recipients as number[]).includes(characterId)) throw new Error('Essa escolha não é sua.');
    if (!a.options.some((o: { id: string }) => o.id === optionId)) throw new Error('Opção inválida.');
    a.votes = { ...(a.votes ?? {}), [characterId]: optionId };
    await tx.update(schema.prologueGroups).set({ ask: a }).where(eq(schema.prologueGroups.id, g.id));
    if (a.kind === 'poll') {
      const ms_ = await groupMembers(tx, g.id);
      const tally: Record<string, number> = {}; for (const v of Object.values(a.votes) as string[]) tally[v] = (tally[v] ?? 0) + 1;
      for (const x of ms_) emitToUser(x.userId, 'prologue:votes', { askId, tally, voters: Object.keys(a.votes).length });
    }
    return { ok: true, groupId: g.id };
  }));
  await tickGroup(r.groupId);
  return { ok: true };
}

async function resolveAsk(tx: Tx, g: GroupRow, beat: Beat, ms_: MemberRow[], chars: CharRow[], ctx: Ctx) {
  const a = g.ask!; const askDef = beat.ask!;
  const alive = ms_.filter((m) => m.status === 'active');
  const aliveChars = chars.filter((c) => alive.some((m) => m.characterId === c.id));
  const valid = (id: string) => a.options.some((o: { id: string }) => o.id === id);
  const defOpt: string = valid(askDef.default ?? '') ? askDef.default! : a.options.at(-1).id;
  const optDef = (id: string) => askDef.options.find((o) => o.id === id)!;
  const labelOf = (id: string) => a.options.find((x: { id: string; label: string }) => x.id === id)?.label;
  const recipients = (a.recipients as number[]).filter((id) => alive.some((m) => m.characterId === id));
  const everyone = ms_.map((m) => ({ characterId: m.characterId, userId: m.userId }));
  await setGroup(tx, g, { ask: null });

  const runOption = async (o: Option, rollers: CharRow[], chooser: number | undefined, audience: { characterId: number; userId: number }[]) => {
    let ok = true;
    if (o.check) {
      const { chance, by } = await chanceFor(tx, o.check, rollers, ms_);
      ok = rng.next() * 100 < chance;
      await deliver(tx, audience, 'roll', 'sistema', { label: o.check.label, chance, ok, by: by ? first(nameOf(by)) : '' });
    }
    await applyEffects(tx, g, ok ? o.effects : o.failEffects, beat.act, { ...ctx, chooser });
    return ok ? o.next : (o.fail ?? o.next);
  };

  if (a.kind === 'poll') {
    const tally: Record<string, number[]> = {};
    for (const [cid, v] of Object.entries(a.votes ?? {}) as [string, string][]) if (valid(v)) (tally[v] ??= []).push(Number(cid));
    let win = defOpt;
    const counts = Object.entries(tally).map(([k, v]) => [k, v.length] as const);
    if (counts.length) {
      const max = Math.max(...counts.map(([, n]) => n));
      const tied = counts.filter(([, n]) => n === max).map(([k]) => k);
      const profs = aliveChars.map((c) => c.profession);
      win = tied.find((k) => optDef(k).expert?.some((p) => profs.includes(p))) ?? rng.pick(tied);
    }
    const o = optDef(win);
    const voters = tally[win] ?? [];
    const chooser = voters.length ? rng.pick(voters) : undefined;
    if (chooser) lastChooser.set(g.id, chooser);
    const total = Object.keys(a.votes ?? {}).length;
    await deliver(tx, everyone, 'answer', a.thread, { askId: a.id, option: win, label: labelOf(win), votes: voters.length, total, timedOut: !total });
    if (o.reply && chooser) await deliver(tx, everyone, 'msg', a.thread, { from: ctx.names[chooser], player: chooser, text: fill(o.reply, chooser, { ...ctx, chooser }) });
    const next = await runOption(o, aliveChars, chooser, everyone);
    await gotoBeat(tx, g, next ?? beat.next);
    return;
  }

  // escolhas individuais (each / secret / call)
  const nexts: Record<number, string | undefined> = {};
  for (const cid of recipients) {
    const v = (a.votes ?? {})[cid]; const pick = v && valid(v) ? v : defOpt;
    const m = ms_.find((x) => x.characterId === cid)!; const me = [{ characterId: cid, userId: m.userId }];
    const o = optDef(pick);
    await deliver(tx, me, 'answer', a.thread, { askId: a.id, option: pick, label: labelOf(pick), mine: true, timedOut: !v });
    if (o.reply) await deliver(tx, a.thread === 'grupo' ? everyone : me, 'msg', a.thread, { from: ctx.names[cid], player: cid, text: fill(o.reply, cid, { ...ctx, chooser: cid }), mine: a.thread !== 'grupo' });
    nexts[cid] = await runOption(o, aliveChars.filter((c) => c.id === cid), cid, a.thread === 'grupo' ? everyone : me);
  }
  if (askDef.split && a.kind === 'each') {
    const byNext = new Map<string, number[]>();
    for (const cid of recipients) { const n = nexts[cid] ?? beat.next ?? ''; byNext.set(n, [...(byNext.get(n) ?? []), cid]); }
    const parts = [...byNext.entries()].sort((x, y) => y[1].length - x[1].length);
    for (const [next, ids] of parts.slice(1)) {
      const [ng] = await tx.insert(schema.prologueGroups).values({ sessionId: g.sessionId, track: g.track, beatId: next || beat.id, phase: next ? 'say' : 'ended', status: next ? 'active' : 'ended', nextAt: new Date(Date.now() + ms(2)), locationId: g.locationId, flags: g.flags }).returning();
      await tx.update(schema.prologueMembers).set({ groupId: ng.id }).where(inArray(schema.prologueMembers.characterId, ids));
      const names = ids.map((i) => first(ctx.names[i] ?? ''));
      await deliver(tx, everyone, 'system', 'cena', { text: `${names.join(' e ')} ${ids.length > 1 ? 'seguem' : 'segue'} por outro caminho.`, split: true });
    }
    await gotoBeat(tx, g, parts[0]?.[0] || beat.next);
    return;
  }
  const chosenNexts = Object.values(nexts).filter(Boolean) as string[];
  await gotoBeat(tx, g, beat.next ?? (chosenNexts.length ? rng.pick(chosenNexts) : undefined));
}

async function enterHub(tx: Tx, g: GroupRow, hubId: string, ms_: MemberRow[], ctx: Ctx) {
  const hub = getTrack(hubId);
  if (!hub) { await gotoBeat(tx, g, undefined); return; }
  // trava por ponto de encontro: dois grupos chegando juntos não abrem dois encontros
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${81_000_000 + (g.sessionId % 1000) * 1000 + hashStr(hubId) % 1000})`);
  const [open] = await tx.select().from(schema.prologueGroups).where(and(eq(schema.prologueGroups.sessionId, g.sessionId), eq(schema.prologueGroups.track, hubId), eq(schema.prologueGroups.hubOpen, true), eq(schema.prologueGroups.status, 'active'))).limit(1);
  if (open && open.id !== g.id) {
    // junta-se ao grupo que já está no ponto de encontro
    await tx.update(schema.prologueMembers).set({ groupId: open.id }).where(eq(schema.prologueMembers.groupId, g.id));
    await setGroup(tx, g, { phase: 'merged', status: 'merged' });
    await tx.update(schema.characters).set({ locationId: open.locationId }).where(inArray(schema.characters.id, ms_.map((m) => m.characterId)));
    await tx.update(schema.prologueGroups).set({ flags: { ...open.flags, ...g.flags } }).where(eq(schema.prologueGroups.id, open.id));
    const all = await groupMembers(tx, open.id);
    const arriving = ms_.map((m) => first(ctx.names[m.characterId] ?? ''));
    await deliver(tx, all.map((m) => ({ characterId: m.characterId, userId: m.userId })), 'system', 'cena', { text: `${arriving.join(', ')} ${arriving.length > 1 ? 'chegam' : 'chega'}. Agora vocês estão juntos.`, merge: true });
    if (open.phase === 'ask' && open.ask && (open.ask.kind === 'poll' || open.ask.kind === 'each')) {
      const newIds = ms_.filter((m) => m.status === 'active').map((m) => m.characterId);
      const askRow: Record<string, any> = { ...open.ask, recipients: [...open.ask.recipients, ...newIds] };
      await tx.update(schema.prologueGroups).set({ ask: askRow }).where(eq(schema.prologueGroups.id, open.id));
      for (const m of ms_.filter((x) => x.status === 'active')) await deliver(tx, [{ characterId: m.characterId, userId: m.userId }], 'ask', askRow.thread, { askId: askRow.id, kind: askRow.kind, from: askRow.from, text: 'O grupo está decidindo agora:', options: askRow.options, deadline: askRow.deadline, group: all.length });
    }
    for (const m of ms_) pushSelf(m.characterId);
    pushScene(g.locationId); pushScene(open.locationId);
    return;
  }
  const hubAct = getBeat(hub.id, hub.start)?.act ?? 1;
  const openMin = Math.max(mapDesignMinute(hub.opensAt ?? 0), ACT_START[hubAct]);
  const opensAt = session ? session.startedAt.getTime() + (openMin * 60_000) / session.speed : Date.now();
  const waiting = Date.now() < opensAt;
  await setGroup(tx, g, { track: hubId, beatId: hub.start, step: 0, ask: null, hubOpen: true, phase: waiting ? 'hub_wait' : 'say', nextAt: new Date(Math.max(Date.now() + ms(2), opensAt)) });
}

// ───────────────────────────── Tick
async function tickGroup(groupId: number) {
  await withLock(`pgroup:${groupId}`, async () => {
    for (let i = 0; i < 8; i++) {
      const more = await db.transaction(async (tx) => {
        const [g] = await tx.select().from(schema.prologueGroups).where(eq(schema.prologueGroups.id, groupId)).for('update');
        if (!g || g.status !== 'active') return false;
        return stepGroup(tx, g);
      });
      if (!more) break;
    }
  });
}

let ticking = false; let lastDrain = 0;
export async function prologueTick() {
  if (ticking || !session || session.status !== 'running' || isPaused()) return;
  ticking = true;
  try {
    const s = session; const minute = sessionMinute(s);
    const ms_ = await db.select().from(schema.prologueMembers).where(eq(schema.prologueMembers.sessionId, s.id));
    const everyone = ms_.map((m) => ({ characterId: m.characterId, userId: m.userId }));
    // linha do tempo global: todos recebem ao mesmo tempo
    let cursor = s.data.timeline ?? 0;
    if (cursor < TIMELINE.length && mapDesignMinute(TIMELINE[cursor].at) <= minute) {
      const chars = await charsOf(db, ms_.map((x) => x.characterId));
      while (cursor < TIMELINE.length && mapDesignMinute(TIMELINE[cursor].at) <= minute) {
        const e = TIMELINE[cursor]; cursor++;
        await db.transaction(async (tx) => {
          for (const [mi, m] of (e.msgs ?? []).entries()) {
            for (const r of everyone) {
              const ch = chars.find((c) => c.id === r.characterId);
              if (m.if?.prof && (!ch || !m.if.prof.includes(ch.profession))) continue;
              await deliver(tx, [r], KIND_OF[m.thread] ?? 'msg', m.thread, { from: m.from, text: m.text.replaceAll('{nome}', ch ? first(nameOf(ch)) : ''), media: m.media, ref: `t${cursor - 1}_${mi}`, ...postExtras(m, `t${cursor - 1}_${mi}`) });
            }
          }
          if (e.family) {
            for (const r of everyone) {
              const ch = chars.find((c) => c.id === r.characterId);
              const msg = familyById(famOf.get(r.characterId)).slots[e.family];
              if (msg) await deliverFamily(tx, r, msg, `slot|${e.family}`, ch ? first(nameOf(ch)) : '');
            }
          }
          if (e.signal !== undefined || e.powerOut) {
            s.data = { ...s.data, ...(e.signal !== undefined ? { signal: e.signal } : {}), ...(e.powerOut ? { powerOut: true } : {}) };
            for (const r of everyone) emitToUser(r.userId, 'prologue:session', { signal: s.data.signal, powerOut: s.data.powerOut });
          }
          s.data = { ...s.data, timeline: cursor };
          await tx.update(schema.prologueSessions).set({ data: s.data }).where(eq(schema.prologueSessions.id, s.id));
        });
      }
    }
    // bateria: ~0,6% por minuto de história; lanterna gasta mais; sem energia, ninguém carrega
    const now = Date.now();
    if (now - lastDrain > ms(60)) {
      lastDrain = now;
      for (const m of ms_) {
        if (m.battery <= 0) continue;
        const b = Math.max(0, +(m.battery - (m.light ? 2 : 0.6)).toFixed(1));
        await db.update(schema.prologueMembers).set({ battery: b, light: b > 0 && m.light }).where(eq(schema.prologueMembers.characterId, m.characterId));
        if (Math.floor(b) !== Math.floor(m.battery) || b === 0) emitToUser(m.userId, 'prologue:me', { battery: b, light: b > 0 && m.light });
      }
    }
    const groups = await db.select({ id: schema.prologueGroups.id }).from(schema.prologueGroups).where(and(eq(schema.prologueGroups.sessionId, s.id), eq(schema.prologueGroups.status, 'active')));
    for (const g of groups) await tickGroup(g.id);
    await freeTick(s.id);
    const stillActive = (await db.select({ id: schema.prologueGroups.id }).from(schema.prologueGroups).where(and(eq(schema.prologueGroups.sessionId, s.id), eq(schema.prologueGroups.status, 'active')))).length;
    // acaba quando as histórias acabaram (e, para quem saiu do trabalho, quando a noite chega) ou no limite de tempo
    const story = await db.select({ id: schema.prologueGroups.id }).from(schema.prologueGroups).where(and(eq(schema.prologueGroups.sessionId, s.id), eq(schema.prologueGroups.status, 'active'), sql`not coalesce((${schema.prologueGroups.flags}->>'livre')::boolean, false)`)).limit(1);
    if (!stillActive || (!story.length && minute >= SESSION_MINUTES) || minute >= SESSION_MINUTES + 25) await finishPrologue();
  } catch (e) { console.error('[dia 1] tick', e); }
  finally { ticking = false; }
}

// ───────────────────────────── Quem saiu do trabalho (livre pelo mapa)
/** Próximo evento global de cada grupo livre (memória; depois de reiniciar, sorteia de novo). */
const nextGlobal = new Map<number, number>();
async function startFreeEvent(tx: Tx, g: GroupRow, trackId: string) {
  const t = getTrack(trackId); if (!t) return;
  await setGroup(tx, g, { track: t.id, beatId: t.start, step: 0, phase: 'say', ask: null, nextAt: new Date(Date.now() + ms(2)) });
  for (const m of await groupMembers(tx, g.id)) emitToUser(m.userId, 'prologue:me', { freeIdle: false });
}
async function freeTick(sessionId: number) {
  const act = actAtMinute(sessionMinute());
  const free = await db.select().from(schema.prologueGroups).where(and(eq(schema.prologueGroups.sessionId, sessionId), eq(schema.prologueGroups.status, 'active'), eq(schema.prologueGroups.phase, 'free')));
  const now = Date.now();
  for (const g0 of free) {
    const due = nextGlobal.get(g0.id);
    if (due === undefined) { nextGlobal.set(g0.id, now + ms(rng.range(150, 300))); continue; }
    if (now < due) continue;
    await withLock(`pgroup:${g0.id}`, () => db.transaction(async (tx) => {
      const [g] = await tx.select().from(schema.prologueGroups).where(eq(schema.prologueGroups.id, g0.id)).for('update');
      if (!g || g.phase !== 'free') return;
      const ms_ = await groupMembers(tx, g.id);
      const chars = await charsOf(tx, ms_.map((m) => m.characterId));
      // viajando ou em confronto: tenta de novo daqui a pouco
      if (chars.some((c) => c.state === 'traveling' || c.combatId)) { nextGlobal.set(g.id, now + ms(45)); return; }
      const options = freeGlobalEvents(act).filter((t) => !g.flags[`ev:${t.id}`]);
      nextGlobal.set(g.id, now + ms(rng.range(300, 480)));
      if (options.length) await startFreeEvent(tx, g, rng.pick(options).id);
    }));
  }
}

/** Chegou num lugar (viagem terminou): quem está livre pode encontrar o evento daquele lugar. */
export async function prologueArrive(characterId: number, locationId: string) {
  if (!session || !isPrologueMember(characterId)) return;
  const [m] = await db.select().from(schema.prologueMembers).where(eq(schema.prologueMembers.characterId, characterId));
  if (!m || m.status !== 'active' || !m.flags.livre) return;
  await withLock(`pgroup:${m.groupId}`, () => db.transaction(async (tx) => {
    const [g] = await tx.select().from(schema.prologueGroups).where(eq(schema.prologueGroups.id, m.groupId)).for('update');
    if (!g) return;
    await setGroup(tx, g, { locationId });
    if (g.phase !== 'free') return;
    const e = freeLocalEvent(locationId, actAtMinute(sessionMinute()));
    if (e && !g.flags[`ev:${e.id}`]) { await startFreeEvent(tx, g, e.id); nextGlobal.set(g.id, Date.now() + ms(rng.range(240, 360))); }
  }));
}

/** Pode viajar pelo mapa (saiu do trabalho e não está no meio de um evento). */
export async function prologueFreeIdle(characterId: number) {
  const [m] = await db.select().from(schema.prologueMembers).where(eq(schema.prologueMembers.characterId, characterId));
  if (!m?.flags.livre || m.status !== 'active') return false;
  const [g] = await db.select({ phase: schema.prologueGroups.phase }).from(schema.prologueGroups).where(eq(schema.prologueGroups.id, m.groupId));
  return g?.phase === 'free';
}

/** Sair do trabalho: deixa o grupo e a história dele, e fica livre pelo condado (não tem volta). */
export async function prologueLeave(characterId: number) {
  if (!session || !prologueRunning()) throw new Error('Você não está no Dia 1.');
  const s = session;
  const [m] = await db.select().from(schema.prologueMembers).where(eq(schema.prologueMembers.characterId, characterId));
  if (!m || m.sessionId !== s.id || m.status !== 'active') throw new Error('Você não pode fazer isso agora.');
  if (m.flags.livre) throw new Error('Você já saiu do trabalho.');
  const [ch] = await charsOf(db, [characterId]);
  if (!ch || ch.combatId) throw new Error('Não dá para ir embora no meio de um confronto.');
  await withLock(`pgroup:${m.groupId}`, () => db.transaction(async (tx) => {
    const [old] = await tx.select().from(schema.prologueGroups).where(eq(schema.prologueGroups.id, m.groupId)).for('update');
    if (old?.phase === 'combat') throw new Error('Não dá para ir embora no meio de um confronto.');
    const mates = (await groupMembers(tx, m.groupId)).filter((x) => x.characterId !== characterId && x.status === 'active');
    const [g] = await tx.insert(schema.prologueGroups).values({ sessionId: s.id, track: 'livre', beatId: 'idle', phase: 'free', nextAt: FAR(), locationId: ch.locationId, flags: { livre: true } }).returning();
    await tx.update(schema.prologueMembers).set({ groupId: g.id, flags: { ...m.flags, livre: true }, marks: m.marks.includes('largou_o_posto') ? m.marks : [...m.marks, 'largou_o_posto'] }).where(eq(schema.prologueMembers.characterId, characterId));
    const me = [{ characterId, userId: m.userId }];
    await deliver(tx, me, 'system', 'cena', { text: 'Você larga o posto e vai embora. A partir de agora, é só você e a cidade: dá para andar pelo mapa, e os lugares importantes têm o que acontecer. Não tem volta.' });
    const mk = MARKS.find((x) => x.id === 'largou_o_posto');
    await deliver(tx, me, 'mark', 'sistema', { mark: 'largou_o_posto', name: mk?.name ?? '', text: mk?.text ?? '' });
    if (mates.length) await deliver(tx, mates.map((x) => ({ characterId: x.characterId, userId: x.userId })), 'system', 'cena', { text: `${first(nameOf(ch))} largou o posto e foi embora sozinho(a).` });
    nextGlobal.set(g.id, Date.now() + ms(rng.range(120, 240)));
  }));
  pushSelf(characterId);
  return { ok: true };
}

/**
 * Proteção da história: chamada pelo tick de necessidades antes de matar alguém do Dia 1.
 * Retorna true quando o personagem NÃO deve morrer agora (atos 1–3: desmaio; atos 4–5: morte aplicada no fim).
 */
export async function prologueIntercept(tx: Tx, characterId: number, cause: string): Promise<boolean> {
  if (!isPrologueMember(characterId)) return false;
  const [m] = await tx.select().from(schema.prologueMembers).where(eq(schema.prologueMembers.characterId, characterId));
  if (!m) return false;
  const [g] = await tx.select().from(schema.prologueGroups).where(eq(schema.prologueGroups.id, m.groupId));
  const act = (g && getBeat(g.track, g.beatId)?.act) ?? actAt(sessionMinute());
  if (act >= 4 && m.status === 'active') {
    const [ch] = await tx.select().from(schema.characters).where(eq(schema.characters.id, characterId));
    await markDead(tx, m, cause, { names: { [characterId]: ch ? nameOf(ch) : '' } });
  }
  return true;
}

// ───────────────────────────── Início e fim
export async function startPrologue(o: { characterIds: number[]; speed?: number }) {
  if (prologueRunning()) throw new Error('O Dia 1 já está acontecendo.');
  const chars = o.characterIds.length ? await db.select().from(schema.characters).where(and(inArray(schema.characters.id, o.characterIds), eq(schema.characters.alive, true))) : [];
  const playable = chars.filter((c) => c.approved && !c.combatId);
  if (!playable.length) throw new Error('Ninguém pronto para começar (personagens vivos e aprovados, conectados ou na sala de espera).');
  const { allItemDefs } = await import('./config.js');
  setItemNames(Object.fromEntries(allItemDefs().map((d) => [d.id, d.name])));
  await setGameTime(7);
  const [s] = await db.insert(schema.prologueSessions).values({ speed: o.speed ?? 1 }).returning();
  session = s; members.clear(); lastDrain = Date.now();
  // grupos por trilha (profissão), em pedaços do tamanho máximo
  const byTrack = new Map<string, CharRow[]>();
  for (const c of rng.shuffle([...playable])) {
    const t = trackForProfession(c.profession); const key = `${t.id}|${t.startAt?.[c.profession] ?? t.location}`;
    byTrack.set(key, [...(byTrack.get(key) ?? []), c]);
  }
  for (const [key, list] of byTrack) {
    const [trackId, startLoc] = key.split('|');
    const t = getTrack(trackId)!; const size = t.maxGroup ?? 4;
    const chunks: CharRow[][] = [];
    for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
    // evita sobrar alguém sozinho quando dá para equilibrar (ex.: 5 → 3+2)
    if (chunks.length > 1 && chunks.at(-1)!.length === 1 && chunks.at(-2)!.length > 2) chunks.at(-1)!.unshift(chunks.at(-2)!.pop()!);
    for (const [ci, chunk] of chunks.entries()) {
      const flags: Record<string, boolean> = ci > 0 ? { segundo_grupo: true } : {};
      if (chunk.length === 1) flags.sozinho = true;
      const [g] = await db.insert(schema.prologueGroups).values({ sessionId: s.id, track: trackId, beatId: t.start, phase: 'say', nextAt: new Date(Date.now() + ms(6)), locationId: startLoc, flags }).returning();
      for (const c of chunk) {
        await db.insert(schema.prologueMembers).values({ characterId: c.id, sessionId: s.id, groupId: g.id, userId: c.userId, battery: Math.round(rng.range(38, 96)) })
          .onConflictDoUpdate({ target: schema.prologueMembers.characterId, set: { sessionId: s.id, groupId: g.id, status: 'active', flags: {}, marks: [], light: false, deathCause: null, battery: Math.round(rng.range(38, 96)) } });
        await db.update(schema.characters).set({ locationId: startLoc, state: 'idle', activity: 'idle', busyUntil: null, busyAction: null, followingId: null }).where(eq(schema.characters.id, c.id));
        await db.delete(schema.travels).where(eq(schema.travels.characterId, c.id));
        members.add(c.id);
      }
    }
  }
  // cada um com uma família diferente no celular (ninguém do mesmo grupo repete)
  {
    const ms0 = await db.select().from(schema.prologueMembers).where(eq(schema.prologueMembers.sessionId, s.id));
    const byGroup = new Map<number, [number, number][]>();
    for (const m of ms0) { const c = playable.find((x) => x.id === m.characterId); byGroup.set(m.groupId, [...(byGroup.get(m.groupId) ?? []), [m.characterId, c?.age ?? 30]]); }
    const fams = assignFamilies([...byGroup.values()]);
    for (const m of ms0) {
      const f = fams.get(m.characterId); if (!f) continue;
      famOf.set(m.characterId, f);
      await db.update(schema.prologueMembers).set({ flags: { ...m.flags, [`fam:${f}`]: true } }).where(eq(schema.prologueMembers.characterId, m.characterId));
    }
  }
  for (const c of playable) { emitToUser(c.userId, 'prologue:start', { sessionId: s.id }); pushSelf(c.id); }
  for (const k of byTrack.keys()) pushScene(k.split('|')[1]);
  const groups = await db.select().from(schema.prologueGroups).where(eq(schema.prologueGroups.sessionId, s.id));
  return { sessionId: s.id, players: playable.length, groups: groups.length };
}

export async function finishPrologue() {
  const s = session; if (!s || s.status !== 'running') return;
  s.status = 'ended';
  const ms_ = await db.select().from(schema.prologueMembers).where(eq(schema.prologueMembers.sessionId, s.id));
  const { killCharacter } = await import('./death.js');
  const ends: { userId: number; payload: unknown }[] = [];
  for (const m of ms_) {
    await db.transaction(async (tx) => {
      const [ch] = await tx.select().from(schema.characters).where(eq(schema.characters.id, m.characterId)).for('update');
      if (!ch) return;
      const chronicle = await buildChronicle(tx, m, ch);
      await gameLog(tx, ch.id, 'chronicle', 'Crônica do Dia 1', { chronicle });
      for (const id of m.marks) { const d = MARKS.find((x) => x.id === id); await gameLog(tx, ch.id, 'mark', `Marca do Dia 1: ${d?.name ?? id}. ${d?.text ?? ''}`); }
      if (m.status === 'dead' && ch.alive) await killCharacter(tx, ch, m.deathCause ?? 'Morreu no primeiro dia');
      else await tx.update(schema.characters).set({ needs: { ...ch.needs, unconscious: false } }).where(eq(schema.characters.id, ch.id));
      ends.push({ userId: m.userId, payload: { chronicle, dead: m.status === 'dead' } });
    });
  }
  // lugares por onde a história passou foram saqueados na confusão
  const places = [...new Set(TRACKS.flatMap((t) => [t.location, ...Object.values(t.startAt ?? {}), ...(t.beats.map((b) => b.at).filter(Boolean) as string[])]))];
  if (places.length) await db.update(schema.locationLoot).set({ reserve: sql`${schema.locationLoot.reserve} * 0.35` }).where(inArray(schema.locationLoot.locationId, places));
  await db.update(schema.prologueSessions).set({ status: 'ended', endedAt: new Date() }).where(eq(schema.prologueSessions.id, s.id));
  session = null; members.clear(); lobby.clear();
  for (const e of ends) emitToUser(e.userId, 'prologue:end', e.payload);
  for (const m of ms_) pushSelf(m.characterId);
  for (const p of places) pushScene(p);
}

async function buildChronicle(tx: Tx, m: MemberRow, ch: CharRow) {
  const evs = await tx.select().from(schema.prologueEvents).where(and(eq(schema.prologueEvents.sessionId, m.sessionId), eq(schema.prologueEvents.characterId, m.characterId))).orderBy(schema.prologueEvents.id);
  const lines: string[] = [];
  for (const e of evs) {
    const p = e.payload;
    if (e.kind === 'answer' && p.label) lines.push(p.mine ? `Você escolheu: ${p.label}` : `O grupo decidiu: ${p.label}${p.total ? ` (${p.votes}/${p.total} votos)` : ''}`);
    else if (e.kind === 'roll') lines.push(`${p.label}: ${p.ok ? 'deu certo' : 'deu errado'}${p.by ? ` (${p.by})` : ''}`);
    else if (e.kind === 'mark') lines.push(`★ ${p.name}`);
    else if (e.kind === 'death') lines.push(p.who === m.characterId ? `Você morreu: ${p.cause}` : `${p.name} morreu: ${p.cause}`);
    else if (e.kind === 'system' && (p.merge || p.split)) lines.push(p.text);
  }
  return { name: nameOf(ch), status: m.status, marks: m.marks.map((id) => MARKS.find((x) => x.id === id) ?? { id, name: id, text: '' }), lines: lines.slice(-80), location: getLocation(ch.locationId)?.name ?? '' };
}

// ───────────────────────────── Celular: estado, lanterna e mensagens entre jogadores
export async function phoneState(characterId: number) {
  if (!session) return null;
  const [m] = await db.select().from(schema.prologueMembers).where(eq(schema.prologueMembers.characterId, characterId));
  if (!m || m.sessionId !== session.id) return null;
  const [g] = await db.select().from(schema.prologueGroups).where(eq(schema.prologueGroups.id, m.groupId));
  const mates = await groupMembers(db, m.groupId);
  const all = await db.select().from(schema.prologueMembers).where(eq(schema.prologueMembers.sessionId, session.id));
  const chars = await charsOf(db, all.map((x) => x.characterId));
  const cname = (id: number) => { const c = chars.find((x) => x.id === id); return c ? nameOf(c) : ''; };
  const events = await db.select().from(schema.prologueEvents).where(and(eq(schema.prologueEvents.sessionId, session.id), eq(schema.prologueEvents.characterId, characterId))).orderBy(schema.prologueEvents.id);
  const a = g?.ask && (g.ask.recipients as number[]).includes(characterId) ? g.ask : null;
  const tally: Record<string, number> = {};
  if (a?.kind === 'poll') for (const v of Object.values(a.votes ?? {}) as string[]) tally[v] = (tally[v] ?? 0) + 1;
  return {
    session: { id: session.id, startedAt: session.startedAt.getTime(), speed: session.speed, signal: session.data.signal, powerOut: session.data.powerOut, act: session.data.act, minutes: SESSION_MINUTES },
    me: { status: m.status, battery: m.battery, light: m.light, marks: m.marks, deathCause: m.deathCause, free: !!m.flags.livre, freeIdle: !!m.flags.livre && g?.phase === 'free' },
    group: g ? { id: g.id, location: getLocation(g.locationId)?.name ?? '', members: mates.map((x) => ({ id: x.characterId, name: cname(x.characterId), status: x.status })) } : null,
    openAsk: a ? { askId: a.id, myVote: a.votes?.[characterId] ?? null, tally } : null,
    social: await socialOf(session.id),
    contacts: all.filter((x) => x.characterId !== characterId).map((x) => { const c = chars.find((y) => y.id === x.characterId); return { id: x.characterId, name: cname(x.characterId), profession: c?.profession ?? '' }; }),
    events,
  };
}

export async function setLight(characterId: number, on: boolean) {
  const [m] = await db.select().from(schema.prologueMembers).where(eq(schema.prologueMembers.characterId, characterId));
  if (!m || !isPrologueMember(characterId)) throw new Error('Você não está no Dia 1.');
  if (on && m.battery <= 0) throw new Error('O celular está sem bateria.');
  await db.update(schema.prologueMembers).set({ light: on }).where(eq(schema.prologueMembers.characterId, characterId));
  return { light: on };
}

/** SMS pelo celular: para o grupo ('grupo') ou para outro jogador do Dia 1. Precisa de bateria e de sinal ≥ 2. */
export async function phoneSend(characterId: number, to: number | 'grupo', text: string) {
  const clean = text.trim().slice(0, 400);
  if (!clean) throw new Error('Mensagem vazia.');
  if (!session) throw new Error('Você não está no Dia 1.');
  const [m] = await db.select().from(schema.prologueMembers).where(eq(schema.prologueMembers.characterId, characterId));
  if (!m || m.sessionId !== session.id) throw new Error('Você não está no Dia 1.');
  if (m.battery <= 0) throw new Error('O celular está sem bateria.');
  if ((session.data.signal ?? 4) < 2) throw new Error('Sem serviço. Fale pessoalmente (chat do local).');
  const [me] = await charsOf(db, [characterId]);
  const delayed = (session.data.signal ?? 4) === 3;
  if (to === 'grupo') {
    const mates = await groupMembers(db, m.groupId);
    await db.transaction((tx) => deliver(tx, mates.map((x) => ({ characterId: x.characterId, userId: x.userId })), 'msg', 'grupo', { from: nameOf(me), player: characterId, text: clean, delayed }));
    return { ok: true };
  }
  const [other] = await db.select().from(schema.prologueMembers).where(and(eq(schema.prologueMembers.characterId, to), eq(schema.prologueMembers.sessionId, session.id)));
  if (!other) throw new Error('Contato não encontrado.');
  await db.transaction(async (tx) => {
    await deliver(tx, [{ characterId, userId: m.userId }], 'msg', `p:${to}`, { from: nameOf(me), player: characterId, text: clean, mine: true, delayed });
    await deliver(tx, [{ characterId: to, userId: other.userId }], 'msg', `p:${characterId}`, { from: nameOf(me), player: characterId, text: clean, delayed });
  });
  return { ok: true };
}

/** Só para testes: injeta o estado da sessão. */
export function _resetPrologueMemory() { session = null; members.clear(); lobby.clear(); lastChooser.clear(); ambientLast.clear(); ambientUsed.clear(); ambientTurn.clear(); famAmbientUsed.clear(); famOf.clear(); nextGlobal.clear(); }
