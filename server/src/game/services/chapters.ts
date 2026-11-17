/**
 * Eventos globais de história (capítulos da lore), ativados pela administração.
 * Ver content/chapters.ts para o roteiro e os efeitos de cada capítulo.
 */
import { and, eq, or, sql } from 'drizzle-orm';
import { db, schema, type Tx } from '../../db/index.js';
import { CHAPTERS, chapterById, type Chapter, type ChapterEffect } from '../content/chapters.js';
import { radioBroadcast, systemEmote } from './chat.js';
import { setWeather } from './config.js';
import { addItem } from './inventory.js';
import { fail } from './infra.js';
import { emitAll, pushScene } from './realtime.js';
import { getLocation, loadWorld } from './world.js';

const STATE_KEY = 'loreChapters';
export type Bulletin = { key: string; kicker: string; title: string; text: string; at: string };
type LoreState = { ran: Record<string, { at: string; by: number; times: number }>; last: Bulletin | null };

async function readState(tx: Tx = db): Promise<LoreState> {
  const [r] = await tx.select().from(schema.gameConfig).where(eq(schema.gameConfig.key, STATE_KEY));
  const v = (r?.value ?? {}) as Partial<LoreState>;
  return { ran: v.ran ?? {}, last: v.last ?? null };
}
async function writeState(tx: Tx, s: LoreState, by: number) {
  await tx.insert(schema.gameConfig).values({ key: STATE_KEY, value: s, updatedBy: by })
    .onConflictDoUpdate({ target: schema.gameConfig.key, set: { value: s, updatedAt: new Date(), updatedBy: by } });
}

/** Último boletim (mostrado a quem conecta depois; o cliente lembra quais já viu). */
export async function lastBulletin() {
  const s = await readState();
  if (!s.last) return null;
  // boletins muito antigos não aparecem mais para quem chega (ficam no diário de quem estava vivo)
  return Date.now() - new Date(s.last.at).getTime() < 7 * 24 * 3_600_000 ? s.last : null;
}

/** Lista para o painel: roteiro, efeitos descritos e se já foi ativado. */
export async function listChapters() {
  const s = await readState();
  const { heliStatus } = await import('./heli.js');
  const heli = await heliStatus();
  return {
    chapters: [...CHAPTERS].sort((a, b) => a.order - b.order).map((c) => ({
      id: c.id, order: c.order, title: c.title, summary: c.summary, bulletin: c.special ? null : c.bulletin,
      effects: c.effects.map(describeEffect), radio: c.radio ?? [], ran: s.ran[c.id] ?? null,
      live: c.special === 'heli' ? heli : null,
    })),
    last: s.last,
  };
}

function describeEffect(e: ChapterEffect) {
  const n = (id: string) => getLocation(id)?.name ?? id;
  switch (e.type) {
    case 'crate': return `Caixote em ${n(e.locationId)}: ${e.items.map((i) => `${i.qty}× ${i.itemId}`).join(', ')}`;
    case 'zombies': return `+${e.add} infectados em ${n(e.locationId)}`;
    case 'horde': return `Nova horda${e.size ? ` (~${e.size})` : ''} perto de ${n(e.nearLocationId)}, indo para ${n(e.targetLocationId)}`;
    case 'retarget_hordes': return `Todas as hordas vão para ${n(e.targetLocationId)}`;
    case 'weather': return `Clima: ${e.weather}`;
    case 'danger': return `Perigo de ${n(e.locationId)} passa a ${Math.round(e.danger * 100)}%`;
    case 'block_road': return `Estrada bloqueada: ${n(e.fromId)} ↔ ${n(e.toId)}`;
    case 'stress': return `+${e.amount} de estresse em todos`;
  }
}

