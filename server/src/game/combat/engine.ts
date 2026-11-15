import type { GameConfig } from '../content/defaultConfig.js';
import type { ZombieStats } from '../../db/schema.js';
import { ARENAS } from './maps.js';
import { HIT_WEIGHTS, ZOMBIE_HIT_WEIGHTS, makeWound, rollRegion, type WoundLike, type WoundType } from '../rules/body.js';
import { clamp, rng } from '../rules/rng.js';
import { REGION_NAMES, type Region } from '../content/items.js';

// ───────────────────────── Tipos ─────────────────────────
export type Pos = { x: number; y: number };
export type WeaponInfo = { itemId: number | null; defId: string; name: string; props: Record<string, any>; durability: number; ammo: number };
export type Unit = {
  id: string; side: 'player' | 'zombie'; team: number; name: string; x: number; y: number;
  ap: number; maxAp: number; out: null | 'fled' | 'dead' | 'down';
  // jogador
  characterId?: number; userId?: number; portrait?: string | null; weapon?: WeaponInfo; stamina?: number;
  accuracyMult?: number; meleeMult?: number; canTwoHanded?: boolean; usableHands?: number; skills?: Record<string, number>;
  attrs?: Record<string, number>; armor?: Record<string, { p: number; b: number }>; defending?: boolean; endedTurn?: boolean;
  actedThisTurn?: boolean; timeouts?: number; autoFlee?: boolean; rangedAccBonus?: number; reloadDiscount?: number; moveApBonus?: number;
  /** Andando agachado/furtivo: mais lento, mas infectados percebem menos e não agarram quem não estão vendo. */
  sneaking?: boolean; load?: number; capacity?: number; hasLighter?: boolean;
  /** Multiplicador da chance de mordida (proteção de novato). 1 ou ausente = normal. */
  biteMult?: number;
  /** Cachorro do jogador: morde e derruba infectados próximos no início da fase deles. */
  dog?: { name: string; chance: number; bites: number } | null;
  // zumbi
  zombieType?: string; behavior?: string; stats?: ZombieStats; body?: number; maxBody?: number; legDamage?: number;
  aware?: boolean; targetId?: string | null; lastKnown?: Pos | null; prone?: boolean; hidden?: boolean; crawling?: boolean; displayName?: string;
  /** Provocado: persegue quem fez barulho para atraí-lo até esta rodada. */
  tauntBy?: string | null; tauntUntil?: number;
  /** Morto que levantou (personagem de jogador): ao cair, larga os pertences. */
  risenId?: number;
};
export type Door = { open: boolean; hp: number; broken: boolean };
export type LogEntry = { round: number; t: string; text: string; unit?: string; from?: Pos; to?: Pos; kind?: string };
export type Effect =
  | { type: 'wound'; characterId: number; wound: WoundLike & { source: string }; infectionRisk: number }
  | { type: 'instant_death'; characterId: number; cause: string }
  | { type: 'durability'; itemId: number; delta: number }
  | { type: 'ammo'; itemId: number; ammo: number }
  | { type: 'stamina'; characterId: number; stamina: number }
  | { type: 'xp'; characterId: number; skill: string; amount: number; key: string }
  | { type: 'kill'; characterId?: number; zombieType: string }
  | { type: 'armor_wear'; characterId: number; region: string }
  | { type: 'arrow'; characterId: number };
export type CombatState = {
  mapKey: string; width: number; height: number; tiles: string[]; doors: Record<string, Door>;
  units: Unit[]; round: number; phase: 'players' | 'zombies' | 'ended'; log: LogEntry[]; effects: Effect[]; noise: number;
  pvp: boolean; context: { type: 'location' | 'travel'; locationId?: string; travelGroupId?: string }; result?: { outcome: string; summary: string };
  zombieSpawns: Pos[]; playerSpawns: Pos[]; exits: Pos[]; nextZombieId: number; isNight: boolean;
  /** Disparos de arma de fogo feitos neste combate (usado para o eco nos locais vizinhos). */
  shotsFired?: number; lastShotSkill?: string;
  /** Alarme de carro tocando (atrai infectados por algumas rodadas). */
  alarm?: { x: number; y: number; until: number } | null;
  /** Galões acesos que explodem no início da fase dos infectados. */
  fuses?: { x: number; y: number; by: string }[];
};

// ───────────────────────── Mapa ─────────────────────────
// S estante/armário (tombável)   A carro com alarme   B galão/barril de combustível
const BLOCK_MOVE = new Set(['#', '+', 'o', 'T', 'c', 'w', 'S', 'A', 'B']);
const BLOCK_LOS = new Set(['#', '+', 'o', 'T', 'S']);
const COVER = new Set(['c', 'A', 'B']);
export const key = (x: number, y: number) => `${x},${y}`;
export const tileAt = (s: CombatState, x: number, y: number) => (x < 0 || y < 0 || x >= s.width || y >= s.height ? '#' : s.tiles[y][x]);
export const inBounds = (s: CombatState, x: number, y: number) => x >= 0 && y >= 0 && x < s.width && y < s.height;
export const unitAt = (s: CombatState, x: number, y: number) => s.units.find((u) => !u.out && u.x === x && u.y === y && !(u.hidden && u.side === 'zombie' && false));
export const activeUnits = (s: CombatState) => s.units.filter((u) => !u.out);
export const dist = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const setTile = (s: CombatState, x: number, y: number, ch: string) => { const r = s.tiles[y]; s.tiles[y] = r.slice(0, x) + ch + r.slice(x + 1); };
export const walkable = (s: CombatState, x: number, y: number) => inBounds(s, x, y) && !BLOCK_MOVE.has(tileAt(s, x, y));

export function loadMap(mapKey: string) {
  const arena = ARENAS[mapKey] ?? ARENAS.street;
  const rows = arena.rows.map((r) => r.padEnd(16, '#'));
  const zombieSpawns: Pos[] = []; const playerSpawns: Pos[] = []; const exits: Pos[] = []; const doors: Record<string, Door> = {};
  const tiles = rows.map((row, y) => [...row].map((ch, x) => {
    if (ch === 'Z') { zombieSpawns.push({ x, y }); return '.'; }
    if (ch === 'P') { playerSpawns.push({ x, y }); return '.'; }
    if (ch === 'E') exits.push({ x, y });
    if (ch === '+' || ch === '/') doors[key(x, y)] = { open: ch === '/', hp: 30, broken: false };
    return ch;
  }).join(''));
  return { mapKey: ARENAS[mapKey] ? mapKey : 'street', width: rows[0].length, height: rows.length, tiles, doors, zombieSpawns, playerSpawns, exits };
}

