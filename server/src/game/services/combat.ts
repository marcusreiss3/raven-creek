import { dogAfterCombat, ownedDog } from './dogs.js';
import { markRisenInCombat, risenForCombat, settleRisen } from './risen.js';
import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import { db, schema, type Tx } from '../../db/index.js';
import { charMod } from '../content/character.js';
import { REGION_NAMES } from '../content/items.js';
import { runZombiePhase } from '../combat/ai.js';
import {
  type Action, type CombatState, type Effect, type PlayerSetup, addPlayer, allPlayersDone, applyTimeouts, canAct, checkEnd, createCombat,
  log, performAction, runAutoFlee, spawnZombie, startPlayerPhase, throwObject,
} from '../combat/engine.js';
import { computeBodyMods, WOUND_TYPES } from '../rules/body.js';
import { grantXp } from '../rules/progression.js';
import { rng } from '../rules/rng.js';
import { assertCanAct, woundsOf } from './characters.js';
import { cfg, clock, itemDef } from './config.js';
import { killCharacter } from './death.js';
import { pickZombies } from './events.js';
import { fail, gameLog, withLock } from './infra.js';
import { addItem, armorByRegion, carryInfo, hasTool, itemsOf, type CharRow } from './inventory.js';
import { emitToRoom, emitToUser, notify, pushScene, pushSelf } from './realtime.js';
import { systemEmote, travelMessage } from './chat.js';
import { reloadInTx, treatInTx, equipInTx } from './survival.js';
import { getLocation } from './world.js';
import { echoGunshots } from './echo.js';

type CombatRow = typeof schema.combats.$inferSelect;

export async function buildPlayerUnit(tx: Tx, ch: CharRow): Promise<PlayerSetup> {
  const items = await itemsOf(tx, 'character', ch.id);
  const wounds = await woundsOf(tx, ch.id);
  const mods = computeBodyMods(wounds, ch.amputations, ch.needs);
  const w = items.find((i) => i.slot === 'primary'); const wd = w && itemDef(w.defId);
  const weapon = w && wd && (wd.props.weaponType) ? { itemId: w.id, defId: w.defId, name: wd.name, props: wd.props, durability: w.durability, ammo: Number(w.data.ammo ?? 0) } : undefined;
  const skills: Record<string, number> = {}; for (const [k, v] of Object.entries(ch.skills)) skills[k] = v.level;
  const baseAp = cfg().combat.playerAp + Math.floor(((ch.attributes.agility ?? 4) - 4) / 2) + charMod(ch.profession, ch.traits, 'moveAp', 0);
  return {
    characterId: ch.id, userId: ch.userId, name: `${ch.firstName} ${ch.lastName}`, portrait: ch.portrait, team: 1,
    maxAp: Math.max(2, baseAp - mods.apPenalty), weapon, stamina: ch.needs.stamina, accuracyMult: mods.accuracyMult, meleeMult: mods.meleeMult,
    canTwoHanded: mods.canUseTwoHanded, usableHands: mods.usableHands, skills, attrs: ch.attributes, armor: armorByRegion(items),
    rangedAccBonus: charMod(ch.profession, ch.traits, 'rangedAcc', 0), reloadDiscount: charMod(ch.profession, ch.traits, 'reloadApDiscount', 0),
    biteMult: ch.protectedUntil && ch.protectedUntil.getTime() > Date.now() ? Number(cfg().combat.newbieBiteMultiplier ?? 1) : 1,
    load: carryInfo(items, ch).weight, capacity: carryInfo(items, ch).capacity, hasLighter: hasTool(items, 'fire'),
    dog: await (async () => { const d = await ownedDog(ch.id, tx); return d && d.health >= 20 ? { name: d.name, chance: Number((cfg() as any).dogs?.combatAssistChance ?? 0.35), bites: 0 } : null; })(),
  };
}

export type StartCombatOpts = {
  characters: CharRow[]; locationId: string; arenaKey?: string; zombieCount?: number; zombieTypes?: string[]; reason: string;
  pvp?: boolean; teams?: Record<number, number>; context?: CombatState['context'];
  /** Enfrentar só este morto que levantou (além dos zumbis pedidos). */
  risenOnly?: number;
};

