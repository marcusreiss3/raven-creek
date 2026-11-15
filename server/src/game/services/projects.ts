import { cropMultiplier } from './nature.js';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema, type Tx } from '../../db/index.js';
import { HOSPITAL_LOCATIONS, MAIN_STREET_ZONE, POWER_REGIONS, PROJECTS, projectDef, type ProjectDef } from '../content/projects.js';
import { clamp } from '../rules/rng.js';
import { assertCanAct, withCharacter } from './characters.js';
import { radioBroadcast, systemEmote } from './chat.js';
import { cfg, itemDef } from './config.js';
import { fail, gameLog } from './infra.js';
import { addItem, consumeByDef, countDef, hasTool, itemsOf, type CharRow } from './inventory.js';
import { emitAll, pushScene, pushSelf } from './realtime.js';
import { giveXp } from './survival.js';
import { getLocation } from './world.js';

type Row = typeof schema.communityProjects.$inferSelect;
const P = () => ({
  workSessionMinutes: 20, workEnergy: 16, workStamina: 12, skillBonusPerLevel: 0.08, minIntegrity: 40, wearPerHour: 0.35,
  repairPerSession: 8, hordeDamagePerZombie: 1.2, claimMinutes: 30, xpPerSession: 14,
  ...((cfg() as any).projects ?? {}),
});
const fullName = (c: CharRow) => `${c.firstName} ${c.lastName}`;

// ───────────── estado em memória (efeitos consultados a todo momento) ─────────────
let cache = new Map<string, Row>();
export async function loadProjects(tx: Tx = db) {
  const rows = await tx.select().from(schema.communityProjects);
  cache = new Map(rows.map((r) => [r.id, r]));
}
/** Garante uma linha por projeto (novos projetos aparecem sozinhos em servidores existentes). */
export async function ensureProjects() {
  const existing = new Set((await db.select({ id: schema.communityProjects.id }).from(schema.communityProjects)).map((r) => r.id));
  for (const p of PROJECTS) {
    if (existing.has(p.id)) continue;
    await db.insert(schema.communityProjects).values({ id: p.id, status: p.requires?.length ? 'locked' : 'active' }).onConflictDoNothing();
  }
  await loadProjects();
}

export const projectRow = (id: string) => cache.get(id);
/** Projeto concluído e em condições de funcionar. */
export function projectActive(id: string) {
  const r = cache.get(id);
  return !!r && r.status === 'complete' && r.integrity >= P().minIntegrity;
}
export function isPowered(locationId: string) {
  const r = cache.get('substation');
  if (!projectActive('substation') || r?.data?.powerOn === false) return false;
  const loc = getLocation(locationId);
  return !!loc && POWER_REGIONS.includes(loc.regionId);
}
/** Modificadores de infectados por zona, vindos das obras concluídas. */
export function zoneZombieMods(locationId: string) {
  let respawn = 1; let threat = 1;
  if (projectActive('hospital') && HOSPITAL_LOCATIONS.includes(locationId)) { respawn *= 0.1; threat *= 0.3; }
  if (projectActive('main_street_wall') && MAIN_STREET_ZONE.includes(locationId)) { respawn *= 0.25; threat *= 0.5; }
  return { respawn, threat };
}
export function healingBonus(locationId: string) {
  return projectActive('hospital') && ['rc_hospital_ward', 'rc_hospital_surgery'].includes(locationId) ? 1.6 : 1;
}
export const bridgeBlocksHordes = () => projectActive('bridge');
export const hordeSpawnMultiplier = () => (projectActive('bridge') ? 0.5 : 1);
export const radioOnline = () => projectActive('radio_tower');

// ───────────── utilitários ─────────────
function materialsFraction(def: ProjectDef, r: Row) {
  const need = def.materials.reduce((s, m) => s + m.qty, 0);
  const have = def.materials.reduce((s, m) => s + Math.min(m.qty, r.delivered[m.itemId] ?? 0), 0);
  return need ? have / need : 1;
}
const allowedLabor = (def: ProjectDef, r: Row) => def.laborMinutes * materialsFraction(def, r);