/** Diagonais só são permitidas se nenhuma das casas ortogonais adjacentes bloquear (sem "cortar quina"). */
export function canStep(s: CombatState, from: Pos, to: Pos, ignoreUnits = false, allowClosedDoor = false) {
  const dx = to.x - from.x; const dy = to.y - from.y;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) return false;
  const t = tileAt(s, to.x, to.y);
  const passable = walkable(s, to.x, to.y) || (allowClosedDoor && t === '+');
  if (!passable) return false;
  if (dx !== 0 && dy !== 0) {
    if (BLOCK_MOVE.has(tileAt(s, from.x + dx, from.y)) || BLOCK_MOVE.has(tileAt(s, from.x, from.y + dy))) return false;
  }
  if (!ignoreUnits && unitAt(s, to.x, to.y)) return false;
  return true;
}
export const stepCost = (s: CombatState, p: Pos) => (tileAt(s, p.x, p.y) === '~' ? 2 : 1);

/** A* em 8 direções. Retorna o caminho sem a origem. `goalAdjacent` para chegar ao lado do alvo. */
export function findPath(s: CombatState, from: Pos, to: Pos, opts: { goalAdjacent?: boolean; allowClosedDoor?: boolean; maxNodes?: number } = {}): Pos[] | null {
  const isGoal = (p: Pos) => (opts.goalAdjacent ? dist(p, to) <= 1 && !(p.x === to.x && p.y === to.y) : p.x === to.x && p.y === to.y);
  if (isGoal(from)) return [];
  const open: { p: Pos; g: number; f: number }[] = [{ p: from, g: 0, f: dist(from, to) }];
  const came = new Map<string, string>(); const gScore = new Map<string, number>([[key(from.x, from.y), 0]]);
  let nodes = 0;
  while (open.length && nodes++ < (opts.maxNodes ?? 600)) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift()!;
    if (isGoal(cur.p)) {
      const path: Pos[] = []; let k = key(cur.p.x, cur.p.y);
      while (k !== key(from.x, from.y)) { const [x, y] = k.split(',').map(Number); path.unshift({ x, y }); k = came.get(k)!; }
      return path;
    }
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const np = { x: cur.p.x + dx, y: cur.p.y + dy };
      const isTarget = np.x === to.x && np.y === to.y;
      if (!canStep(s, cur.p, np, isTarget, opts.allowClosedDoor)) continue;
      const doorPenalty = tileAt(s, np.x, np.y) === '+' ? 4 : 0;
      const g = cur.g + stepCost(s, np) + doorPenalty + (dx && dy ? 0.01 : 0);
      const k = key(np.x, np.y);
      if (g < (gScore.get(k) ?? Infinity)) { gScore.set(k, g); came.set(k, key(cur.p.x, cur.p.y)); open.push({ p: np, g, f: g + dist(np, to) }); }
    }
  }
  return null;
}

/** Linha de visão (Bresenham) — paredes, portas fechadas e obstáculos altos bloqueiam. */
export function hasLOS(s: CombatState, a: Pos, b: Pos) {
  let x0 = a.x, y0 = a.y; const x1 = b.x, y1 = b.y;
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (!(x0 === x1 && y0 === y1)) {
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
    if (x0 === x1 && y0 === y1) break;
    if (BLOCK_LOS.has(tileAt(s, x0, y0))) return false;
  }
  return true;
}
/** Cobertura: há uma casa "c" adjacente ao alvo, na direção do atacante. */
export function inCover(s: CombatState, attacker: Pos, target: Pos) {
  const vx = Math.sign(attacker.x - target.x), vy = Math.sign(attacker.y - target.y);
  const cands = [{ x: target.x + vx, y: target.y + vy }, { x: target.x + vx, y: target.y }, { x: target.x, y: target.y + vy }];
  return dist(attacker, target) > 1 && cands.some((c) => (c.x !== target.x || c.y !== target.y) && COVER.has(tileAt(s, c.x, c.y)));
}

export function log(s: CombatState, text: string, extra: Partial<LogEntry> = {}) {
  s.log.push({ round: s.round, t: new Date().toISOString(), text, ...extra });
  if (s.log.length > 200) s.log.splice(0, s.log.length - 200);
}

// ───────────────────────── Criação ─────────────────────────
export type PlayerSetup = Omit<Unit, 'id' | 'side' | 'x' | 'y' | 'ap' | 'out'> & { characterId: number };
export function createCombat(mapKey: string, players: PlayerSetup[], zombies: { type: string; behavior: string; stats: ZombieStats; name: string; risenId?: number; portrait?: string | null }[], opts: { pvp?: boolean; context: CombatState['context']; isNight: boolean; teams?: Record<number, number>; ambush?: boolean }): CombatState {
  const m = loadMap(mapKey);
  const s: CombatState = { ...m, units: [], round: 1, phase: 'players', log: [], effects: [], noise: 0, pvp: !!opts.pvp, context: opts.context, nextZombieId: 1, isNight: opts.isNight };
  players.forEach((p, i) => addPlayer(s, p, i, opts.teams?.[p.characterId] ?? 1));
  for (const z of zombies) {
    const amb = opts.ambush !== false && z.behavior !== 'lurker' ? ambushSpot(s, 2, 4) : null;
    const u = spawnZombie(s, z, amb ?? undefined);
    // O confronto começa porque algo chamou a atenção deles: sabem aproximadamente onde os vivos estão.
    if (u.behavior !== 'lurker') { const p = s.units.filter((x) => x.side === 'player').sort((a, b) => dist(a, u) - dist(b, u))[0]; if (p) { u.aware = true; u.lastKnown = { x: p.x, y: p.y }; } }
  }
  log(s, `O confronto começou${opts.pvp ? ' entre sobreviventes' : ''}. ${zombies.length ? `${zombies.length} infectado(s) à vista.` : ''}`, { kind: 'system' });
  return s;
}
function freeNear(s: CombatState, spots: Pos[], fallbackNear?: Pos): Pos {
  for (const p of rng.next() < 2 ? [...spots].sort(() => rng.next() - 0.5) : spots) if (walkable(s, p.x, p.y) && !unitAt(s, p.x, p.y)) return p;
  const origin = fallbackNear ?? spots[0] ?? { x: 1, y: 1 };
  for (let r = 1; r < 8; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
    const p = { x: origin.x + dx, y: origin.y + dy };
    if (walkable(s, p.x, p.y) && !unitAt(s, p.x, p.y)) return p;
  }
  return { x: 1, y: 1 };
}
export function addPlayer(s: CombatState, p: PlayerSetup, index: number, team = 1) {
  const spawnPool = team === 2 ? [...s.playerSpawns].reverse() : s.playerSpawns;
  const pos = freeNear(s, spawnPool.length ? [spawnPool[index % spawnPool.length], ...spawnPool] : s.exits);
  const u: Unit = { ...p, id: `p${p.characterId}`, side: 'player', team, x: pos.x, y: pos.y, ap: p.maxAp, out: null, timeouts: 0, endedTurn: false };
  s.units = s.units.filter((x) => x.id !== u.id);
  s.units.push(u);
  return u;
}
/** Posição de emboscada: 2–4 casas de um sobrevivente, preferindo o caminho até as saídas. */
export function ambushSpot(s: CombatState, minD = 2, maxD = 4): Pos | null {
  const players = activeUnits(s).filter((u) => u.side === 'player');
  if (!players.length) return null;
  const cands: { p: Pos; score: number }[] = [];
  for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
    if (!walkable(s, x, y) || unitAt(s, x, y) || tileAt(s, x, y) === 'E') continue;
    const d = Math.min(...players.map((pl) => dist(pl, { x, y })));
    if (d < minD || d > maxD) continue;
    const toExit = s.exits.length ? Math.min(...s.exits.map((e) => dist(e, { x, y }))) : 0;
    cands.push({ p: { x, y }, score: toExit + d * 0.5 + rng.next() * 4 });
  }
  cands.sort((a, b) => a.score - b.score);
  return cands[0]?.p ?? null;
}
export function spawnZombie(s: CombatState, z: { type: string; behavior: string; stats: ZombieStats; name: string; risenId?: number; portrait?: string | null }, at?: Pos) {
  const playersPos = activeUnits(s).filter((u) => u.side === 'player');
  const spots = s.zombieSpawns.length ? s.zombieSpawns : s.exits;
  const pos = at ?? freeNear(s, spots.filter((p) => playersPos.every((pp) => dist(pp, p) > 2)));
  const u: Unit = {
    id: `z${s.nextZombieId++}`, side: 'zombie', team: 0, name: z.name, zombieType: z.type, behavior: z.behavior, stats: z.stats,
    x: pos.x, y: pos.y, ap: z.stats.ap, maxAp: z.stats.ap, out: null, body: z.stats.body, maxBody: z.stats.body, legDamage: 0,
    aware: z.behavior === 'runner', targetId: null, lastKnown: null, prone: false, hidden: z.behavior === 'lurker', crawling: false,
    ...(z.risenId ? { risenId: z.risenId, portrait: z.portrait ?? null } : {}),
  };
  s.units.push(u);
  return u;
}

