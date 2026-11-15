import { and, eq, gt, inArray } from 'drizzle-orm';
import { db, schema, type Tx } from '../../db/index.js';
import { STRUCTURES } from '../content/structures.js';
import { clamp, rng } from '../rules/rng.js';
import { systemEmote } from './chat.js';
import { startCombat } from './combat.js';
import { cfg, clock } from './config.js';
import { gameLog } from './infra.js';
import { isUserOnline, pushScene } from './realtime.js';
import { getLocation } from './world.js';
import { isPowered, zoneZombieMods } from './projects.js';
import { fireLit, smokeMultiplier } from './nature.js';
import { dogThreatMultiplier } from './dogs.js';

/** Luz elétrica ou de fogueira: a noite não deixa o local mais perigoso. */
const litAt = (locationId: string) => isPowered(locationId) || fireLit(locationId);

/**
 * Infectados que vivem nos locais (location_loot.zombies) agora representam perigo real:
 *  • emboscada ao CHEGAR num local infestado;
 *  • ataques de surpresa a quem fica PARADO num local infestado (checagem periódica);
 *  • infectados voltam a vagar pelos locais com o tempo (até um limite pela periculosidade).
 * Jogadores desconectados não são atacados (mesma regra do PVP); novatos sofrem menos.
 */

type CharRow = typeof schema.characters.$inferSelect;
const Z = () => ({
  arrivalAmbushBase: 0.16, idleAttackPerCheck: 0.05, nightMultiplier: 1.5, restingMultiplier: 1.3, newbieMultiplier: 0.4,
  baseDefenseReduction: 0.05, respawnPerHour: 0.6, maxPerDanger: 10, stealthReduction: 0.06, baseBlockRespawnDefense: 24,
  ...((cfg() as any).zombies ?? {}),
});

const fullName = (c: CharRow) => `${c.firstName} ${c.lastName}`;
const names = (cs: CharRow[]) => cs.length > 1 ? `${cs.slice(0, -1).map(fullName).join(', ')} e ${fullName(cs[cs.length - 1])}` : fullName(cs[0]);

export async function baseDefense(tx: Tx, locationId: string) {
  const [b] = await tx.select().from(schema.bases).where(eq(schema.bases.locationId, locationId));
  if (!b) return 0;
  const st = await tx.select().from(schema.baseStructures).where(eq(schema.baseStructures.baseId, b.id));
  return st.reduce((s, x) => s + ((STRUCTURES as any)[x.kind]?.defense ?? 0) * (x.hp / Math.max(1, x.maxHp)), 0);
}

/** Probabilidade de os infectados de um local notarem um grupo. */
export function zombieThreatChance(base: number, danger: number, zombies: number, opts: { night: boolean; resting: boolean; newbie: boolean; stealth: number; defense: number }) {
  const z = Z();
  if (zombies <= 0) return 0;
  return clamp(base * (0.4 + danger) * Math.min(1.6, 0.4 + zombies / 5)
    * (opts.night ? z.nightMultiplier : 1) * (opts.resting ? z.restingMultiplier : 1) * (opts.newbie ? z.newbieMultiplier : 1)
    * (1 - Math.min(0.6, opts.stealth * z.stealthReduction)) * (1 - Math.min(0.9, opts.defense * z.baseDefenseReduction)), 0, 0.85);
}

async function ambush(tx: Tx, locationId: string, targets: CharRow[], zombiesHere: number, reason: string, emote: string) {
  const loc = getLocation(locationId); if (!loc) return false;
  const n = Math.max(1, Math.min(zombiesHere, rng.int(1, loc.danger > 0.6 ? 3 : 2) + Math.max(0, targets.length - 1)));
  await startCombat(tx, { characters: targets, locationId, zombieCount: n, reason });
  for (const c of targets) await gameLog(tx, c.id, 'combat', reason);
  await systemEmote(locationId, emote, 'system');
  pushScene(locationId);
  return true;
}

/** Chamado na chegada de um grupo a um local (dentro da transação de chegada, com os personagens travados). */
export async function arrivalAmbush(tx: Tx, locationId: string, arrived: CharRow[]) {
  const loc = getLocation(locationId); if (!loc) return false;
  const targets = arrived.filter((c) => c.alive && !c.needs.unconscious && isUserOnline(c.userId));
  if (!targets.length) return false;
  const [ll] = await tx.select().from(schema.locationLoot).where(eq(schema.locationLoot.locationId, locationId));
  const zombies = ll?.zombies ?? 0; if (zombies <= 0) return false;
  const now = new Date();
  const p = zoneZombieMods(locationId).threat * smokeMultiplier(locationId) * (await dogThreatMultiplier(targets.map((c) => c.id), tx)) * zombieThreatChance(Z().arrivalAmbushBase, loc.danger, zombies, {
    night: clock().phase === 'night' && !litAt(locationId), resting: false, newbie: targets.every((c) => c.protectedUntil && c.protectedUntil > now),
    stealth: Math.max(...targets.map((c) => c.skills.stealth?.level ?? 0)), defense: await baseDefense(tx, locationId),
  });
  if (!rng.chance(p)) return false;
  return ambush(tx, locationId, targets, zombies, `Ao chegar em ${loc.name}, infectados avançam!`, `Gemidos! Infectados avançam sobre ${names(targets)} assim que ${targets.length > 1 ? 'chegam' : 'chega'}!`);
}

