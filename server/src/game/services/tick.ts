import { ageStageFor, withAgeTrait } from '../content/character.js';
import { and, eq, isNull, lte } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { simulate, type ConditionLike } from '../rules/simulate.js';
import type { WoundLike } from '../rules/body.js';
import { cfg, clock } from './config.js';
import { downCharacter, isDowned, killCharacter } from './death.js';
import { gameLog, withLock } from './infra.js';
import { carryInfo, insulationOf, itemsOf } from './inventory.js';
import { isUserOnline, notify, pushScene, pushSelf, onlineSince } from './realtime.js';
import { markCombatant } from './combat.js';
import { getLocation } from './world.js';
import { fireLit, fireWarmth } from './nature.js';
import { STRUCTURES } from '../content/structures.js';
import { healingBonus } from './projects.js';
import { prologueIntercept } from './prologue.js';

const MAX_STEP_MS = 10 * 60_000;     // simula em passos de até 10 min
const MAX_CATCHUP_MS = 48 * 3_600_000; // limite de recuperação após longa parada do servidor

/**
 * Evolui necessidades, ferimentos, doenças e infecção de TODOS os personagens vivos,
 * a partir do timestamp persistido (lastTickAt). Não depende do navegador.
 */
export async function processNeeds(now = Date.now()) {
  const alive = await db.select({ id: schema.characters.id }).from(schema.characters).where(eq(schema.characters.alive, true));
  for (const { id } of alive) {
    try { await tickCharacter(id, now); } catch (e) { console.error('tick', id, e); }
  }
}