// ───────────────────────── Ações dos jogadores ─────────────────────────
export type Action =
  | { type: 'move'; x: number; y: number }
  | { type: 'attack'; targetId: string; aimHead?: boolean }
  | { type: 'shove'; targetId: string }
  | { type: 'defend' } | { type: 'end_turn' } | { type: 'flee' }
  | { type: 'door'; x: number; y: number }
  | { type: 'distract'; x: number; y: number }
  | { type: 'taunt' } | { type: 'sneak' }
  | { type: 'topple'; x: number; y: number } | { type: 'alarm'; x: number; y: number } | { type: 'ignite'; x: number; y: number }
  | { type: 'barricade'; x: number; y: number }
  | { type: 'reload' } | { type: 'use_item'; itemId: number; targetId?: string } | { type: 'equip'; itemId: number | null };

export type ActionResult = { ok: true; apSpent: number } | { ok: false; error: string };

/** O infectado está concentrado nesta pessoa (persegue ou foi provocado por ela)? */
export function engagedWith(z: Unit, u: Unit, round: number) {
  if (z.tauntBy && (z.tauntUntil ?? 0) >= round) return z.tauntBy === u.id;
  return z.targetId === u.id;
}
/** Este infectado colado em você te impede de passar/fugir? Quem está ocupado com outra pessoa não; furtivo, só quem já te viu. */
export function blocksYou(s: CombatState, z: Unit, u: Unit) {
  if (z.side !== 'zombie' || z.out || z.prone || z.hidden || dist(z, u) > 1) return false;
  if (engagedWith(z, u, s.round)) return true;
  const busyElsewhere = !!z.targetId || (!!z.tauntBy && (z.tauntUntil ?? 0) >= s.round) || ((z as any).distractedUntil ?? 0) >= s.round;
  if (busyElsewhere) return false;
  return !u.sneaking;
}

export function canAct(s: CombatState, u: Unit | undefined): string | null {
  if (!u) return 'Você não está neste combate.';
  if (s.phase !== 'players') return 'Aguarde: os infectados estão agindo.';
  if (u.out) return u.out === 'down' ? 'Você está inconsciente.' : 'Você não está mais no combate.';
  if (u.endedTurn) return 'Você já encerrou seu turno.';
  return null;
}

