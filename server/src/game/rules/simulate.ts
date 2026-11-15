import type { Needs } from '../../db/schema.js';
import { stepAddiction } from './addiction.js';
import type { GameConfig } from '../content/defaultConfig.js';
import { charMod } from '../content/character.js';
import { WOUND_TYPES, computeBodyMods, type WoundLike, type WoundType } from './body.js';
import { clamp, rng } from './rng.js';

export type ConditionLike = {
  id?: number; kind: string; stage: number; progress: number; durationHours: number; discovered: boolean;
  sourceWoundId?: number | null; sourceRegion?: string | null; resolvedAt?: Date | null; data: Record<string, unknown>;
};

export type SimContext = {
  cfg: GameConfig; now: number; online: boolean; activity: string; inCombat: boolean; traveling: boolean;
  temperature: number; weather: string; indoor: boolean; insulation: number; encumbrance: number; // 0 = leve, 1 = no limite, >1 = sobrecarregado
  profession: string; traits: string[]; endurance: number; bedBonus: number;
  /** Multiplicador de cicatrização do local (ex.: hospital reaberto). */
  healBonus?: number;
};

export type SimResult = {
  needs: Needs; wounds: WoundLike[]; conditions: ConditionLike[]; newConditions: ConditionLike[];
  messages: string[]; death: string | null; fainted: boolean; woke: boolean;
};

export const DISEASE_NAMES: Record<string, string> = {
  zombie_infection: 'Infecção zumbi', wound_infection: 'Infecção de ferimento', food_poisoning: 'Intoxicação alimentar', waterborne: 'Doença por água contaminada',
  respiratory: 'Doença respiratória', zoonotic: 'Infecção transmitida por animal', hypothermia: 'Hipotermia',
};
/** Sintomas visíveis por estágio. A causa real da infecção zumbi não é revelada sem diagnóstico. */
export const ZOMBIE_SYMPTOMS = ['', 'Febre baixa e calafrios', 'Febre alta, náusea e tontura', 'Visão turva, tremores e confusão', 'Delírio e convulsões'];

const crossed = (before: number, after: number, t: number) => before < t && after >= t;