/** Checagem periódica: infectados do local encontram quem está parado ali (acordado ou dormindo). */
export async function processLurkingZombies() {
  const occupied = await db.select().from(schema.characters).where(and(eq(schema.characters.alive, true), eq(schema.characters.state, 'idle')));
  const online = occupied.filter((c) => isUserOnline(c.userId) && !c.needs.unconscious);
  const byLoc = new Map<string, CharRow[]>();
  for (const c of online) byLoc.set(c.locationId, [...(byLoc.get(c.locationId) ?? []), c]);
  if (!byLoc.size) return;
  const lls = await db.select().from(schema.locationLoot).where(and(inArray(schema.locationLoot.locationId, [...byLoc.keys()]), gt(schema.locationLoot.zombies, 0)));
  const night = clock().phase === 'night';
  for (const ll of lls) {
    const loc = getLocation(ll.locationId); if (!loc) continue;
    const here = byLoc.get(ll.locationId)!; const now = new Date();
    const defense = await baseDefense(db, ll.locationId);
    const p = zoneZombieMods(ll.locationId).threat * smokeMultiplier(ll.locationId) * (await dogThreatMultiplier(here.map((c) => c.id))) * zombieThreatChance(Z().idleAttackPerCheck, loc.danger, ll.zombies, {
      night: night && !litAt(ll.locationId), resting: here.every((c) => c.activity !== 'idle'), newbie: here.every((c) => c.protectedUntil && c.protectedUntil > now),
      stealth: Math.max(...here.map((c) => c.skills.stealth?.level ?? 0)), defense,
    });
    if (!rng.chance(p)) continue;
    await db.transaction(async (tx) => {
      const ids = here.map((c) => c.id);
      const fresh = (await tx.select().from(schema.characters).where(inArray(schema.characters.id, ids)).for('update'))
        .filter((c) => c.alive && c.state === 'idle' && c.locationId === ll.locationId && !c.needs.unconscious && isUserOnline(c.userId));
      if (!fresh.length) return;
      const sleeping = fresh.some((c) => c.activity === 'sleeping');
      await ambush(tx, ll.locationId, fresh, ll.zombies,
        sleeping ? `Você acorda com gemidos — infectados encontraram o grupo em ${loc.name}!` : `Infectados que vagavam por ${loc.name} encontraram vocês!`,
        `Infectados surgem em ${loc.name} e avançam sobre ${names(fresh)}!`);
    }).catch((e) => console.error('lurking zombies', e));
  }
}

/**
 * Barulho (tiro de caça etc.): os infectados do local podem vir atrás de quem fez o barulho
 * e de quem estiver parado ali com ele.
 */
export async function zombieNoiseCheck(locationId: string, characterId: number, base: number) {
  const loc = getLocation(locationId); if (!loc) return false;
  const [ll] = await db.select().from(schema.locationLoot).where(eq(schema.locationLoot.locationId, locationId));
  if (!ll || ll.zombies <= 0) return false;
  const p = clamp(base * (0.4 + loc.danger) * Math.min(1.6, 0.4 + ll.zombies / 5) * (clock().phase === 'night' && !litAt(locationId) ? Z().nightMultiplier : 1), 0, 0.85);
  if (!rng.chance(p)) return false;
  return db.transaction(async (tx) => {
    const here = (await tx.select().from(schema.characters).where(and(eq(schema.characters.locationId, locationId), eq(schema.characters.alive, true))).for('update'))
      .filter((c) => c.state === 'idle' && !c.needs.unconscious && isUserOnline(c.userId));
    const maker = here.find((c) => c.id === characterId);
    if (!maker) return false;
    return ambush(tx, locationId, here, ll.zombies, `O barulho atraiu os infectados de ${loc.name}!`, `O estampido ecoa por ${loc.name}. Logo depois, gemidos — infectados vêm na direção de ${names(here)}!`);
  });
}

/** Quanto uma base deixa os infectados voltarem: 1 = normal, 0 = bloqueado (defesa ≥ baseBlockRespawnDefense). */
export function baseRespawnFactor(defense: number) {
  return Math.max(0, 1 - defense / Math.max(1, Z().baseBlockRespawnDefense));
}

/** Defesa atual de todas as bases, por local (estruturas danificadas contam proporcionalmente). */
async function defenseByLocation() {
  const bases = await db.select().from(schema.bases);
  if (!bases.length) return new Map<string, number>();
  const st = await db.select().from(schema.baseStructures).where(inArray(schema.baseStructures.baseId, bases.map((b) => b.id)));
  const out = new Map<string, number>();
  for (const b of bases) out.set(b.locationId, st.filter((x) => x.baseId === b.id).reduce((s, x) => s + ((STRUCTURES as any)[x.kind]?.defense ?? 0) * (x.hp / Math.max(1, x.maxHp)), 0));
  return out;
}

/**
 * Infectados voltam a vagar pelos locais com o tempo (até danger × maxPerDanger).
 * Numa base, as defesas seguram os infectados do lado de fora: quanto mais defesa, menos voltam;
 * com barricada + porta reforçada (defesa 24) não voltam mais — só entram se uma horda romper as defesas.
 */
export async function respawnZombies(hours: number) {
  if (hours <= 0) return;
  const z = Z();
  const lls = await db.select().from(schema.locationLoot);
  const defense = await defenseByLocation();
  for (const ll of lls) {
    const loc = getLocation(ll.locationId); if (!loc) continue;
    const cap = Math.round(loc.danger * z.maxPerDanger);
    if (ll.zombies >= cap) continue;
    const factor = (defense.has(ll.locationId) ? baseRespawnFactor(defense.get(ll.locationId)!) : 1) * zoneZombieMods(ll.locationId).respawn;
    if (factor <= 0) continue;
    const expected = z.respawnPerHour * hours * (0.3 + loc.danger) * factor;
    const add = Math.floor(expected) + (rng.chance(expected - Math.floor(expected)) ? 1 : 0);
    if (add > 0) await db.update(schema.locationLoot).set({ zombies: Math.min(cap, ll.zombies + add) }).where(eq(schema.locationLoot.locationId, ll.locationId));
  }
}