export function performAction(s: CombatState, unitId: string, a: Action, cfg: GameConfig): ActionResult {
  const u = s.units.find((x) => x.id === unitId);
  const err = canAct(s, u); if (err) return { ok: false, error: err };
  const me = u!;
  switch (a.type) {
    case 'move': {
      const target = { x: a.x, y: a.y };
      if (!walkable(s, target.x, target.y) || unitAt(s, target.x, target.y)) return { ok: false, error: 'Destino bloqueado.' };
      const path = findPath(s, me, target);
      if (!path || !path.length) return { ok: false, error: 'Não há caminho até lá.' };
      const base = path.reduce((c, p) => c + stepCost(s, p), 0);
      const cost = me.sneaking ? Math.ceil(base * 1.5) : base;
      if (cost > me.ap) return { ok: false, error: `Movimento custa ${cost} PA; você tem ${me.ap}.` };
      const from = { x: me.x, y: me.y };
      me.actedThisTurn = true; me.defending = false;
      let spent = 0;
      for (const step of path) {
        // Sair do alcance de um infectado dá a ele a chance de agarrar (como em Project Zomboid, fugir no meio deles é perigoso).
        // Só agarra quem está concentrado em você; ocupado com outra pessoa ou distraído, dá para passar (furtivo, ainda mais).
        const grabbers = s.units.filter((z) => z.side === 'zombie' && !z.out && !z.prone && !z.hidden && dist(z, me) <= 1 && dist(z, step) > 1 && blocksYou(s, z, me));
        for (const z of grabbers) {
          const focused = engagedWith(z, me, s.round);
          const chance = clamp((((z.stats?.hitChance ?? 55) * cfg.combat.grabChanceMultiplier - ((me.attrs?.agility ?? 4) - 4) * 4 - ((me.stamina ?? 50) < 15 ? -10 : 0)) * (focused ? 1 : 0.5)) / 100 * 0.5, 0.02, 0.45);
          if (rng.chance(chance)) {
            // agarrado: para onde está e perde o que gastou andando, mas não o turno inteiro
            me.ap = Math.max(0, me.ap - spent - 1); me.stamina = Math.max(0, (me.stamina ?? 50) - spent * cfg.combat.moveStaminaCost);
            log(s, `${z.name} agarra ${me.name} quando tenta passar!`, { unit: z.id, kind: 'grab', from, to: { x: me.x, y: me.y } });
            damagePlayer(s, z.name, me, 10, 'scratch', false, false, z.name, ZOMBIE_HIT_WEIGHTS, z.stats);
            return { ok: true, apSpent: spent };
          }
        }
        me.x = step.x; me.y = step.y; spent += stepCost(s, step);
        revealLurkers(s, me);
      }
      me.ap -= cost;
      me.stamina = Math.max(0, (me.stamina ?? 50) - cost * cfg.combat.moveStaminaCost);
      log(s, me.sneaking ? `${me.name} avança agachado, em silêncio.` : `${me.name} se move.`, { unit: me.id, from, to: target, kind: 'move' });
      if (me.characterId && cost >= 3) s.effects.push({ type: 'xp', characterId: me.characterId, skill: me.sneaking ? 'stealth' : 'athletics', amount: me.sneaking ? 1 : 0.5, key: me.sneaking ? 'combat_sneak' : 'combat_move' });
      return { ok: true, apSpent: cost };
    }
    case 'attack': return attack(s, me, a.targetId, !!a.aimHead, cfg);
    case 'shove': {
      const t = s.units.find((x) => x.id === a.targetId && !x.out);
      if (!t || dist(me, t) > 1) return { ok: false, error: 'O alvo precisa estar adjacente.' };
      if (me.ap < 1) return { ok: false, error: 'PA insuficiente.' };
      me.ap -= 1; me.actedThisTurn = true; me.stamina = Math.max(0, (me.stamina ?? 50) - 6);
      const resist = t.behavior === 'brute' ? 0.7 : t.side === 'player' ? 0.4 : 0.15;
      const power = 0.55 + ((me.attrs?.strength ?? 4) - 4) * 0.06 + ((me.stamina ?? 50) < 10 ? -0.2 : 0);
      if (rng.chance(clamp(power - resist + 0.45, 0.25, 0.95))) {
        const nx = t.x + Math.sign(t.x - me.x), ny = t.y + Math.sign(t.y - me.y);
        const moved = walkable(s, nx, ny) && !unitAt(s, nx, ny);
        if (moved) { t.x = nx; t.y = ny; }
        if (t.side === 'zombie' && t.behavior !== 'brute' && rng.chance(0.65)) t.prone = true;
        log(s, `${me.name} empurra ${t.name}${moved ? ' para trás' : ''}${t.prone ? ', derrubando-o' : ''}.`, { unit: me.id, kind: 'shove' });
      } else log(s, `${me.name} tenta empurrar ${t.name}, sem sucesso.`, { unit: me.id, kind: 'shove' });
      return { ok: true, apSpent: 1 };
    }
    case 'defend':
      me.defending = true; me.endedTurn = true; me.ap = 0; me.actedThisTurn = true;
      log(s, `${me.name} assume posição defensiva.`, { unit: me.id, kind: 'defend' });
      return { ok: true, apSpent: 0 };
    case 'end_turn': me.endedTurn = true; me.actedThisTurn = true; return { ok: true, apSpent: 0 };
    case 'flee': {
      if (tileAt(s, me.x, me.y) !== 'E') return { ok: false, error: 'Você precisa estar em uma saída (E) para fugir.' };
      if (me.ap < 2) return { ok: false, error: 'Fugir custa 2 PA.' };
      me.ap -= 2; me.out = 'fled';
      log(s, `${me.name} escapa do confronto!`, { unit: me.id, kind: 'flee' });
      if (me.characterId) s.effects.push({ type: 'xp', characterId: me.characterId, skill: 'athletics', amount: 4, key: 'flee' });
      return { ok: true, apSpent: 2 };
    }
    case 'door': {
      const d = s.doors[key(a.x, a.y)];
      if (!d || d.broken) return { ok: false, error: 'Não há porta utilizável ali.' };
      if (dist(me, { x: a.x, y: a.y }) !== 1) return { ok: false, error: 'Fique ao lado da porta.' };
      if (!d.open && unitAt(s, a.x, a.y)) return { ok: false, error: 'Há alguém na porta.' };
      if (d.open && unitAt(s, a.x, a.y)) return { ok: false, error: 'Há alguém bloqueando a porta.' };
      if (me.ap < 1) return { ok: false, error: 'PA insuficiente.' };
      me.ap -= 1; me.actedThisTurn = true; d.open = !d.open; setTile(s, a.x, a.y, d.open ? '/' : '+');
      log(s, `${me.name} ${d.open ? 'abre' : 'fecha'} a porta.`, { unit: me.id, kind: 'door', to: { x: a.x, y: a.y } });
      return { ok: true, apSpent: 1 };
    }
    case 'distract': {
      // Arremessa algo para fazer barulho num ponto: infectados que não estão vendo ninguém vão até lá.
      const pt = { x: a.x, y: a.y };
      if (!inBounds(s, pt.x, pt.y) || dist(me, pt) > 7) return { ok: false, error: 'Longe demais para arremessar (máx. 7 casas).' };
      if (!hasLOS(s, me, pt)) return { ok: false, error: 'Sem linha de visão até o ponto.' };
      if (me.ap < 2) return { ok: false, error: 'Distrair custa 2 PA.' };
      me.ap -= 2; me.actedThisTurn = true; me.stamina = Math.max(0, (me.stamina ?? 50) - 3);
      let lured = 0;
      for (const z of s.units) {
        if (z.side !== 'zombie' || z.out || z.hidden || dist(z, pt) > 8) continue;
        const seesSomeone = s.units.some((u) => u.side === 'player' && !u.out && dist(u, z) <= (z.stats?.perception ?? 6) && hasLOS(s, z, u));
        if (seesSomeone && z.behavior !== 'shambler') continue;
        z.aware = true; z.lastKnown = pt; z.targetId = null; (z as any).distractedUntil = s.round + 1; lured++;
      }
      log(s, `${me.name} arremessa um objeto que cai com estrondo${lured ? ` — ${lured} infectado(s) se viram para o barulho` : ''}.`, { unit: me.id, kind: 'distract', to: pt });
      return { ok: true, apSpent: 2 };
    }
    case 'taunt': {
      // Gritar, bater em metal, acenar: puxa a atenção dos infectados próximos para si — os outros podem passar ou fugir.
      if (me.ap < 1) return { ok: false, error: 'Provocar custa 1 PA.' };
      me.ap -= 1; me.actedThisTurn = true; me.sneaking = false; me.stamina = Math.max(0, (me.stamina ?? 50) - 2);
      let n = 0;
      for (const z of s.units) {
        if (z.side !== 'zombie' || z.out || z.hidden) continue;
        if (dist(z, me) > 9 && !hasLOS(s, z, me)) continue;
        if (dist(z, me) > 12) continue;
        z.tauntBy = me.id; z.tauntUntil = s.round + 1; z.aware = true; z.targetId = me.id; z.lastKnown = { x: me.x, y: me.y }; n++;
      }
      s.noise += 4;
      log(s, `${me.name} grita e bate em tudo o que encontra${n ? ` — ${n} infectado(s) se voltam para ${me.name}!` : ', mas nenhum infectado está perto.'}`, { unit: me.id, kind: 'taunt' });
      if (me.characterId && n) s.effects.push({ type: 'xp', characterId: me.characterId, skill: 'athletics', amount: 1, key: 'combat_taunt' });
      return { ok: true, apSpent: 1 };
    }
    case 'sneak': {
      me.sneaking = !me.sneaking;
      log(s, me.sneaking ? `${me.name} se abaixa e passa a se mover em silêncio.` : `${me.name} se levanta.`, { unit: me.id, kind: 'sneak' });
      return { ok: true, apSpent: 0 };
    }
    case 'topple': {
      // Derrubar estante/armário: cria entulho, derruba e machuca infectados no caminho.
      const p0 = { x: a.x, y: a.y };
      if (tileAt(s, p0.x, p0.y) !== 'S') return { ok: false, error: 'Não há estante ou armário ali.' };
      if (dist(me, p0) !== 1) return { ok: false, error: 'Fique ao lado da estante.' };
      if (me.ap < 2) return { ok: false, error: 'Derrubar custa 2 PA.' };
      me.ap -= 2; me.actedThisTurn = true; me.sneaking = false; me.stamina = Math.max(0, (me.stamina ?? 50) - 8);
      const vx = Math.sign(p0.x - me.x), vy = Math.sign(p0.y - me.y);
      setTile(s, p0.x, p0.y, '~');
      const hit: string[] = [];
      for (const step of [1, 2]) {
        const tx = p0.x + vx * step, ty = p0.y + vy * step;
        if (!inBounds(s, tx, ty) || BLOCK_LOS.has(tileAt(s, tx, ty)) && tileAt(s, tx, ty) !== 'S') break;
        const z = s.units.find((u) => !u.out && u.x === tx && u.y === ty);
        if (z && z.side === 'zombie') { z.prone = true; z.body = (z.body ?? 0) - 25; hit.push(z.name); if ((z.body ?? 0) <= 0) { z.out = 'dead'; s.effects.push({ type: 'kill', characterId: me.characterId, zombieType: z.zombieType ?? 'walker' }); } }
        else if (z && z.side === 'player') damagePlayer(s, 'a estante', z, 8, 'bruise', false, false, 'estante derrubada', HIT_WEIGHTS);
        if (step === 1 && tileAt(s, tx, ty) === '.') setTile(s, tx, ty, '~');
      }
      s.noise += 6;
      log(s, `${me.name} derruba a estante com estrondo${hit.length ? `, prensando ${hit.join(' e ')}` : ''}!`, { unit: me.id, kind: 'topple', to: p0 });
      return { ok: true, apSpent: 2 };
    }
    case 'alarm': {
      const p0 = { x: a.x, y: a.y };
      if (tileAt(s, p0.x, p0.y) !== 'A') return { ok: false, error: 'Não há carro ali.' };
      if (dist(me, p0) !== 1) return { ok: false, error: 'Fique ao lado do carro.' };
      if ((s as any).alarmUsed?.[key(p0.x, p0.y)]) return { ok: false, error: 'A bateria desse alarme já morreu.' };
      if (me.ap < 1) return { ok: false, error: 'Disparar o alarme custa 1 PA.' };
      me.ap -= 1; me.actedThisTurn = true;
      (s as any).alarmUsed = { ...((s as any).alarmUsed ?? {}), [key(p0.x, p0.y)]: true };
      s.alarm = { x: p0.x, y: p0.y, until: s.round + 2 };
      lureToAlarm(s);
      s.noise += 8;
      log(s, `${me.name} quebra o vidro do carro e o alarme dispara, ensurdecedor!`, { unit: me.id, kind: 'alarm', to: p0 });
      return { ok: true, apSpent: 1 };
    }
    case 'ignite': {
      const p0 = { x: a.x, y: a.y };
      if (tileAt(s, p0.x, p0.y) !== 'B') return { ok: false, error: 'Não há galão de combustível ali.' };
      if (dist(me, p0) !== 1) return { ok: false, error: 'Fique ao lado do galão.' };
      if (!me.hasLighter) return { ok: false, error: 'Você precisa de um isqueiro.' };
      if ((s.fuses ?? []).some((f) => f.x === p0.x && f.y === p0.y)) return { ok: false, error: 'O pavio já está aceso — saia de perto!' };
      if (me.ap < 2) return { ok: false, error: 'Acender o pavio custa 2 PA.' };
      me.ap -= 2; me.actedThisTurn = true; me.sneaking = false;
      s.fuses = [...(s.fuses ?? []), { x: p0.x, y: p0.y, by: me.id }];
      log(s, `${me.name} enfia um trapo no galão e acende. Vai explodir quando os infectados se moverem — afaste-se!`, { unit: me.id, kind: 'fuse', to: p0 });
      return { ok: true, apSpent: 2 };
    }
    case 'barricade': {
      const d = s.doors[key(a.x, a.y)];
      if (!d || d.broken) return { ok: false, error: 'Não há porta inteira ali.' };
      if (d.open) return { ok: false, error: 'Feche a porta antes de barricar.' };
      if (dist(me, { x: a.x, y: a.y }) !== 1) return { ok: false, error: 'Fique ao lado da porta.' };
      if (d.hp >= 90) return { ok: false, error: 'Não cabe mais nada na frente dessa porta.' };
      if (me.ap < 2) return { ok: false, error: 'Barricar custa 2 PA.' };
      me.ap -= 2; me.actedThisTurn = true; me.stamina = Math.max(0, (me.stamina ?? 50) - 6);
      d.hp = Math.min(90, d.hp + 25);
      log(s, `${me.name} arrasta móveis contra a porta.`, { unit: me.id, kind: 'barricade', to: { x: a.x, y: a.y } });
      if (me.characterId) s.effects.push({ type: 'xp', characterId: me.characterId, skill: 'carpentry', amount: 1, key: 'combat_barricade' });
      return { ok: true, apSpent: 2 };
    }
    default: return { ok: false, error: 'Ação desconhecida.' };
  }
}

