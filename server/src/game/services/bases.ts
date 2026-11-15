/** Emblemas de facção (símbolos SVG no cliente). */
export const FACTION_EMBLEMS = ['wolf', 'raven', 'axes', 'anchor', 'skull', 'radiation', 'biohazard', 'fist', 'eagle', 'wire', 'crown', 'flame', 'pine', 'wheat', 'cross', 'banner'];
import { cropMultiplier } from './nature.js';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema, type Tx } from '../../db/index.js';
import { charMod, PROFESSIONS } from '../content/character.js';
import { STRUCTURES } from '../content/structures.js';
import { clamp } from '../rules/rng.js';
import { assertCanAct, withCharacter } from './characters.js';
import { cfg } from './config.js';
import { fail, gameLog } from './infra.js';
import { consumeByDef, countDef, hasTool, itemsOf, type CharRow } from './inventory.js';
import { emitToRoom, getIO, notify, pushScene, pushSelf } from './realtime.js';
import { systemEmote } from './chat.js';
import { giveXp } from './survival.js';
import { getLocation } from './world.js';

const fullName = (c: CharRow) => `${c.firstName} ${c.lastName}`;

async function membership(tx: Tx, characterId: number) {
  const [m] = await tx.select().from(schema.factionMembers).where(eq(schema.factionMembers.characterId, characterId));
  return m ?? null;
}
export async function canManageBase(tx: Tx, base: typeof schema.bases.$inferSelect, ch: CharRow) {
  if (base.ownerCharacterId === ch.id) return true;
  if (!base.factionId) return false;
  const m = await membership(tx, ch.id);
  return !!m && m.factionId === base.factionId && m.rank !== 'recruit';
}

// ───────────────────────── Bases ─────────────────────────
export async function claimBase(characterId: number, name: string) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch);
    const loc = getLocation(ch.locationId)!;
    if (!loc.buildable) fail('Este local não pode ser transformado em base.');
    const [existing] = await tx.select().from(schema.bases).where(eq(schema.bases.locationId, loc.id));
    if (existing) fail('Este local já foi reivindicado.');
    const [ll] = await tx.select().from(schema.locationLoot).where(eq(schema.locationLoot.locationId, loc.id));
    if (cfg().build.claimRequiresNoZombies && (ll?.zombies ?? 0) > 0) fail('Limpe os infectados do local antes de reivindicá-lo.');
    const m = await membership(tx, ch.id);
    const [base] = await tx.insert(schema.bases).values({ locationId: loc.id, name: name.trim().slice(0, 40) || loc.name, ownerCharacterId: ch.id, factionId: m?.factionId ?? null }).returning();
    await tx.insert(schema.containers).values({ locationId: loc.id, name: `Estoque — ${base.name}`, kind: 'base_storage', baseId: base.id, capacity: 60 });
    await gameLog(tx, ch.id, 'base', `Reivindicou ${loc.name} como base "${base.name}".`);
    await systemEmote(loc.id, `${fullName(ch)} reivindica este lugar: agora é a base "${base.name}".`, 'system');
    pushScene(loc.id);
    return { ok: true, baseId: base.id };
  });
}

