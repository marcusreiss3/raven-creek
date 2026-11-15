import type { Needs } from '../../db/schema.js';
import { addictionMods } from './addiction.js';
import { REGIONS, type Region } from '../content/items.js';
import { clamp, rng } from './rng.js';

export type WoundType = 'scratch' | 'cut_shallow' | 'cut_deep' | 'laceration' | 'puncture' | 'bite' | 'bruise' | 'fracture' | 'burn' | 'gunshot' | 'amputation';

export const WOUND_TYPES: Record<WoundType, { name: string; bleed: number; pain: number; clot: number; heal: number; open: boolean; contamination: number }> = {
  // bleed: % de sangue/min sem curativo · clot: fração do sangramento que estanca por hora · heal: multiplicador de cicatrização
  scratch: { name: 'Arranhão', bleed: 0.04, pain: 8, clot: 1.5, heal: 2.5, open: true, contamination: 0.05 },
  cut_shallow: { name: 'Corte superficial', bleed: 0.1, pain: 14, clot: 0.7, heal: 1.3, open: true, contamination: 0.1 },
  cut_deep: { name: 'Corte profundo', bleed: 0.35, pain: 30, clot: 0.15, heal: 0.5, open: true, contamination: 0.2 },
  laceration: { name: 'Laceração', bleed: 0.3, pain: 32, clot: 0.2, heal: 0.5, open: true, contamination: 0.25 },
  puncture: { name: 'Perfuração', bleed: 0.25, pain: 28, clot: 0.2, heal: 0.6, open: true, contamination: 0.25 },
  bite: { name: 'Mordida', bleed: 0.22, pain: 35, clot: 0.3, heal: 0.5, open: true, contamination: 0.5 },
  bruise: { name: 'Contusão', bleed: 0, pain: 12, clot: 1, heal: 1.6, open: false, contamination: 0 },
  fracture: { name: 'Fratura', bleed: 0, pain: 55, clot: 1, heal: 0.12, open: false, contamination: 0 },
  burn: { name: 'Queimadura', bleed: 0, pain: 40, clot: 1, heal: 0.5, open: true, contamination: 0.2 },
  gunshot: { name: 'Ferimento por projétil', bleed: 0.6, pain: 50, clot: 0.06, heal: 0.3, open: true, contamination: 0.3 },
  amputation: { name: 'Amputação', bleed: 0.9, pain: 70, clot: 0.05, heal: 0.25, open: true, contamination: 0.35 },
};

export type WoundLike = {
  id?: number; region: string; type: string; severity: number; bleeding: number; pain: number; contamination: number; healing: number;
  bandaged: boolean; bandageDirt: number; disinfected: boolean; splinted: boolean; sutured: boolean; infected: boolean; treatments: string[]; healedAt?: Date | null;
};

/** Gera um ferimento novo com variação controlada pela gravidade. */
export function makeWound(type: WoundType, region: Region | string, severity: number, source: string, painMult = 1, bleedMult = 1): WoundLike & { source: string } {
  const def = WOUND_TYPES[type];
  const s = clamp(severity, 0.05, 1);
  return {
    region, type, severity: s, source,
    bleeding: def.bleed * (0.5 + s) * bleedMult,
    pain: clamp(def.pain * (0.6 + s * 0.8) * painMult, 0, 100),
    contamination: def.contamination * (0.5 + s * 0.5), healing: 0,
    bandaged: false, bandageDirt: 0, disinfected: false, splinted: false, sutured: false, infected: false, treatments: [],
  };
}

export const HIT_WEIGHTS: Record<Region, number> = {
  head: 9, neck: 3, torso: 26, abdomen: 14, left_arm: 9, right_arm: 9, left_hand: 4, right_hand: 4, left_leg: 9, right_leg: 9, left_foot: 2, right_foot: 2,
};
/** Zumbis tendem a agarrar braços, mãos, pescoço e tórax. */
export const ZOMBIE_HIT_WEIGHTS: Record<Region, number> = {
  head: 3, neck: 7, torso: 18, abdomen: 8, left_arm: 16, right_arm: 16, left_hand: 10, right_hand: 10, left_leg: 5, right_leg: 5, left_foot: 1, right_foot: 1,
};
export function rollRegion(weights: Record<Region, number>, exclude: string[] = [], aimHead = false): Region {
  const regs = REGIONS.filter((r) => !exclude.includes(r));
  return rng.weighted(regs, (r) => (aimHead && r === 'head' ? weights[r] * 5 : weights[r])) ?? 'torso';
}

/** Regiões removidas por amputação: braço leva a mão junto; perna leva o pé. */
export function amputatedRegions(amputations: string[]): string[] {
  const out = new Set<string>();
  for (const a of amputations) {
    out.add(a);
    if (a === 'left_arm') out.add('left_hand'); if (a === 'right_arm') out.add('right_hand');
    if (a === 'left_leg') out.add('left_foot'); if (a === 'right_leg') out.add('right_foot');
  }
  return [...out];
}

export type BodyMods = {
  pain: number; moveMult: number; travelMult: number; accuracyMult: number; meleeMult: number; manipulation: number;
  staminaMaxMult: number; apPenalty: number; canUseTwoHanded: boolean; usableHands: number; perceptionMult: number; findMult: number;
  notes: string[];
};