/** Alarme tocando: quem não está atracado com alguém vai até o carro. */
export function lureToAlarm(s: CombatState) {
  if (!s.alarm || s.alarm.until < s.round) { s.alarm = null; return 0; }
  let n = 0;
  for (const z of s.units) {
    if (z.side !== 'zombie' || z.out || z.hidden) continue;
    if (s.units.some((u) => u.side === 'player' && !u.out && dist(u, z) <= 1)) continue;
    if (z.tauntBy && (z.tauntUntil ?? 0) >= s.round) continue;
    z.aware = true; z.lastKnown = { x: s.alarm.x, y: s.alarm.y }; z.targetId = null; (z as any).distractedUntil = s.round + 1; n++;
  }
  return n;
}

/** Galões acesos explodem: raio 1 (e 2 com menos dano). Atinge infectados e sobreviventes. */
export function detonateFuses(s: CombatState) {
  const fuses = s.fuses ?? []; s.fuses = [];
  for (const f of fuses) {
    if (tileAt(s, f.x, f.y) !== 'B') continue;
    setTile(s, f.x, f.y, '~');
    const by = s.units.find((u) => u.id === f.by);
    let killed = 0;
    for (const u of s.units) {
      if (u.out === 'dead' || u.out === 'fled') continue;
      const d = dist(u, f); if (d > 2) continue;
      if (u.side === 'zombie') {
        u.body = (u.body ?? 0) - (d <= 1 ? 80 : 30); u.prone = true; u.hidden = false;
        if ((u.body ?? 0) <= 0 && !u.out) { u.out = 'dead'; killed++; s.effects.push({ type: 'kill', characterId: by?.characterId, zombieType: u.zombieType ?? 'walker' }); }
      } else if (u.side === 'player' && !u.out) damagePlayer(s, 'a explosão', u, d <= 1 ? 26 : 12, 'burn', false, false, 'explosão de combustível', HIT_WEIGHTS);
    }
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (tileAt(s, f.x + dx, f.y + dy) === '.') setTile(s, f.x + dx, f.y + dy, '~');
    s.noise += 15;
    log(s, `O galão explode numa bola de fogo!${killed ? ` ${killed} infectado(s) não se levantam mais.` : ''}`, { kind: 'explosion', to: { x: f.x, y: f.y } });
  }
}

