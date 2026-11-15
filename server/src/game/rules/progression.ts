import type { SkillMap } from '../../db/schema.js';
import type { GameConfig } from '../content/defaultConfig.js';
import { SKILLS, charMod } from '../content/character.js';

/** XP acumulado necessário para atingir o nível n. Curva com retornos decrescentes. */
export function xpForLevel(n: number, cfg: GameConfig) {
  if (n <= 0) return 0;
  return Math.round(cfg.skills.xpCurveBase * Math.pow(n, cfg.skills.xpCurveExponent));
}
export function levelForXp(xp: number, cfg: GameConfig) {
  let l = 0; while (l < cfg.skills.maxLevel && xp >= xpForLevel(l + 1, cfg)) l++; return l;
}
export function skillLevel(skills: SkillMap, id: string) { return skills[id]?.level ?? 0; }

export type Ledger = Record<string, { t: number; xp: number; k?: string }[]>;

/**
 * Concede XP com proteção anti-farm:
 *  1) teto suave por hora por habilidade (ganho ÷ (1 + recente/teto));
 *  2) repetição da MESMA ação no mesmo alvo nos últimos 10 min decai exponencialmente;
 *  3) multiplicadores de profissão/traços/intelecto.
 */
export function grantXp(skills: SkillMap, ledger: Ledger, skill: string, baseXp: number, actionKey: string, now: number, cfg: GameConfig,
  ctx: { profession: string; traits: string[]; intellect: number; maxLevelFromSource?: number }) {
  if (!SKILLS[skill] || baseXp <= 0) return { skills, ledger, gained: 0, levelUp: false };
  const hourAgo = now - 3_600_000; const tenMin = now - 600_000;
  const entries = (ledger[skill] ?? []).filter((e) => e.t > hourAgo);
  const recent = entries.reduce((s, e) => s + e.xp, 0);
  const repeats = entries.filter((e) => e.k === actionKey && e.t > tenMin).length;
  const mult = charMod(ctx.profession, ctx.traits, 'xp') * charMod(ctx.profession, ctx.traits, 'xpTrait') * (1 + (ctx.intellect - 4) * 0.04);
  const gained = baseXp * mult * (1 / (1 + recent / cfg.skills.hourlySoftCap)) * Math.pow(cfg.skills.sameActionDecay, repeats);
  const cur = skills[skill] ?? { xp: 0, level: 0 };
  let xp = cur.xp + gained;
  if (ctx.maxLevelFromSource !== undefined) xp = Math.min(xp, xpForLevel(ctx.maxLevelFromSource, cfg));
  xp = Math.max(xp, cur.xp);
  const level = levelForXp(xp, cfg);
  const nextSkills = { ...skills, [skill]: { xp: Math.round(xp * 100) / 100, level } };
  const nextLedger = { ...ledger, [skill]: [...entries, { t: now, xp: gained, k: actionKey }].slice(-40) };
  return { skills: nextSkills, ledger: nextLedger, gained: xp - cur.xp, levelUp: level > cur.level };
}

export function initialSkills(professionSkills: Record<string, number>, cfg: GameConfig): SkillMap {
  const out: SkillMap = {};
  for (const id of Object.keys(SKILLS)) { const lvl = professionSkills[id] ?? 0; out[id] = { xp: xpForLevel(lvl, cfg), level: lvl }; }
  return out;
}
