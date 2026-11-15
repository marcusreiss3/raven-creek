import { and, eq, inArray, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema, type Tx } from '../../db/index.js';
import { computeBodyMods, makeWound } from '../rules/body.js';
import { clamp, rng } from '../rules/rng.js';
import { encounterChance, travelDuration } from '../rules/travel.js';
import { assertCanAct, withCharacter, woundsOf } from './characters.js';
import { cfg, clock, getEventDefs, itemDef } from './config.js';
import { logEvent, pickEvent, randomVehicle } from './events.js';
import { fail, gameLog, withLock } from './infra.js';
import { carryInfo, hasTool, itemsOf, type CharRow } from './inventory.js';
import { emitToUser, getIO, notify, pushScene, pushSelf } from './realtime.js';
import { systemEmote, travelMessage } from './chat.js';
import { startCombat } from './combat.js';
import { findConnection, getLocation } from './world.js';
import { canSee, roadTravels, sightingsMap, travelElapsed } from './roads.js';
import { arrivalAmbush } from './zombies.js';
import { isPowered } from './projects.js';

type TravelRow = typeof schema.travels.$inferSelect;
const fullName = (c: CharRow) => `${c.firstName} ${c.lastName}`;
const joinTravelRoom = (userId: number, gid: string) => getIO()?.in(`user:${userId}`).socketsJoin(`travel:${gid}`);
const leaveTravelRoom = (userId: number, gid: string) => getIO()?.in(`user:${userId}`).socketsLeave(`travel:${gid}`);

/** Com a subestação ligada, estradas entre locais iluminados não sofrem com a escuridão. */
const effectivePhase = (phase: string, a: string, b: string) => (phase === 'night' && isPowered(a) && isPowered(b) ? 'dusk' : phase);

async function memberDuration(tx: Tx, ch: CharRow, conn: { distance: number; roadType: string; fromId?: string; toId?: string }, indoor: boolean) {
  const items = await itemsOf(tx, 'character', ch.id);
  const wounds = await woundsOf(tx, ch.id);
  const mods = computeBodyMods(wounds, ch.amputations, ch.needs);
  const carry = carryInfo(items, ch);
  const boots = items.find((i) => i.slot === 'boots'); const c = clock();
  return travelDuration({
    cfg: cfg(), distance: conn.distance, roadType: conn.roadType, mode: 'walk', bodyTravelMult: mods.travelMult, encumbrance: carry.ratio, stamina: ch.needs.stamina,
    weather: c.weather, phase: conn.fromId && conn.toId ? effectivePhase(c.phase, conn.fromId, conn.toId) : c.phase, hasLight: hasTool(items, 'light'), indoor, profession: ch.profession, traits: ch.traits,
    bootsSpeed: boots ? Number(itemDef(boots.defId)?.props.travelSpeed ?? 1) : 1,
  });
}

/** Prévia de duração (exibida antes de partir). */
export async function previewTravel(characterId: number, toId: string) {
  const [ch] = await db.select().from(schema.characters).where(eq(schema.characters.id, characterId));
  if (!ch) fail('Personagem não encontrado.');
  const conn = findConnection(ch!.locationId, toId); if (!conn) fail('Não há caminho direto.');
  const to = getLocation(toId)!; const from = getLocation(ch!.locationId)!;
  const d = await memberDuration(db, ch!, conn!, from.indoor && to.indoor);
  return { durationMs: d.durationMs, factors: d.factors, distance: conn!.distance, roadType: conn!.roadType };
}

/**
 * Inicia uma viagem. Seguidores ociosos no mesmo local viajam junto (grupo); se o líder estiver
 * dirigindo, eles vão como passageiros. A duração do grupo é a do membro mais lento.
 */