/** Arremesso de um objeto do inventário: machuca/derruba quem estiver na casa e faz barulho ali (atrai infectados). */
export function throwObject(s: CombatState, me: Unit, pt: Pos, item: { name: string; weight: number }): ActionResult {
  const range = 5 + Math.floor(((me.attrs?.strength ?? 4) - 4) / 2) + (item.weight < 1 ? 2 : item.weight > 4 ? -2 : 0);
  if (!inBounds(s, pt.x, pt.y) || dist(me, pt) > range) return { ok: false, error: `Longe demais para arremessar ${item.name.toLowerCase()} (máx. ${range} casas).` };
  if (!hasLOS(s, me, pt)) return { ok: false, error: 'Sem linha de visão até lá.' };
  if (me.ap < 1) return { ok: false, error: 'Arremessar custa 1 PA.' };
  me.ap -= 1; me.actedThisTurn = true; me.sneaking = false; me.stamina = Math.max(0, (me.stamina ?? 50) - Math.min(8, 2 + item.weight));
  if (me.load !== undefined) me.load = Math.max(0, me.load - item.weight);
  const t = s.units.find((u) => !u.out && u.x === pt.x && u.y === pt.y && u.side === 'zombie' && !u.hidden);
  let text = `${me.name} arremessa ${item.name.toLowerCase()}`;
  if (t) {
    const hitChance = clamp(0.55 + ((me.attrs?.agility ?? 4) - 4) * 0.05 - dist(me, pt) * 0.03, 0.2, 0.9);
    if (rng.chance(hitChance)) {
      const dmg = Math.round(2 + item.weight * 4);
      t.body = (t.body ?? 0) - dmg;
      if (item.weight >= 2 && rng.chance(Math.min(0.8, item.weight * 0.15))) t.prone = true;
      text += ` e acerta ${t.name}${t.prone ? ', que cai' : ''}`;
      if ((t.body ?? 0) <= 0) { t.out = 'dead'; text += ' — e ele não se levanta mais'; s.effects.push({ type: 'kill', characterId: me.characterId, zombieType: t.zombieType ?? 'walker' }); }
    } else text += `, mas erra ${t.name}`;
  }
  // barulho no ponto de impacto: infectados que não estão atracados com ninguém vão olhar
  let lured = 0;
  for (const z of s.units) {
    if (z.side !== 'zombie' || z.out || z.hidden || dist(z, pt) > 6 || z === t) continue;
    if (s.units.some((u) => u.side === 'player' && !u.out && dist(u, z) <= 1)) continue;
    if (z.tauntBy && (z.tauntUntil ?? 0) >= s.round) continue;
    z.aware = true; z.lastKnown = pt; z.targetId = null; (z as any).distractedUntil = s.round + 1; lured++;
  }
  s.noise += 2;
  log(s, `${text}.${lured ? ` O barulho atrai ${lured} infectado(s) para lá.` : ''}`, { unit: me.id, kind: 'throw', to: pt });
  return { ok: true, apSpent: 1 };
}

function revealLurkers(s: CombatState, near: Unit) {
  for (const z of s.units) if (z.side === 'zombie' && z.hidden && !z.out && dist(z, near) <= 2) {
    z.hidden = false; z.aware = true; z.targetId = near.id;
    log(s, `Um ${z.name.toLowerCase()} se levanta do chão bem ao lado de ${near.name}!`, { unit: z.id, kind: 'reveal' });
  }
}