/** Cria um combate. Deve ser chamado dentro de uma transação que já travou os personagens. */
export async function startCombat(tx: Tx, o: StartCombatOpts) {
  const loc = getLocation(o.locationId);
  const players: PlayerSetup[] = [];
  for (const ch of o.characters) players.push(await buildPlayerUnit(tx, ch));
  const category = loc?.category ?? 'road';
  const zombies: any[] = o.zombieCount ? pickZombies(category, Math.min(o.zombieCount, cfg().combat.maxZombiesStart), o.zombieTypes, o.locationId) : [];
  // Mortos que levantaram neste local entram na briga (com nome e os pertences de quando eram gente).
  const risenUnits = !o.pvp && o.context?.type !== 'travel' && (o.zombieCount || o.risenOnly) ? await risenForCombat(tx, o.locationId, o.risenOnly) : [];
  zombies.unshift(...risenUnits);
  const state = createCombat(o.arenaKey ?? loc?.arenaKey ?? 'street', players, zombies, {
    pvp: o.pvp, context: o.context ?? { type: 'location', locationId: o.locationId }, isNight: clock().phase === 'night', teams: o.teams,
  });
  const [row] = await tx.insert(schema.combats).values({
    locationId: o.context?.type === 'travel' ? `travel:${o.context.travelGroupId}` : o.locationId, reason: o.reason, state,
    phaseDeadline: new Date(Date.now() + cfg().combat.turnSeconds * 1000),
  }).returning();
  await markRisenInCombat(tx, risenUnits.map((r) => r.risenId), row.id);
  for (const ch of o.characters) {
    await tx.update(schema.characters).set({ state: 'combat', combatId: row.id, activity: 'idle', busyUntil: null, busyAction: null }).where(eq(schema.characters.id, ch.id));
    emitToUser(ch.userId, 'combat:start', { combatId: row.id, reason: o.reason });
    await gameLog(tx, ch.id, 'combat', `Confronto: ${o.reason}`);
    pushSelf(ch.id);
  }
  if (o.context?.type !== 'travel') pushScene(o.locationId);
  return row;
}

/** Visão do combate enviada aos clientes — sem informações ocultas (emboscadores escondidos, estatísticas internas). */
export function publicCombat(row: Pick<CombatRow, 'id' | 'status' | 'phaseDeadline' | 'reason'>, s: CombatState) {
  return {
    id: row.id, status: row.status, reason: row.reason, deadline: row.phaseDeadline, round: s.round, phase: s.phase, pvp: s.pvp,
    width: s.width, height: s.height, tiles: s.tiles, exits: s.exits, result: s.result ?? null, mapKey: s.mapKey,
    units: s.units.filter((u) => !(u.side === 'zombie' && u.hidden && !u.out)).map((u) => ({
      id: u.id, side: u.side, team: u.team, name: u.name, x: u.x, y: u.y, ap: u.ap, maxAp: u.maxAp, out: u.out, characterId: u.characterId,
      portrait: u.portrait, defending: u.defending, endedTurn: u.endedTurn, prone: u.prone, crawling: u.crawling, behavior: u.behavior, zombieType: u.zombieType,
      condition: u.side === 'zombie' ? ((u.body ?? 0) / (u.maxBody ?? 1) < 0.5 ? 'muito ferido' : (u.body ?? 0) < (u.maxBody ?? 0) ? 'ferido' : 'intacto') : undefined,
      weapon: u.weapon ? { name: u.weapon.name, ammo: u.weapon.props.weaponType === 'ranged' ? u.weapon.ammo : undefined, magSize: u.weapon.props.magSize, range: u.weapon.props.range, apCost: u.weapon.props.apCost, ranged: u.weapon.props.weaponType === 'ranged', twoHanded: !!u.weapon.props.twoHanded, skill: u.weapon.props.skill } : null,
      stamina: u.stamina !== undefined ? Math.round(u.stamina) : undefined, autoFlee: u.autoFlee,
      sneaking: u.sneaking || undefined, overloaded: u.load !== undefined && u.capacity !== undefined && u.load > u.capacity ? true : undefined,
      tauntedBy: u.side === 'zombie' && u.tauntBy && (u.tauntUntil ?? 0) >= s.round ? u.tauntBy : undefined,
      hasLighter: u.hasLighter || undefined, dog: u.dog?.name,
    })),
    alarm: s.alarm && s.alarm.until >= s.round ? { x: s.alarm.x, y: s.alarm.y } : null, fuses: (s.fuses ?? []).map((f) => ({ x: f.x, y: f.y })),
    log: s.log.slice(-60),
  };
}