export async function startTravel(characterId: number, toId: string, opts: { vehicle?: boolean } = {}) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch);
    if (ch.followingId) {
      // Quem você seguia já não está aqui (foi embora sem você): deixa de seguir e escolhe o caminho sozinho.
      const [leader] = await tx.select({ locationId: schema.characters.locationId, state: schema.characters.state, alive: schema.characters.alive }).from(schema.characters).where(eq(schema.characters.id, ch.followingId));
      if (!leader || !leader.alive || leader.locationId !== ch.locationId || leader.state === 'traveling') {
        await tx.update(schema.characters).set({ followingId: null }).where(eq(schema.characters.id, ch.id));
        ch.followingId = null;
      } else fail('Você está seguindo outra pessoa. Pare de seguir para escolher o caminho.');
    }
    const conn = findConnection(ch.locationId, toId);
    if (!conn) fail('Não há caminho direto até lá. Não é possível teleportar.');
    if (conn!.blocked) fail(`Caminho bloqueado: ${conn!.blockedReason ?? 'passagem obstruída'}.`);
    const from = getLocation(ch.locationId)!; const to = getLocation(toId)!;
    const followers = (await tx.select().from(schema.characters).where(and(eq(schema.characters.followingId, ch.id), eq(schema.characters.locationId, ch.locationId), eq(schema.characters.alive, true))).for('update'))
      .filter((f) => f.state === 'idle' && !f.needs.unconscious);
    const members = [ch, ...followers];
    let mode: 'walk' | 'vehicle' = 'walk'; let vehicle: typeof schema.vehicles.$inferSelect | undefined; let duration = 0; let factors: { label: string; mult: number }[] = [];
    if (opts.vehicle) {
      [vehicle] = await tx.select().from(schema.vehicles).where(and(eq(schema.vehicles.driverId, ch.id), eq(schema.vehicles.locationId, ch.locationId))).for('update');
      if (!vehicle) fail('Você não está ao volante de um veículo aqui.');
      if (!vehicle!.running) fail('O motor está desligado.');
      if (!cfg().travel.vehicleAllowedRoads.includes(conn!.roadType)) fail('Veículos não passam por esse caminho.');
      if (members.length > vehicle!.seats) fail(`O veículo só leva ${vehicle!.seats} pessoas.`);
      const needFuel = (conn!.distance / 1000) * vehicle!.consumption;
      if (vehicle!.fuel < needFuel) fail('Combustível insuficiente para esse trajeto.');
      if (vehicle!.tires < 10) fail('Os pneus estão destruídos.');
      const c = clock();
      const r = travelDuration({ cfg: cfg(), distance: conn!.distance, roadType: conn!.roadType, mode: 'vehicle', vehicleSpeed: vehicle!.speed, vehicleCondition: Math.min(vehicle!.engine, vehicle!.tires),
        bodyTravelMult: 1, encumbrance: 0, stamina: 100, weather: c.weather, phase: c.phase, hasLight: true, indoor: false, profession: ch.profession, traits: ch.traits });
      mode = 'vehicle'; duration = r.durationMs; factors = r.factors;
    } else {
      for (const m of members) { const r = await memberDuration(tx, m, conn!, from.indoor && to.indoor); if (r.durationMs > duration) { duration = r.durationMs; factors = r.factors; } }
    }
    // Encontro planejado (probabilidades configuráveis)
    const c = clock();
    let encounter: TravelRow['encounter'] = null;
    if (rng.chance(encounterChance(cfg(), conn!.distance, Math.max(from.danger, to.danger), effectivePhase(c.phase, from.id, to.id), mode))) {
      const ev = await pickEvent(tx, { scope: 'travel', roadType: conn!.roadType, vehicle: mode === 'vehicle', danger: to.danger });
      if (ev) encounter = { atMs: Math.round(duration * rng.range(0.25, 0.75)), eventId: ev.id, triggered: false, resolved: false };
    }
    const groupId = randomUUID(); const now = new Date();
    for (const m of members) {
      await tx.insert(schema.travels).values({ characterId: m.id, groupId, fromId: from.id, toId: to.id, connectionId: conn!.id, mode, vehicleId: vehicle?.id ?? null,
        startedAt: now, durationMs: duration, lastProgressAt: now, status: 'active', encounter: m.id === ch.id ? encounter : null, sceneKey: conn!.travelSceneKey, isLeader: m.id === ch.id });
      await tx.update(schema.characters).set({ state: 'traveling', activity: 'idle' }).where(eq(schema.characters.id, m.id));
      joinTravelRoom(m.userId, groupId);
      emitToUser(m.userId, 'travel:start', { groupId, toName: to.name, durationMs: duration });
      pushSelf(m.id);
    }
    if (vehicle) await tx.update(schema.vehicles).set({ locationId: null }).where(eq(schema.vehicles.id, vehicle.id));
    const names = members.map(fullName).join(', ');
    await systemEmote(from.id, `${names} ${members.length > 1 ? 'partem' : 'parte'} em direção a ${to.name}${mode === 'vehicle' ? ` de ${vehicle!.name.toLowerCase()}` : ''}.`);
    for (const m of members) await gameLog(tx, m.id, 'travel', `Partiu de ${from.name} para ${to.name} (${Math.round(duration / 1000)}s).`);
    pushScene(from.id);
    return { ok: true, groupId, durationMs: duration, factors };
  });
}

