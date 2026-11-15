import type { ZombieStats } from '../../db/schema.js';

/**
 * Comportamentos (implementados em combat/ai.ts):
 * - shambler: lento, segue o último ponto conhecido; perigoso em grupo (bônus de agarrar quando cercando).
 * - runner: move até 3 casas por turno, sempre investe no alvo visível mais próximo, ignora barulhos fracos.
 * - brute: lento, muito resistente, derruba portas rápido e arremessa o alvo (empurrão) — causa contusões e fraturas.
 * - wanderer: 50% dos turnos se move aleatoriamente mesmo com alvo; difícil de prever.
 * - lurker: começa caído/oculto, invisível até alguém ficar a 2 casas; primeiro ataque com bônus.
 */
export const ZOMBIE_TYPES: { id: string; name: string; description: string; behavior: string; stats: ZombieStats; spawnWeight: number; nightMultiplier: number; allowedCategories: string[] }[] = [
  { id: 'walker', name: 'Caminhante comum', description: 'Lento e frágil, mas raramente sozinho.', behavior: 'shambler', spawnWeight: 10, nightMultiplier: 1, allowedCategories: [],
    stats: { body: 22, headThreshold: 10, ap: 3, perception: 6, hearing: 10, hitChance: 45, biteChance: 0.12, scratchChance: 0.6, lacerationChance: 0.28, bluntChance: 0, damage: 1, doorBash: 4 } },
  { id: 'runner', name: 'Corredor', description: 'Rápido e agressivo. Fugir dele exige obstáculos e portas.', behavior: 'runner', spawnWeight: 2.5, nightMultiplier: 1.8, allowedCategories: [],
    stats: { body: 22, headThreshold: 10, ap: 6, perception: 9, hearing: 12, hitChance: 55, biteChance: 0.16, scratchChance: 0.56, lacerationChance: 0.28, bluntChance: 0, damage: 1, doorBash: 3 } },
  { id: 'brute', name: 'Brutamontes', description: 'Resistente e lento; golpes que quebram ossos e portas.', behavior: 'brute', spawnWeight: 0.8, nightMultiplier: 1, allowedCategories: ['prison', 'military', 'industrial', 'street', 'hospital'],
    stats: { body: 80, headThreshold: 22, ap: 2, perception: 6, hearing: 8, hitChance: 45, biteChance: 0.08, scratchChance: 0.27, lacerationChance: 0.15, bluntChance: 0.5, damage: 2, doorBash: 20, knockback: true } },
  { id: 'wanderer', name: 'Infectado errante', description: 'Movimentos erráticos; aparece em estradas e bosques.', behavior: 'wanderer', spawnWeight: 2, nightMultiplier: 1.2, allowedCategories: ['road', 'forest', 'rural', 'farm', 'camp'],
    stats: { body: 22, headThreshold: 10, ap: 4, perception: 7, hearing: 10, hitChance: 45, biteChance: 0.12, scratchChance: 0.6, lacerationChance: 0.28, bluntChance: 0, damage: 1, doorBash: 3 } },
  { id: 'decayed', name: 'Infectado deteriorado', description: 'Fraco, mas espera imóvel no chão até alguém se aproximar.', behavior: 'lurker', spawnWeight: 2, nightMultiplier: 1, allowedCategories: [],
    stats: { body: 12, headThreshold: 6, ap: 2, perception: 3, hearing: 6, hitChance: 60, biteChance: 0.25, scratchChance: 0.5, lacerationChance: 0.25, bluntChance: 0, damage: 1, doorBash: 1 } },
];
