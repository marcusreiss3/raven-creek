import { and, eq, inArray, lte } from 'drizzle-orm';
import { db, schema, type Tx } from '../../db/index.js';
import { clamp, rng } from '../rules/rng.js';
import { assertCanAct, withCharacter } from './characters.js';
import { systemEmote } from './chat.js';
import { cfg, getZombieTypes } from './config.js';
import { fail, gameLog } from './infra.js';
import { emitAll, pushScene, pushSelf } from './realtime.js';
import { getLocation } from './world.js';

/**
 * Mortos que levantam: o corpo de um sobrevivente se ergue depois de um tempo como infectado com nome,
 * carregando o que tinha. Dá para impedir destruindo o cérebro do corpo antes. Quem derruba o
 * infectado recupera os pertences.
 */
const R = () => ({ enabled: true, delayMinutes: 10, infectionDelayMinutes: 1, bodyMultiplier: 1.6, apBonus: 1, ...((cfg() as any).risen ?? {}) });

/** Chamado na morte (dentro da transação), depois de criado o corpo. */
export async function scheduleRise(tx: Tx, ch: { id: number; firstName: string; lastName: string; portrait: string | null; locationId: string }, corpseId: number, cause: string) {
  if (!R().enabled) return;
  const minutes = cause === 'zombie_infection' ? R().infectionDelayMinutes : R().delayMinutes;
  await tx.insert(schema.risen).values({
    characterId: ch.id, name: `${ch.firstName} ${ch.lastName}`, portrait: ch.portrait, locationId: ch.locationId, corpseContainerId: corpseId,
    status: 'pending', risesAt: new Date(Date.now() + minutes * 60000), data: { cause },
  });
}

/** Corpos cujo tempo chegou se levantam. */
export async function processRisen() {
  const due = await db.select().from(schema.risen).where(and(eq(schema.risen.status, 'pending'), lte(schema.risen.risesAt, new Date())));
  for (const r of due) {
    await db.transaction(async (tx) => {
      const [fresh] = await tx.select().from(schema.risen).where(eq(schema.risen.id, r.id)).for('update');
      if (!fresh || fresh.status !== 'pending') return;
      const [corpse] = fresh.corpseContainerId ? await tx.select().from(schema.containers).where(eq(schema.containers.id, fresh.corpseContainerId)) : [];
      const locationId = corpse?.locationId ?? fresh.locationId;
      if (corpse) {
        await tx.update(schema.items).set({ ownerType: 'risen', ownerId: String(fresh.id), slot: null }).where(and(eq(schema.items.ownerType, 'container'), eq(schema.items.ownerId, String(corpse.id))));
        await tx.delete(schema.containers).where(eq(schema.containers.id, corpse.id));
      }
      await tx.update(schema.risen).set({ status: 'active', locationId, corpseContainerId: null }).where(eq(schema.risen.id, fresh.id));
      await systemEmote(locationId, `O corpo de ${fresh.name} se contorce… e se levanta. Os olhos estão vazios.`, 'system');
      if (fresh.characterId) await gameLog(tx, fresh.characterId, 'death', `Seu corpo se levantou como infectado em ${getLocation(locationId)?.name ?? locationId}.`);
      pushScene(locationId);
    });
    emitAll('notify', { icon: 'risen', text: `Dizem que ${r.name} foi visto andando de novo em ${getLocation(r.locationId)?.name ?? 'algum lugar'}…`, level: 'danger', at: Date.now() });
  }
}

/** Infectados nomeados ativos num local (para a cena). */
export async function risenAt(locationId: string, tx: Tx = db) {
  const rows = await tx.select().from(schema.risen).where(and(eq(schema.risen.locationId, locationId), eq(schema.risen.status, 'active')));
  const items = rows.length ? await tx.select().from(schema.items).where(and(eq(schema.items.ownerType, 'risen'), inArray(schema.items.ownerId, rows.map((r) => String(r.id))))) : [];
  return rows.map((r) => ({ id: r.id, name: r.name, portrait: r.portrait, inCombat: !!r.combatId, carrying: items.filter((i) => i.ownerId === String(r.id)).length }));
}
/** Corpos que ainda vão levantar (para a opção de destruir o cérebro). */
export async function pendingCorpses(locationId: string, tx: Tx = db) {
  const rows = await tx.select().from(schema.risen).where(and(eq(schema.risen.status, 'pending')));
  const ids = rows.map((r) => r.corpseContainerId).filter(Boolean) as number[];
  if (!ids.length) return [];
  const cts = await tx.select().from(schema.containers).where(and(inArray(schema.containers.id, ids), eq(schema.containers.locationId, locationId)));
  return rows.filter((r) => cts.some((c) => c.id === r.corpseContainerId)).map((r) => ({ containerId: r.corpseContainerId!, name: r.name, risesAt: r.risesAt }));
}

