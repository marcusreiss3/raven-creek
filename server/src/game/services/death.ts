import { and, eq, inArray, isNull } from 'drizzle-orm';
import { schema, type Tx } from '../../db/index.js';
import { DEATH_CAUSES } from '../rules/simulate.js';
import { SPAWN_LOCATION } from './characters.js';
import { cfg } from './config.js';
import { gameLog } from './infra.js';
import type { CharRow } from './inventory.js';
import { emitToUser, pushScene, pushSelf } from './realtime.js';
import { systemEmote } from './chat.js';
import { scheduleRise } from './risen.js';

/** Tempo até um corpo se decompor (no máximo 3 horas — o mundo não vira um cemitério a céu aberto). */
export const CORPSE_MAX_HOURS = 3;
export const corpseMs = () => Math.max(0.25, Math.min(CORPSE_MAX_HOURS, Number(cfg().permadeath.corpseHours ?? CORPSE_MAX_HOURS))) * 3_600_000;

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
    expiresAt: new Date(now.getTime() + corpseMs()), data: { characterId: ch.id, cause },
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

/** Causas que não têm volta: o corpo já virou (ou nem há o que salvar). */
const FINAL_CAUSES = new Set(['zombie_infection']);
export const isDowned = (needs: { downedUntil?: number } | null | undefined) => !!needs?.downedUntil;

/**
 * Em vez de morrer na hora, o personagem CAI: fica inconsciente e morre quando o prazo (1–3 min, configurável)
 * vence — a menos que alguém use um kit de primeiros socorros nele. Infecção zumbi não tem volta.
 * Retorna true se o personagem caiu (e false se morreu de vez).
 */
export async function downCharacter(tx: Tx, ch: CharRow, cause: string) {
  if (!ch.alive) return false;
  const pd = cfg().permadeath as any;
  if (pd.downedEnabled === false || FINAL_CAUSES.has(cause)) { await killCharacter(tx, ch, cause); return false; }
  if (isDowned(ch.needs)) return true; // já caído: o prazo não reinicia
  const min = Math.max(10, Number(pd.downedMinSeconds ?? 60)); const max = Math.max(min, Number(pd.downedMaxSeconds ?? 180));
  const seconds = Math.round(min + Math.random() * (max - min));
  const until = Date.now() + seconds * 1000;
  const blood = Math.max(Number(ch.needs.blood ?? 0), cfg().wounds.deathBlood + 1);
  const needs = { ...ch.needs, blood, vitality: Math.max(1, Number(ch.needs.vitality ?? 0)), unconscious: true, downedUntil: until, downedCause: cause };
  await tx.update(schema.characters).set({ needs, activity: 'idle', ...(ch.state === 'busy' ? { state: 'idle', busyUntil: null, busyAction: null } : {}) }).where(eq(schema.characters.id, ch.id));
  ch.needs = needs;
  const name = `${ch.firstName} ${ch.lastName}`;
  const mins = Math.max(1, Math.round(seconds / 60));
  await gameLog(tx, ch.id, 'death', `Você caiu (${DEATH_CAUSES[cause] ?? cause}). Sem um kit de primeiros socorros em cerca de ${mins} min, é o fim.`);
  if (ch.state !== 'traveling') await systemEmote(ch.locationId, `${name} desaba no chão e não se mexe. Ainda respira — com um kit de primeiros socorros dá para salvar (cerca de ${mins} min).`, 'system');
  emitToUser(ch.userId, 'character:downed', { until, cause: DEATH_CAUSES[cause] ?? cause });
  pushSelf(ch.id); pushScene(ch.locationId);
  return true;
}

/** Reanimar quem caiu: estabiliza (sangue, sangramentos) e acorda. Exige um kit de primeiros socorros do socorrista. */
export async function reviveInTx(tx: Tx, actor: CharRow, target: CharRow, medkitId?: number) {
  if (!isDowned(target.needs)) return null;
  if (actor.id === target.id) return null;
  const items = await tx.select().from(schema.items).where(and(eq(schema.items.ownerType, 'character'), eq(schema.items.ownerId, String(actor.id))));
  const kit = items.find((i) => (medkitId ? i.id === medkitId : true) && i.defId === 'first_aid_kit') ?? items.find((i) => i.defId === 'first_aid_kit');
  if (!kit) return { ok: false as const, error: 'Só um kit de primeiros socorros salva quem caiu.' };
  if (kit.durability > 1) await tx.update(schema.items).set({ durability: kit.durability - 1 }).where(eq(schema.items.id, kit.id));
  else await tx.delete(schema.items).where(eq(schema.items.id, kit.id));
  const w = cfg().wounds;
  const { downedUntil: _u, downedCause: _c, ...rest } = target.needs;
  const needs = { ...rest, unconscious: false, blood: Math.max(Number(target.needs.blood ?? 0), w.faintBlood + 8), vitality: Math.max(Number(target.needs.vitality ?? 0), 20), stress: Math.min(100, Number(target.needs.stress ?? 0) + 25) };
  await tx.update(schema.characters).set({ needs }).where(eq(schema.characters.id, target.id));
  target.needs = needs as typeof target.needs;
  // o kit estanca o pior: curativo limpo e sangramento contido nos ferimentos abertos
  const wounds = await tx.select().from(schema.wounds).where(and(eq(schema.wounds.characterId, target.id), isNull(schema.wounds.healedAt)));
  for (const wd of wounds) if (wd.bleeding > 0) await tx.update(schema.wounds).set({ bleeding: wd.bleeding * 0.25, bandaged: true, bandageDirt: 0, treatments: [...wd.treatments.filter((t) => t !== 'rag'), 'medkit'] }).where(eq(schema.wounds.id, wd.id));
  const text = `${actor.firstName} ${actor.lastName} usa um kit de primeiros socorros e traz ${target.firstName} ${target.lastName} de volta!`;
  await gameLog(tx, target.id, 'medical', `${actor.firstName} ${actor.lastName} salvou você com um kit de primeiros socorros.`);
  if (actor.state !== 'traveling') await systemEmote(actor.locationId, text, 'system');
  emitToUser(target.userId, 'character:revived', { by: `${actor.firstName} ${actor.lastName}` });
  pushSelf(actor.id); pushSelf(target.id); pushScene(actor.locationId);
  return { ok: true as const, text };
}

/** Ninguém fica "ao volante" depois de morrer: o veículo fica livre para quem chegar (e deixa de ter dono). */
async function releaseVehicle(tx: Tx, characterId: number) {
  await tx.update(schema.vehicles).set({ driverId: null, running: false }).where(eq(schema.vehicles.driverId, characterId));
  await tx.update(schema.vehicles).set({ ownerCharacterId: null }).where(eq(schema.vehicles.ownerCharacterId, characterId));
}
