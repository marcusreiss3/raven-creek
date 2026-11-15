import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { STRUCTURES } from '../content/structures.js';
import { rng } from '../rules/rng.js';
import { cfg, clock, getEventDefs, setWeather, worldState } from './config.js';
import { logEvent, matchesConditions, pickEvent } from './events.js';
import { addItem } from './inventory.js';
import { emitAll, emitToLocation, pushScene } from './realtime.js';
import { radioBroadcast, systemEmote } from './chat.js';
import { allLocations, connectionsFrom, getLocation } from './world.js';
import { bridgeBlocksHordes, damageProjectsAt, hordeSpawnMultiplier, radioOnline } from './projects.js';
const lastRadioAlert = new Map<number, number>();

/** Clima: troca a cada N horas de jogo, com pesos configuráveis. */
export async function processWeather() {
  const c = clock(); const ws = worldState(); const every = cfg().world.weatherChangeEveryGameHours * 60;
  if (c.total - ws.weatherChangedAtGameMinutes < every) return;
  const seasonal = (cfg() as any).seasons?.weather?.[(c as any).season ?? ''] as Record<string, number> | undefined;
  const weights = seasonal ?? (cfg().world.weatherWeights as Record<string, number>);
  const next = rng.weighted(Object.keys(weights), (k) => weights[k]) ?? 'clear';
  await setWeather(next);
  emitAll('world:weather', { weather: next });
}

/** Eventos de mundo em locais ocupados (com cooldown e condições). */
export async function processWorldEvents() {
  const occupied = await db.selectDistinct({ locationId: schema.characters.locationId }).from(schema.characters).where(and(eq(schema.characters.alive, true), sql`${schema.characters.state} <> 'traveling'`));
  for (const { locationId } of occupied) {
    if (!rng.chance(cfg().world.worldEventChance)) continue;
    const loc = getLocation(locationId); if (!loc) continue;
    await db.transaction(async (tx) => {
      const ev = await pickEvent(tx, { scope: 'world', category: loc.category, danger: loc.danger, locationId });
      if (ev) await applyWorldEvent(tx, ev, locationId, null);
    });
  }
}

export async function applyWorldEvent(tx: any, ev: ReturnType<typeof getEventDefs>[number], locationId: string, triggeredBy: number | null) {
  const fx = ev.effects ?? {};
  await logEvent(tx, ev.id, locationId, null, { manual: !!triggeredBy }, triggeredBy);
  await systemEmote(locationId, ev.text, 'system');
  switch (ev.kind) {
    case 'loot': if (fx.loot) await addItem(tx, 'location', locationId, fx.loot.itemId, fx.loot.qty ?? 1); break;
    case 'weather': if (fx.weather) await setWeather(fx.weather); emitAll('world:weather', { weather: fx.weather }); break;
    case 'horde': await spawnHorde(tx, locationId); break;
    case 'structure_damage': {
      const [b] = await tx.select().from(schema.bases).where(eq(schema.bases.locationId, locationId));
      if (b) { const st = await tx.select().from(schema.baseStructures).where(eq(schema.baseStructures.baseId, b.id)); const t = st.length ? rng.pick(st as (typeof schema.baseStructures.$inferSelect)[]) : null; if (t) await tx.update(schema.baseStructures).set({ hp: Math.max(0, t.hp - (fx.structureDamage ?? 10)) }).where(eq(schema.baseStructures.id, t.id)); }
      break;
    }
    case 'combat': {
      // Infectados surgem: quem estiver livre e conectado no local entra em confronto; o resto aumenta a ameaça do local.
      const { startCombat } = await import('./combat.js');
      const { isUserOnline } = await import('./realtime.js');
      const here = (await tx.select().from(schema.characters).where(and(eq(schema.characters.locationId, locationId), eq(schema.characters.alive, true), eq(schema.characters.state, 'idle'))).for('update'))
        .filter((c: typeof schema.characters.$inferSelect) => isUserOnline(c.userId) && !c.needs.unconscious);
      const n = rng.int(fx.zombies?.min ?? 1, fx.zombies?.max ?? 2) + Math.max(0, here.length - 1);
      if (here.length) await startCombat(tx, { characters: here, locationId, zombieCount: n, zombieTypes: fx.types, reason: ev.text });
      else {
        const [ll] = await tx.select().from(schema.locationLoot).where(eq(schema.locationLoot.locationId, locationId));
        if (ll) await tx.update(schema.locationLoot).set({ zombies: ll.zombies + n }).where(eq(schema.locationLoot.locationId, locationId));
      }
      break;
    }
  }
  pushScene(locationId);
}