const active = (w: WoundLike) => !w.healedAt && w.healing < 1;
function regionLoad(wounds: WoundLike[], regions: string[]) {
  let s = 0; let fracture = false;
  for (const w of wounds) {
    if (!active(w) || !regions.includes(w.region)) continue;
    const f = w.type === 'fracture' ? (w.splinted ? 1 : 2) : 1;
    if (w.type === 'fracture') fracture = true;
    s += w.severity * (1 - w.healing) * f;
  }
  return { s: Math.min(s, 2), fracture };
}

/** Converte ferimentos, amputações e necessidades em penalidades concretas. */
export function computeBodyMods(wounds: WoundLike[], amputations: string[], needs: Needs, now = Date.now()): BodyMods {
  const notes: string[] = [];
  const amp = amputatedRegions(amputations);
  let pain = 0;
  for (const w of wounds) if (active(w)) pain += w.pain * (1 - w.healing * 0.85) * (w.splinted ? 0.6 : 1);
  if (needs.painkillerUntil && needs.painkillerUntil > now) pain -= 35;
  pain = clamp(pain, 0, 100);

  const lLeg = regionLoad(wounds, ['left_leg', 'left_foot']); const rLeg = regionLoad(wounds, ['right_leg', 'right_foot']);
  const lArm = regionLoad(wounds, ['left_arm', 'left_hand']); const rArm = regionLoad(wounds, ['right_arm', 'right_hand']);
  const hands = regionLoad(wounds, ['left_hand', 'right_hand']);
  const core = regionLoad(wounds, ['torso', 'abdomen']); const head = regionLoad(wounds, ['head', 'neck']);

  let moveMult = 1 - 0.22 * lLeg.s - 0.22 * rLeg.s;
  let apPenalty = 0;
  if (lLeg.fracture || rLeg.fracture) { moveMult -= 0.2; apPenalty += 1; notes.push('Perna fraturada: movimento muito lento.'); }
  const legsLost = amp.filter((r) => r === 'left_leg' || r === 'right_leg').length;
  if (legsLost) { moveMult *= legsLost === 2 ? 0.15 : 0.4; apPenalty += legsLost * 2; notes.push('Membro inferior amputado.'); }

  let accuracyMult = 1 - 0.12 * hands.s - 0.08 * head.s;
  let meleeMult = 1 - 0.18 * lArm.s - 0.18 * rArm.s;
  let usableHands = 2 - amp.filter((r) => r === 'left_hand' || r === 'right_hand').length;
  let canUseTwoHanded = usableHands === 2 && !lArm.fracture && !rArm.fracture;
  if (lArm.fracture || rArm.fracture) { meleeMult -= 0.2; notes.push('Braço fraturado: armas de duas mãos indisponíveis.'); }
  if (usableHands < 2) { notes.push('Uma das mãos foi perdida: só armas de uma mão.'); accuracyMult *= 0.8; }
  if (usableHands <= 0) { canUseTwoHanded = false; meleeMult *= 0.2; accuracyMult *= 0.3; }
  const manipulation = clamp(1 - 0.2 * hands.s - (2 - usableHands) * 0.3, 0.1, 1);

  let staminaMaxMult = 1 - 0.18 * core.s;
  if (needs.thirst > 70) { staminaMaxMult -= 0.2; accuracyMult -= 0.05; notes.push('Desidratação reduz sua estamina.'); }
  if (needs.hunger > 75) { staminaMaxMult -= 0.15; notes.push('A fome deixa você fraco.'); }
  if (needs.blood < 75) staminaMaxMult -= (75 - needs.blood) / 100;
  let perceptionMult = 1 - 0.15 * head.s;
  let findMult = 1;
  if (needs.sleepiness > 75) { accuracyMult -= 0.15; findMult -= 0.2; perceptionMult -= 0.15; notes.push('Falta de sono prejudica sua concentração.'); }
  if (needs.stress > 70) { accuracyMult -= 0.1; notes.push('Estresse alto atrapalha sua mira.'); }
  if (needs.bodyTemp > 38.3) { staminaMaxMult -= 0.15; perceptionMult -= 0.1; notes.push('Febre.'); }
  const addict = addictionMods(needs);
  accuracyMult += addict.accuracy; moveMult += addict.move; staminaMaxMult += addict.stamina; pain = Math.max(0, pain + addict.pain); notes.push(...addict.notes);
  if (pain > 50) { accuracyMult -= 0.1; apPenalty += 1; notes.push('Dor intensa.'); }
  if (pain > 80) apPenalty += 1;

  const travelMult = clamp(moveMult, 0.15, 1.1);
  return {
    pain, moveMult: clamp(moveMult, 0.1, 1.2), travelMult, accuracyMult: clamp(accuracyMult, 0.2, 1.2), meleeMult: clamp(meleeMult, 0.15, 1.2), manipulation,
    staminaMaxMult: clamp(staminaMaxMult, 0.2, 1), apPenalty, canUseTwoHanded, usableHands, perceptionMult: clamp(perceptionMult, 0.3, 1.2), findMult: clamp(findMult, 0.3, 1.3), notes,
  };
}

/** Saúde geral exibida (0..100) — composta, não é "HP". */
export function overallHealth(wounds: WoundLike[], needs: Needs) {
  let h = Math.min(needs.vitality, 100);
  for (const w of wounds) if (active(w)) h -= w.severity * (1 - w.healing) * (w.type === 'fracture' ? 18 : 12);
  h -= Math.max(0, 85 - needs.blood) * 1.1;
  return clamp(Math.round(h), 0, 100);
}
