import type { GameConfig } from '../content/defaultConfig.js';

export type WorldState = {
  baseGameMinutes: number; baseRealMs: number;
  weather: string; weatherChangedAtGameMinutes: number;
};
export type Phase = 'dawn' | 'day' | 'dusk' | 'night';

export function gameMinutesAt(now: number, ws: WorldState, cfg: GameConfig) {
  return ws.baseGameMinutes + ((now - ws.baseRealMs) / 60000) * cfg.time.timeScale;
}

export function clockInfo(now: number, ws: WorldState, cfg: GameConfig) {
  const total = gameMinutesAt(now, ws, cfg);
  const day = Math.floor(total / 1440) + 1;
  const minuteOfDay = ((total % 1440) + 1440) % 1440;
  const hour = Math.floor(minuteOfDay / 60);
  const minute = Math.floor(minuteOfDay % 60);
  const phase: Phase = hour >= 5 && hour < 7 ? 'dawn' : hour >= 7 && hour < 18 ? 'day' : hour >= 18 && hour < 20 ? 'dusk' : 'night';
  const se = seasonOf(day, cfg);
  const temperature = temperatureFor(ws.weather, phase) + Number((cfg as any).seasons?.temperatureOffset?.[se.season] ?? 0);
  return { total, day, hour, minute, phase, weather: ws.weather, temperature, isDark: phase === 'night', season: se.season, seasonDay: se.dayOfSeason, daysPerSeason: se.daysPerSeason };
}

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = typeof SEASONS[number];
export const SEASON_NAMES: Record<Season, string> = { spring: 'Primavera', summer: 'Verão', autumn: 'Outono', winter: 'Inverno' };
/** Estação a partir do dia de jogo (o mundo começa na estação `seasons.start`). */
export function seasonOf(day: number, cfg: GameConfig) {
  const s = (cfg as any).seasons ?? {}; const per = Math.max(1, Number(s.daysPerSeason ?? 10));
  const start = Math.max(0, SEASONS.indexOf((s.start ?? 'autumn') as Season));
  const idx = (start + Math.floor((day - 1) / per)) % 4;
  return { season: SEASONS[idx] as Season, dayOfSeason: ((day - 1) % per) + 1, daysPerSeason: per };
}

export function temperatureFor(weather: string, phase: Phase) {
  const base: Record<string, number> = { clear: 22, cloudy: 18, rain: 14, storm: 11, fog: 13, snow: -2 };
  const t = base[weather] ?? 18;
  return phase === 'night' ? t - 9 : phase === 'dawn' || phase === 'dusk' ? t - 4 : t;
}

export const WEATHER_NAMES: Record<string, string> = { clear: 'Céu limpo', cloudy: 'Nublado', rain: 'Chuva', storm: 'Tempestade', fog: 'Neblina', snow: 'Neve' };