/** Inicia uma construção: consome materiais, energia e estamina; termina via job agendado. */
export async function build(characterId: number, kind: string) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch);
    const def = STRUCTURES[kind]; if (!def) fail('Construção desconhecida.');
    const [base] = await tx.select().from(schema.bases).where(eq(schema.bases.locationId, ch.locationId));
    if (!base) fail('Reivindique este local como base antes de construir.');
    if (!(await canManageBase(tx, base!, ch))) fail('Você não tem permissão para construir nesta base.');
    const existing = await tx.select().from(schema.baseStructures).where(and(eq(schema.baseStructures.baseId, base!.id), eq(schema.baseStructures.kind, kind)));
    if (existing.length >= def.maxCount) fail(`Limite atingido para ${def.name}.`);
    const lvl = ch.skills[def.skill]?.level ?? 0;
    if (lvl < def.minLevel) fail(`Exige ${def.skill} nível ${def.minLevel}.`);
    if (def.knowledge && !ch.knownRecipes.includes(def.knowledge)) fail('Você não sabe como construir isso. Procure um livro ou alguém da profissão.');
    if (kind === 'lights') { const gen = await tx.select().from(schema.baseStructures).where(and(eq(schema.baseStructures.baseId, base!.id), eq(schema.baseStructures.kind, 'generator'))); if (!gen.length) fail('Construa um gerador primeiro.'); }
    const items = await itemsOf(tx, 'character', ch.id);
    for (const t of def.tools) if (!hasTool(items, t)) fail(`Ferramenta necessária: ${t}.`);
    const matMult = charMod(ch.profession, ch.traits, 'buildMaterial');
    const mats = def.materials.map((m) => ({ ...m, qty: Math.max(1, Math.ceil(m.qty * matMult * (1 - Math.min(0.3, lvl * 0.03)))) }));
    for (const m of mats) if (countDef(items, m.itemId) < m.qty) fail(`Materiais insuficientes: precisa de ${m.qty}× ${m.itemId}.`);
    if (ch.needs.energy < def.energy) fail('Energia insuficiente para construir agora.', 'no_energy');
    for (const m of mats) await consumeByDef(tx, 'character', ch.id, m.itemId, m.qty);
    const seconds = def.seconds / (charMod(ch.profession, ch.traits, 'buildSpeed') * (1 + lvl * 0.05));
    const runAt = new Date(Date.now() + seconds * 1000);
    const maxHp = def.maxHp * charMod(ch.profession, ch.traits, 'structureHp');
    const [st] = await tx.insert(schema.baseStructures).values({ baseId: base!.id, kind, hp: maxHp, maxHp, builtBy: ch.id, completeAt: runAt }).returning();
    const [job] = await tx.insert(schema.jobs).values({ kind: 'build_complete', characterId: ch.id, runAt, payload: { structureId: st.id, kind } }).returning();
    await tx.update(schema.characters).set({ state: 'busy', activity: 'idle', busyUntil: runAt, busyAction: { type: 'build', jobId: job.id, label: `Construindo: ${def.name}`, startedAt: Date.now() },
      needs: { ...ch.needs, energy: ch.needs.energy - def.energy, stamina: clamp(ch.needs.stamina - 10, 0, 100) } }).where(eq(schema.characters.id, ch.id));
    await systemEmote(ch.locationId, `${fullName(ch)} começa a construir: ${def.name.toLowerCase()}.`);
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true, seconds: Math.round(seconds) };
  });
}

export async function completeBuild(jobId: number, characterId: number, structureId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    const [st] = await tx.select().from(schema.baseStructures).where(eq(schema.baseStructures.id, structureId));
    if (st) {
      await tx.update(schema.baseStructures).set({ completeAt: null }).where(eq(schema.baseStructures.id, st.id));
      const def = STRUCTURES[st.kind];
      if (def?.effects?.storage) await tx.update(schema.containers).set({ capacity: sql`${schema.containers.capacity} + ${def.effects.storage}` }).where(and(eq(schema.containers.baseId, st.baseId), eq(schema.containers.kind, 'base_storage')));
      await giveXp(tx, ch, def?.skill ?? 'carpentry', 12, `build_${st.kind}`);
      await gameLog(tx, ch.id, 'build', `Concluiu: ${def?.name ?? st.kind}.`);
    }
    if ((ch.busyAction as any)?.jobId === jobId) {
      await tx.update(schema.characters).set({ state: 'idle', busyUntil: null, busyAction: null }).where(eq(schema.characters.id, ch.id));
      await systemEmote(ch.locationId, `${fullName(ch)} termina a construção.`);
    }
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true };
  });
}