/** Seguir/parar de seguir outro personagem (forma de viajar em grupo). */
export async function follow(characterId: number, targetId: number | null) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: true });
    if (targetId) {
      const [t] = await tx.select().from(schema.characters).where(eq(schema.characters.id, targetId));
      if (!t || !t.alive || t.locationId !== ch.locationId || t.id === ch.id) fail('Essa pessoa não está aqui.');
      if (t!.followingId === ch.id) fail('Essa pessoa já está seguindo você.');
      await tx.update(schema.characters).set({ followingId: targetId }).where(eq(schema.characters.id, ch.id));
      await systemEmote(ch.locationId, `${fullName(ch)} passa a acompanhar ${t!.firstName} ${t!.lastName}.`);
    } else {
      await tx.update(schema.characters).set({ followingId: null }).where(eq(schema.characters.id, ch.id));
    }
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true };
  });
}

const elapsedOf = (t: TravelRow, now: number) => t.elapsedMs + (t.status === 'active' ? now - t.lastProgressAt.getTime() : 0);

/** Processa viagens ativas: encontros e chegadas. Baseado em timestamps — sobrevive a reinicializações. */
export async function processTravels() {
  const leaders = await db.select().from(schema.travels).where(and(eq(schema.travels.status, 'active'), eq(schema.travels.isLeader, true)));
  const now = Date.now();
  for (const l of leaders) {
    const elapsed = elapsedOf(l, now);
    const enc = l.encounter;
    if (enc && !enc.triggered && elapsed >= enc.atMs) { await withLock(`travel:${l.groupId}`, () => triggerEncounter(l.groupId)).catch((e) => console.error('encounter', e)); continue; }
    if (elapsed >= l.durationMs) await withLock(`travel:${l.groupId}`, () => arrive(l.groupId)).catch((e) => console.error('arrive', e));
  }
}

async function groupRows(tx: Tx, groupId: string) {
  return tx.select().from(schema.travels).where(and(eq(schema.travels.groupId, groupId), inArray(schema.travels.status, ['active', 'paused', 'awaiting_decision', 'combat']))).for('update');
}

async function arrive(groupId: string) {
  await db.transaction(async (tx) => {
    const rows = await groupRows(tx, groupId); if (!rows.length) return;
    const leader = rows.find((r) => r.isLeader) ?? rows[0];
    if (leader.status !== 'active' || elapsedOf(leader, Date.now()) < leader.durationMs) return;
    const to = getLocation(leader.toId)!; const from = getLocation(leader.fromId)!;
    const names: string[] = []; const arrivedChars: CharRow[] = [];
    for (const r of rows) {
      const [ch] = await tx.select().from(schema.characters).where(eq(schema.characters.id, r.characterId)).for('update');
      await tx.update(schema.travels).set({ status: 'arrived', elapsedMs: r.durationMs }).where(eq(schema.travels.id, r.id));
      if (!ch?.alive) continue;
      await tx.update(schema.characters).set({ locationId: r.toId, state: 'idle' }).where(eq(schema.characters.id, ch.id));
      await gameLog(tx, ch.id, 'travel', `Chegou a ${to.name}.`);
      emitToUser(ch.userId, 'travel:arrived', { locationId: to.id, name: to.name });
      // Dia 1: quem saiu do trabalho pode encontrar o evento do lugar (depois que a chegada for gravada)
      { const cid = ch.id, loc = r.toId; setTimeout(() => { import('./prologue.js').then((p) => p.prologueArrive(cid, loc)).catch((e) => console.error('[dia 1] chegada', e)); }, 250); }
      leaveTravelRoom(ch.userId, groupId);
      names.push(`${ch.firstName} ${ch.lastName}`); pushSelf(ch.id);
      arrivedChars.push({ ...ch, locationId: r.toId, state: 'idle' });
    }
    if (leader.vehicleId) {
      const [v] = await tx.select().from(schema.vehicles).where(eq(schema.vehicles.id, leader.vehicleId));
      const conn = findConnection(leader.fromId, leader.toId);
      if (v) await tx.update(schema.vehicles).set({ locationId: to.id, fuel: Math.max(0, v.fuel - ((conn?.distance ?? 0) / 1000) * v.consumption), tires: Math.max(0, v.tires - 0.3) }).where(eq(schema.vehicles.id, v.id));
    }
    if (names.length) await systemEmote(to.id, `${names.join(', ')} ${names.length > 1 ? 'chegam' : 'chega'} vindo de ${from.name}.`);
    if (arrivedChars.length) await arrivalAmbush(tx, to.id, arrivedChars);
    pushScene(to.id);
  });
}

