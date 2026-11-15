import type { GameConfig } from '../content/defaultConfig.js';
import { charMod } from '../content/character.js';
import { clamp } from './rng.js';

export type TravelCtx = {
  cfg: GameConfig; distance: number; roadType: string; mode: 'walk' | 'vehicle'; vehicleSpeed?: number; vehicleCondition?: number;
  bodyTravelMult: number; encumbrance: number; stamina: number; weather: string; phase: string; hasLight: boolean; indoor: boolean;
  profession: string; traits: string[]; bootsSpeed?: number;
};

/** Duração de uma viagem com explicação dos fatores (exibida ao jogador). */
export function travelDuration(c: TravelCtx) {
  const t = c.cfg.travel; const factors: { label: string; mult: number }[] = [];
  let speed: number;
  if (c.mode === 'vehicle') {
    speed = (c.vehicleSpeed ?? 12) * (c.roadType === 'dirt' ? 0.6 : 1) * clamp(0.5 + (c.vehicleCondition ?? 100) / 200, 0.5, 1);
    factors.push({ label: 'Veículo', mult: speed / t.walkSpeed });
  } else {
    speed = t.walkSpeed;
    const road = (t.roadTypeSpeed as Record<string, number>)[c.roadType] ?? 1;
    if (road !== 1) factors.push({ label: 'Terreno', mult: road });
    speed *= road;
    const body = c.bodyTravelMult; if (body < 0.99) factors.push({ label: 'Ferimentos', mult: body }); speed *= body;
    const enc = c.encumbrance > 1 ? clamp(1 - (c.encumbrance - 1) * t.encumbranceSpeedPenalty * 2, 0.35, 1) : 1;
    if (enc < 1) factors.push({ label: 'Sobrecarga', mult: enc }); speed *= enc;
    if (c.stamina < 25) { factors.push({ label: 'Exaustão', mult: t.lowStaminaSpeed }); speed *= t.lowStaminaSpeed; }
    const tm = charMod(c.profession, c.traits, 'walkSpeed') * (c.roadType === 'trail' ? charMod(c.profession, c.traits, 'trailSpeed') : 1) * (c.bootsSpeed ?? 1);
    if (tm !== 1) factors.push({ label: 'Características', mult: tm }); speed *= tm;
  }
  if (!c.indoor) {
    const w = (t.weatherSpeed as Record<string, number>)[c.weather] ?? 1;
    if (w !== 1) factors.push({ label: 'Clima', mult: w }); speed *= w;
  }
  if (c.phase === 'night' && !c.hasLight && c.mode === 'walk') { factors.push({ label: 'Escuridão', mult: t.nightSpeed }); speed *= t.nightSpeed; }
  const seconds = Math.max(t.minSeconds, (c.distance / Math.max(0.1, speed)) * t.durationMultiplier);
  return { durationMs: Math.round(seconds * 1000), speed, factors };
}

/** Chance de encontro durante a viagem, proporcional à distância e ao perigo. */
export function encounterChance(cfg: GameConfig, distance: number, danger: number, phase: string, mode: string) {
  const t = cfg.travel;
  const base = (distance / 1000) * t.encounterChancePerKm * (0.5 + danger) * (phase === 'night' ? 1.4 : 1) * (mode === 'vehicle' ? 0.6 : 1);
  return clamp(base, t.encounterChanceMin, t.encounterChanceMax);
}