/** Ataque de jogador contra zumbi ou outro jogador. */
function attack(s: CombatState, me: Unit, targetId: string, aimHead: boolean, cfg: GameConfig): ActionResult {
  const t = s.units.find((x) => x.id === targetId && !x.out);
  if (!t) return { ok: false, error: 'Alvo inválido.' };
  if (t.side === 'player' && !s.pvp) return { ok: false, error: 'Este confronto não permite atacar sobreviventes.' };
  if (t.side === 'player' && t.team === me.team) return { ok: false, error: 'Você não pode atacar um aliado.' };
  if (t.hidden) return { ok: false, error: 'Você não vê esse alvo.' };
  me.sneaking = false;
  const w = me.weapon ?? { itemId: null, defId: 'unarmed', name: 'Mãos nuas', props: { weaponType: 'melee', skill: 'blunt', damage: cfg.combat.unarmedDamage, range: 1, apCost: 2, staminaCost: 4, hitBonus: 0, woundType: 'bruise', noise: 1 }, durability: 1, ammo: 0 };
  const p = w.props; const ranged = p.weaponType === 'ranged';
  if (p.twoHanded && !me.canTwoHanded) return { ok: false, error: 'Seus ferimentos impedem usar uma arma de duas mãos.' };
  const apCost = (p.apCost ?? 2) + (aimHead ? cfg.combat.headshotAimCost : 0);
  if (me.ap < apCost) return { ok: false, error: `Ataque custa ${apCost} PA.` };
  const d = dist(me, t);
  if (d > (p.range ?? 1)) return { ok: false, error: `Fora de alcance (${d} > ${p.range ?? 1}).` };
  if ((ranged || d > 1) && !hasLOS(s, me, t)) return { ok: false, error: 'Sem linha de visão.' };
  if (ranged && w.ammo <= 0) return { ok: false, error: 'Sem munição carregada. Recarregue.' };

  me.ap -= apCost; me.actedThisTurn = true; me.defending = false;
  const stamina = me.stamina ?? 50;
  me.stamina = Math.max(0, stamina - (p.staminaCost ?? 4));
  const tired = stamina < 10;
  const lvl = me.skills?.[p.skill] ?? 0;
  let hit: number;
  if (ranged) {
    hit = cfg.combat.baseRangedHit + (p.hitBonus ?? 0) + lvl * 5 + ((me.attrs?.perception ?? 4) - 4) * 3 + (me.rangedAccBonus ?? 0) - Math.max(0, d - 2) * cfg.combat.rangePenaltyPerTile;
    if (inCover(s, me, t)) hit -= cfg.combat.coverBonus;
    hit *= me.accuracyMult ?? 1;
    w.ammo -= 1; if (w.itemId) s.effects.push({ type: 'ammo', itemId: w.itemId, ammo: w.ammo });
    if (p.ammoType === 'arrow' && me.characterId) s.effects.push({ type: 'arrow', characterId: me.characterId });
    s.shotsFired = (s.shotsFired ?? 0) + 1; s.lastShotSkill = p.skill;
  } else {
    hit = cfg.combat.baseMeleeHit + 10 + (p.hitBonus ?? 0) + lvl * 4 + ((me.attrs?.agility ?? 4) - 4) * 2;
    hit *= me.meleeMult ?? 1;
  }
  if (aimHead) hit -= 12;
  if (tired) hit -= 15;
  if (t.defending) hit -= cfg.combat.defendBonus;
  if (t.prone) hit += 20;
  hit = clamp(hit, 5, 95);

  // Barulho atrai infectados
  const noise = p.noise ?? 1;
  s.noise += noise;
  if (noise >= 5) for (const z of s.units) if (z.side === 'zombie' && !z.out && dist(z, me) <= noise) { z.aware = true; z.lastKnown = { x: me.x, y: me.y }; if (z.hidden) z.hidden = false; }

  // desgaste
  if (w.itemId && rng.chance(ranged ? 0.15 : 0.6)) { w.durability -= 1; s.effects.push({ type: 'durability', itemId: w.itemId, delta: -1 }); }
  if (w.itemId && w.durability <= 0) { log(s, `${w.name} de ${me.name} quebrou!`, { unit: me.id, kind: 'break' }); me.weapon = undefined; }

  const roll = rng.next() * 100;
  if (roll >= hit) {
    log(s, `${me.name} ${ranged ? 'dispara' : 'golpeia'} contra ${t.name} e erra. (${Math.round(hit)}%)`, { unit: me.id, kind: ranged ? 'shot_miss' : 'miss', to: { x: t.x, y: t.y } });
    return { ok: true, apSpent: apCost };
  }
  const strBonus = ranged ? 0 : ((me.attrs?.strength ?? 4) - 4) * 1.5;
  let dmg = (p.damage + strBonus) * (ranged ? 1 : me.meleeMult ?? 1) * rng.range(0.75, 1.25) * (tired ? 0.6 : 1) * (1 + lvl * 0.04);
  if (me.characterId) s.effects.push({ type: 'xp', characterId: me.characterId, skill: p.skill, amount: 3, key: `hit_${t.id}` });

  if (t.side === 'zombie') {
    if (!ranged) dmg *= 1.3; // golpes corpo a corpo derrubam infectados com menos tentativas
    damageZombie(s, me, t, dmg, aimHead, ranged, !!p.knockback);
    if (p.spread) {
      const extra = s.units.find((z) => z.side === 'zombie' && !z.out && z.id !== t.id && dist(z, t) <= 1);
      if (extra) damageZombie(s, me, extra, dmg * 0.5, false, true, false);
    }
  } else {
    damagePlayer(s, me.name, t, dmg, p.woundType ?? 'bruise', ranged, aimHead, me.weapon?.name ?? 'mãos', HIT_WEIGHTS);
  }
  return { ok: true, apSpent: apCost };
}

function damageZombie(s: CombatState, me: Unit, z: Unit, dmg: number, aimHead: boolean, ranged: boolean, knockback: boolean) {
  const r = rng.next();
  const headChance = aimHead ? (ranged ? 0.55 : 0.7) : ranged ? 0.12 : 0.3;
  const region = r < headChance ? 'head' : r < headChance + 0.2 ? 'legs' : 'body';
  const st = z.stats!;
  if (region === 'head' && dmg >= st.headThreshold * rng.range(0.8, 1.2)) {
    z.out = 'dead'; z.body = 0;
    log(s, `${me.name} acerta a cabeça de ${z.name} — ele cai e não se levanta mais.`, { unit: me.id, kind: 'kill', to: { x: z.x, y: z.y } });
    s.effects.push({ type: 'kill', characterId: me.characterId, zombieType: z.zombieType! });
    return;
  }
  z.body = (z.body ?? 0) - dmg * (region === 'head' ? 1.5 : 1);
  if (region === 'legs') { z.legDamage = (z.legDamage ?? 0) + dmg; if (!z.crawling && z.legDamage > (z.maxBody ?? 20) * 0.45) { z.crawling = true; z.maxAp = 1; log(s, `${z.name} tem as pernas destruídas e passa a se arrastar.`, { unit: z.id, kind: 'cripple' }); } }
  if (knockback && z.behavior !== 'brute' && rng.chance(0.45)) z.prone = true;
  if ((z.body ?? 0) <= 0) {
    z.out = 'dead';
    log(s, `${me.name} derruba ${z.name} definitivamente.`, { unit: me.id, kind: 'kill', to: { x: z.x, y: z.y } });
    s.effects.push({ type: 'kill', characterId: me.characterId, zombieType: z.zombieType! });
  } else {
    const where = region === 'head' ? 'na cabeça (de raspão)' : region === 'legs' ? 'nas pernas' : 'no corpo';
    log(s, `${me.name} acerta ${z.name} ${where}${z.prone ? ' e o derruba' : ''}.`, { unit: me.id, kind: ranged ? 'shot_hit' : 'hit', to: { x: z.x, y: z.y } });
  }
}