export async function getCombatView(combatId: number) {
  const [row] = await db.select().from(schema.combats).where(eq(schema.combats.id, combatId));
  return row ? publicCombat(row, row.state as CombatState) : null;
}
function broadcast(row: CombatRow, s: CombatState) { emitToRoom(`combat:${row.id}`, 'combat:state', publicCombat(row, s)); }

/** Persiste efeitos produzidos pelo motor (ferimentos, munição, desgaste, XP…). */
async function applyEffects(tx: Tx, s: CombatState) {
  const effects = s.effects.splice(0);
  const kills: Record<number, number> = {};
  for (const e of effects) await applyEffect(tx, s, e, kills);
  return kills;
}
async function applyEffect(tx: Tx, s: CombatState, e: Effect, kills: Record<number, number>) {
  switch (e.type) {
    case 'wound': {
      const [ch] = await tx.select().from(schema.characters).where(eq(schema.characters.id, e.characterId)).for('update');
      if (!ch?.alive) return;
      const [w] = await tx.insert(schema.wounds).values({ characterId: ch.id, ...e.wound, pain: e.wound.pain * charMod(ch.profession, ch.traits, 'pain') }).returning();
      const region = REGION_NAMES[w.region as keyof typeof REGION_NAMES]?.toLowerCase();
      await gameLog(tx, ch.id, 'wound', `Você sofreu: ${w.type === 'bite' ? 'mordida' : (WOUND_TYPES[w.type as keyof typeof WOUND_TYPES]?.name ?? w.type).toLowerCase()} (${region}), ${e.wound.source}.`);
      if (e.infectionRisk > 0) {
        const inf = cfg().infection;
        const chance = w.type === 'bite' ? inf.biteChance : w.type === 'laceration' ? inf.lacerationChance : w.type === 'scratch' ? inf.scratchChance : 0;
        const [existing] = await tx.select().from(schema.conditions).where(and(eq(schema.conditions.characterId, ch.id), eq(schema.conditions.kind, 'zombie_infection'), sql`${schema.conditions.resolvedAt} is null`));
        if (!existing && rng.chance(chance)) {
          const speed = (inf.regionSpeed as Record<string, number>)[w.region] ?? 1;
          const endurance = (ch.attributes.endurance ?? 4);
          await tx.insert(schema.conditions).values({ characterId: ch.id, kind: 'zombie_infection', durationHours: inf.hoursToDeath * (1 + (endurance - 4) * 0.05), discovered: false, sourceWoundId: w.id, sourceRegion: w.region, data: { speed } });
        }
      }
      // dor extrema derruba no ato
      const wounds = await woundsOf(tx, ch.id);
      const mods = computeBodyMods(wounds, ch.amputations, ch.needs);
      if (mods.pain >= cfg().wounds.painFaint) {
        const u = s.units.find((x) => x.characterId === ch.id);
        if (u && !u.out) { u.out = 'down'; log(s, `${u.name} desaba de dor.`, { unit: u.id, kind: 'down' }); }
        await tx.update(schema.characters).set({ needs: { ...ch.needs, unconscious: true } }).where(eq(schema.characters.id, ch.id));
      }
      pushSelf(ch.id);
      return;
    }
    case 'instant_death': {
      const [ch] = await tx.select().from(schema.characters).where(eq(schema.characters.id, e.characterId)).for('update');
      if (!ch?.alive) return;
      // Dia 1: ninguém morre no meio da sessão (atos 1–3: só desmaia; atos 4–5: a morte é aplicada no fim)
      const { prologueIntercept } = await import('./prologue.js');
      if (await prologueIntercept(tx, ch.id, e.cause)) {
        const u = s.units.find((x) => x.characterId === ch.id);
        if (u && !u.out) { u.out = 'down'; log(s, `${u.name} cai e não levanta.`, { unit: u.id, kind: 'down' }); }
        await tx.update(schema.characters).set({ needs: { ...ch.needs, unconscious: true } }).where(eq(schema.characters.id, ch.id));
        pushSelf(ch.id);
        return;
      }
      await killCharacter(tx, ch, e.cause);
      return;
    }
    case 'durability': {
      const [it] = await tx.select().from(schema.items).where(eq(schema.items.id, e.itemId));
      if (!it) return;
      if (it.durability + e.delta <= 0) await tx.delete(schema.items).where(eq(schema.items.id, it.id));
      else await tx.update(schema.items).set({ durability: it.durability + e.delta }).where(eq(schema.items.id, it.id));
      return;
    }
    case 'ammo': await tx.update(schema.items).set({ data: sql`jsonb_set(${schema.items.data}, '{ammo}', to_jsonb(${e.ammo}::int))` }).where(eq(schema.items.id, e.itemId)); return;
    case 'armor_wear': {
      const items = await itemsOf(tx, 'character', e.characterId);
      const piece = items.find((i) => i.slot && (itemDef(i.defId)?.props.protection?.[e.region] ?? 0) > 0);
      if (piece && piece.durability > 0) await tx.update(schema.items).set({ durability: piece.durability - 1 }).where(eq(schema.items.id, piece.id));
      return;
    }
    case 'xp': {
      const [ch] = await tx.select().from(schema.characters).where(eq(schema.characters.id, e.characterId));
      if (!ch?.alive) return;
      const r = grantXp(ch.skills, ch.xpLedger, e.skill, e.amount, e.key, Date.now(), cfg(), { profession: ch.profession, traits: ch.traits, intellect: ch.attributes.intellect ?? 4 });
      await tx.update(schema.characters).set({ skills: r.skills, xpLedger: r.ledger }).where(eq(schema.characters.id, ch.id));
      if (r.levelUp) notify(ch.userId, `Habilidade aprimorada: ${e.skill} agora no nível ${r.skills[e.skill].level}`, 'success');
      return;
    }
    case 'kill': if (e.characterId) kills[e.characterId] = (kills[e.characterId] ?? 0) + 1; (s as any).killCount = ((s as any).killCount ?? 0) + 1; return;
    case 'stamina': return;
  }
}

