import { randomInt } from 'node:crypto';

/** RNG do servidor. Substituível em testes para resultados determinísticos. */
let source: () => number = () => randomInt(0, 2 ** 32) / 2 ** 32;

export const rng = {
  next: () => source(),
  chance: (p: number) => source() < p,
  range: (min: number, max: number) => min + source() * (max - min),
  int: (min: number, max: number) => Math.floor(min + source() * (max - min + 1)),
  pick: <T>(arr: readonly T[]): T => arr[Math.floor(source() * arr.length)],
  /** Embaralha (Fisher–Yates) usando a fonte de aleatoriedade do jogo (determinística nos testes). */
  shuffle: <T>(arr: T[]): T[] => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(source() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; },
  weighted: <T>(items: readonly T[], weight: (t: T) => number): T | undefined => {
    const total = items.reduce((s, i) => s + Math.max(0, weight(i)), 0);
    if (total <= 0) return undefined;
    let r = source() * total;
    for (const i of items) { r -= Math.max(0, weight(i)); if (r <= 0) return i; }
    return items[items.length - 1];
  },
};

export function setRandomSource(fn: () => number) { source = fn; }
/** Mulberry32 — útil para testes reprodutíveis. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
