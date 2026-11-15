import { canFish, canHaveFire, canHunt, fireLit, fireMinutesLeft, fireWarmth, smokeNearby } from './nature.js';
import { dogsAt } from './dogs.js';
import { pendingCorpses, risenAt } from './risen.js';
import { muralCount, safesAt } from './stories.js';
import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { db, schema, type Tx } from '../../db/index.js';
import { clock, cfg, itemDef } from './config.js';
import { isUserOnline } from './realtime.js';
import { isPowered } from './projects.js';
import { PROJECTS } from '../content/projects.js';

type LocationRow = typeof schema.locations.$inferSelect;
type ConnRow = typeof schema.connections.$inferSelect;
let locs = new Map<string, LocationRow>();
let conns: ConnRow[] = [];

export async function loadWorld() {
  locs = new Map((await db.select().from(schema.locations)).map((l) => [l.id, l]));
  conns = await db.select().from(schema.connections);
}
export const getLocation = (id: string) => locs.get(id);
export const allLocations = () => [...locs.values()];
export const allConnections = () => conns;
export function connectionsFrom(id: string) {
  return conns.filter((c) => c.fromId === id || c.toId === id).map((c) => ({ ...c, other: c.fromId === id ? c.toId : c.fromId }));
}
export function findConnection(a: string, b: string) {
  return conns.find((c) => (c.fromId === a && c.toId === b) || (c.fromId === b && c.toId === a));
}