export async function tickCharacter(characterId: number, now = Date.now()) {
  const after: (() => Promise<void>)[] = [];
  await withLock(`char:${characterId}`, () => db.transaction(async (tx) => {
    const [ch] = await tx.select().from(schema.characters).where(eq(schema.characters.id, characterId)).for('update');
    if (!ch || !ch.alive) return;
    // Caído: o corpo fica parado até alguém reanimar com um kit — ou o prazo vencer.
    if (isDowned(ch.needs)) {
      if (now >= Number(ch.needs.downedUntil)) {
        await killCharacter(tx, ch, ch.needs.downedCause ?? 'unknown');
        if (ch.combatId) { const cid = ch.combatId; after.push(() => markCombatant(ch.id, cid, 'dead')); }
      } else await tx.update(schema.characters).set({ lastTickAt: new Date(now) }).where(eq(schema.characters.id, ch.id));
      return;
    }
    let dt = Math.min(now - ch.lastTickAt.getTime(), MAX_CATCHUP_MS);
    if (dt < 1000) return;
    const wounds = await tx.select().from(schema.wounds).where(and(eq(schema.wounds.characterId, ch.id), isNull(schema.wounds.healedAt)));
    const conds = await tx.select().from(schema.conditions).where(and(eq(schema.conditions.characterId, ch.id), isNull(schema.conditions.resolvedAt)));
    const items = await itemsOf(tx, 'character', ch.id);
    const loc = getLocation(ch.locationId);
    const c = clock(now);
    let bedBonus = 1;
    if (ch.activity === 'sleeping') {
      const [base] = await tx.select().from(schema.bases).where(eq(schema.bases.locationId, ch.locationId));
      if (base) { const st = await tx.select().from(schema.baseStructures).where(and(eq(schema.baseStructures.baseId, base.id), eq(schema.baseStructures.kind, 'bed'))); if (st.length) bedBonus = STRUCTURES.bed.effects!.sleep; }
    }
    const ctx = {
      cfg: cfg(), now, online: isUserOnline(ch.userId), activity: ch.activity, inCombat: ch.state === 'combat', traveling: ch.state === 'traveling',
      temperature: c.temperature + (ch.state === 'traveling' ? 0 : fireWarmth(ch.locationId)), weather: c.weather, indoor: !!loc?.indoor && ch.state !== 'traveling', insulation: insulationOf(items), encumbrance: carryInfo(items, ch).ratio,
      profession: ch.profession, traits: ch.traits, endurance: ch.attributes.endurance ?? 4, bedBonus,
      healBonus: ch.state === 'traveling' ? 1 : healingBonus(ch.locationId),
      nearFire: ch.state !== 'traveling' && fireLit(ch.locationId),
    };
    // Desconectado: o corpo fica parado (fome, sede, sono, ferimentos, infecção, doenças, cicatrização e energia).
    // Só evolui, em velocidade normal, enquanto o jogador está conectado. Viagens seguem normais.
    let offlineMs = 0; // tempo desconectado neste intervalo (só a energia anda nele)
    if (!ctx.online) { offlineMs = dt; dt = dt * Math.max(0, Math.min(1, cfg().needs.offlineBodyTimeMultiplier ?? 0)); }
    else {
      // Acabou de conectar: só conta o tempo desde a conexão (o período desconectado não é cobrado de uma vez).
      const since = onlineSince(ch.userId);
      const offMult = Math.max(0, Math.min(1, cfg().needs.offlineBodyTimeMultiplier ?? 0));
      if (since && since > ch.lastTickAt.getTime()) { offlineMs = Math.min(dt, since - ch.lastTickAt.getTime()); dt = Math.max(0, now - since) + (since - ch.lastTickAt.getTime()) * offMult; }
    }
    let needs = ch.needs;
    // Desconectado, a energia volta como se estivesse descansando (ou dormindo), na metade da velocidade.
    if (offlineMs > 0 && !needs.unconscious) {
      const nc = cfg().needs; const h = offlineMs / 3_600_000;
      const mult = ch.activity === 'sleeping' ? nc.energyRegenSleepingMultiplier : nc.energyRegenRestingMultiplier;
      const starving = needs.hunger > 80 || needs.thirst > 80 || needs.sleepiness > 90 ? 0.3 : 1;
      const gain = nc.energyRegenPerHour * h * mult * starving * (bedBonus || 1) * (nc.offlineEnergyMultiplier ?? 0.5);
      if (gain > 0) needs = { ...needs, energy: Math.min(100, needs.energy + gain) };
    } let ws: WoundLike[] = wounds; let all: ConditionLike[] = conds;
    const messages: string[] = [];
    let death: string | null = null; let fainted = false; let woke = false;
    while (dt > 0 && !death) {
      const step = Math.min(dt, MAX_STEP_MS); dt -= step;
      const r = simulate(needs, ws, all, ch.amputations, step, ctx);
      needs = r.needs; ws = r.wounds; all = [...r.conditions, ...r.newConditions];
      messages.push(...r.messages); death = r.death; fainted ||= r.fainted; woke ||= r.woke;
    }
    const cs = all.filter((x) => x.id); const newConds = all.filter((x) => !x.id);
    // Aniversário: a cada ano de jogo (quatro estações) o personagem fica um ano mais velho; na velhice, o corpo cobra.
    let age = ch.age; let traits = ch.traits;
    {
      const yearDays = 4 * c.daysPerSeason; const mark = Number((needs as any).ageDay);
      if (!Number.isFinite(mark)) needs = { ...needs, ageDay: c.day } as typeof needs;
      else if (c.day - mark >= yearDays) {
        const years = Math.floor((c.day - mark) / yearDays);
        const before = ageStageFor(age); age += years; const stage = ageStageFor(age);
        needs = { ...needs, ageDay: mark + years * yearDays } as typeof needs; traits = withAgeTrait(traits, age);
        messages.push(stage && stage.id !== before?.id ? `Você fez ${age} anos. ${stage.name}: o corpo já não responde como antes.` : `Mais um ano se passou: você fez ${age} anos.`);
      }
    }
    // persiste
    let activity = ch.activity;
    if (activity === 'sleeping' && needs.sleepiness <= 0) { activity = 'idle'; messages.push('Você acorda descansado.'); }
    if (needs.unconscious && activity !== 'idle') activity = 'idle';
    await tx.update(schema.characters).set({ needs, age, traits, lastTickAt: new Date(now), activity, state: needs.unconscious && ch.state === 'idle' ? 'idle' : ch.state }).where(eq(schema.characters.id, ch.id));
    for (const w of ws) {
      const o = wounds.find((x) => x.id === w.id); if (!o) continue;
      await tx.update(schema.wounds).set({ bleeding: w.bleeding, contamination: w.contamination, healing: w.healing, bandageDirt: w.bandageDirt, infected: w.infected, healedAt: w.healedAt ?? null }).where(eq(schema.wounds.id, o.id));
    }
    for (const cnd of cs) if (cnd.id) await tx.update(schema.conditions).set({ stage: cnd.stage, progress: cnd.progress, resolvedAt: cnd.resolvedAt ?? null }).where(eq(schema.conditions.id, cnd.id));
    for (const nc of newConds) if (!nc.id) await tx.insert(schema.conditions).values({ characterId: ch.id, kind: nc.kind, stage: nc.stage, progress: nc.progress, durationHours: nc.durationHours, discovered: nc.discovered, sourceWoundId: nc.sourceWoundId ?? null, sourceRegion: nc.sourceRegion ?? null, data: nc.data });
    const unique = [...new Set(messages)];
    for (const m of unique.slice(0, 5)) { await gameLog(tx, ch.id, 'body', m); if (ctx.online) notify(ch.userId, m, /sangue|desmaia|infecc|febre|delírio|tremores/i.test(m) ? 'danger' : 'warn'); }
    if (death && (await prologueIntercept(tx, ch.id, death))) {
      // Dia 1: ninguém morre no meio da sessão (atos 1–3: desmaio; atos 4–5: morte aplicada no fim)
      const floor = cfg().wounds.deathBlood + 5;
      await tx.update(schema.characters).set({ needs: { ...needs, blood: Math.max(needs.blood, floor), unconscious: true } }).where(eq(schema.characters.id, ch.id));
      death = null;
    }
    if (death) {
      const fell = await downCharacter(tx, { ...ch, needs }, death);
      if (ch.combatId) { const cid = ch.combatId; after.push(() => markCombatant(ch.id, cid, fell ? 'down' : 'dead')); }
      return;
    }
    if (fainted) {
      if (ch.combatId) { const cid = ch.combatId; after.push(() => markCombatant(ch.id, cid, 'down')); }
      if (ch.state === 'busy') await tx.update(schema.characters).set({ state: 'idle', busyUntil: null, busyAction: null }).where(eq(schema.characters.id, ch.id));
      pushScene(ch.locationId);
    }
    if (woke) pushScene(ch.locationId);
    if (ctx.online) pushSelf(ch.id);
  }));
  for (const f of after) await f();
}

/** Recupera jobs que estavam "running" quando o servidor caiu. */
export async function recoverJobs() {
  await db.update(schema.jobs).set({ status: 'pending' }).where(eq(schema.jobs.status, 'running'));
  // Personagem marcado "em combate" sem combate associado ficaria preso para sempre: devolve ao estado livre.
  await db.update(schema.characters).set({ state: 'idle' }).where(and(eq(schema.characters.state, 'combat'), isNull(schema.characters.combatId)));
}
export { lte };
