import { dogView } from './dogs.js';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema, type Tx } from '../../db/index.js';
import { ATTRIBUTES, ATTRIBUTE_MAX, ATTRIBUTE_MIN, ATTRIBUTE_POINTS, PROFESSIONS, TRAITS, TRAIT_BASE_POINTS, professionById, SKILLS, charMod, ageStageFor, withAgeTrait } from '../content/character.js';
import { REGION_NAMES } from '../content/items.js';
import { WOUND_TYPES, computeBodyMods, overallHealth, type WoundType } from '../rules/body.js';
import { initialSkills, xpForLevel } from '../rules/progression.js';
import { DISEASE_NAMES, ZOMBIE_SYMPTOMS } from '../rules/simulate.js';
import { cfg, clock, getEventDefs, itemDef } from './config.js';
import { addItem, armorByRegion, carryInfo, describeItem, itemsOf, type CharRow } from './inventory.js';
import { fail, withLock } from './infra.js';
import { getLocation, visibleCondition } from './world.js';
import { isUserOnline } from './realtime.js';
import { nearbyOf } from './roads.js';
import { isStaffRole, serverStatus } from './serverStatus.js';
import { isPrologueMember } from './prologue.js';

export const SPAWN_LOCATION = 'rc_main_street';
/** Onde cada profissão começa, quando não é a Rua Principal. */
export const SPAWN_BY_PROFESSION: Record<string, string> = {
  police: 'rc_police', soldier: 'mil_checkpoint', doctor: 'rc_hospital_lobby', nurse: 'rc_hospital_lobby',
  firefighter: 'in_gate', engineer: 'in_factory_office', electrician: 'in_substation', mechanic: 'rc_workshop',
  cook: 'rc_restaurant', teacher: 'rc_school_classrooms', carpenter: 'in_warehouse_b', hunter: 'fo_hunting_cabin',
  farmer: 'fm_miller_farm', athlete: 'res_avenue', unemployed: 'rc_apartment_3b',
};

export const characterInput = z.object({
  firstName: z.string().trim().min(2).max(24), lastName: z.string().trim().min(2).max(24), age: z.number().int().min(18).max(85),
  appearance: z.string().trim().max(600).default(''), backstory: z.string().trim().max(2000).default(''),
  profession: z.string(), traits: z.array(z.string()).max(8), attributes: z.record(z.string(), z.number().int()),
});

export function validateCharacter(input: z.infer<typeof characterInput>) {
  const prof = professionById(input.profession); if (!prof) fail('Profissão inválida.');
  const keys = Object.keys(ATTRIBUTES);
  let sum = 0;
  for (const k of keys) { const v = input.attributes[k]; if (typeof v !== 'number' || v < ATTRIBUTE_MIN || v > ATTRIBUTE_MAX) fail(`Atributo ${k} inválido.`); sum += v; }
  if (Object.keys(input.attributes).some((k) => !keys.includes(k))) fail('Atributo desconhecido.');
  if (sum !== ATTRIBUTE_POINTS) fail(`Distribua exatamente ${ATTRIBUTE_POINTS} pontos de atributo (atual: ${sum}).`);
  const uniq = [...new Set(input.traits)];
  let points = TRAIT_BASE_POINTS + (prof!.modifiers?.traitPoints ?? 0);
  for (const t of uniq) {
    const tr = TRAITS.find((x) => x.id === t); if (!tr) fail(`Característica inválida: ${t}`);
    if (tr!.exclusive?.some((e) => uniq.includes(e))) fail(`${tr!.name} é incompatível com outra característica escolhida.`);
    points -= tr!.cost;
  }
  if (points < 0) fail('Pontos de características insuficientes. Adicione características negativas ou remova positivas.');
  return { prof: prof!, traits: uniq, pointsLeft: points };
}

export async function activeCharacter(userId: number, tx: Tx = db) {
  const [c] = await tx.select().from(schema.characters).where(and(eq(schema.characters.userId, userId), eq(schema.characters.alive, true))).orderBy(desc(schema.characters.id)).limit(1);
  return c ?? null;
}