async function lockRow(tx: Tx, id: string) {
  const [r] = await tx.select().from(schema.communityProjects).where(eq(schema.communityProjects.id, id)).for('update');
  if (!r) fail('Projeto desconhecido.');
  return r!;
}
function addContribution(r: Row, ch: CharRow, items: number, minutes: number) {
  const c = { ...(r.contributions ?? {}) };
  const k = String(ch.id); const cur = c[k] ?? { name: fullName(ch), items: 0, minutes: 0 };
  c[k] = { name: fullName(ch), items: cur.items + items, minutes: cur.minutes + minutes };
  return c;
}
async function announce(text: string, level: 'info' | 'warn' | 'success' | 'danger' = 'success', icon = 'projects') {
  emitAll('notify', { text, level, icon, at: Date.now() });
  if (radioOnline()) await radioBroadcast(88.1, 'Rádio KRVN', text).catch(() => undefined);
}
const changed = () => emitAll('projects:update', {});

async function zombiesAt(tx: Tx, ids: string[]) {
  const lls = await tx.select().from(schema.locationLoot).where(inArray(schema.locationLoot.locationId, ids));
  return lls.filter((l) => l.zombies > 0).map((l) => ({ id: l.locationId, name: getLocation(l.locationId)?.name ?? l.locationId, zombies: l.zombies }));
}

// ───────────── leitura para a interface ─────────────
export async function listProjects(characterId: number) {
  await loadProjects();
  const [ch] = await db.select().from(schema.characters).where(eq(schema.characters.id, characterId));
  const factions = await db.select().from(schema.factions);
  const [member] = ch ? await db.select().from(schema.factionMembers).where(eq(schema.factionMembers.characterId, ch.id)) : [];
  const out = [];
  for (const def of PROJECTS) {
    const r = cache.get(def.id); if (!r) continue;
    const contributors = Object.entries(r.contributions ?? {}).map(([id, c]) => ({ id: Number(id), ...c })).sort((a, b) => (b.minutes + b.items * 10) - (a.minutes + a.items * 10));
    const blockers = r.status !== 'complete' && def.clearLocations ? await zombiesAt(db, def.clearLocations) : [];
    out.push({
      id: def.id, name: def.name, description: def.description, effect: def.effect, locationId: def.locationId, locationName: getLocation(def.locationId)?.name ?? def.locationId,
      status: r.status, integrity: Math.round(r.integrity), active: projectActive(def.id), requires: (def.requires ?? []).map((id) => ({ id, name: projectDef(id)?.name ?? id, done: cache.get(id)?.status === 'complete' })),
      materials: def.materials.map((m) => ({ itemId: m.itemId, name: itemDef(m.itemId)?.name ?? m.itemId, need: m.qty, delivered: Math.min(m.qty, r.delivered[m.itemId] ?? 0), have: 0 })),
      labor: { done: Math.round(r.laborMinutes), need: def.laborMinutes, allowed: Math.round(allowedLabor(def, r)) },
      skill: def.skill, tools: def.tools.map((t) => ({ id: t, name: itemDef(t)?.name ?? t })), sessionMinutes: P().workSessionMinutes,
      blockers, contributors: contributors.slice(0, 8), mine: r.contributions?.[String(characterId)] ?? null,
      here: ch?.locationId === def.locationId,
      power: def.id === 'substation' ? { on: r.data?.powerOn !== false, controller: factions.find((f) => f.id === r.controllerFactionId) ? { id: r.controllerFactionId, name: factions.find((f) => f.id === r.controllerFactionId)!.name, emblem: factions.find((f) => f.id === r.controllerFactionId)!.emblem } : null, myFaction: member?.factionId ?? null } : null,
      production: def.production ? { name: itemDef(def.production.itemId)?.name ?? def.production.itemId, perHour: def.production.perHour, max: def.production.max, container: def.production.containerName } : null,
      completedAt: r.completedAt,
    });
  }
  // quantos de cada material o jogador carrega (para o botão "entregar")
  if (ch) { const items = await itemsOf(db, 'character', ch.id); for (const p of out) for (const m of p.materials) m.have = countDef(items, m.itemId); }
  return { ok: true, projects: out, minIntegrity: P().minIntegrity };
}