async function syncStamina(tx: Tx, s: CombatState) {
  for (const u of s.units) if (u.side === 'player' && u.characterId && u.stamina !== undefined) {
    await tx.update(schema.characters).set({ needs: sql`jsonb_set(${schema.characters.needs}, '{stamina}', to_jsonb(${Math.round(u.stamina * 10) / 10}::numeric))` })
      .where(and(eq(schema.characters.id, u.characterId), eq(schema.characters.alive, true)));
  }
}

function spawnPending(s: CombatState, category: string, locationId?: string) {
  const n = (s as any).pendingSpawns ?? 0; if (!n) return; (s as any).pendingSpawns = 0;
  for (const z of pickZombies(category, n, ['walker', 'runner', 'wanderer'], locationId)) {
    const u = spawnZombie(s, z); u.aware = true;
    const p = s.units.find((x) => x.side === 'player' && !x.out); if (p) u.lastKnown = { x: p.x, y: p.y };
    log(s, `${u.name} surge atraído pelo barulho.`, { unit: u.id, kind: 'spawn' });
  }
}

/** Avança fases até que os jogadores possam agir de novo ou o combate termine. */
async function advance(tx: Tx, row: CombatRow, s: CombatState, depth = 0) {
  const loc = s.context.locationId ? getLocation(s.context.locationId) : undefined;
  if (s.phase === 'players' && allPlayersDone(s)) {
    runAutoFlee(s);
    runZombiePhase(s, cfg());
    spawnPending(s, loc?.category ?? 'road', s.context.locationId);
    await applyEffects(tx, s);
    const end = checkEnd(s);
    if (end.ended) return finish(tx, row, s, end.outcome!, end.summary!);
    startPlayerPhase(s);
    for (const u of s.units) if (u.side === 'player' && !u.out && u.autoFlee) u.endedTurn = true;
    row.phaseDeadline = new Date(Date.now() + cfg().combat.turnSeconds * 1000);
    // só jogadores em fuga automática: avança mais rodadas, mas com limite (o resto fica para o próximo prazo)
    if (allPlayersDone(s) && depth < 6) return advance(tx, row, s, depth + 1);
  }
  const end = checkEnd(s);
  if (end.ended) return finish(tx, row, s, end.outcome!, end.summary!);
}