async function triggerEncounter(groupId: string) {
  await db.transaction(async (tx) => {
    const rows = await groupRows(tx, groupId); const leader = rows.find((r) => r.isLeader);
    if (!leader || leader.status !== 'active' || !leader.encounter || leader.encounter.triggered) return;
    const now = Date.now(); const elapsed = elapsedOf(leader, now);
    const ev = getEventDefs().find((e) => e.id === leader.encounter!.eventId);
    const enc = { ...leader.encounter, triggered: true };
    if (!ev) { await tx.update(schema.travels).set({ encounter: { ...enc, resolved: true } }).where(eq(schema.travels.id, leader.id)); return; }
    const members = await Promise.all(rows.map(async (r) => (await tx.select().from(schema.characters).where(eq(schema.characters.id, r.characterId)).for('update'))[0]));
    await logEvent(tx, ev.id, null, leader.characterId, { groupId });
    for (const m of members) { if (m) { notify(m.userId, ev.text, ev.requiresDecision ? 'danger' : 'warn'); await gameLog(tx, m.id, 'event', ev.text); } }
    await travelMessage(groupId, ev.text);
    if (ev.requiresDecision) {
      for (const r of rows) await tx.update(schema.travels).set({ status: 'awaiting_decision', elapsedMs: elapsed, lastProgressAt: new Date(now), encounter: r.isLeader ? enc : r.encounter }).where(eq(schema.travels.id, r.id));
      for (const m of members) if (m) pushSelf(m.id);
      return;
    }
    const fx = ev.effects ?? {};
    let newDuration = leader.durationMs;
    if (ev.kind === 'alt_path') newDuration = Math.round(elapsed + (leader.durationMs - elapsed) * (fx.timeMultiplier ?? 0.75));
    for (const m of members) {
      if (!m) continue;
      if (ev.kind === 'stress' || fx.stress) await tx.update(schema.characters).set({ needs: { ...m.needs, stress: clamp(m.needs.stress + (fx.stress ?? 5), 0, 100) } }).where(eq(schema.characters.id, m.id));
      if (ev.kind === 'wound' || ev.kind === 'accident') {
        if (ev.kind === 'wound' && m.id !== leader.characterId && rng.chance(0.6)) continue;
        const region = fx.wound?.region === 'random_leg' ? rng.pick(['left_leg', 'right_leg']) : fx.wound?.region ?? 'torso';
        await tx.insert(schema.wounds).values({ characterId: m.id, ...makeWound(fx.wound?.type ?? 'bruise', region, rng.range(0.15, 0.45), ev.name) });
        if (fx.disease && rng.chance(fx.disease.chance ?? 0.2)) await tx.insert(schema.conditions).values({ characterId: m.id, kind: fx.disease.kind, durationHours: 12, discovered: true, stage: 1 });
      }
      pushSelf(m.id);
    }
    if (ev.kind === 'accident' && leader.vehicleId) {
      const [v] = await tx.select().from(schema.vehicles).where(eq(schema.vehicles.id, leader.vehicleId));
      if (v) await tx.update(schema.vehicles).set({ body: Math.max(0, v.body - (fx.vehicleDamage ?? 10)), engine: Math.max(0, v.engine - (fx.vehicleDamage ?? 10) / 2) }).where(eq(schema.vehicles.id, v.id));
    }
    if (ev.kind === 'vehicle') { await tx.insert(schema.vehicles).values(randomVehicle(leader.toId)); await travelMessage(groupId, `(O veículo ficará em ${getLocation(leader.toId)?.name}.)`); }
    for (const r of rows) await tx.update(schema.travels).set({ durationMs: newDuration, encounter: r.isLeader ? { ...enc, resolved: true } : r.encounter }).where(eq(schema.travels.id, r.id));
  });
}

