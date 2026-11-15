import { eq } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { defaultGameConfig, type GameConfig } from '../content/defaultConfig.js';
import { clockInfo, type WorldState } from '../rules/clock.js';
import { worldNow } from './serverStatus.js';

/** Cache em memória dos dados configuráveis. Invalidado sempre que o painel salva algo. */
let gameCfg: GameConfig = structuredClone(defaultGameConfig);
let world: WorldState = { baseGameMinutes: 8 * 60, baseRealMs: Date.now(), weather: 'clear', weatherChangedAtGameMinutes: 8 * 60 };
let itemDefs = new Map<string, typeof schema.itemDefs.$inferSelect>();
let zombieTypes: (typeof schema.zombieTypes.$inferSelect)[] = [];
let eventDefs: (typeof schema.eventDefs.$inferSelect)[] = [];
let lootTables = new Map<string, typeof schema.lootTables.$inferSelect>();
let recipes: (typeof schema.recipes.$inferSelect)[] = [];

function deepMerge<T>(base: T, over: any): T {
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return (over ?? base) as T;
  const out: any = { ...base };
  for (const k of Object.keys(over ?? {})) out[k] = k in (base as any) ? deepMerge((base as any)[k], over[k]) : over[k];
  return out;
}

export async function loadAll() {
  const rows = await db.select().from(schema.gameConfig);
  const g = rows.find((r) => r.key === 'game');
  gameCfg = deepMerge(structuredClone(defaultGameConfig), g?.value ?? {});
  const w = rows.find((r) => r.key === 'world');
  if (w) world = w.value as WorldState;
  else await saveWorld();
  itemDefs = new Map((await db.select().from(schema.itemDefs)).map((d) => [d.id, d]));
  zombieTypes = await db.select().from(schema.zombieTypes);
  eventDefs = await db.select().from(schema.eventDefs);
  lootTables = new Map((await db.select().from(schema.lootTables)).map((t) => [t.id, t]));
  recipes = await db.select().from(schema.recipes);
}

export const cfg = () => gameCfg;
export const worldState = () => world;
/** Relógio do jogo. Enquanto o jogo está pausado, fica parado no instante da pausa. */
export const clock = (now = Date.now()) => clockInfo(worldNow(now), world, gameCfg);
export const itemDef = (id: string) => itemDefs.get(id);
export const allItemDefs = () => [...itemDefs.values()];
export const getZombieTypes = () => zombieTypes.filter((z) => z.enabled);
export const getEventDefs = () => eventDefs.filter((e) => e.enabled);
export const getLootTable = (id: string | null | undefined) => (id ? lootTables.get(id) : undefined);
export const getRecipes = () => recipes;

export async function saveWorld() {
  await db.insert(schema.gameConfig).values({ key: 'world', value: world }).onConflictDoUpdate({ target: schema.gameConfig.key, set: { value: world, updatedAt: new Date() } });
}
export async function setWeather(weather: string) {
  world = { ...world, weather, weatherChangedAtGameMinutes: clock().total };
  await saveWorld();
}

/** Atualiza a configuração preservando o horário atual do mundo quando a escala de tempo muda. */
export async function updateGameConfig(next: GameConfig, userId: number) {
  const now = Date.now();
  if (next.time.timeScale !== gameCfg.time.timeScale) {
    world = { ...world, baseGameMinutes: clock(now).total, baseRealMs: now };
    await saveWorld();
  }
  gameCfg = deepMerge(structuredClone(defaultGameConfig), next);
  await db.insert(schema.gameConfig).values({ key: 'game', value: gameCfg, updatedBy: userId })
    .onConflictDoUpdate({ target: schema.gameConfig.key, set: { value: gameCfg, updatedAt: new Date(), updatedBy: userId } });
}
export async function setGameTime(hour: number) {
  const now = Date.now(); const c = clock(now);
  const dayStart = Math.floor(c.total / 1440) * 1440;
  world = { ...world, baseGameMinutes: dayStart + hour * 60, baseRealMs: now };
  await saveWorld();
}
export async function reloadData() { await loadAll(); }
/** Ao retomar de uma pausa: o relógio do jogo continua de onde parou. */
export async function shiftWorldClock(ms: number) { world = { ...world, baseRealMs: world.baseRealMs + ms }; await saveWorld(); }
export async function getRawConfig(key: string) {
  const [r] = await db.select().from(schema.gameConfig).where(eq(schema.gameConfig.key, key));
  return r?.value;
}