async function finish(tx: Tx, row: CombatRow, s: CombatState, outcome: string, summary: string) {
  await applyEffects(tx, s);
  await syncStamina(tx, s);
  s.phase = 'ended'; s.result = { outcome, summary };
  row.status = 'ended';
  const kills = s.units.filter((u) => u.side === 'zombie' && u.out === 'dead' && !u.risenId).length;
  await settleRisen(tx, s.units, s.context.type === 'location' ? s.context.locationId : undefined, s.units.find((u) => u.side === 'player' && !u.out)?.name ?? null);
  log(s, `Fim do confronto. ${summary}`, { kind: 'system' });
  if (s.context.type === 'location' && s.context.locationId && kills) {
    await tx.update(schema.locationLoot).set({ zombies: sql`greatest(0, ${schema.locationLoot.zombies} - ${kills})` }).where(eq(schema.locationLoot.locationId, s.context.locationId));
  }
  for (const u of s.units) {
    if (u.side !== 'player' || !u.characterId) continue;
    const [ch] = await tx.select().from(schema.characters).where(eq(schema.characters.id, u.characterId));
    if (!ch?.alive || ch.combatId !== row.id) continue;
    const resumeTravel = s.context.type === 'travel';
    await tx.update(schema.characters).set({ state: resumeTravel ? 'traveling' : 'idle', combatId: null }).where(eq(schema.characters.id, ch.id));
    if (u.dog) await dogAfterCombat(tx, ch.id, s.round, u.dog.bites);
    await gameLog(tx, ch.id, 'combat', `${u.out === 'fled' ? 'Você escapou do confronto.' : u.out === 'down' ? 'Você ficou inconsciente no confronto.' : 'Você sobreviveu ao confronto.'} ${summary}`);
    emitToUser(ch.userId, 'combat:end', { combatId: row.id, outcome, summary, you: u.out ?? 'standing' });
    pushSelf(ch.id);
  }
  if (s.context.type === 'travel' && s.context.travelGroupId) {
    const gid = s.context.travelGroupId;
    await tx.update(schema.travels).set({ status: 'active', lastProgressAt: new Date() }).where(and(eq(schema.travels.groupId, gid), eq(schema.travels.status, 'combat')));
    await travelMessage(gid, `O confronto terminou. ${summary} A viagem continua.`);
  } else if (s.context.locationId) {
    await systemEmote(s.context.locationId, `O confronto terminou. ${summary}${kills ? ` (${kills} infectado(s) abatido(s))` : ''}`, 'system');
    pushScene(s.context.locationId);
  }
}

async function saveRow(tx: Tx, row: CombatRow, s: CombatState) {
  await tx.update(schema.combats).set({ state: s, status: row.status, phaseDeadline: row.phaseDeadline, version: row.version + 1, endedAt: row.status === 'ended' ? new Date() : null }).where(eq(schema.combats.id, row.id));
}

async function withCombat<T>(combatId: number, fn: (tx: Tx, row: CombatRow, s: CombatState) => Promise<T>) {
  return withLock(`combat:${combatId}`, async () => {
    let rowOut: CombatRow | null = null; let sOut: CombatState | null = null; let shots = 0;
    const res = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(schema.combats).where(eq(schema.combats.id, combatId)).for('update');
      if (!row || row.status !== 'active') fail('Este combate já terminou.');
      const s = row!.state as CombatState;
      const before = s.shotsFired ?? 0;
      const r = await fn(tx, row!, s);
      shots = (s.shotsFired ?? 0) - before;
      await saveRow(tx, row!, s);
      rowOut = row!; sOut = s;
      return r;
    });
    if (rowOut && sOut) broadcast(rowOut, sOut);
    if (shots > 0 && sOut) { const s: CombatState = sOut; echoGunshots(s, shots, s.lastShotSkill).catch((e) => console.error('[eco de tiros]', e)); }
    return res;
  });
}