/**
 * Decisão sobre um encontro que bloqueia a viagem.
 *  combate: fight | sneak | retreat      bloqueio: detour | retreat
 */
export async function decideEncounter(characterId: number, choice: 'fight' | 'sneak' | 'retreat' | 'detour') {
  const [t] = await db.select().from(schema.travels).where(and(eq(schema.travels.characterId, characterId), eq(schema.travels.status, 'awaiting_decision')));
  if (!t) fail('Não há decisão pendente.');
  return withLock(`travel:${t!.groupId}`, () => db.transaction(async (tx) => {
    const rows = await groupRows(tx, t!.groupId); const leader = rows.find((r) => r.isLeader)!;
    if (leader.status !== 'awaiting_decision') fail('A decisão já foi tomada.');
    const ev = getEventDefs().find((e) => e.id === leader.encounter?.eventId);
    const members = (await Promise.all(rows.map(async (r) => (await tx.select().from(schema.characters).where(eq(schema.characters.id, r.characterId)).for('update'))[0]))).filter((m) => m?.alive);
    const decider = members.find((m) => m.id === characterId)!;
    const resolvedEnc = { ...leader.encounter!, resolved: true };
    const resume = async (durationDelta = 0) => {
      for (const r of rows) await tx.update(schema.travels).set({ status: 'active', lastProgressAt: new Date(), durationMs: r.durationMs + durationDelta, encounter: r.isLeader ? resolvedEnc : r.encounter }).where(eq(schema.travels.id, r.id));
    };
    if (choice === 'retreat') {
      for (const r of rows) {
        await tx.update(schema.travels).set({ status: 'active', fromId: r.toId, toId: r.fromId, durationMs: Math.max(5000, r.elapsedMs), elapsedMs: 0, lastProgressAt: new Date(), encounter: r.isLeader ? resolvedEnc : null }).where(eq(schema.travels.id, r.id));
      }
      await travelMessage(t!.groupId, `${decider.firstName} decide voltar pelo mesmo caminho.`);
    } else if (choice === 'detour') {
      if (ev?.kind !== 'roadblock' && ev?.kind !== 'combat') fail('Opção inválida.');
      await resume(Math.round(leader.durationMs * cfg().travel.detourTimeMultiplier));
      await travelMessage(t!.groupId, `O grupo procura um desvio. A viagem ficará mais longa.`);
    } else if (choice === 'sneak') {
      if (ev?.kind !== 'combat') fail('Opção inválida.');
      const best = Math.max(...members.map((m) => (m.skills.stealth?.level ?? 0) + ((m.attributes.agility ?? 4) - 4) / 2));
      const ok = rng.chance(clamp(0.35 + best * 0.08 - (members.length - 1) * 0.08, 0.1, 0.9));
      if (ok) { await resume(Math.round(leader.durationMs * 0.15)); await travelMessage(t!.groupId, 'Em silêncio, o grupo contorna os infectados sem ser notado.'); }
      else {
        await travelMessage(t!.groupId, 'Um galho estala. Eles viram vocês!');
        await toCombat(tx, rows, members, ev, resolvedEnc);
      }
    } else if (choice === 'fight') {
      if (ev?.kind !== 'combat') fail('Opção inválida.');
      await toCombat(tx, rows, members, ev, resolvedEnc);
    }
    for (const m of members) pushSelf(m.id);
    return { ok: true };
  }));
}