// ───────────── contribuir com materiais ─────────────
export async function deliverMaterials(characterId: number, projectId: string, itemId?: string) {
  const def = projectDef(projectId); if (!def) fail('Projeto desconhecido.');
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: true });
    if (ch.locationId !== def!.locationId) fail(`Os materiais são entregues no local da obra: ${getLocation(def!.locationId)?.name}.`);
    const r = await lockRow(tx, projectId);
    if (r.status === 'locked') fail('Este projeto ainda depende de outra obra.');
    if (r.status === 'complete') fail('Esta obra já está concluída.');
    const items = await itemsOf(tx, 'character', ch.id);
    const delivered = { ...r.delivered }; let total = 0; const parts: string[] = [];
    for (const m of def!.materials) {
      if (itemId && m.itemId !== itemId) continue;
      const missing = m.qty - (delivered[m.itemId] ?? 0); if (missing <= 0) continue;
      const give = Math.min(missing, countDef(items, m.itemId)); if (give <= 0) continue;
      await consumeByDef(tx, 'character', ch.id, m.itemId, give);
      delivered[m.itemId] = (delivered[m.itemId] ?? 0) + give; total += give; parts.push(`${give}× ${itemDef(m.itemId)?.name ?? m.itemId}`);
    }
    if (!total) fail(itemId ? 'Você não tem esse material (ou ele já foi todo entregue).' : 'Você não carrega nenhum material que ainda falte.');
    await tx.update(schema.communityProjects).set({ delivered, contributions: addContribution(r, ch, total, 0), updatedAt: new Date() }).where(eq(schema.communityProjects.id, projectId));
    await gameLog(tx, ch.id, 'build', `Entregou para "${def!.name}": ${parts.join(', ')}.`);
    await systemEmote(ch.locationId, `${fullName(ch)} deixa materiais para a obra "${def!.name}": ${parts.join(', ')}.`);
    await loadProjects(tx); changed(); pushSelf(ch.id);
    return { ok: true, delivered: total };
  });
}

// ───────────── turnos de trabalho (demorados) ─────────────
export async function startProjectWork(characterId: number, projectId: string) {
  const def = projectDef(projectId); if (!def) fail('Projeto desconhecido.');
  const z = P();
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch);
    if (ch.locationId !== def!.locationId) fail(`É preciso estar no local da obra: ${getLocation(def!.locationId)?.name}.`);
    const r = await lockRow(tx, projectId);
    if (r.status === 'locked') fail(`Antes, conclua: ${(def!.requires ?? []).map((id) => projectDef(id)?.name).join(', ')}.`);
    const repair = r.status === 'complete';
    if (repair && r.integrity >= 99.5) fail('A obra está em perfeito estado.');
    if (!repair && r.laborMinutes >= allowedLabor(def!, r) - 0.5) fail(r.laborMinutes >= def!.laborMinutes - 0.5 ? 'O trabalho está pronto — falta cumprir os outros requisitos.' : 'Faltam materiais: o trabalho só avança conforme os materiais são entregues.');
    const [ll] = await tx.select().from(schema.locationLoot).where(eq(schema.locationLoot.locationId, ch.locationId));
    if ((ll?.zombies ?? 0) > 0) fail('Há infectados por aqui. Limpe o local antes de trabalhar na obra.');
    const items = await itemsOf(tx, 'character', ch.id);
    const missingTools = def!.tools.filter((t) => !hasTool(items, t));
    if (missingTools.length) fail(`Ferramentas necessárias: ${missingTools.map((t) => itemDef(t)?.name ?? t).join(', ')}.`);
    if (ch.needs.energy < z.workEnergy) fail('Energia insuficiente para um turno de trabalho.', 'no_energy');
    const runAt = new Date(Date.now() + z.workSessionMinutes * 60000);
    const [job] = await tx.insert(schema.jobs).values({ kind: 'project_work', characterId: ch.id, runAt, payload: { projectId, repair } }).returning();
    await tx.update(schema.characters).set({
      state: 'busy', activity: 'idle', busyUntil: runAt,
      busyAction: { type: 'project_work', jobId: job.id, label: `${repair ? 'Reparando' : 'Trabalhando em'}: ${def!.name}`, startedAt: Date.now() },
      needs: { ...ch.needs, energy: ch.needs.energy - z.workEnergy, stamina: clamp(ch.needs.stamina - z.workStamina, 0, 100) },
    }).where(eq(schema.characters.id, ch.id));
    await systemEmote(ch.locationId, `${fullName(ch)} começa um turno de ${repair ? 'reparo' : 'trabalho'} na obra "${def!.name}".`);
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true, minutes: z.workSessionMinutes };
  });
}

