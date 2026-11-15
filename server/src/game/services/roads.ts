import { inArray } from 'drizzle-orm';
import { db, schema, type Tx } from '../../db/index.js';
import { cfg } from './config.js';
import { getLocation } from './world.js';

/**
 * Encontros na estrada.
 * Cada viagem tem uma posição no mapa: a interpolação entre origem e destino pelo progresso.
 * Dois grupos se avistam quando estão perto um do outro E as estradas fazem sentido juntas
 * (mesma estrada, em qualquer sentido, ou estradas que partem/chegam no mesmo local).
 */

type TravelRow = typeof schema.travels.$inferSelect;
export const ROAD_STATUSES = ['active', 'paused', 'awaiting_decision'] as const;

export const travelElapsed = (t: TravelRow, now = Date.now()) =>
  Math.min(t.durationMs, t.elapsedMs + (t.status === 'active' ? now - t.lastProgressAt.getTime() : 0));

export function travelPosition(t: TravelRow, now = Date.now()) {
  const a = getLocation(t.fromId); const b = getLocation(t.toId);
  if (!a || !b) return null;
  const k = t.durationMs > 0 ? travelElapsed(t, now) / t.durationMs : 1;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

const meetRadius = () => Number((cfg().travel as any).meetRadiusM ?? 150);
const sharesRoad = (a: TravelRow, b: TravelRow) => a.fromId === b.fromId || a.fromId === b.toId || a.toId === b.fromId || a.toId === b.toId;

export function canSee(a: TravelRow, b: TravelRow, now = Date.now()) {
  if (a.groupId === b.groupId || !sharesRoad(a, b)) return null;
  const pa = travelPosition(a, now); const pb = travelPosition(b, now);
  if (!pa || !pb) return null;
  const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
  return d <= meetRadius() ? Math.round(d) : null;
}

export async function roadTravels(tx: Tx = db) {
  return tx.select().from(schema.travels).where(inArray(schema.travels.status, [...ROAD_STATUSES]));
}

/** Viagens de outros grupos que este grupo consegue ver agora. */
export async function nearbyOf(groupId: string, tx: Tx = db) {
  const all = await roadTravels(tx);
  const mine = all.find((t) => t.groupId === groupId && t.isLeader) ?? all.find((t) => t.groupId === groupId);
  if (!mine) return [];
  const now = Date.now();
  return all.flatMap((t) => { const d = canSee(mine, t, now); return d === null ? [] : [{ travel: t, distance: d }]; });
}

export async function nearbyGroupIds(groupId: string) {
  return [...new Set((await nearbyOf(groupId)).map((n) => n.travel.groupId))];
}

/** Calcula quem vê quem (por grupo). Usado pelo tick para avisar quando alguém aparece ou some. */
export function sightingsMap(all: TravelRow[], now = Date.now()) {
  const leaders = new Map<string, TravelRow>();
  for (const t of all) if (!leaders.has(t.groupId) || t.isLeader) leaders.set(t.groupId, t);
  const seen = new Map<string, Set<string>>();
  const ls = [...leaders.values()];
  for (const a of ls) seen.set(a.groupId, new Set());
  for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) {
    if (canSee(ls[i], ls[j], now) !== null) { seen.get(ls[i].groupId)!.add(ls[j].groupId); seen.get(ls[j].groupId)!.add(ls[i].groupId); }
  }
  return seen;
}