// ───────────────────────── Hordas ─────────────────────────
export async function spawnHorde(tx: any, nearLocationId?: string) {
  const active = await tx.select().from(schema.hordes).where(eq(schema.hordes.active, true));
  if (active.length >= cfg().hordes.maxActive) return null;
  const outdoor = allLocations().filter((l) => !l.indoor && ['road', 'forest', 'field', 'street'].includes(l.category));
  const start = nearLocationId ? (connectionsFrom(nearLocationId).map((c) => getLocation(c.other)!).find((l) => !l.indoor) ?? getLocation(nearLocationId)!) : rng.pick(outdoor);
  const bases = await tx.select().from(schema.bases);
  const target = bases.length && rng.chance(0.6) ? rng.pick(bases as { locationId: string }[]).locationId : rng.pick(outdoor).id;
  const [h] = await tx.insert(schema.hordes).values({ name: `Horda de ${start.name}`, size: rng.int(8, 25), locationId: start.id, targetLocationId: target, nextMoveAt: new Date(Date.now() + cfg().hordes.moveEveryMinutes * 60000) }).returning();
  await systemEmote(start.id, 'O chão vibra com centenas de passos arrastados. Uma horda está aqui!', 'system');
  return h;
}

/** Hordas migram passo a passo pelas conexões em direção ao alvo, aumentando o perigo por onde passam e atacando bases. */
export async function processHordes() {
  if (!cfg().hordes.enabled) return;
  const due = await db.select().from(schema.hordes).where(and(eq(schema.hordes.active, true), lte(schema.hordes.nextMoveAt, new Date())));
  for (const h of due) {
    await db.transaction(async (tx) => {
      const [ll] = await tx.select().from(schema.locationLoot).where(eq(schema.locationLoot.locationId, h.locationId));
      if (ll) await tx.update(schema.locationLoot).set({ zombies: Math.max(0, ll.zombies - Math.ceil(h.size / 3)) }).where(eq(schema.locationLoot.locationId, h.locationId));
      const next = stepToward(h.locationId, h.targetLocationId ?? h.locationId);
      if (next && next !== h.locationId) await damageProjectsAt(tx, next, h.size);
      if (!next || next === h.locationId) {
        await attackBase(tx, h);
        await tx.update(schema.hordes).set({ active: false }).where(eq(schema.hordes.id, h.id));
        await systemEmote(h.locationId, 'A horda se dispersa aos poucos.', 'system');
        return;
      }
      const [nl] = await tx.select().from(schema.locationLoot).where(eq(schema.locationLoot.locationId, next));
      if (nl) await tx.update(schema.locationLoot).set({ zombies: nl.zombies + Math.ceil(h.size / 3) }).where(eq(schema.locationLoot.locationId, next));
      await tx.update(schema.hordes).set({ locationId: next, nextMoveAt: new Date(Date.now() + cfg().hordes.moveEveryMinutes * 60000) }).where(eq(schema.hordes.id, h.id));
      const loc = getLocation(next)!;
      await systemEmote(next, `Uma horda de ~${h.size} infectados chega a ${loc.name}!`, 'system');
      for (const c of connectionsFrom(next)) emitToLocation(c.other, 'notify', { text: `Gemidos vindos da direção de ${loc.name}. Uma horda se move por ali.`, level: 'warn', at: Date.now() });
      if (next === h.targetLocationId) await attackBase(tx, h);
      if (radioOnline() && Date.now() - (lastRadioAlert.get(h.id) ?? 0) > 30 * 60000) {
        lastRadioAlert.set(h.id, Date.now());
        await radioBroadcast(88.1, 'Rádio KRVN', `Alerta: horda de ~${h.size} infectados avistada em ${loc.name}, seguindo na direção de ${getLocation(h.targetLocationId ?? next)?.name ?? 'desconhecida'}.`).catch(() => undefined);
      }
      pushScene(next); pushScene(h.locationId);
    });
  }
  if (rng.chance(cfg().hordes.spawnChancePerHour * hordeSpawnMultiplier() * (cfg().world.eventRollEveryMinutes / 60))) {
    const h = await db.transaction((tx) => spawnHorde(tx));
    if (h && radioOnline()) await radioBroadcast(88.1, 'Rádio KRVN', `Nova horda de ~${h.size} infectados formada perto de ${getLocation(h.locationId)?.name}.`).catch(() => undefined);
  }
}