export type CombatActionInput = Action | { type: 'throw'; itemId: number; x: number; y: number };
/** Ação de um jogador em seu combate atual. */
export async function combatAction(characterId: number, a: CombatActionInput) {
  const [ch] = await db.select().from(schema.characters).where(eq(schema.characters.id, characterId));
  if (!ch?.combatId) fail('Você não está em combate.');
  return withCombat(ch!.combatId!, async (tx, row, s) => {
    const unit = s.units.find((u) => u.characterId === characterId);
    const err = canAct(s, unit); if (err) fail(err);
    const u = unit!; u.autoFlee = false; u.timeouts = 0;
    const [fresh] = await tx.select().from(schema.characters).where(eq(schema.characters.id, characterId)).for('update');
    if (a.type === 'reload') {
      const cost = Math.max(1, 2 - (u.reloadDiscount ?? 0));
      if (u.ap < cost) fail(`Recarregar custa ${cost} PA.`);
      const r = await reloadInTx(tx, fresh!);
      if (u.weapon) u.weapon.ammo = r.ammo;
      u.ap -= cost; u.actedThisTurn = true;
      log(s, `${u.name} recarrega a arma.`, { unit: u.id, kind: 'reload' });
    } else if (a.type === 'use_item') {
      if (u.ap < 2) fail('Usar um item custa 2 PA.');
      const target = a.targetId ? s.units.find((x) => x.id === a.targetId && x.side === 'player') : u;
      if (!target || target.out === 'fled' || target.out === 'dead') fail('Alvo inválido.');
      if (Math.max(Math.abs(target!.x - u.x), Math.abs(target!.y - u.y)) > 1) fail('Fique ao lado do aliado.');
      const [tch] = await tx.select().from(schema.characters).where(eq(schema.characters.id, target!.characterId!)).for('update');
      const wounds = await woundsOf(tx, tch!.id);
      const worst = [...wounds].sort((x, y) => y.bleeding - x.bleeding)[0];
      const d = itemDef((await itemsOf(tx, 'character', fresh!.id)).find((i) => i.id === a.itemId)?.defId ?? '');
      const needsWound = ['bandage', 'disinfect', 'medkit', 'splint', 'suture'].includes(d?.props.use);
      if (needsWound && !worst) fail('Não há ferimentos para tratar.');
      await treatInTx(tx, fresh!, tch!, needsWound ? worst.id : null, a.itemId);
      u.ap -= 2; u.actedThisTurn = true;
      log(s, `${u.name} presta socorro a ${target!.id === u.id ? 'si mesmo' : target!.name}.`, { unit: u.id, kind: 'aid' });
    } else if (a.type === 'throw') {
      // Arremessar um item do inventário (alivia o peso). O item cai no chão do local — dá para pegar depois.
      const [it] = await tx.select().from(schema.items).where(and(eq(schema.items.id, a.itemId), eq(schema.items.ownerType, 'character'), eq(schema.items.ownerId, String(characterId))));
      if (!it) fail('Item não encontrado.');
      if (it!.slot) fail('Tire o item do corpo (desequipe) antes de arremessar.');
      const d = itemDef(it!.defId);
      const r = throwObject(s, u, { x: a.x, y: a.y }, { name: d?.name ?? 'objeto', weight: Number(d?.weight ?? 0.5) });
      if (!r.ok) fail(r.error);
      if (it!.quantity > 1) await tx.update(schema.items).set({ quantity: it!.quantity - 1 }).where(eq(schema.items.id, it!.id));
      else await tx.delete(schema.items).where(eq(schema.items.id, it!.id));
      if (s.context.type === 'location' && s.context.locationId) await addItem(tx, 'location', s.context.locationId, it!.defId, 1, { durability: it!.durability, data: it!.data });
      else log(s, `(${d?.name ?? 'O objeto'} fica para trás na estrada.)`, { kind: 'system' });
      if (it!.slot === null && u.weapon?.itemId === it!.id) u.weapon = undefined;
      pushSelf(characterId);
    } else if (a.type === 'equip') {
      if (u.ap < 1) fail('Trocar de arma custa 1 PA.');
      if (a.itemId) {
        const [it] = await tx.select().from(schema.items).where(and(eq(schema.items.id, a.itemId), eq(schema.items.ownerType, 'character'), eq(schema.items.ownerId, String(characterId))));
        if (!it) fail('Item não encontrado.');
        await equipInTx(tx, fresh!, it!, 'primary');
      } else await tx.update(schema.items).set({ slot: null }).where(and(eq(schema.items.ownerType, 'character'), eq(schema.items.ownerId, String(characterId)), eq(schema.items.slot, 'primary')));
      const rebuilt = await buildPlayerUnit(tx, fresh!);
      u.weapon = rebuilt.weapon; u.ap -= 1; u.actedThisTurn = true;
      log(s, `${u.name} ${u.weapon ? `empunha ${u.weapon.name}` : 'guarda a arma'}.`, { unit: u.id, kind: 'equip' });
    } else {
      const r = performAction(s, u.id, a, cfg());
      if (!r.ok) fail(r.error);
    }
    await applyEffects(tx, s);
    await syncStamina(tx, s);
    if (u.out === 'fled' && s.context.type === 'location') {
      await tx.update(schema.characters).set({ state: 'idle', combatId: null }).where(eq(schema.characters.id, characterId));
      emitToUser(ch!.userId, 'combat:end', { combatId: row.id, outcome: 'escaped', summary: 'Você escapou.', you: 'fled' });
      await systemEmote(s.context.locationId!, `${u.name} volta correndo, ofegante.`);
      pushSelf(characterId); pushScene(s.context.locationId!);
    }
    await advance(tx, row, s);
    return { ok: true };
  });
}