export async function createCharacter(userId: number, raw: unknown) {
  const input = characterInput.parse(raw);
  const { prof, traits } = validateCharacter(input);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${7000000 + userId})`);
    // Com "exigir aprovação" ligado, fichas de jogadores nascem pendentes; as da equipe já nascem aprovadas.
    const [owner] = await tx.select({ role: schema.users.role, settings: schema.users.settings }).from(schema.users).where(eq(schema.users.id, userId));
    const approved = !(serverStatus().requireApproval && !isStaffRole(owner?.role));
    const alive = await tx.select({ id: schema.characters.id }).from(schema.characters).where(and(eq(schema.characters.userId, userId), eq(schema.characters.alive, true)));
    if (alive.length >= cfg().permadeath.maxAliveCharactersPerUser) fail('Você já possui um personagem vivo.');
    const now = Date.now();
    const [ch] = await tx.insert(schema.characters).values({
      approved,
      userId, firstName: input.firstName, lastName: input.lastName, age: input.age, appearance: input.appearance, backstory: input.backstory,
      profession: prof.id, traits: withAgeTrait(traits, input.age), attributes: input.attributes, locationId: SPAWN_BY_PROFESSION[prof.id] ?? SPAWN_LOCATION,
      needs: { hunger: 15, thirst: 15, sleepiness: 10, stamina: 100, energy: 100, stress: 20, bodyTemp: 37, blood: 100, boredom: 0, vitality: 100 },
      skills: initialSkills(prof.skills, cfg()), knownRecipes: [...prof.recipes],
      protectedUntil: new Date(now + cfg().pvp.newbieProtectionHours * 3_600_000),
    }).returning();
    const starter = [{ itemId: 'tshirt', slot: 'shirt' }, { itemId: 'jeans', slot: 'pants' }, { itemId: 'sneakers', slot: 'boots' }];
    for (const s of starter) { const [it] = await addItem(tx, 'character', ch.id, s.itemId, 1); await tx.update(schema.items).set({ slot: s.slot }).where(eq(schema.items.id, it.id)); }
    await addItem(tx, 'character', ch.id, 'water_bottle', 1);
    await addItem(tx, 'character', ch.id, 'crackers', 2);
    let armed = false;
    for (const it of prof.items) {
      const d = itemDef(it.itemId);
      // arma de fogo da profissão: vem carregada e já na mão
      if (d?.props?.weaponType === 'ranged') {
        const [w] = await addItem(tx, 'character', ch.id, it.itemId, 1, { data: { ammo: d.props.magSize ?? 0 } });
        if (!armed) { await tx.update(schema.items).set({ slot: 'primary' }).where(eq(schema.items.id, w.id)); armed = true; }
      } else await addItem(tx, 'character', ch.id, it.itemId, it.qty);
    }
    await tx.insert(schema.gameLogs).values({ characterId: ch.id, kind: 'system', message: `${ch.firstName} ${ch.lastName} chegou a Raven Creek.` });
    if ((owner?.settings as any)?.rejection) { const { rejection: _r, ...rest } = owner!.settings as any; await tx.update(schema.users).set({ settings: rest }).where(eq(schema.users.id, userId)); }
    return ch;
  });
}

/** Executa fn com o personagem travado (mutex local + SELECT ... FOR UPDATE). */
export async function withCharacter<T>(characterId: number, fn: (tx: Tx, ch: CharRow) => Promise<T>): Promise<T> {
  return withLock(`char:${characterId}`, () => db.transaction(async (tx) => {
    const [ch] = await tx.select().from(schema.characters).where(eq(schema.characters.id, characterId)).for('update');
    if (!ch) fail('Personagem não encontrado.');
    return fn(tx, ch!);
  }));
}
/** Trava dois personagens em ordem estável (evita deadlock). */
export async function withTwoCharacters<T>(a: number, b: number, fn: (tx: Tx, ca: CharRow, cb: CharRow) => Promise<T>): Promise<T> {
  if (a === b) return withCharacter(a, (tx, c) => fn(tx, c, c));
  const [first, second] = a < b ? [a, b] : [b, a];
  return withLock(`char:${first}`, () => withLock(`char:${second}`, () => db.transaction(async (tx) => {
    const rows = await tx.select().from(schema.characters).where(eq(schema.characters.id, first)).for('update');
    const rows2 = await tx.select().from(schema.characters).where(eq(schema.characters.id, second)).for('update');
    const byId = new Map([...rows, ...rows2].map((r) => [r.id, r]));
    if (!byId.get(a) || !byId.get(b)) fail('Personagem não encontrado.');
    return fn(tx, byId.get(a)!, byId.get(b)!);
  })));
}

export function assertCanAct(ch: CharRow, opts: { allowBusy?: boolean; allowTravel?: boolean; allowCombat?: boolean } = {}) {
  if (!ch.alive) fail('Seu personagem está morto.');
  if (ch.needs.unconscious) fail('Você está inconsciente.');
  if (ch.state === 'combat' && !opts.allowCombat) fail('Você está em combate!', 'in_combat');
  if (ch.state === 'traveling' && !opts.allowTravel) fail('Você está viajando.', 'traveling');
  if (ch.state === 'busy' && !opts.allowBusy) fail('Você está ocupado com outra ação.', 'busy');
  // Lendo: a atenção está toda no livro. Nada de mexer na mochila, tratar, equipar… (dá para parar de ler).
  if (ch.state === 'busy' && (ch.busyAction as any)?.type === 'read') fail('Você está lendo. Pare de ler antes de fazer outra coisa.', 'busy');
}

export async function woundsOf(tx: Tx, characterId: number, includeHealed = false) {
  const rows = await tx.select().from(schema.wounds).where(eq(schema.wounds.characterId, characterId));
  return includeHealed ? rows : rows.filter((w) => !w.healedAt);
}
export async function conditionsOf(tx: Tx, characterId: number) {
  return tx.select().from(schema.conditions).where(and(eq(schema.conditions.characterId, characterId), isNull(schema.conditions.resolvedAt)));
}

/** Estado privado completo do personagem, enviado apenas ao dono. */
export async function buildSelfState(characterId: number, tx: Tx = db) {
  const [ch] = await tx.select().from(schema.characters).where(eq(schema.characters.id, characterId));
  if (!ch) return null;
  const wounds = await woundsOf(tx, ch.id);
  const conds = await conditionsOf(tx, ch.id);
  const items = await itemsOf(tx, 'character', ch.id);
  const mods = computeBodyMods(wounds, ch.amputations, ch.needs);
  const carry = carryInfo(items, ch);
  const [travel] = await tx.select().from(schema.travels).where(and(eq(schema.travels.characterId, ch.id), eq(schema.travels.status, 'active'))).limit(1);
  const [pendingTravel] = travel ? [travel] : await tx.select().from(schema.travels).where(and(eq(schema.travels.characterId, ch.id))).orderBy(desc(schema.travels.id)).limit(1);
  const activeTravel = pendingTravel && ['active', 'paused', 'awaiting_decision', 'combat'].includes(pendingTravel.status) ? pendingTravel : null;
  const companions = activeTravel ? (await tx.select({ c: schema.characters }).from(schema.travels)
    .innerJoin(schema.characters, eq(schema.characters.id, schema.travels.characterId))
    .where(and(eq(schema.travels.groupId, activeTravel.groupId), inArray(schema.travels.status, ['active', 'paused', 'awaiting_decision', 'combat']))))
    .map(({ c }) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, portrait: c.portrait, portraitAdjust: c.portraitAdjust, state: c.state, activity: c.activity, appearance: c.appearance,
      online: isUserOnline(c.userId), userId: c.userId, followingId: c.followingId, inCombat: !!c.combatId, visibleCondition: visibleCondition(c.needs) })) : [];
  // Outros viajantes à vista na estrada (mesma estrada ou estradas que se encontram num local).
  let nearby: any[] = [];
  if (activeTravel && ['active', 'paused', 'awaiting_decision'].includes(activeTravel.status)) {
    const near = await nearbyOf(activeTravel.groupId, tx);
    const ids = near.map((n) => n.travel.characterId);
    const chars = ids.length ? await tx.select().from(schema.characters).where(inArray(schema.characters.id, ids)) : [];
    nearby = near.flatMap(({ travel: t, distance }) => {
      const c = chars.find((x) => x.id === t.characterId); if (!c || !c.alive) return [];
      return [{ id: c.id, name: `${c.firstName} ${c.lastName}`, portrait: c.portrait, portraitAdjust: c.portraitAdjust, state: c.state, activity: c.activity, appearance: c.appearance,
        online: isUserOnline(c.userId), userId: c.userId, followingId: c.followingId, inCombat: !!c.combatId, visibleCondition: visibleCondition(c.needs),
        toName: getLocation(t.toId)?.name ?? '?', fromName: getLocation(t.fromId)?.name ?? '?', travelStatus: t.status, mode: t.mode, distance, groupId: t.groupId,
        sameRoad: (t.fromId === activeTravel.fromId && t.toId === activeTravel.toId) || (t.fromId === activeTravel.toId && t.toId === activeTravel.fromId) }];
    });
  }
  const leaderRow = activeTravel ? (await tx.select().from(schema.travels).where(and(eq(schema.travels.groupId, activeTravel.groupId), eq(schema.travels.isLeader, true))).limit(1))[0] : null;
  const [membership] = await tx.select().from(schema.factionMembers).where(eq(schema.factionMembers.characterId, ch.id));
  let faction = null as any;
  if (membership) { const [f] = await tx.select().from(schema.factions).where(eq(schema.factions.id, membership.factionId)); faction = f ? { id: f.id, name: f.name, emblem: f.emblem, color: f.color, rank: membership.rank } : null; }
  const invites = await tx.select({ factionId: schema.factionInvites.factionId, name: schema.factions.name }).from(schema.factionInvites)
    .innerJoin(schema.factions, eq(schema.factions.id, schema.factionInvites.factionId)).where(eq(schema.factionInvites.characterId, ch.id));
  const logs = await tx.select().from(schema.gameLogs).where(eq(schema.gameLogs.characterId, ch.id)).orderBy(desc(schema.gameLogs.id)).limit(30);
  const prof = professionById(ch.profession);
  const isDoctor = ch.profession === 'doctor' || (ch.skills.medicine?.level ?? 0) >= 6;
  const loc = getLocation(ch.locationId);
  const now = Date.now();
  return {
    userId: ch.userId,
    state: {
      id: ch.id, name: `${ch.firstName} ${ch.lastName}`, firstName: ch.firstName, lastName: ch.lastName, age: ch.age, ageStage: (() => { const s = ageStageFor(ch.age); return s ? { name: s.name, description: s.description } : null; })(), appearance: ch.appearance, backstory: ch.backstory,
      profession: { id: ch.profession, name: prof?.name ?? ch.profession, perks: prof?.perks ?? [] }, traits: ch.traits.map((t) => TRAITS.find((x) => x.id === t)).filter(Boolean),
      attributes: ch.attributes, portrait: ch.portrait, portraitAdjust: ch.portraitAdjust, alive: ch.alive, deathCause: ch.deathCause,
      locationId: ch.locationId, locationName: loc?.name ?? ch.locationId, state: ch.state, activity: ch.activity, busyUntil: ch.busyUntil, busyAction: ch.busyAction,
      combatId: ch.combatId, prologue: isPrologueMember(ch.id), followingId: ch.followingId, vehicleId: ch.vehicleId, radioFrequency: ch.radioFrequency, tutorialStep: ch.tutorialStep,
      protectedUntil: ch.protectedUntil && ch.protectedUntil.getTime() > now ? ch.protectedUntil : null,
      needs: { ...ch.needs, health: overallHealth(wounds, ch.needs), pain: Math.round(mods.pain), staminaMax: Math.round(100 * mods.staminaMaxMult * charMod(ch.profession, ch.traits, 'staminaMax')) },
      mods: { moveMult: mods.moveMult, accuracyMult: mods.accuracyMult, meleeMult: mods.meleeMult, canUseTwoHanded: mods.canUseTwoHanded, usableHands: mods.usableHands, notes: mods.notes },
      amputations: ch.amputations,
      wounds: wounds.map((w) => ({
        id: w.id, region: w.region, regionName: REGION_NAMES[w.region as keyof typeof REGION_NAMES] ?? w.region, type: w.type, typeName: WOUND_TYPES[w.type as WoundType]?.name ?? w.type,
        severity: w.severity, bleeding: Math.round(w.bleeding * 1000) / 1000, pain: Math.round(w.pain * (1 - w.healing * 0.85)), healing: w.healing,
        bandaged: w.bandaged, bandageDirt: w.bandageDirt, disinfected: w.disinfected, splinted: w.splinted, sutured: w.sutured,
        infected: w.infected, contaminated: w.contamination > 0.45, createdAt: w.createdAt, source: w.source,
      })),
      conditions: conds.filter((c) => c.kind !== 'zombie_infection' || c.discovered || c.stage >= 1).map((c) => {
        if (c.kind === 'zombie_infection' && !c.discovered) return { id: c.id, kind: 'unknown', name: 'Mal-estar sem causa aparente', stage: c.stage, symptoms: ZOMBIE_SYMPTOMS[c.stage] ?? '', hidden: true };
        return { id: c.id, kind: c.kind, name: DISEASE_NAMES[c.kind] ?? c.kind, stage: c.stage, symptoms: c.kind === 'zombie_infection' ? ZOMBIE_SYMPTOMS[c.stage] : '', progress: isDoctor ? c.progress : undefined, hidden: false };
      }),
      skills: Object.entries(SKILLS).map(([id, s]) => {
        const v = ch.skills[id] ?? { xp: 0, level: 0 };
        const cur = xpForLevel(v.level, cfg()); const next = xpForLevel(v.level + 1, cfg());
        return { id, name: s.name, category: s.category, level: v.level, progress: v.level >= cfg().skills.maxLevel ? 1 : (v.xp - cur) / Math.max(1, next - cur) };
      }),
      knownRecipes: ch.knownRecipes,
      inventory: items.map(describeItem), carry, armor: armorByRegion(items),
      // marcações feitas no próprio mapa (somem se o mapa sair das mãos da pessoa)
      hasMap: items.some((i) => itemDef(i.defId)?.props.map),
      mapMarks: ((items.find((i) => itemDef(i.defId)?.props.map)?.data?.marks ?? []) as unknown[]),
      travel: activeTravel ? {
        id: activeTravel.id, status: activeTravel.status, fromId: activeTravel.fromId, toId: activeTravel.toId, toName: getLocation(activeTravel.toId)?.name, fromName: getLocation(activeTravel.fromId)?.name,
        durationMs: activeTravel.durationMs, elapsedMs: activeTravel.elapsedMs + (activeTravel.status === 'active' ? now - activeTravel.lastProgressAt.getTime() : 0),
        mode: activeTravel.mode, sceneKey: activeTravel.sceneKey, groupId: activeTravel.groupId, companions, nearby, isLeader: activeTravel.isLeader, leaderId: leaderRow?.characterId ?? null,
        encounter: activeTravel.status === 'awaiting_decision' && activeTravel.encounter ? { ...activeTravel.encounter, ...(() => { const ev = getEventDefs().find((e) => e.id === activeTravel.encounter!.eventId); return { kind: ev?.kind ?? 'combat', text: ev?.text ?? '' }; })() } : null,
      } : null,
      dog: await dogView(ch.id, tx),
      // capítulos da história com estado por pessoa (capítulo 1: queda do helicóptero)
      lore: { heli: await (await import('./heli.js')).heliView(ch.id) },
      faction, factionInvites: invites,
      logs: logs.map((l) => ({ id: l.id, kind: l.kind, message: l.message, at: l.createdAt })),
      clock: clock(),
      itemNames: undefined as unknown,
    },
  };
}
export const itemName = (id: string) => itemDef(id)?.name ?? id;
export { PROFESSIONS };