async function applyEffect(tx: Tx, e: ChapterEffect) {
  switch (e.type) {
    case 'crate': {
      if (!getLocation(e.locationId)) return;
      const [ct] = await tx.insert(schema.containers).values({ locationId: e.locationId, name: e.name, kind: 'crate', capacity: 999, data: { lore: true } }).returning();
      for (const it of e.items) await addItem(tx, 'container', ct.id, it.itemId, it.qty).catch(() => undefined);
      pushScene(e.locationId); return;
    }
    case 'zombies':
      await tx.update(schema.locationLoot).set({ zombies: sql`${schema.locationLoot.zombies} + ${e.add}` }).where(eq(schema.locationLoot.locationId, e.locationId));
      pushScene(e.locationId); return;
    case 'horde': {
      const { spawnHorde } = await import('./worldsim.js');
      const h = await spawnHorde(tx, e.nearLocationId);
      if (h) await tx.update(schema.hordes).set({ targetLocationId: e.targetLocationId, ...(e.size ? { size: e.size } : {}) }).where(eq(schema.hordes.id, h.id));
      return;
    }
    case 'retarget_hordes':
      await tx.update(schema.hordes).set({ targetLocationId: e.targetLocationId }).where(eq(schema.hordes.active, true)); return;
    case 'weather':
      await setWeather(e.weather); emitAll('world:weather', { weather: e.weather }); return;
    case 'danger':
      await tx.update(schema.locations).set({ danger: Math.max(0, Math.min(1, e.danger)) }).where(eq(schema.locations.id, e.locationId)); return;
    case 'block_road':
      await tx.update(schema.connections).set({ blocked: true, blockedReason: e.reason }).where(or(
        and(eq(schema.connections.fromId, e.fromId), eq(schema.connections.toId, e.toId)),
        and(eq(schema.connections.fromId, e.toId), eq(schema.connections.toId, e.fromId)),
      ));
      pushScene(e.fromId); pushScene(e.toId); return;
    case 'stress':
      await tx.update(schema.characters).set({ needs: sql`jsonb_set(${schema.characters.needs}, '{stress}', to_jsonb(least(100, coalesce((${schema.characters.needs}->>'stress')::numeric, 0) + ${e.amount})))` })
        .where(eq(schema.characters.alive, true));
      return;
  }
}

/** Anuncia para o condado inteiro: boletim em tela cheia, diário de todos e (opcional) rádio e narração local. */
async function announce(tx: Tx, key: string, b: { kicker: string; title: string; text: string }, radio: { author: string; text: string }[], emotes: { locationId: string; text: string }[]) {
  const bulletin: Bulletin = { key, ...b, at: new Date().toISOString() };
  const alive = await tx.select({ id: schema.characters.id }).from(schema.characters).where(eq(schema.characters.alive, true));
  if (alive.length) await tx.insert(schema.gameLogs).values(alive.map((c) => ({ characterId: c.id, kind: 'lore', message: `${b.title}: ${b.text.split('\n')[0]}`, data: { key } })));
  return { bulletin, after: async () => {
    emitAll('world:bulletin', bulletin);
    for (const e of emotes) if (getLocation(e.locationId)) await systemEmote(e.locationId, e.text, 'system').catch(() => undefined);
    for (const r of radio) await radioBroadcast(88.1, r.author, r.text).catch(() => undefined);
  } };
}

export async function runChapter(id: string, userId: number) {
  const c = chapterById(id); if (!c) fail('Capítulo inexistente.');
  const ch = c as Chapter;
  if (ch.special === 'heli') {
    // roteiro próprio: rádio ao vivo, queda, teste de 1d6, destroços (services/heli.ts)
    const { startHeliChapter } = await import('./heli.js');
    await startHeliChapter();
    await db.transaction(async (tx) => {
      const s = await readState(tx);
      s.ran[ch.id] = { at: new Date().toISOString(), by: userId, times: (s.ran[ch.id]?.times ?? 0) + 1 };
      await writeState(tx, s, userId);
    });
    return { ok: true };
  }
  let after: (() => Promise<void>) | null = null; let worldChanged = false;
  await db.transaction(async (tx) => {
    for (const e of ch.effects) { await applyEffect(tx, e); if (e.type === 'danger' || e.type === 'block_road') worldChanged = true; }
    const a = await announce(tx, `${ch.id}:${Date.now()}`, ch.bulletin, ch.radio ?? [], ch.emotes ?? []);
    const s = await readState(tx);
    s.ran[ch.id] = { at: a.bulletin.at, by: userId, times: (s.ran[ch.id]?.times ?? 0) + 1 };
    s.last = a.bulletin;
    await writeState(tx, s, userId);
    after = a.after;
  });
  if (worldChanged) await loadWorld(); // perigo e estradas vêm do banco
  if (ch.effects.some((e) => e.type === 'horde' || e.type === 'retarget_hordes')) (await import('./hordes.js')).broadcastHordes();
  await (after as (() => Promise<void>) | null)?.();
  return { ok: true };
}

/** Evento global escrito na hora pela administração (sem efeitos no mundo). */
export async function runCustom(userId: number, b: { kicker?: string; title: string; text: string; radioAuthor?: string; radio?: boolean }) {
  let after: (() => Promise<void>) | null = null;
  await db.transaction(async (tx) => {
    const a = await announce(tx, `custom:${Date.now()}`, { kicker: b.kicker?.trim() || 'Raven Creek', title: b.title.trim(), text: b.text.trim() },
      b.radio ? [{ author: b.radioAuthor?.trim() || 'Rádio KRVN', text: b.text.trim().slice(0, 900) }] : [], []);
    const s = await readState(tx); s.last = a.bulletin; await writeState(tx, s, userId);
    after = a.after;
  });
  await (after as (() => Promise<void>) | null)?.();
  return { ok: true };
}