export async function repairStructure(characterId: number, structureId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch);
    const [st] = await tx.select().from(schema.baseStructures).where(eq(schema.baseStructures.id, structureId));
    const [base] = st ? await tx.select().from(schema.bases).where(eq(schema.bases.id, st.baseId)) : [];
    if (!st || !base || base.locationId !== ch.locationId) fail('Estrutura não encontrada aqui.');
    if (st!.hp >= st!.maxHp) fail('Não há o que reparar.');
    const items = await itemsOf(tx, 'character', ch.id);
    if (!hasTool(items, 'hammer')) fail('Precisa de um martelo.');
    await consumeByDef(tx, 'character', ch.id, 'plank', 1); await consumeByDef(tx, 'character', ch.id, 'nails', 2);
    const amount = st!.maxHp * (0.35 + (ch.skills.carpentry?.level ?? 0) * 0.04);
    await tx.update(schema.baseStructures).set({ hp: Math.min(st!.maxHp, st!.hp + amount) }).where(eq(schema.baseStructures.id, st!.id));
    await tx.update(schema.characters).set({ needs: { ...ch.needs, energy: Math.max(0, ch.needs.energy - 4) } }).where(eq(schema.characters.id, ch.id));
    await giveXp(tx, ch, 'carpentry', 4, `repair_${st!.id}`);
    await systemEmote(ch.locationId, `${fullName(ch)} reforça ${STRUCTURES[st!.kind]?.name.toLowerCase() ?? 'a estrutura'}.`);
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true };
  });
}

/** Produção periódica de bases (coletor de água, plantação, combustível do gerador). */
export async function processBaseProduction(hours: number) {
  const st = await db.select().from(schema.baseStructures);
  const { addItem } = await import('./inventory.js');
  const { clock } = await import('./config.js');
  // plantações montadas por um agricultor produzem mais
  const builders = [...new Set(st.filter((s) => s.kind === 'garden' && s.builtBy).map((s) => s.builtBy!))];
  const farmers = new Set(builders.length ? (await db.select({ id: schema.characters.id }).from(schema.characters).where(and(inArray(schema.characters.id, builders), eq(schema.characters.profession, 'farmer')))).map((c) => c.id) : []);
  for (const s of st) {
    if (s.completeAt && s.completeAt > new Date()) continue;
    const gardenMult = s.kind === 'garden' && s.builtBy && farmers.has(s.builtBy) ? (PROFESSIONS.find((p) => p.id === 'farmer')?.modifiers?.gardenYield ?? 3) : 1;
    const acc = Number(s.data.acc ?? 0) + hours * (s.kind === 'rain_collector' ? (['rain', 'storm'].includes(clock().weather) ? 1.5 : 0.25) : s.kind === 'garden' ? 0.12 * cropMultiplier() * gardenMult : 0);
    if (acc >= 1) {
      const [store] = await db.select().from(schema.containers).where(and(eq(schema.containers.baseId, s.baseId), eq(schema.containers.kind, 'base_storage')));
      if (store) await db.transaction(async (tx) => addItem(tx, 'container', store.id, s.kind === 'garden' ? 'apple' : 'dirty_water', Math.floor(acc)));
    }
    if (s.kind === 'rain_collector' || s.kind === 'garden') await db.update(schema.baseStructures).set({ data: { ...s.data, acc: acc % 1 } }).where(eq(schema.baseStructures.id, s.id));
    if (s.kind === 'generator' && Number(s.data.fuel ?? 0) > 0) await db.update(schema.baseStructures).set({ data: { ...s.data, fuel: Math.max(0, Number(s.data.fuel) - hours * 1.5) } }).where(eq(schema.baseStructures.id, s.id));
  }
}