/** Reforço: outro personagem no mesmo local entra no combate em andamento. */
export async function joinCombat(characterId: number, combatId: number, joinCharacterTeam?: number) {
  const [ch0] = await db.select().from(schema.characters).where(eq(schema.characters.id, characterId));
  if (!ch0) fail('Personagem não encontrado.');
  return withCombat(combatId, async (tx, row, s) => {
    const [ch] = await tx.select().from(schema.characters).where(eq(schema.characters.id, characterId)).for('update');
    // Dá para largar o que está fazendo (vasculhar, construir…) para ajudar quem está em perigo.
    assertCanAct(ch!, { allowBusy: true });
    if (s.context.type !== 'location' || s.context.locationId !== ch!.locationId) fail('Esse confronto não está acontecendo aqui.');
    if (s.pvp && !cfg().pvp.allowJoinAsReinforcement) fail('Reforços não são permitidos em confrontos entre jogadores.');
    let team = 1;
    if (s.pvp) {
      const ally = s.units.find((u) => u.characterId === joinCharacterTeam);
      if (!ally) fail('Escolha de que lado entrar.');
      team = ally!.team;
      const enemy = s.units.find((u) => u.side === 'player' && u.team !== team && u.characterId);
      if (enemy) { const [e] = await tx.select().from(schema.characters).where(eq(schema.characters.id, enemy.characterId!)); if (e?.protectedUntil && e.protectedUntil > new Date()) fail('O outro lado está sob proteção de novato.'); }
    }
    const setup = await buildPlayerUnit(tx, ch!);
    const u = addPlayer(s, setup, s.units.length, team);
    if (s.phase !== 'players') u.endedTurn = true;
    log(s, `${u.name} entra no confronto!`, { unit: u.id, kind: 'join' });
    if (ch!.state === 'busy') log(s, `${u.name} larga o que estava fazendo.`, { unit: u.id, kind: 'join' });
    await tx.update(schema.characters).set({ state: 'combat', combatId: row.id, activity: 'idle', busyUntil: null, busyAction: null }).where(eq(schema.characters.id, ch!.id));
    if (s.pvp) await gameLog(tx, ch!.id, 'pvp', `Entrou como reforço no confronto #${row.id}.`);
    emitToUser(ch!.userId, 'combat:start', { combatId: row.id, reason: row.reason });
    pushSelf(ch!.id); pushScene(ch!.locationId);
    return { ok: true };
  });
}