/** Dados públicos de uma cena (o que todos os presentes veem). */
export async function buildScene(locationId: string, tx: Tx = db) {
  const l = getLocation(locationId); if (!l) return null;
  const chars = await tx.select({
    id: schema.characters.id, userId: schema.characters.userId, firstName: schema.characters.firstName, lastName: schema.characters.lastName,
    portrait: schema.characters.portrait, portraitAdjust: schema.characters.portraitAdjust, state: schema.characters.state, activity: schema.characters.activity,
    appearance: schema.characters.appearance, followingId: schema.characters.followingId, combatId: schema.characters.combatId, needs: schema.characters.needs,
  }).from(schema.characters).where(and(eq(schema.characters.locationId, locationId), eq(schema.characters.alive, true), ne(schema.characters.state, 'traveling')));
  const ground = await tx.select().from(schema.items).where(and(eq(schema.items.ownerType, 'location'), eq(schema.items.ownerId, locationId)));
  const containers = await tx.select().from(schema.containers).where(eq(schema.containers.locationId, locationId));
  const vehicles = await tx.select().from(schema.vehicles).where(eq(schema.vehicles.locationId, locationId));
  const [base] = await tx.select().from(schema.bases).where(eq(schema.bases.locationId, locationId));
  const structures = base ? await tx.select().from(schema.baseStructures).where(eq(schema.baseStructures.baseId, base.id)) : [];
  const combats = await tx.select({ id: schema.combats.id, reason: schema.combats.reason }).from(schema.combats)
    .where(and(eq(schema.combats.locationId, locationId), eq(schema.combats.status, 'active')));
  const [ll] = await tx.select().from(schema.locationLoot).where(eq(schema.locationLoot.locationId, locationId));
  const hordesHere = await tx.select().from(schema.hordes).where(and(eq(schema.hordes.locationId, locationId), eq(schema.hordes.active, true)));
  let faction = null as null | { name: string; emblem: string; color: string };
  if (base?.factionId) { const [f] = await tx.select().from(schema.factions).where(eq(schema.factions.id, base.factionId)); if (f) faction = { name: f.name, emblem: f.emblem, color: f.color }; }
  const c = clock();
  const exits = connectionsFrom(locationId).map((cn) => {
    const o = getLocation(cn.other)!;
    return { connectionId: cn.id, toId: o.id, name: o.name, distance: cn.distance, roadType: cn.roadType, blocked: cn.blocked, blockedReason: cn.blockedReason, regionChange: o.regionId !== l.regionId, category: o.category };
  });
  const searchedRatio = ll ? ll.reserve / ll.maxReserve : 1;
  return {
    location: { id: l.id, name: l.name, description: l.description, category: l.category, regionId: l.regionId, sceneKey: l.sceneKey, musicKey: l.musicKey, indoor: l.indoor, buildable: l.buildable, tags: l.tags, data: l.data },
    powered: isPowered(l.id),
    project: (() => { const d = PROJECTS.find((x) => x.locationId === l.id); return d ? { id: d.id, name: d.name } : null; })(),
    looted: searchedRatio < 0.15 ? 'saqueado' : searchedRatio < 0.45 ? 'revirado' : searchedRatio < 0.8 ? 'mexido' : 'intocado',
    threat: describeThreat(ll?.zombies ?? 0, hordesHere.reduce((s, h) => s + h.size, 0)),
    characters: chars.map((ch) => ({
      id: ch.id, name: `${ch.firstName} ${ch.lastName}`, portrait: ch.portrait, portraitAdjust: ch.portraitAdjust, state: ch.state, activity: ch.activity,
      appearance: ch.appearance, online: isUserOnline(ch.userId), userId: ch.userId, followingId: ch.followingId, inCombat: !!ch.combatId,
      visibleCondition: visibleCondition(ch.needs),
    })),
    ground: ground.map((i) => ({ id: i.id, defId: i.defId, name: itemDef(i.defId)?.name ?? i.defId, quantity: i.quantity, icon: itemDef(i.defId)?.icon ?? 'generic', category: itemDef(i.defId)?.category })),
    containers: containers.map((ct) => ({ id: ct.id, name: ct.name, kind: ct.kind, baseId: ct.baseId })),
    vehicles: vehicles.map((v) => ({ id: v.id, name: v.name, type: v.type, seats: v.seats, running: v.running, driverId: v.driverId, condition: Math.round((v.engine + v.body) / 2) })),
    base: base ? { id: base.id, name: base.name, ownerCharacterId: base.ownerCharacterId, factionId: base.factionId, faction, structures: structures.map((s) => ({ id: s.id, kind: s.kind, hp: Math.round(s.hp), maxHp: s.maxHp, building: !!(s.completeAt && s.completeAt > new Date()) , completeAt: s.completeAt })) } : null,
    combats, exits,
    campfire: { lit: fireLit(l.id), minutesLeft: fireMinutesLeft(l.id), canHaveFire: canHaveFire(l.id) },
    smokeNearby: smokeNearby(l.id), canHunt: canHunt(l.id), canFish: canFish(l.id),
    dogs: await dogsAt(l.id, chars.map((ch) => ch.id), tx),
    risen: await risenAt(l.id, tx), pendingCorpses: await pendingCorpses(l.id, tx), safes: await safesAt(l.id, tx), muralCount: await muralCount(l.id, tx),
    time: { hour: c.hour, minute: c.minute, day: c.day, phase: c.phase, weather: c.weather, temperature: c.temperature + fireWarmth(l.id), season: (c as any).season, seasonDay: (c as any).seasonDay },
  };
}

export function visibleCondition(n: any) {
  if (!n) return 'normal';
  if (n.unconscious) return 'inconsciente';
  if (n.blood < 55) return 'muito pálido e ensanguentado';
  if (n.blood < 80) return 'ferido';
  if (n.sleepiness > 80) return 'exausto';
  return 'normal';
}
function describeThreat(z: number, horde: number) {
  if (horde > 0) return 'horda';
  if (z >= 8) return 'alta'; if (z >= 4) return 'média'; if (z >= 1) return 'baixa'; return 'nenhuma';
}

/** Personagens (não viajando) num local — usado para presença e chat local. */
export async function charactersAt(locationId: string, tx: Tx = db) {
  return tx.select({ id: schema.characters.id, userId: schema.characters.userId }).from(schema.characters)
    .where(and(eq(schema.characters.locationId, locationId), eq(schema.characters.alive, true), ne(schema.characters.state, 'traveling')));
}
export { inArray, or, sql };
export const lootCfg = () => cfg().loot;