export async function completeProjectWork(jobId: number, characterId: number, projectId: string) {
  const def = projectDef(projectId); if (!def) return { ok: false };
  const z = P();
  let completed = false; let stalledMsg: string | null = null;
  await withCharacter(characterId, async (tx, ch) => {
    const mine = (ch.busyAction as any)?.jobId === jobId;
    if (!mine) return; // turno interrompido (combate, inconsciência…): não conta
    await tx.update(schema.characters).set({ state: 'idle', busyUntil: null, busyAction: null }).where(eq(schema.characters.id, ch.id));
    if (!ch.alive || ch.locationId !== def.locationId) return;
    const r = await lockRow(tx, projectId);
    const lvl = ch.skills[def.skill]?.level ?? 0;
    if (r.status === 'complete') {
      const integrity = Math.min(100, r.integrity + z.repairPerSession * (1 + lvl * z.skillBonusPerLevel));
      await tx.update(schema.communityProjects).set({ integrity, contributions: addContribution(r, ch, 0, z.workSessionMinutes), updatedAt: new Date() }).where(eq(schema.communityProjects.id, projectId));
      await systemEmote(ch.locationId, `${fullName(ch)} termina um turno de reparo em "${def.name}" (${Math.round(integrity)}%).`);
    } else {
      const add = z.workSessionMinutes * (1 + lvl * z.skillBonusPerLevel);
      const labor = Math.min(def.laborMinutes, Math.min(allowedLabor(def, r), r.laborMinutes + add));
      let status = r.status; let integrity = r.integrity; let completedAt = r.completedAt;
      if (labor >= def.laborMinutes - 0.5 && materialsFraction(def, r) >= 0.999) {
        const blockers = def.clearLocations ? await zombiesAt(tx, def.clearLocations) : [];
        if (blockers.length) stalledMsg = `A obra "${def.name}" está pronta, mas ainda há infectados em: ${blockers.map((b) => b.name).join(', ')}.`;
        else { status = 'complete'; integrity = 100; completedAt = new Date(); completed = true; }
      }
      await tx.update(schema.communityProjects).set({ laborMinutes: labor, status, integrity, completedAt, contributions: addContribution(r, ch, 0, z.workSessionMinutes), updatedAt: new Date(),
        ...(completed && def.id === 'substation' ? { data: { ...r.data, powerOn: true } } : {}) }).where(eq(schema.communityProjects.id, projectId));
      await systemEmote(ch.locationId, `${fullName(ch)} termina um turno de trabalho em "${def.name}" (${Math.round((labor / def.laborMinutes) * 100)}% do trabalho).`);
      if (completed) {
        // libera projetos que dependiam deste
        for (const other of PROJECTS.filter((p) => p.requires?.includes(def.id))) {
          const deps = other.requires!.every((d) => d === def.id || cache.get(d)?.status === 'complete');
          if (deps) await tx.update(schema.communityProjects).set({ status: 'active' }).where(and(eq(schema.communityProjects.id, other.id), eq(schema.communityProjects.status, 'locked')));
        }
        if (def.production) {
          const [ct] = await tx.select().from(schema.containers).where(and(eq(schema.containers.locationId, def.locationId), eq(schema.containers.kind, 'community')));
          if (!ct) await tx.insert(schema.containers).values({ locationId: def.locationId, name: def.production.containerName, kind: 'community', capacity: 200, data: { projectId: def.id } });
        }
      }
    }
    await giveXp(tx, ch, def.skill, z.xpPerSession, `project_${def.id}`);
    await gameLog(tx, ch.id, 'build', `Turno de trabalho em "${def.name}".`);
    pushSelf(ch.id); pushScene(ch.locationId);
  });
  await loadProjects();
  if (completed) await announce(`Obra concluída: ${def.name}! ${def.effect.split('.')[0]}.`);
  if (stalledMsg) await systemEmote(def.locationId, stalledMsg, 'system');
  changed();
  return { ok: true, completed };
}

