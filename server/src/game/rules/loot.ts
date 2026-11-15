import type { LootEntry } from '../../db/schema.js';
import { rng } from './rng.js';

/** Probabilidade de cada entrada ser escolhida em um sorteio (exibida no painel). */
export function lootProbabilities(entries: LootEntry[], isNight = false) {
  const w = entries.map((e) => e.weight * (isNight && e.night ? e.night : 1));
  const total = w.reduce((s, x) => s + x, 0) || 1;
  return entries.map((e, i) => ({ ...e, probability: w[i] / total }));
}

export function rollEntry(entries: LootEntry[], isNight: boolean, tags: string[] = []) {
  const pool = entries.filter((e) => !e.requiresTag || tags.includes(e.requiresTag));
  return rng.weighted(pool, (e) => e.weight * (isNight && e.night ? e.night : 1));
}

/** Quantidade de achados com base em reserva restante, habilidade e iluminação. Retornos decrescentes. */
export function findCount(opts: { reserveRatio: number; skillLevel: number; perception: number; lightMult: number; findMult: number; baseFinds: number; repeatPenalty: number; minRatio: number }) {
  if (opts.reserveRatio <= opts.minRatio) return 0;
  const expected = opts.baseFinds * Math.sqrt(opts.reserveRatio) * (1 + opts.skillLevel * 0.08 + (opts.perception - 4) * 0.04) * opts.lightMult * opts.findMult * Math.max(0.2, 1 - opts.repeatPenalty);
  // Poisson simples com média "expected"
  let k = 0; let p = Math.exp(-expected); let s = p; const u = rng.next();
  while (u > s && k < 6) { k++; p = (p * expected) / k; s += p; }
  return k;
}