function stepToward(from: string, to: string) {
  if (from === to) return from;
  const prev = new Map<string, string>(); const q = [from]; const seen = new Set([from]);
  const blocked = bridgeBlocksHordes() ? new Set(['hw_bridge']) : new Set<string>(); // ponte fortificada: hordas não passam
  while (q.length) {
    const cur = q.shift()!; if (cur === to) break;
    for (const c of connectionsFrom(cur)) if (!seen.has(c.other) && !blocked.has(c.other)) { seen.add(c.other); prev.set(c.other, cur); q.push(c.other); }
  }
  if (!prev.has(to)) return null;
  let cur = to; while (prev.get(cur) !== from) cur = prev.get(cur)!;
  return cur;
}

async function attackBase(tx: any, h: typeof schema.hordes.$inferSelect) {
  const [b] = await tx.select().from(schema.bases).where(eq(schema.bases.locationId, h.targetLocationId ?? h.locationId));
  if (!b) return;
  const st: (typeof schema.baseStructures.$inferSelect)[] = await tx.select().from(schema.baseStructures).where(eq(schema.baseStructures.baseId, b.id));
  const defense = st.reduce((s, x) => s + (STRUCTURES[x.kind]?.defense ?? 0) * (x.hp / x.maxHp), 0);
  let damage = Math.max(0, h.size * cfg().hordes.structureDamagePerZombie * 10 - defense * 2);
  const defensive = st.filter((x) => (STRUCTURES[x.kind]?.defense ?? 0) > 0).sort((a, b2) => b2.hp - a.hp);
  for (const s of defensive) { if (damage <= 0) break; const d = Math.min(s.hp, damage); await tx.update(schema.baseStructures).set({ hp: s.hp - d }).where(eq(schema.baseStructures.id, s.id)); damage -= d; }
  const breached = damage > 0;
  const [ll] = await tx.select().from(schema.locationLoot).where(eq(schema.locationLoot.locationId, b.locationId));
  if (ll) await tx.update(schema.locationLoot).set({ zombies: ll.zombies + (breached ? Math.ceil(h.size / 2) : 2) }).where(eq(schema.locationLoot.locationId, b.locationId));
  await systemEmote(b.locationId, breached ? `A horda rompeu as defesas de "${b.name}"! Infectados invadem a base — defendam-se ou fujam!` : `A horda castiga as barricadas de "${b.name}", mas elas resistem.`, 'system');
  pushScene(b.locationId);
}

/** Corpos expiram; contêineres de corpos vazios somem. */
export async function cleanupCorpses() {
  const expired = await db.select().from(schema.containers).where(and(eq(schema.containers.kind, 'corpse'), lte(schema.containers.expiresAt, new Date())));
  for (const c of expired) await db.transaction(async (tx) => {
    await tx.update(schema.items).set({ ownerType: 'location', ownerId: c.locationId }).where(and(eq(schema.items.ownerType, 'container'), eq(schema.items.ownerId, String(c.id))));
    await tx.delete(schema.containers).where(eq(schema.containers.id, c.id));
    pushScene(c.locationId);
  });
}

/** Eventos narrativos agendados por mestres. */
export async function processScheduledEvents() {
  const due = await db.select().from(schema.scheduledEvents).where(and(eq(schema.scheduledEvents.done, false), lte(schema.scheduledEvents.runAt, new Date())));
  for (const s of due) await db.transaction(async (tx) => {
    const [row] = await tx.update(schema.scheduledEvents).set({ done: true }).where(and(eq(schema.scheduledEvents.id, s.id), eq(schema.scheduledEvents.done, false))).returning();
    if (!row) return;
    const ev = getEventDefs().find((e) => e.id === s.eventId);
    if (ev) await applyWorldEvent(tx, ev, s.locationId, s.createdBy);
  });
}
export { matchesConditions, inArray };