async function toCombat(tx: Tx, rows: TravelRow[], members: CharRow[], ev: any, enc: any) {
  const leader = rows.find((r) => r.isLeader)!;
  for (const r of rows) await tx.update(schema.travels).set({ status: 'combat', encounter: r.isLeader ? enc : r.encounter }).where(eq(schema.travels.id, r.id));
  const conn = findConnection(leader.fromId, leader.toId);
  const arena = conn?.roadType === 'trail' ? 'forest' : 'road';
  const n = rng.int(ev.effects?.zombies?.min ?? 1, ev.effects?.zombies?.max ?? 2) + Math.max(0, members.length - 2);
  await startCombat(tx, { characters: members, locationId: leader.toId, arenaKey: arena, zombieCount: n, zombieTypes: ev.effects?.types, reason: ev.text, context: { type: 'travel', travelGroupId: leader.groupId, locationId: undefined } });
}
/**
 * Parar / continuar a caminhada. Qualquer membro do grupo pode parar; o relógio da viagem congela
 * (nem chegada nem encontros avançam) até alguém do grupo retomar. Serve para conversar e interpretar no caminho.
 */
export async function togglePause(characterId: number, pause?: boolean) {
  const [t] = await db.select().from(schema.travels).where(and(eq(schema.travels.characterId, characterId), inArray(schema.travels.status, ['active', 'paused'])));
  if (!t) fail('Você não está em uma caminhada que possa ser parada.');
  return withLock(`travel:${t!.groupId}`, () => db.transaction(async (tx) => {
    const rows = await groupRows(tx, t!.groupId); const leader = rows.find((r) => r.isLeader) ?? rows[0];
    if (!leader || !['active', 'paused'].includes(leader.status)) fail('Agora não dá para parar a viagem.');
    const wantPause = pause ?? leader.status === 'active';
    if (wantPause === (leader.status === 'paused')) return { ok: true, paused: wantPause };
    const now = Date.now();
    const [me] = await tx.select().from(schema.characters).where(eq(schema.characters.id, characterId));
    const mine = rows.find((r) => r.characterId === characterId)!;
    if (wantPause && !mine.isLeader) {
      // Quem acompanha e para fica para trás sozinho: o grupo segue (e chega antes); o destino continua o mesmo.
      const gid = randomUUID();
      await tx.update(schema.travels).set({ groupId: gid, isLeader: true, status: 'paused', elapsedMs: Math.min(mine.durationMs, elapsedOf(mine, now)), lastProgressAt: new Date(now), encounter: null }).where(eq(schema.travels.id, mine.id));
      await tx.update(schema.characters).set({ followingId: null }).where(eq(schema.characters.id, characterId));
      if (me) { leaveTravelRoom(me.userId, t!.groupId); joinTravelRoom(me.userId, gid); }
      const who = me ? `${me.firstName} ${me.lastName}` : 'Alguém';
      await travelMessage(t!.groupId, `${who} fica para trás.`);
      await travelMessage(gid, `${who} para. O grupo segue em frente — o destino continua sendo ${getLocation(mine.toId)?.name}.`);
      for (const r of rows) pushSelf(r.characterId);
      return { ok: true, paused: true, detached: true };
    }
    for (const r of rows) {
      if (wantPause) await tx.update(schema.travels).set({ status: 'paused', elapsedMs: Math.min(r.durationMs, elapsedOf(r, now)), lastProgressAt: new Date(now) }).where(eq(schema.travels.id, r.id));
      else await tx.update(schema.travels).set({ status: 'active', lastProgressAt: new Date(now) }).where(eq(schema.travels.id, r.id));
    }
    const who = me ? `${me.firstName} ${me.lastName}` : 'Alguém';
    await travelMessage(t!.groupId, wantPause ? `${who} para no meio do caminho.` : `${who} retoma a caminhada.`);
    for (const r of rows) pushSelf(r.characterId);
    return { ok: true, paused: wantPause };
  }));
}
/**
 * Dar meia-volta: volta para o lugar de onde saiu, pelo mesmo caminho (leva o tempo que já tinha andado).
 * Quem conduz o grupo leva todos junto; quem acompanhava alguém deixa de seguir e volta sozinho.
 */