export async function fuelGenerator(characterId: number, structureId: number, itemId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch);
    const [st] = await tx.select().from(schema.baseStructures).where(eq(schema.baseStructures.id, structureId));
    if (!st || st.kind !== 'generator') fail('Gerador não encontrado.');
    const { consumeItem } = await import('./inventory.js');
    const it = (await itemsOf(tx, 'character', ch.id)).find((i) => i.id === itemId && i.defId === 'gas_can');
    if (!it) fail('Você precisa de um galão de combustível.');
    await consumeItem(tx, it!.id, 'character', ch.id, 1);
    await tx.update(schema.baseStructures).set({ data: { ...st!.data, fuel: Number(st!.data.fuel ?? 0) + 10 * charMod(ch.profession, ch.traits, 'generatorFuel') ** -1 } }).where(eq(schema.baseStructures.id, st!.id));
    await systemEmote(ch.locationId, `${fullName(ch)} abastece o gerador. As luzes zumbem.`);
    pushScene(ch.locationId); pushSelf(ch.id);
    return { ok: true };
  });
}

// ───────────────────────── Facções ─────────────────────────
const RANKS = ['recruit', 'member', 'officer', 'leader'];
const rankAtLeast = (r: string, min: string) => RANKS.indexOf(r) >= RANKS.indexOf(min);

