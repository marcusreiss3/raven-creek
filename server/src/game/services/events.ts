import { and, desc, eq, gt } from 'drizzle-orm';
import { schema, type Tx } from '../../db/index.js';
import type { EventConditions } from '../../db/schema.js';
import { VEHICLE_TYPES } from '../content/structures.js';
import { rng } from '../rules/rng.js';
import { clock, getEventDefs, getZombieTypes } from './config.js';
import { getLocation } from './world.js';

export type EventDef = ReturnType<typeof getEventDefs>[number];
export type EventCtx = { scope: 'explore' | 'travel' | 'world'; category?: string; roadType?: string; danger?: number; vehicle?: boolean; locationId?: string };

export function matchesConditions(c: EventConditions, ctx: EventCtx) {
  const phase = clock().phase; const weather = clock().weather;
  if (c.categories?.length && (!ctx.category || !c.categories.includes(ctx.category))) return false;
  if (c.roadTypes?.length && (!ctx.roadType || !c.roadTypes.includes(ctx.roadType))) return false;
  if (c.timeOfDay?.length && !c.timeOfDay.includes(phase)) return false;
  if (c.weather?.length && !c.weather.includes(weather)) return false;
  if (c.minDanger !== undefined && (ctx.danger ?? 0) < c.minDanger) return false;
  if (c.vehicleOnly && !ctx.vehicle) return false;
  if (c.footOnly && ctx.vehicle) return false;
  return true;
}

/** Eventos elegíveis com seus pesos efetivos (também usado pelo painel para exibir probabilidades). */
export async function eligibleEvents(tx: Tx, ctx: EventCtx) {
  const defs = getEventDefs().filter((e) => e.scope === ctx.scope && matchesConditions(e.conditions, ctx));
  const out: EventDef[] = [];
  for (const d of defs) {
    if (d.cooldownMinutes > 0 && ctx.locationId) {
      const [last] = await tx.select().from(schema.eventLog)
        .where(and(eq(schema.eventLog.eventId, d.id), eq(schema.eventLog.locationId, ctx.locationId), gt(schema.eventLog.createdAt, new Date(Date.now() - d.cooldownMinutes * 60000))))
        .orderBy(desc(schema.eventLog.id)).limit(1);
      if (last) continue;
    }
    out.push(d);
  }
  return out;
}
export async function pickEvent(tx: Tx, ctx: EventCtx) {
  const pool = await eligibleEvents(tx, ctx);
  return rng.weighted(pool, (e) => e.weight);
}

/** Seleciona tipos de zumbis por categoria do local, horário e pesos configurados. */
export function pickZombies(category: string, count: number, restrictTypes?: string[], locationId?: string) {
  const night = clock().phase === 'night';
  const pool = getZombieTypes().filter((z) => (!z.allowedCategories.length || z.allowedCategories.includes(category)) && (!restrictTypes?.length || restrictTypes.includes(z.id)));
  const named = (locationId ? (getLocation(locationId)?.data?.namedZombies as string[] | undefined) : undefined) ?? [];
  const out: { type: string; behavior: string; stats: any; name: string }[] = [];
  for (let i = 0; i < count; i++) {
    const t = rng.weighted(pool.length ? pool : getZombieTypes(), (z) => z.spawnWeight * (night ? z.nightMultiplier : 1));
    if (!t) continue;
    const isNamed = i === 0 && named.length && rng.chance(0.25);
    out.push({ type: t.id, behavior: t.behavior, stats: t.stats, name: isNamed ? `${rng.pick(named)} (infectado)` : t.name });
  }
  return out;
}

export function randomVehicle(locationId: string | null) {
  const types = Object.keys(VEHICLE_TYPES);
  const type = rng.weighted(types, (t) => ({ compact: 5, pickup: 3, van: 2, motorcycle: 1.5, truck: 0.5, armored: 0.2 } as Record<string, number>)[t] ?? 1)!;
  const v = VEHICLE_TYPES[type];
  return {
    type, name: v.name, locationId, seats: v.seats, storage: v.storage, fuelMax: v.fuelMax, fuel: Math.round(v.fuelMax * rng.range(0, 0.5)),
    engine: Math.round(rng.range(25, 95)), tires: Math.round(rng.range(30, 100)), battery: Math.round(rng.range(0, 90)), body: Math.round(rng.range(40, 100)),
    speed: v.speed, consumption: v.consumption, noise: v.noise, hasKey: rng.chance(0.3),
  };
}

export async function logEvent(tx: Tx, eventId: string, locationId: string | null, characterId: number | null, details: Record<string, unknown> = {}, triggeredBy: number | null = null) {
  await tx.insert(schema.eventLog).values({ eventId, locationId, characterId, details, triggeredBy });
}