/** Chamado quando um personagem desmaia ou morre fora do fluxo do combate (tick de necessidades). */
export async function markCombatant(characterId: number, combatId: number, status: 'down' | 'dead') {
  try {
    await withCombat(combatId, async (tx, row, s) => {
      const u = s.units.find((x) => x.characterId === characterId);
      if (!u || u.out === status || u.out === 'fled' || u.out === 'dead') return;
      u.out = status;
      log(s, status === 'dead' ? `${u.name} não se move mais.` : `${u.name} perde a consciência.`, { unit: u.id, kind: status });
      await advance(tx, row, s);
    });
  } catch { /* combate já encerrado */ }
}

/** Prazo de turno esgotado: regra de inatividade + fase dos infectados. */
export async function processCombatDeadlines() {
  const due = await db.select({ id: schema.combats.id }).from(schema.combats).where(and(eq(schema.combats.status, 'active'), lte(schema.combats.phaseDeadline, new Date())));
  for (const { id } of due) {
    try {
      await withCombat(id, async (tx, row, s) => {
        if (row.phaseDeadline > new Date()) return;
        applyTimeouts(s, cfg());
        await advance(tx, row, s);
        if (row.status === 'active' && row.phaseDeadline <= new Date()) row.phaseDeadline = new Date(Date.now() + cfg().combat.turnSeconds * 1000);
      });
    } catch (e) { if (!(e instanceof Error && e.message.includes('terminou'))) console.error('combat deadline', id, e); }
  }
}

/** PVP: inicia confronto contra outro personagem, aplicando todas as regras anti-abuso. */
export async function attackCharacter(attackerId: number, targetId: number) {
  const p = cfg().pvp;
  if (!p.enabled) fail('PVP está desativado neste servidor.');
  const { withTwoCharacters } = await import('./characters.js');
  const { isUserOnline } = await import('./realtime.js');
  return withTwoCharacters(attackerId, targetId, async (tx, a, t) => {
    assertCanAct(a);
    if (a.id === t.id) fail('Alvo inválido.');
    if (!t.alive || t.locationId !== a.locationId || t.state === 'traveling') fail('O alvo não está aqui.');
    if (t.state === 'combat') fail('O alvo já está em combate. Entre como reforço.');
    const now = new Date();
    if (t.protectedUntil && t.protectedUntil > now) fail('Esse sobrevivente ainda está sob proteção de novato.');
    if (p.protectOffline && !isUserOnline(t.userId)) fail('Não é permitido atacar personagens de jogadores desconectados.');
    if (a.lastPvpAt && now.getTime() - a.lastPvpAt.getTime() < p.cooldownMinutes * 60000) fail(`Aguarde o tempo de recarga de PVP (${p.cooldownMinutes} min).`);
    const [fa] = await tx.select().from(schema.factionMembers).where(eq(schema.factionMembers.characterId, a.id));
    const [ft] = await tx.select().from(schema.factionMembers).where(eq(schema.factionMembers.characterId, t.id));
    if (fa && ft && fa.factionId === ft.factionId) fail('Vocês pertencem à mesma facção.');
    await tx.update(schema.characters).set({ lastPvpAt: now, protectedUntil: null }).where(eq(schema.characters.id, a.id));
    const row = await startCombat(tx, { characters: [a, t], locationId: a.locationId, reason: `${a.firstName} ${a.lastName} atacou ${t.firstName} ${t.lastName}`, pvp: true, teams: { [a.id]: 1, [t.id]: 2 } });
    await gameLog(tx, a.id, 'pvp', `Você atacou ${t.firstName} ${t.lastName} (combate #${row.id}).`, { combatId: row.id, targetId: t.id });
    await gameLog(tx, t.id, 'pvp', `${a.firstName} ${a.lastName} atacou você (combate #${row.id}).`, { combatId: row.id, attackerId: a.id });
    await systemEmote(a.locationId, `${a.firstName} ${a.lastName} parte para cima de ${t.firstName} ${t.lastName}! Outros podem intervir.`, 'system');
    return { ok: true, combatId: row.id };
  });
}

export async function activeCombatIds() {
  return (await db.select({ id: schema.combats.id }).from(schema.combats).where(eq(schema.combats.status, 'active'))).map((r) => r.id);
}
export { inArray };