export async function turnBack(characterId: number) {
  const [t] = await db.select().from(schema.travels).where(and(eq(schema.travels.characterId, characterId), inArray(schema.travels.status, ['active', 'paused'])));
  if (!t) fail('Você não está numa caminhada que possa interromper.');
  return withLock(`travel:${t!.groupId}`, () => db.transaction(async (tx) => {
    const rows = await groupRows(tx, t!.groupId); const leader = rows.find((r) => r.isLeader) ?? rows[0];
    if (!leader || !['active', 'paused'].includes(leader.status)) fail('Agora não dá para dar meia-volta.');
    const now = Date.now();
    const [me] = await tx.select().from(schema.characters).where(eq(schema.characters.id, characterId));
    const who = me ? `${me.firstName} ${me.lastName}` : 'Alguém';
    const mine = rows.find((r) => r.characterId === characterId)!;
    const back = (r: TravelRow) => ({ fromId: r.toId, toId: r.fromId, durationMs: Math.max(5000, Math.min(r.durationMs, elapsedOf(r, now))), elapsedMs: 0, lastProgressAt: new Date(now), status: 'active', encounter: null });
    if (!mine.isLeader && rows.length > 1) {
      const gid = randomUUID();
      await tx.update(schema.travels).set({ ...back(mine), groupId: gid, isLeader: true }).where(eq(schema.travels.id, mine.id));
      await tx.update(schema.characters).set({ followingId: null }).where(eq(schema.characters.id, characterId));
      if (me) { leaveTravelRoom(me.userId, t!.groupId); joinTravelRoom(me.userId, gid); }
      await travelMessage(t!.groupId, `${who} dá meia-volta e volta sozinho(a).`);
      await travelMessage(gid, `${who} deixa o grupo e volta para ${getLocation(mine.fromId)?.name}.`);
      for (const r of rows) pushSelf(r.characterId);
      return { ok: true, detached: true };
    }
    for (const r of rows) await tx.update(schema.travels).set(back(r)).where(eq(schema.travels.id, r.id));
    await travelMessage(t!.groupId, `${who} dá meia-volta: o grupo volta para ${getLocation(leader.fromId)?.name}.`);
    for (const r of rows) pushSelf(r.characterId);
    return { ok: true };
  }));
}
/**
 * Acompanhar alguém avistado na estrada: o seu grupo (ou só você, se você estava acompanhando outra pessoa)
 * passa a fazer o mesmo trajeto, no mesmo ritmo e para o mesmo destino da pessoa escolhida.
 */
export async function joinTravel(characterId: number, targetId: number) {
  const [mine] = await db.select().from(schema.travels).where(and(eq(schema.travels.characterId, characterId), inArray(schema.travels.status, ['active', 'paused'])));
  if (!mine) fail('Você precisa estar andando ou parado numa estrada.');
  const [theirs] = await db.select().from(schema.travels).where(and(eq(schema.travels.characterId, targetId), inArray(schema.travels.status, ['active', 'paused'])));
  if (!theirs) fail('Essa pessoa não está mais na estrada.');
  if (mine!.groupId === theirs!.groupId) fail('Vocês já estão viajando juntos.');
  const [g1, g2] = [mine!.groupId, theirs!.groupId].sort();
  return withLock(`travel:${g1}`, () => withLock(`travel:${g2}`, () => db.transaction(async (tx) => {
    const myRows = await groupRows(tx, mine!.groupId); const theirRows = await groupRows(tx, theirs!.groupId);
    const meRow = myRows.find((r) => r.characterId === characterId); const tRow = theirRows.find((r) => r.characterId === targetId);
    if (!meRow || !tRow || !['active', 'paused'].includes(meRow.status) || !['active', 'paused'].includes(tRow.status)) fail('Agora não dá para acompanhar essa pessoa.');
    if (meRow!.mode === 'vehicle' || tRow!.mode === 'vehicle') fail('Não dá para acompanhar a pé quem está de veículo (nem o contrário).');
    const tLeader = theirRows.find((r) => r.isLeader) ?? tRow!;
    const myLeader = myRows.find((r) => r.isLeader) ?? meRow!;
    if (canSee(myLeader, tLeader) === null) fail('Essa pessoa já está longe demais.');
    const [me] = await tx.select().from(schema.characters).where(eq(schema.characters.id, characterId)).for('update');
    const [target] = await tx.select().from(schema.characters).where(eq(schema.characters.id, targetId));
    if (target?.followingId === characterId) fail('Essa pessoa já está acompanhando você.');
    const movers = meRow!.isLeader ? myRows : [meRow!];
    const now = Date.now(); const elapsed = travelElapsed(tLeader, now);
    for (const r of movers) {
      await tx.update(schema.travels).set({
        groupId: tLeader.groupId, fromId: tLeader.fromId, toId: tLeader.toId, connectionId: tLeader.connectionId, mode: 'walk', vehicleId: null,
        startedAt: tLeader.startedAt, durationMs: tLeader.durationMs, elapsedMs: elapsed, lastProgressAt: new Date(now), status: tLeader.status,
        encounter: null, sceneKey: tLeader.sceneKey, isLeader: false,
      }).where(eq(schema.travels.id, r.id));
    }
    await tx.update(schema.characters).set({ followingId: targetId }).where(eq(schema.characters.id, characterId));
    const moverChars = await tx.select().from(schema.characters).where(inArray(schema.characters.id, movers.map((m) => m.characterId)));
    for (const c of moverChars) { leaveTravelRoom(c.userId, mine!.groupId); joinTravelRoom(c.userId, tLeader.groupId); }
    const meName = `${me!.firstName} ${me!.lastName}`; const tName = `${target!.firstName} ${target!.lastName}`;
    const dest = getLocation(tLeader.toId)?.name;
    await travelMessage(tLeader.groupId, `${movers.length > 1 ? `${meName} e companhia passam` : `${meName} passa`} a acompanhar ${tName} rumo a ${dest}.`);
    if (!meRow!.isLeader) await travelMessage(mine!.groupId, `${meName} deixa o grupo e passa a acompanhar ${tName}.`);
    await gameLog(tx, characterId, 'travel', `Passou a acompanhar ${tName} rumo a ${dest}.`);
    for (const r of [...myRows, ...theirRows]) pushSelf(r.characterId);
    return { ok: true, toName: dest };
  })));
}