/** Simula dtMs de tempo real para um personagem. Função pura (exceto RNG). */
export function simulate(needsIn: Needs, woundsIn: WoundLike[], condsIn: ConditionLike[], amputations: string[], dtMs: number, ctx: SimContext): SimResult {
  const { cfg } = ctx;
  const h = dtMs / 3_600_000; const min = dtMs / 60_000;
  const n: Needs = { ...needsIn };
  const wounds = woundsIn.map((w) => ({ ...w, treatments: [...w.treatments] }));
  const conds = condsIn.map((c) => ({ ...c, data: { ...c.data } }));
  const newConditions: ConditionLike[] = []; const messages: string[] = [];
  const sleeping = ctx.activity === 'sleeping'; const resting = ctx.activity === 'resting' || sleeping;
  // A desaceleração offline é aplicada ao tempo inteiro em tick.ts (offlineBodyTimeMultiplier).
  const needMult = 1;
  const antibiotics = (n.antibioticUntil ?? 0) > ctx.now;
  let drain = 0; let drainCause = '';
  const addDrain = (v: number, cause: string) => { drain += v; if (v > 0 && (!drainCause || v > 1)) drainCause = cause; };

  // ── Fome, sede, sono
  const before = { ...n };
  n.hunger = clamp(n.hunger + cfg.needs.hungerPerHour * h * needMult * charMod(ctx.profession, ctx.traits, 'hunger') * (sleeping ? 0.5 : 1), 0, 100);
  n.thirst = clamp(n.thirst + cfg.needs.thirstPerHour * h * needMult * (ctx.temperature > 28 ? 1.3 : 1) * (sleeping ? 0.5 : 1), 0, 100);
  if (sleeping) n.sleepiness = clamp(n.sleepiness - cfg.needs.sleepRecoveryPerHour * h * charMod(ctx.profession, ctx.traits, 'sleepRecovery') * (ctx.bedBonus || 1), 0, 100);
  else n.sleepiness = clamp(n.sleepiness + cfg.needs.sleepinessPerHour * h, 0, 100);
  if (crossed(before.hunger, n.hunger, 50)) messages.push('Seu estômago ronca. Você está com fome.');
  if (crossed(before.hunger, n.hunger, 80)) messages.push('A fome está deixando você fraco.');
  if (crossed(before.thirst, n.thirst, 50)) messages.push('Sua boca está seca. Você precisa beber água.');
  if (crossed(before.thirst, n.thirst, 80)) messages.push('Você está gravemente desidratado.');
  if (crossed(before.sleepiness, n.sleepiness, 70)) messages.push('Você mal consegue manter os olhos abertos.');

  // ── Ferimentos
  let bleedPerMin = 0; let hasOpenBleed = false;
  for (const w of wounds) {
    if (w.healedAt || w.healing >= 1) continue;
    const def = WOUND_TYPES[w.type as WoundType] ?? WOUND_TYPES.cut_shallow;
    if (w.bleeding > 0) {
      const eff = w.bleeding * (w.bandaged ? 1 - cfg.wounds.bandageBleedReduction : 1) * charMod(ctx.profession, ctx.traits, 'bleed');
      bleedPerMin += eff;
      if (eff > 0.02) hasOpenBleed = true;
      const clotRate = def.clot * (w.bandaged ? 3 : 1) * (w.sutured ? 6 : 1) * (resting ? 1.3 : 1);
      w.bleeding = Math.max(0, w.bleeding * (1 - Math.min(0.95, clotRate * h)) - (w.bleeding < 0.01 ? w.bleeding : 0));
    }
    if (def.open && !w.disinfected) {
      const dirtFactor = w.bandaged ? (w.bandageDirt > 0.6 ? 1.4 : 0.3) : 1;
      w.contamination = clamp(w.contamination + cfg.wounds.contaminationPerHourUntreated * h * dirtFactor, 0, 1);
    }
    if (w.bandaged) w.bandageDirt = clamp(w.bandageDirt + cfg.wounds.bandageDirtPerHour * h * (w.bleeding > 0.1 ? 2 : 1), 0, 1);
    if (def.open && !w.infected && !antibiotics && w.contamination > cfg.wounds.infectionContaminationThreshold && rng.chance(cfg.wounds.woundInfectionChancePerHour * h)) {
      w.infected = true;
      newConditions.push({ kind: 'wound_infection', stage: 0, progress: 0, durationHours: cfg.diseases.durationsHours.wound_infection, discovered: true, sourceWoundId: w.id, sourceRegion: w.region, data: {} });
      messages.push('Um dos seus ferimentos está vermelho, quente e latejando. Parece infeccionado.');
    }
    if (w.infected && antibiotics) { w.infected = false; w.contamination = Math.min(w.contamination, 0.2); }
    const canHeal = !w.infected && w.bleeding < 0.05 && (w.type !== 'fracture' || w.splinted || true);
    if (canHeal) {
      const nutrition = n.hunger < 65 && n.thirst < 65 ? 1 : 0.35;
      const fractureMult = w.type === 'fracture' && !w.splinted ? cfg.wounds.fractureHealingWithoutSplint : 1;
      const quality = Number((w.treatments.find((t) => t.startsWith('q:')) ?? 'q:1').slice(2));
      const rate = cfg.wounds.healingPerHourBase * def.heal * fractureMult * (w.sutured ? 1.5 : 1) * nutrition * (sleeping ? 1.5 : resting ? 1.2 : 1)
        * charMod(ctx.profession, ctx.traits, 'healing') * quality * (1 - w.severity * 0.4) * (ctx.healBonus ?? 1);
      w.healing = clamp(w.healing + rate * h, 0, 1);
      if (w.healing >= 1) { w.healedAt = new Date(ctx.now); messages.push(`Um ferimento (${def.name.toLowerCase()}) cicatrizou.`); }
    }
  }
  const bloodBefore = n.blood;
  n.blood = clamp(n.blood - bleedPerMin * min, 0, 100);
  if (!hasOpenBleed && n.hunger < 80 && n.thirst < 80) n.blood = clamp(n.blood + cfg.needs.bloodRegenPerHour * h, 0, 100);
  if (bleedPerMin > 0.15 && Math.floor(bloodBefore / 10) !== Math.floor(n.blood / 10)) messages.push('Você está perdendo muito sangue!');

  // ── Doenças e infecção zumbi
  let fever = 0; let extraPain = 0;
  for (const c of conds) {
    if (c.resolvedAt) continue;
    if (c.kind === 'zombie_infection') {
      const speed = Number(c.data.speed ?? 1);
      c.progress = clamp(c.progress + (h / Math.max(0.1, c.durationHours)) * speed, 0, 1);
      const st = cfg.infection.stages; const stage = c.progress >= st[3] ? 4 : c.progress >= st[2] ? 3 : c.progress >= st[1] ? 2 : c.progress >= st[0] ? 1 : 0;
      if (stage > c.stage) { c.stage = stage; messages.push(ZOMBIE_SYMPTOMS[stage] + '.'); }
      if (c.stage >= 1) fever = Math.max(fever, 0.8 + c.stage * 0.5);
      if (c.stage >= 2) { n.sleepiness = clamp(n.sleepiness + 4 * h, 0, 100); extraPain += 10; }
      if (c.stage >= 3) addDrain(5 * h, 'zombie_infection');
      if (c.progress >= 1) return { needs: n, wounds, conditions: conds, newConditions, messages, death: 'zombie_infection', fainted: false, woke: false };
      continue;
    }
    // doenças comuns
    const cure = (c.kind === 'wound_infection' || c.kind === 'zoonotic' || c.kind === 'respiratory') && antibiotics;
    c.progress = clamp(c.progress + (h / Math.max(0.1, c.durationHours)) * (cure ? 4 : 1), 0, 1);
    c.stage = c.progress < 0.3 ? 1 : c.progress < 0.7 ? 2 : 3;
    switch (c.kind) {
      case 'food_poisoning': addDrain(3 * h, 'food_poisoning'); n.thirst = clamp(n.thirst + 6 * h, 0, 100); fever = Math.max(fever, 0.5); break;
      case 'waterborne': addDrain(3.5 * h, 'waterborne'); n.thirst = clamp(n.thirst + 8 * h, 0, 100); fever = Math.max(fever, 0.8); break;
      case 'respiratory': addDrain((ctx.temperature < 10 ? 2.5 : 1) * h, 'respiratory'); fever = Math.max(fever, 1); break;
      case 'zoonotic': addDrain(2 * h, 'zoonotic'); fever = Math.max(fever, 1.2); break;
      case 'wound_infection': addDrain((c.progress >= 1 && !antibiotics ? 4 : 1.5) * h, 'wound_infection'); fever = Math.max(fever, 1.4); extraPain += 12; break;
      case 'hypothermia': addDrain(6 * h, 'hypothermia'); break;
    }
    const selfLimiting = c.kind !== 'wound_infection' && c.kind !== 'hypothermia';
    if ((selfLimiting && c.progress >= 1) || cure && c.progress >= 1) { c.resolvedAt = new Date(ctx.now); messages.push(`Você se recuperou: ${DISEASE_NAMES[c.kind] ?? c.kind}.`); }
    if (c.kind === 'hypothermia' && n.bodyTemp > cfg.diseases.hypothermiaThreshold + 0.8) { c.resolvedAt = new Date(ctx.now); messages.push('Você finalmente está aquecido.'); }
  }

  // ── Temperatura corporal
  const cold = !ctx.indoor && ctx.temperature < 12 ? (12 - ctx.temperature) / 12 * (1 - clamp(ctx.insulation, 0, 1)) * (ctx.weather === 'rain' || ctx.weather === 'storm' ? 1.6 : 1) : 0;
  const target = 37 + fever - cold * 3;
  n.bodyTemp = n.bodyTemp + (target - n.bodyTemp) * Math.min(1, 0.6 * h * 4);
  const hasHypo = conds.some((c) => c.kind === 'hypothermia' && !c.resolvedAt) || newConditions.some((c) => c.kind === 'hypothermia');
  if (n.bodyTemp < cfg.diseases.hypothermiaThreshold && !hasHypo) {
    newConditions.push({ kind: 'hypothermia', stage: 1, progress: 0, durationHours: cfg.diseases.durationsHours.hypothermia, discovered: true, data: {} });
    messages.push('Você está tremendo de frio. Procure abrigo e roupas quentes.');
  }
  const hasResp = conds.some((c) => c.kind === 'respiratory' && !c.resolvedAt);
  if (!hasResp && cold > 0.3 && rng.chance(cfg.diseases.respiratoryChancePerHourCold * h * (2 - ctx.endurance / 8))) {
    newConditions.push({ kind: 'respiratory', stage: 1, progress: 0, durationHours: cfg.diseases.durationsHours.respiratory, discovered: true, data: {} });
    messages.push('Uma tosse seca começa a incomodar seu peito.');
  }

  // ── Fome/sede extremas drenam vitalidade
  if (n.hunger >= cfg.needs.starvationDamageThreshold) addDrain(4 * h, 'starvation');
  if (n.thirst >= cfg.needs.dehydrationDamageThreshold) addDrain(8 * h, 'dehydration');
  if (drain > 0) n.vitality = clamp(n.vitality - drain, 0, 100);
  else if (n.hunger < 70 && n.thirst < 70) n.vitality = clamp(n.vitality + 2 * h, 0, 100);
  if (drainCause) n.lastDrain = drainCause;

  // ── Estamina, energia, estresse
  const mods = computeBodyMods(wounds, amputations, n, ctx.now);
  const staminaMax = 100 * mods.staminaMaxMult * charMod(ctx.profession, ctx.traits, 'staminaMax');
  if (!ctx.inCombat) {
    const regen = cfg.needs.staminaRegenPerMinute * min * (resting ? cfg.needs.staminaRegenRestingMultiplier : 1)
      * charMod(ctx.profession, ctx.traits, 'staminaRegen') * charMod(ctx.profession, ctx.traits, 'staminaRegenTrait')
      * (ctx.traveling ? 0.3 * (ctx.encumbrance > 1 ? 1 / cfg.needs.encumbranceFatigueMultiplier : 1) : 1);
    n.stamina = clamp(n.stamina + regen, 0, staminaMax);
  }
  n.stamina = Math.min(n.stamina, staminaMax);
  const energyMult = sleeping ? cfg.needs.energyRegenSleepingMultiplier : resting ? cfg.needs.energyRegenRestingMultiplier : 1;
  const starvingFactor = n.hunger > 80 || n.thirst > 80 || n.sleepiness > 90 ? 0.3 : 1;
  n.energy = clamp(n.energy + cfg.needs.energyRegenPerHour * h * energyMult * starvingFactor * (ctx.bedBonus || 1), 0, 100);
  n.stress = clamp(n.stress - cfg.needs.stressDecayPerHour * h * (resting ? 2 : 1) + mods.pain * 0.02 * h, 0, 100);
  // ── Vícios (fissura, abstinência, embriaguez)
  messages.push(...stepAddiction(n, ctx.traits, h, cfg));

  // ── Morte, desmaio
  if (n.blood <= cfg.wounds.deathBlood) return { needs: n, wounds, conditions: conds, newConditions, messages, death: 'hemorrhage', fainted: false, woke: false };
  if (n.vitality <= 0) return { needs: n, wounds, conditions: conds, newConditions, messages, death: n.lastDrain ?? 'unknown', fainted: false, woke: false };
  const totalPain = clamp(mods.pain + extraPain, 0, 100);
  let fainted = false; let woke = false;
  if (!n.unconscious && (n.blood < cfg.wounds.faintBlood || totalPain >= cfg.wounds.painFaint)) { n.unconscious = true; fainted = true; messages.push('Sua visão escurece… você desmaia.'); }
  else if (n.unconscious && n.blood >= cfg.wounds.faintBlood + 5 && totalPain < cfg.wounds.painFaint - 10) { n.unconscious = false; woke = true; messages.push('Você recobra a consciência, zonzo.'); }
  return { needs: n, wounds, conditions: conds, newConditions, messages, death: null, fainted, woke };
}

export const DEATH_CAUSES: Record<string, string> = {
  hemorrhage: 'Hemorragia', zombie_infection: 'Infecção zumbi', starvation: 'Inanição', dehydration: 'Desidratação', food_poisoning: 'Intoxicação alimentar',
  waterborne: 'Doença por água contaminada', respiratory: 'Doença respiratória', zoonotic: 'Infecção animal', wound_infection: 'Septicemia (ferimento infeccionado)',
  hypothermia: 'Hipotermia', combat: 'Morto em combate', headshot: 'Ferimento fatal na cabeça', admin: 'Intervenção narrativa', unknown: 'Causa desconhecida',
};