// ───────────── subestação: controle por facção e interruptor ─────────────
export async function startClaimPower(characterId: number) {
  const z = P();
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch);
    const def = projectDef('substation')!;
    if (ch.locationId !== def.locationId) fail('É preciso estar na subestação.');
    const r = await lockRow(tx, 'substation');
    if (r.status !== 'complete') fail('A subestação ainda não foi religada.');
    const [m] = await tx.select().from(schema.factionMembers).where(eq(schema.factionMembers.characterId, ch.id));
    if (!m) fail('Só uma facção pode assumir o controle da subestação.');
    if (r.controllerFactionId === m!.factionId) fail('Sua facção já controla a subestação.');
    const runAt = new Date(Date.now() + z.claimMinutes * 60000);
    const [job] = await tx.insert(schema.jobs).values({ kind: 'project_claim', characterId: ch.id, runAt, payload: { factionId: m!.factionId } }).returning();
    await tx.update(schema.characters).set({ state: 'busy', activity: 'idle', busyUntil: runAt, busyAction: { type: 'project_claim', jobId: job.id, label: 'Tomando o controle da subestação', startedAt: Date.now() } }).where(eq(schema.characters.id, ch.id));
    await systemEmote(ch.locationId, `${fullName(ch)} começa a trocar os cadeados da subestação. Quem quiser impedir, a hora é agora.`, 'system');
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true, minutes: z.claimMinutes };
  });
}

export async function completeClaimPower(jobId: number, characterId: number, factionId: number) {
  let factionName = '';
  await withCharacter(characterId, async (tx, ch) => {
    const mine = (ch.busyAction as any)?.jobId === jobId;
    if (!mine) return; // interrompido (combate, morte...)
    await tx.update(schema.characters).set({ state: 'idle', busyUntil: null, busyAction: null }).where(eq(schema.characters.id, ch.id));
    const [m] = await tx.select().from(schema.factionMembers).where(eq(schema.factionMembers.characterId, ch.id));
    if (!m || m.factionId !== factionId || !ch.alive || ch.locationId !== projectDef('substation')!.locationId) return;
    const [f] = await tx.select().from(schema.factions).where(eq(schema.factions.id, factionId));
    factionName = f?.name ?? 'Uma facção';
    await tx.update(schema.communityProjects).set({ controllerFactionId: factionId, updatedAt: new Date() }).where(eq(schema.communityProjects.id, 'substation'));
    await gameLog(tx, ch.id, 'build', `Assumiu o controle da subestação para ${factionName}.`);
    pushSelf(ch.id); pushScene(ch.locationId);
  });
  if (factionName) { await loadProjects(); await announce(`${factionName} assumiu o controle da subestação de Raven Creek.`, 'warn', 'power'); changed(); }
  return { ok: true };
}

