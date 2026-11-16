import { and, eq, inArray } from 'drizzle-orm';
import { schema, type Tx } from '../../db/index.js';
import { DEATH_CAUSES } from '../rules/simulate.js';
import { SPAWN_LOCATION } from './characters.js';
import { cfg } from './config.js';
import { gameLog } from './infra.js';
import type { CharRow } from './inventory.js';
import { emitToUser, pushScene, pushSelf } from './realtime.js';
import { systemEmote } from './chat.js';
import { scheduleRise } from './risen.js';

/**
 * Morte de personagem. Com permadeath: deixa de ser jogável, o corpo (com o inventário) fica no local
 * por um tempo, entra no memorial e — se a causa foi infecção zumbi e o servidor permitir — reanima.
 * Sem permadeath: o personagem desperta no ponto inicial sem o inventário (que fica no corpo).
 */
export async function killCharacter(tx: Tx, ch: CharRow, cause: string) {
  if (!ch.alive) return;
  const pd = cfg().permadeath; const now = new Date();
  const name = `${ch.firstName} ${ch.lastName}`;
  const locationId = ch.locationId;
  const [corpse] = await tx.insert(schema.containers).values({
    locationId, name: `Corpo de ${name}`, kind: 'corpse', capacity: 999,
    expiresAt: new Date(now.getTime() + pd.corpseHours * 3_600_000), data: { characterId: ch.id, cause },
  }).returning();
  await tx.update(schema.items).set({ ownerType: 'container', ownerId: String(corpse.id), slot: null })
    .where(and(eq(schema.items.ownerType, 'character'), eq(schema.items.ownerId, String(ch.id))));
  await tx.update(schema.travels).set({ status: 'returned' }).where(and(eq(schema.travels.characterId, ch.id), inArray(schema.travels.status, ['active', 'paused', 'awaiting_decision', 'combat'])));
  await tx.update(schema.characters).set({ followingId: null }).where(eq(schema.characters.followingId, ch.id));
  if (ch.vehicleId) await tx.update(schema.vehicles).set({ driverId: null }).where(eq(schema.vehicles.driverId, ch.id));

  if (!pd.enabled) {
    await tx.update(schema.wounds).set({ healedAt: now, healing: 1 }).where(eq(schema.wounds.characterId, ch.id));
    await tx.update(schema.conditions).set({ resolvedAt: now }).where(eq(schema.conditions.characterId, ch.id));
    await releaseVehicle(tx, ch.id);
    await tx.update(schema.characters).set({
      locationId: SPAWN_LOCATION, state: 'idle', activity: 'idle', combatId: null, vehicleId: null, busyUntil: null, busyAction: null,
      needs: { hunger: 30, thirst: 30, sleepiness: 30, stamina: 60, energy: 50, stress: 60, bodyTemp: 37, blood: 80, boredom: 0, vitality: 70 },
    }).where(eq(schema.characters.id, ch.id));
    await gameLog(tx, ch.id, 'death', `Você "morreu" (${DEATH_CAUSES[cause] ?? cause}), mas o servidor está sem morte permanente. Você desperta em Raven Creek sem seus pertences.`);
    await scheduleRise(tx, { ...ch, locationId }, corpse.id, cause);
    await systemEmote(locationId, `${name} cai… e não se move mais.`, 'system');
    pushSelf(ch.id); pushScene(locationId); pushScene(SPAWN_LOCATION);
    return;
  }

  await releaseVehicle(tx, ch.id);
  await tx.update(schema.characters).set({
    alive: false, state: 'dead', activity: 'idle', diedAt: now, deathCause: cause, combatId: null, busyUntil: null, busyAction: null, vehicleId: null,
  }).where(eq(schema.characters.id, ch.id));
  await tx.update(schema.conditions).set({ resolvedAt: now }).where(eq(schema.conditions.characterId, ch.id));
  await tx.delete(schema.factionMembers).where(eq(schema.factionMembers.characterId, ch.id));
  const reanimates = cfg().permadeath.enabled && ((cfg() as any).risen?.enabled ?? true);
  await scheduleRise(tx, ch, corpse.id, cause);
  await gameLog(tx, ch.id, 'death', `${name} morreu. Causa: ${DEATH_CAUSES[cause] ?? cause}.${reanimates ? ' O corpo vai se levantar se ninguém impedir.' : ''}`);
  await systemEmote(locationId, `${name} está morto.`, 'system');
  emitToUser(ch.userId, 'character:death', { characterId: ch.id, name, cause: DEATH_CAUSES[cause] ?? cause, reanimated: reanimates });
  pushScene(locationId);
}

/** Ninguém fica "ao volante" depois de morrer: o veículo fica livre para quem chegar (e deixa de ter dono). */
async function releaseVehicle(tx: Tx, characterId: number) {
  await tx.update(schema.vehicles).set({ driverId: null, running: false }).where(eq(schema.vehicles.driverId, characterId));
  await tx.update(schema.vehicles).set({ ownerCharacterId: null }).where(eq(schema.vehicles.ownerCharacterId, characterId));
}