/** Dano em sobrevivente: gera ferimento por região, considerando proteção da roupa. */
export function damagePlayer(s: CombatState, attackerName: string, t: Unit, dmg: number, woundType: string, ranged: boolean, aimHead: boolean, source: string, weights: Record<Region, number>, zombie?: ZombieStats) {
  if (!t.characterId) return;
  const region = rollRegion(weights, [], aimHead);
  const armor = t.armor?.[region] ?? { p: 0, b: 0 };
  let type = woundType as WoundType;
  let severity = clamp(dmg / 32 * rng.range(0.7, 1.2), 0.05, 1);
  let blocked = false;
  if (zombie) {
    const r = rng.next(); const st = zombie;
    const biteChance = st.biteChance * (t.biteMult ?? 1);
    type = r < st.bluntChance ? (severity > 0.55 ? 'fracture' : 'bruise') : r < st.bluntChance + biteChance ? 'bite' : r < st.bluntChance + biteChance + st.lacerationChance ? 'laceration' : 'scratch';
    severity = clamp(rng.range(0.25, 0.65) * st.damage, 0.1, 1);
  }
  const protection = type === 'gunshot' ? armor.b : armor.p;
  if (type !== 'bruise' && type !== 'fracture' && rng.chance(protection)) {
    blocked = true; type = 'bruise'; severity *= 0.4;
    s.effects.push({ type: 'armor_wear', characterId: t.characterId, region });
  }
  if (type === 'gunshot' && region === 'head' && severity > 0.75) {
    t.out = 'dead';
    log(s, `${attackerName} acerta ${t.name} na cabeça. ${t.name} cai imóvel.`, { unit: t.id, kind: 'death' });
    s.effects.push({ type: 'instant_death', characterId: t.characterId, cause: 'headshot' });
    return;
  }
  const wound = makeWound(type, region, severity, source);
  const infectionRisk = zombie ? (type === 'bite' ? 1 : type === 'laceration' ? 0.5 : type === 'scratch' ? 0.25 : 0) : 0;
  s.effects.push({ type: 'wound', characterId: t.characterId, wound, infectionRisk });
  const label = REGION_NAMES[region].toLowerCase();
  const typeName: Record<string, string> = { bite: 'morde', laceration: 'rasga a carne', scratch: 'arranha', bruise: 'golpeia', fracture: 'esmaga', gunshot: 'atinge com um disparo', cut: 'corta', cut_shallow: 'corta', cut_deep: 'corta fundo', puncture: 'perfura' };
  log(s, blocked ? `${attackerName} atinge ${t.name} (${label}), mas a proteção segura o golpe.` : `${attackerName} ${typeName[type] ?? 'fere'} ${t.name} — ${label}!`, { unit: t.id, kind: blocked ? 'blocked' : type === 'bite' ? 'bite' : 'wound', to: { x: t.x, y: t.y } });
}

// ───────────────────────── Fases ─────────────────────────
export function allPlayersDone(s: CombatState) {
  return activeUnits(s).filter((u) => u.side === 'player' && u.out === null).every((u) => u.endedTurn || u.ap <= 0);
}

/** Regra de inatividade: quem não agiu até o prazo fica em defesa; após N vezes seguidas, foge automaticamente. */
export function applyTimeouts(s: CombatState, cfg: GameConfig) {
  for (const u of s.units) {
    if (u.side !== 'player' || u.out || u.endedTurn) continue;
    if (!u.actedThisTurn) u.timeouts = (u.timeouts ?? 0) + 1; else u.timeouts = 0;
    if ((u.timeouts ?? 0) >= cfg.combat.maxTimeoutsBeforeAutoFlee) u.autoFlee = true;
    u.defending = !u.actedThisTurn || cfg.combat.idleTimeoutAction === 'defend';
    u.endedTurn = true;
    log(s, `${u.name} hesita e se protege (tempo esgotado).`, { unit: u.id, kind: 'timeout' });
  }
}

/** Personagens em fuga automática (desconectados) andam até a saída mais próxima. */
export function runAutoFlee(s: CombatState) {
  for (const u of s.units) {
    if (u.side !== 'player' || u.out || !u.autoFlee) continue;
    if (tileAt(s, u.x, u.y) === 'E') { u.out = 'fled'; log(s, `${u.name} recua até a saída e desaparece.`, { unit: u.id, kind: 'flee' }); continue; }
    (u as any).autoFleeRounds = ((u as any).autoFleeRounds ?? 0) + 1;
    const exit = [...s.exits].sort((a, b) => dist(a, u) - dist(b, u)).find((e) => !unitAt(s, e.x, e.y));
    const path = exit ? findPath(s, u, exit) : null;
    if (!path) {
      // encurralado sem caminho até a saída: depois de algumas rodadas escapa por onde der
      if ((u as any).autoFleeRounds >= 3) { u.out = 'fled'; log(s, `${u.name} se espreme por uma brecha e some.`, { unit: u.id, kind: 'flee' }); }
      continue;
    }
    let ap = u.maxAp; const from = { x: u.x, y: u.y };
    for (const p of path) { const c = stepCost(s, p); if (c > ap) break; ap -= c; u.x = p.x; u.y = p.y; }
    log(s, `${u.name} recua automaticamente.`, { unit: u.id, from, to: { x: u.x, y: u.y }, kind: 'move' });
    if (tileAt(s, u.x, u.y) === 'E') { u.out = 'fled'; log(s, `${u.name} escapa.`, { unit: u.id, kind: 'flee' }); }
  }
}

export function startPlayerPhase(s: CombatState) {
  s.round += 1; s.phase = 'players';
  for (const u of s.units) {
    if (u.side !== 'player' || u.out) continue;
    const overloaded = u.load !== undefined && u.capacity !== undefined && u.load > u.capacity;
    // fôlego volta um pouco a cada rodada (mais para quem segurou a posição), e o cansaço tira no máximo 1 PA
    u.stamina = Math.min(100, (u.stamina ?? 50) + (u.defending ? 20 : 12));
    u.ap = Math.max(2, u.maxAp - ((u.stamina ?? 50) < 15 ? 1 : 0) - (overloaded ? 1 : 0)); u.endedTurn = false; u.actedThisTurn = false; u.defending = false;
  }
}

export function checkEnd(s: CombatState): { ended: boolean; outcome?: string; summary?: string } {
  const players = s.units.filter((u) => u.side === 'player');
  const standing = players.filter((u) => !u.out);
  const zombies = s.units.filter((u) => u.side === 'zombie' && !u.out);
  if (!standing.length) {
    const down = players.filter((u) => u.out === 'down');
    if (zombies.length && down.length) for (const d of down) { d.out = 'dead'; s.effects.push({ type: 'instant_death', characterId: d.characterId!, cause: 'combat' }); log(s, `Os infectados alcançam ${d.name}, indefeso no chão…`, { unit: d.id, kind: 'death' }); }
    const fled = players.some((u) => u.out === 'fled');
    return { ended: true, outcome: fled ? 'escaped' : 'defeat', summary: fled ? 'Os sobreviventes escaparam.' : 'Ninguém ficou de pé.' };
  }
  if (!zombies.length) {
    const teams = new Set(standing.map((u) => u.team));
    if (!s.pvp || teams.size <= 1) return { ended: true, outcome: 'victory', summary: s.pvp ? `Equipe ${[...teams][0]} prevaleceu.` : 'A área está limpa.' };
  }
  return { ended: false };
}