export async function togglePower(characterId: number, on: boolean) {
  const result = await withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: true });
    if (ch.locationId !== projectDef('substation')!.locationId) fail('O interruptor geral fica na subestação.');
    const r = await lockRow(tx, 'substation');
    if (r.status !== 'complete') fail('A subestação ainda não foi religada.');
    const [m] = await tx.select().from(schema.factionMembers).where(eq(schema.factionMembers.characterId, ch.id));
    if (!r.controllerFactionId) fail('Ninguém controla a subestação ainda. Assuma o controle primeiro.');
    if (!m || m.factionId !== r.controllerFactionId) fail('Só a facção que controla a subestação pode mexer na energia.');
    await tx.update(schema.communityProjects).set({ data: { ...r.data, powerOn: on }, updatedAt: new Date() }).where(eq(schema.communityProjects.id, 'substation'));
    await systemEmote(ch.locationId, `${fullName(ch)} ${on ? 'liga' : 'desliga'} a chave geral da subestação.`);
    return { ok: true, on };
  });
  await loadProjects();
  await announce(on ? 'As luzes de Raven Creek voltam a acender.' : 'Raven Creek mergulha no escuro: a energia foi cortada na subestação.', on ? 'success' : 'warn', 'power');
  changed();
  return result;
}

// ───────────── tempo: desgaste e produção ─────────────
export async function processProjects(hours: number) {
  if (hours <= 0) return;
  const z = P();
  const rows = await db.select().from(schema.communityProjects).where(eq(schema.communityProjects.status, 'complete'));
  for (const r of rows) {
    const def = projectDef(r.id); if (!def) continue;
    const before = r.integrity; const integrity = Math.max(0, r.integrity - z.wearPerHour * hours);
    await db.update(schema.communityProjects).set({ integrity }).where(eq(schema.communityProjects.id, r.id));
    if (before >= z.minIntegrity && integrity < z.minIntegrity) await announce(`A obra "${def.name}" se deteriorou e parou de funcionar. Precisa de reparos no local.`, 'warn');
    if (def.production && integrity >= z.minIntegrity) {
      let [ct] = await db.select().from(schema.containers).where(and(eq(schema.containers.locationId, def.locationId), eq(schema.containers.kind, 'community')));
      if (!ct) [ct] = await db.insert(schema.containers).values({ locationId: def.locationId, name: def.production.containerName, kind: 'community', capacity: 200, data: { projectId: def.id } }).returning();
      const items = await itemsOf(db, 'container', ct.id);
      const have = countDef(items, def.production.itemId);
      const frac = ((ct.data as any)?.carry ?? 0) + def.production.perHour * hours * (def.id === 'community_garden' ? cropMultiplier() : 1);
      const add = Math.min(Math.floor(frac), Math.max(0, def.production.max - have));
      if (add > 0) await db.transaction((tx) => addItem(tx, 'container', ct.id, def.production!.itemId, add));
      await db.update(schema.containers).set({ data: { ...(ct.data as any), carry: frac - Math.floor(frac) } }).where(eq(schema.containers.id, ct.id));
      if (add > 0) pushScene(def.locationId);
    }
  }
  await loadProjects(); changed();
}

/** Uma horda passando pelo local de uma obra concluída a danifica. */
export async function damageProjectsAt(tx: Tx, locationId: string, hordeSize: number) {
  const def = PROJECTS.find((p) => p.locationId === locationId); if (!def) return;
  const [r] = await tx.select().from(schema.communityProjects).where(eq(schema.communityProjects.id, def.id));
  if (!r || r.status !== 'complete') return;
  const integrity = Math.max(0, r.integrity - hordeSize * P().hordeDamagePerZombie);
  await tx.update(schema.communityProjects).set({ integrity }).where(eq(schema.communityProjects.id, def.id));
  await systemEmote(locationId, `A horda castiga a obra "${def.name}" (${Math.round(integrity)}%).`, 'system');
  if (r.integrity >= P().minIntegrity && integrity < P().minIntegrity) setTimeout(() => announce(`Uma horda destruiu parte da obra "${def.name}". Ela parou de funcionar.`, 'danger'), 0);
  setTimeout(() => { loadProjects().then(changed).catch(() => undefined); }, 0);
}