/** Unidades de combate para os mortos que levantaram num local (que não estão em outro confronto). */
export async function risenForCombat(tx: Tx, locationId: string, onlyId?: number) {
  const rows = await tx.select().from(schema.risen).where(and(eq(schema.risen.locationId, locationId), eq(schema.risen.status, 'active'), onlyId ? eq(schema.risen.id, onlyId) : undefined)).for('update');
  const active = rows.length ? await tx.select({ id: schema.combats.id }).from(schema.combats).where(and(inArray(schema.combats.id, rows.map((r) => r.combatId ?? -1)), eq(schema.combats.status, 'active'))) : [];
  const free = rows.filter((r) => !r.combatId || !active.some((c) => c.id === r.combatId)).slice(0, 2);
  const walker = getZombieTypes().find((z) => z.id === 'walker') ?? getZombieTypes()[0];
  return free.map((r) => ({
    risenId: r.id, portrait: r.portrait, type: walker.id, behavior: 'shambler',
    stats: { ...walker.stats, body: Math.round(walker.stats.body * R().bodyMultiplier), ap: walker.stats.ap + R().apBonus },
    name: `${r.name} (infectado)`,
  }));
}
export async function markRisenInCombat(tx: Tx, ids: number[], combatId: number) {
  if (ids.length) await tx.update(schema.risen).set({ combatId }).where(inArray(schema.risen.id, ids));
}

/** Fim de confronto: quem foi derrubado larga os pertences; os outros voltam a vagar. */
export async function settleRisen(tx: Tx, units: { risenId?: number; out: string | null }[], locationId: string | undefined, killerName: string | null) {
  for (const u of units) {
    if (!u.risenId) continue;
    const [r] = await tx.select().from(schema.risen).where(eq(schema.risen.id, u.risenId));
    if (!r) continue;
    if (u.out === 'dead') {
      const loc = locationId ?? r.locationId;
      const [ct] = await tx.insert(schema.containers).values({
        locationId: loc, name: `Restos de ${r.name}`, kind: 'corpse', capacity: 999,
        expiresAt: new Date(Date.now() + (await import('./death.js')).corpseMs()), data: { risenId: r.id },
      }).returning();
      await tx.update(schema.items).set({ ownerType: 'container', ownerId: String(ct.id) }).where(and(eq(schema.items.ownerType, 'risen'), eq(schema.items.ownerId, String(r.id))));
      await tx.update(schema.risen).set({ status: 'killed', combatId: null, data: { ...r.data, killedBy: killerName } }).where(eq(schema.risen.id, r.id));
      await systemEmote(loc, `${r.name} finalmente descansa. Os pertences ficaram no chão: "Restos de ${r.name}".`, 'system');
      pushScene(loc);
    } else await tx.update(schema.risen).set({ combatId: null }).where(eq(schema.risen.id, r.id));
  }
}

/** Destruir o cérebro de um corpo antes que levante. */
export async function destroyCorpse(characterId: number, containerId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch);
    const [r] = await tx.select().from(schema.risen).where(and(eq(schema.risen.corpseContainerId, containerId), eq(schema.risen.status, 'pending'))).for('update');
    const [ct] = await tx.select().from(schema.containers).where(eq(schema.containers.id, containerId));
    if (!r || !ct || ct.locationId !== ch.locationId) fail('Não há um corpo para isso aqui.');
    await tx.update(schema.risen).set({ status: 'destroyed', data: { ...r!.data, destroyedBy: `${ch.firstName} ${ch.lastName}` } }).where(eq(schema.risen.id, r!.id));
    const stress = r!.characterId && r!.characterId !== ch.id ? 14 : 8;
    await tx.update(schema.characters).set({ needs: { ...ch.needs, stress: clamp(ch.needs.stress + stress, 0, 100) } }).where(eq(schema.characters.id, ch.id));
    await systemEmote(ch.locationId, `${ch.firstName} ${ch.lastName} se ajoelha ao lado de ${r!.name} e faz o que precisa ser feito. Esse não vai levantar.`);
    await gameLog(tx, ch.id, 'event', `Você garantiu que ${r!.name} não se levantasse.`);
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true };
  });
}

/** Ir atrás de um morto que levantou neste local. */
export async function fightRisen(characterId: number, risenId: number) {
  const { startCombat } = await import('./combat.js');
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch);
    const units = await risenForCombat(tx, ch.locationId, risenId);
    if (!units.length) fail('Ele não está aqui — ou já está em outro confronto.');
    const [ll] = await tx.select().from(schema.locationLoot).where(eq(schema.locationLoot.locationId, ch.locationId));
    const extra = ll && ll.zombies > 0 && rng.chance(0.4) ? 1 : 0;
    await startCombat(tx, { characters: [ch], locationId: ch.locationId, zombieCount: extra, reason: `${ch.firstName} ${ch.lastName} foi atrás de ${units[0].name}.`, risenOnly: risenId });
    await systemEmote(ch.locationId, `${ch.firstName} ${ch.lastName} encara ${units[0].name}.`, 'system');
    return { ok: true };
  });
}