export async function createFaction(characterId: number, name: string, emblem: string, color: string) {
  return withCharacter(characterId, async (tx, ch) => {
    if (await membership(tx, ch.id)) fail('Você já pertence a uma facção.');
    const n = name.trim(); if (n.length < 3 || n.length > 32) fail('Nome deve ter de 3 a 32 caracteres.');
    const [dup] = await tx.select().from(schema.factions).where(sql`lower(${schema.factions.name}) = lower(${n})`);
    if (dup) fail('Já existe uma facção com esse nome.');
    const [f] = await tx.insert(schema.factions).values({ name: n, emblem: FACTION_EMBLEMS.includes(emblem) ? emblem : 'banner', color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#b45309', createdBy: ch.id }).returning();
    await tx.insert(schema.factionMembers).values({ factionId: f.id, characterId: ch.id, rank: 'leader' });
    await gameLog(tx, ch.id, 'faction', `Fundou a facção ${f.name}.`, { factionId: f.id });
    getIO()?.in(`user:${ch.userId}`).socketsJoin(`faction:${f.id}`);
    pushSelf(ch.id);
    return { ok: true, factionId: f.id };
  });
}
export async function inviteToFaction(characterId: number, targetId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    const m = await membership(tx, ch.id); if (!m || !rankAtLeast(m.rank, 'officer')) fail('Apenas oficiais e líderes podem convidar.');
    const [t] = await tx.select().from(schema.characters).where(eq(schema.characters.id, targetId));
    if (!t?.alive) fail('Personagem não encontrado.');
    if (await membership(tx, targetId)) fail('Essa pessoa já pertence a uma facção.');
    await tx.insert(schema.factionInvites).values({ factionId: m!.factionId, characterId: targetId, invitedBy: ch.id }).onConflictDoNothing();
    notify(t!.userId, `${fullName(ch)} convidou você para uma facção. Veja em Facção.`, 'info');
    pushSelf(targetId);
    return { ok: true };
  });
}
export async function answerInvite(characterId: number, factionId: number, accept: boolean) {
  return withCharacter(characterId, async (tx, ch) => {
    const [inv] = await tx.select().from(schema.factionInvites).where(and(eq(schema.factionInvites.factionId, factionId), eq(schema.factionInvites.characterId, ch.id)));
    if (!inv) fail('Convite não encontrado.');
    await tx.delete(schema.factionInvites).where(and(eq(schema.factionInvites.factionId, factionId), eq(schema.factionInvites.characterId, ch.id)));
    if (accept) {
      if (await membership(tx, ch.id)) fail('Você já pertence a uma facção.');
      await tx.insert(schema.factionMembers).values({ factionId, characterId: ch.id, rank: 'recruit' });
      await gameLog(tx, ch.id, 'faction', 'Entrou para a facção.', { factionId });
      getIO()?.in(`user:${ch.userId}`).socketsJoin(`faction:${factionId}`);
      emitToRoom(`faction:${factionId}`, 'notify', { text: `${fullName(ch)} entrou para a facção.`, level: 'info', at: Date.now() });
    }
    pushSelf(ch.id);
    return { ok: true };
  });
}
export async function leaveFaction(characterId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    const m = await membership(tx, ch.id); if (!m) fail('Você não pertence a uma facção.');
    await tx.delete(schema.factionMembers).where(eq(schema.factionMembers.characterId, ch.id));
    const rest = await tx.select().from(schema.factionMembers).where(eq(schema.factionMembers.factionId, m!.factionId));
    if (m!.rank === 'leader' && rest.length) {
      const next = rest.sort((a, b) => RANKS.indexOf(b.rank) - RANKS.indexOf(a.rank))[0];
      await tx.update(schema.factionMembers).set({ rank: 'leader' }).where(and(eq(schema.factionMembers.factionId, m!.factionId), eq(schema.factionMembers.characterId, next.characterId)));
    }
    getIO()?.in(`user:${ch.userId}`).socketsLeave(`faction:${m!.factionId}`);
    await gameLog(tx, ch.id, 'faction', 'Saiu da facção.', { factionId: m!.factionId });
    pushSelf(ch.id);
    return { ok: true };
  });
}
export async function setRank(characterId: number, targetId: number, rank: string) {
  return withCharacter(characterId, async (tx, ch) => {
    if (!RANKS.includes(rank)) fail('Patente inválida.');
    const m = await membership(tx, ch.id); const t = await membership(tx, targetId);
    if (!m || m.rank !== 'leader' || !t || t.factionId !== m.factionId) fail('Apenas o líder pode alterar patentes de membros da facção.');
    if (rank === 'kick') { await tx.delete(schema.factionMembers).where(eq(schema.factionMembers.characterId, targetId)); }
    else await tx.update(schema.factionMembers).set({ rank }).where(eq(schema.factionMembers.characterId, targetId));
    await gameLog(tx, targetId, 'faction', `Sua patente agora é ${rank}.`);
    pushSelf(targetId);
    return { ok: true };
  });
}
export async function factionDetails(factionId: number) {
  const [f] = await db.select().from(schema.factions).where(eq(schema.factions.id, factionId)); if (!f) return null;
  const members = await db.select({ characterId: schema.factionMembers.characterId, rank: schema.factionMembers.rank, firstName: schema.characters.firstName, lastName: schema.characters.lastName, locationId: schema.characters.locationId })
    .from(schema.factionMembers).innerJoin(schema.characters, eq(schema.characters.id, schema.factionMembers.characterId)).where(eq(schema.factionMembers.factionId, factionId));
  const bases = await db.select().from(schema.bases).where(eq(schema.bases.factionId, factionId));
  const ids = members.map((m) => m.characterId);
  const logs = ids.length ? await db.select().from(schema.gameLogs).where(sql`${schema.gameLogs.characterId} in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) and ${schema.gameLogs.kind} in ('base','faction','build')`).orderBy(sql`${schema.gameLogs.id} desc`).limit(40) : [];
  return { ...f, members: members.map((m) => ({ ...m, name: `${m.firstName} ${m.lastName}`, locationName: getLocation(m.locationId)?.name })), bases: bases.map((b) => ({ ...b, locationName: getLocation(b.locationId)?.name })), logs };
}
export async function assignBaseToFaction(characterId: number, baseId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    const [b] = await tx.select().from(schema.bases).where(eq(schema.bases.id, baseId));
    const m = await membership(tx, ch.id);
    if (!b || b.ownerCharacterId !== ch.id || !m) fail('Somente o dono da base, membro de uma facção, pode cedê-la.');
    await tx.update(schema.bases).set({ factionId: m!.factionId }).where(eq(schema.bases.id, baseId));
    pushScene(b!.locationId);
    return { ok: true };
  });
}
