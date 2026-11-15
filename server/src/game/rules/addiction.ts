import type { GameConfig } from '../content/defaultConfig.js';
import { clamp, rng } from './rng.js';

/**
 * Vícios: nicotina e álcool.
 *  • dependência (0–100): sobe a cada uso e cai devagar com o tempo; quem tem o traço (Fumante / Bebe demais) nunca fica abaixo do piso.
 *  • fissura (0–100): com dependência ≥ limiar, sobe enquanto a pessoa está sem; zera ao fumar/beber.
 *  • abstinência = fissura acima de 40: estresse sobe, a mira piora (tremores, no caso do álcool).
 *  • embriaguez (0–100): cai com o tempo; mira e passos piores, menos dor; demais = vômito.
 */
export type AddictionNeeds = { nicotine?: number; alcohol?: number; nicotineDep?: number; alcoholDep?: number; drunk?: number };
export const A = (cfg: GameConfig) => ({
  addictedAt: 40, traitFloor: 70, depDecayPerHour: 0.25,
  nicotineCravingPerHour: 9, alcoholCravingPerHour: 6,
  withdrawalStressPerHour: { nicotine: 3, alcohol: 4 },
  smokeDependence: 6, drinkDependenceFactor: 0.3, drunkDecayPerHour: 12,
  ...((cfg as any).addiction ?? {}),
});

export const isAddicted = (dep: number | undefined, cfg: GameConfig) => (dep ?? 0) >= A(cfg).addictedAt;
/** 0 (sem abstinência) a 1 (abstinência máxima). */
export const withdrawal = (craving: number | undefined) => clamp(((craving ?? 0) - 40) / 60, 0, 1);

export function applyTraitFloors(n: AddictionNeeds, traits: string[], cfg: GameConfig) {
  const floor = A(cfg).traitFloor;
  if (traits.includes('smoker')) n.nicotineDep = Math.max(n.nicotineDep ?? 0, floor);
  if (traits.includes('heavy_drinker')) n.alcoholDep = Math.max(n.alcoholDep ?? 0, floor);
}

/** Passo de simulação (h horas). Devolve mensagens para o jogador. */
export function stepAddiction(n: AddictionNeeds & { stress: number; thirst: number }, traits: string[], h: number, cfg: GameConfig) {
  const a = A(cfg); const msgs: string[] = [];
  applyTraitFloors(n, traits, cfg);
  for (const k of ['nicotine', 'alcohol'] as const) {
    const depKey = k === 'nicotine' ? 'nicotineDep' : 'alcoholDep';
    const dep = n[depKey] ?? 0;
    const before = n[k] ?? 0;
    if (isAddicted(dep, cfg)) n[k] = clamp(before + (k === 'nicotine' ? a.nicotineCravingPerHour : a.alcoholCravingPerHour) * h * (0.5 + dep / 200), 0, 100);
    else n[k] = clamp(before - 10 * h, 0, 100);
    // a dependência cai devagar quando a pessoa fica sem (o traço segura o piso)
    n[depKey] = clamp(dep - a.depDecayPerHour * h, 0, 100);
    const s = withdrawal(n[k]);
    if (s > 0) n.stress = clamp(n.stress + a.withdrawalStressPerHour[k] * s * h, 0, 100);
    if (before < 50 && (n[k] ?? 0) >= 50) msgs.push(k === 'nicotine' ? 'Você não para de pensar num cigarro. As mãos procuram o bolso sozinhas.' : 'Sua boca pede uma bebida. Uma dor de cabeça começa a apertar.');
    if (before < 85 && (n[k] ?? 0) >= 85) msgs.push(k === 'nicotine' ? 'A falta do cigarro te deixa irritado e sem foco.' : 'Suas mãos tremem. Suor frio. O corpo implora por álcool.');
  }
  applyTraitFloors(n, traits, cfg);
  if ((n.drunk ?? 0) > 0) {
    const was = n.drunk ?? 0;
    if (was > 85 && rng.chance(Math.min(1, 0.6 * h))) { n.drunk = was - 20; n.thirst = clamp(n.thirst + 15, 0, 100); msgs.push('O mundo gira — você vomita.'); }
    n.drunk = clamp((n.drunk ?? 0) - a.drunkDecayPerHour * h, 0, 100);
    if (was >= 30 && (n.drunk ?? 0) < 30) msgs.push('A bebedeira passa. Fica só a cabeça pesada.');
  }
  return msgs;
}

/** Efeito de fumar um cigarro. */
export function smoke(n: AddictionNeeds, cfg: GameConfig) {
  n.nicotine = 0;
  n.nicotineDep = clamp((n.nicotineDep ?? 0) + A(cfg).smokeDependence, 0, 100);
}
/** Efeito de beber (força = quanto embriaga). */
export function drink(n: AddictionNeeds, strength: number, cfg: GameConfig) {
  n.drunk = clamp((n.drunk ?? 0) + strength, 0, 100);
  n.alcohol = clamp((n.alcohol ?? 0) - strength * 3, 0, 100);
  n.alcoholDep = clamp((n.alcoholDep ?? 0) + strength * A(cfg).drinkDependenceFactor, 0, 100);
}

/** Penalidades no corpo (entram em computeBodyMods). */
export function addictionMods(n: AddictionNeeds) {
  const nic = withdrawal(n.nicotine); const alc = withdrawal(n.alcohol); const d = (n.drunk ?? 0) / 100;
  const notes: string[] = [];
  let accuracy = 0; let move = 0; let stamina = 0; let pain = 0;
  if (nic > 0) { accuracy -= 0.12 * nic; notes.push('Abstinência de nicotina: inquieto, mira pior.'); }
  if (alc > 0) { accuracy -= 0.22 * alc; stamina -= 0.1 * alc; notes.push('Abstinência de álcool: tremores nas mãos.'); }
  if (d > 0.15) { accuracy -= 0.35 * d; move -= d > 0.4 ? 0.15 * d : 0; pain -= 25 * d; notes.push(d > 0.6 ? 'Muito bêbado: mal fica em pé.' : 'Alterado pela bebida.'); }
  return { accuracy, move, stamina, pain, notes };
}