let lastSeen = new Map<string, Set<string>>();
/** A cada tick: avisa os grupos quando alguém aparece ou some de vista na estrada. */
export async function processRoadSightings() {
  const all = await roadTravels();
  const now = Date.now();
  const seen = sightingsMap(all, now);
  const changed: string[] = []; const appeared: [string, string][] = []; const left: [string, string][] = [];
  for (const [gid, set] of seen) {
    const prev = lastSeen.get(gid) ?? new Set<string>();
    let diff = false;
    for (const o of set) if (!prev.has(o)) { appeared.push([gid, o]); diff = true; }
    for (const o of prev) if (!set.has(o)) { if (seen.has(o)) left.push([gid, o]); diff = true; }
    if (diff) changed.push(gid);
  }
  lastSeen = seen;
  if (!changed.length) return;
  const ids = [...new Set(all.map((t) => t.characterId))];
  const chars = ids.length ? await db.select().from(schema.characters).where(inArray(schema.characters.id, ids)) : [];
  const nameOf = (gid: string) => {
    const ns = all.filter((t) => t.groupId === gid).map((t) => chars.find((c) => c.id === t.characterId)).filter(Boolean).map((c) => `${c!.firstName} ${c!.lastName}`);
    return ns.length > 1 ? `${ns.slice(0, -1).join(', ')} e ${ns[ns.length - 1]}` : ns[0] ?? 'Alguém';
  };
  const leaderOf = (gid: string) => all.find((t) => t.groupId === gid && t.isLeader) ?? all.find((t) => t.groupId === gid);
  for (const [gid, o] of appeared) {
    const lo = leaderOf(o); const many = all.filter((t) => t.groupId === o).length > 1;
    const going = lo ? (lo.status === 'paused' ? `${many ? 'parados' : 'parado(a)'} na estrada` : `a caminho de ${getLocation(lo.toId)?.name}`) : '';
    await travelMessage(gid, `Na estrada, vocês avistam ${nameOf(o)} — ${going}.`).catch(() => undefined);
  }
  for (const [gid, o] of left) await travelMessage(gid, `${nameOf(o)} ${all.filter((t) => t.groupId === o).length > 1 ? 'somem' : 'some'} de vista.`).catch(() => undefined);
  const touched = new Set(changed);
  for (const t of all) if (touched.has(t.groupId)) pushSelf(t.characterId);
}
export { ne };
