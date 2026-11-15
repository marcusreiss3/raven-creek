import type { GameConfig } from '../content/defaultConfig.js';
import { ZOMBIE_HIT_WEIGHTS } from '../rules/body.js';
import { clamp, rng } from '../rules/rng.js';
import {
  type CombatState, type Unit, activeUnits, canStep, damagePlayer, detonateFuses, dist, findPath, hasLOS, key, log, lureToAlarm, stepCost, tileAt, unitAt, walkable, inCone, faceTo, DIRS,
} from './engine.js';

/**
 * Fase dos infectados. Cada tipo tem comportamento próprio:
 *  shambler – persegue o alvo visível; sem alvo, vai até o último ponto conhecido ou vagueia.
 *  runner   – sempre investe contra o alvo mais próximo; 4 PA por turno.
 *  brute    – lento; derruba portas rápido; seus golpes arremessam o alvo.
 *  wanderer – metade dos turnos se move de forma errática, mesmo vendo alguém.
 *  lurker   – oculto até alguém chegar perto; primeiro ataque com bônus.
 */
/** Cachorros dos jogadores avançam sobre um infectado perto do dono e podem derrubá-lo. */
function dogsAttack(s: CombatState) {
  for (const p of s.units) {
    if (p.side !== 'player' || p.out || !p.dog) continue;
    const near = s.units.filter((z) => z.side === 'zombie' && !z.out && !z.hidden && !z.prone && dist(z, p) <= 2)
      .sort((a, b) => dist(a, p) - dist(b, p));
    const z = near[0]; if (!z) continue;
    if (!rng.chance(p.dog.chance)) continue;
    z.prone = true; z.body = (z.body ?? 0) - 8; p.dog.bites++;
    if ((z.body ?? 0) <= 0) { z.out = 'dead'; s.effects.push({ type: 'kill', characterId: p.characterId, zombieType: z.zombieType ?? 'walker' }); }
    log(s, `${p.dog.name} avança latindo e derruba ${z.name}${z.out === 'dead' ? ', que não se levanta mais' : ''}!`, { unit: z.id, kind: 'dog' });
  }
}

export function runZombiePhase(s: CombatState, cfg: GameConfig) {
  s.phase = 'zombies';
  detonateFuses(s);
  dogsAttack(s);
  if (s.alarm) { const n = lureToAlarm(s); if (s.alarm) { s.noise += 3; if (n) log(s, `O alarme do carro continua berrando — ${n} infectado(s) seguem o som.`, { kind: 'alarm' }); } }
  const zombies = s.units.filter((u) => u.side === 'zombie' && !u.out);
  for (const z of zombies) {
    if (z.out) continue;
    if (z.hidden) { lurkerCheck(s, z); continue; }
    if (z.prone) { z.prone = false; log(s, `${z.name} se levanta do chão.`, { unit: z.id, kind: 'stand' }); continue; }
    z.ap = z.crawling ? 1 : z.maxAp;
    const taunter = z.tauntBy && (z.tauntUntil ?? 0) >= s.round ? s.units.find((u) => u.id === z.tauntBy && (u.out === null || u.out === 'down')) : undefined;
    const distracted = !taunter && ((z as any).distractedUntil ?? 0) >= s.round && z.lastKnown;
    const target = taunter ?? (distracted && rng.chance(0.7) ? undefined : pickTarget(s, z));
    if (target) { z.targetId = target.id; z.lastKnown = { x: target.x, y: target.y }; z.aware = true; faceTo(z, target); }
    else if (z.targetId && !distracted) { z.targetId = null; log(s, `${z.name} perde você de vista.`, { unit: z.id, kind: 'lost' }); }

    if (z.behavior === 'wanderer' && rng.chance(0.5)) { wander(s, z, 2); continue; }
    if (target) { approachAndAttack(s, z, target, cfg); continue; }
    if (z.aware && z.lastKnown) {
      moveToward(s, z, z.lastKnown, false);
      if (z.x === z.lastKnown.x && z.y === z.lastKnown.y) { z.lastKnown = null; z.aware = z.behavior === 'runner'; }
      continue;
    }
    if (z.behavior !== 'runner' && rng.chance(0.35)) wander(s, z, 1);
    else if (rng.chance(0.3)) z.face = rng.pick(DIRS); // olha em volta
  }
  reinforcements(s, cfg);
}

function lurkerCheck(s: CombatState, z: Unit) {
  const near = activeUnits(s).find((u) => u.side === 'player' && u.out === null && dist(u, z) <= 2);
  if (!near) return;
  z.hidden = false; z.aware = true;
  log(s, `${z.name} se ergue de repente perto de ${near.name}!`, { unit: z.id, kind: 'reveal' });
  if (dist(near, z) <= 1) zombieAttack(s, z, near, 20);
}

function pickTarget(s: CombatState, z: Unit): Unit | undefined {
  const per = (z.stats!.perception) - (s.isNight ? 2 : 0);
  const canSense = (u: Unit) => {
    const d = dist(u, z);
    if (z.targetId === u.id) return d <= per && hasLOS(s, z, u); // já está atrás de você: não perde de vista ao virar
    // só vê o que está dentro do cone de visão (para onde está olhando); colado sempre percebe
    if (!inCone(z, u)) return false;
    if (!u.sneaking || u.out === 'down') return d <= per && hasLOS(s, z, u);
    // furtivo: só é notado bem de perto — e mesmo assim nem sempre
    const stealth = u.skills?.stealth ?? 0;
    const sneakPer = Math.max(1, per - 3 - Math.floor(stealth / 2));
    if (d > sneakPer || !hasLOS(s, z, u)) return false;
    return d > 1 ? rng.chance(0.35 - stealth * 0.03) : rng.chance(0.55 - stealth * 0.04);
  };
  const visible = activeUnits(s).filter((u) => u.side === 'player' && (u.out === null || u.out === 'down') && canSense(u));
  visible.sort((a, b) => dist(a, z) - dist(b, z) + (a.out === 'down' ? -0.5 : 0));
  // Se o alvo atual continua visível, mantém (comportamento consistente)
  const cur = visible.find((u) => u.id === z.targetId);
  return cur ?? visible[0];
}

function approachAndAttack(s: CombatState, z: Unit, t: Unit, cfg: GameConfig) {
  let guard = 6;
  while (z.ap > 0 && guard-- > 0 && !z.out && (t.out === null || t.out === 'down')) {
    if (dist(z, t) <= 1) {
      if (z.ap < 1) break;
      zombieAttack(s, z, t, 0); z.ap = 0; break;
    }
    const moved = moveToward(s, z, t, true, 1);
    if (!moved) break;
  }
}

/** Move até `steps` passos em direção ao destino; contorna unidades; ataca portas fechadas no caminho. */
function moveToward(s: CombatState, z: Unit, to: { x: number; y: number }, adjacent: boolean, steps = 99): boolean {
  const path = findPath(s, z, to, { goalAdjacent: adjacent, allowClosedDoor: true });
  if (!path || !path.length) return sidestep(s, z, to);
  let movedAny = false; const from = { x: z.x, y: z.y };
  for (const p of path.slice(0, steps)) {
    if (tileAt(s, p.x, p.y) === '+') { bashDoor(s, z, p.x, p.y); z.ap = 0; break; }
    const c = stepCost(s, p);
    if (c > z.ap) break;
    if (!canStep(s, z, p)) { if (!sidestep(s, z, to)) break; movedAny = true; z.ap -= 1; continue; }
    faceTo(z, p); z.x = p.x; z.y = p.y; z.ap -= c; movedAny = true;
  }
  if (movedAny) log(s, `${z.name} avança.`, { unit: z.id, from, to: { x: z.x, y: z.y }, kind: 'zmove' });
  return movedAny;
}

/** Contorno simples: tenta um vizinho que reduza a distância quando o caminho está bloqueado por outra unidade. */
function sidestep(s: CombatState, z: Unit, to: { x: number; y: number }) {
  const cur = dist(z, to);
  const opts: { x: number; y: number }[] = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const p = { x: z.x + dx, y: z.y + dy };
    if ((dx || dy) && canStep(s, z, p) && dist(p, to) < cur) opts.push(p);
  }
  if (!opts.length) return false;
  const p = rng.pick(opts); const from = { x: z.x, y: z.y };
  faceTo(z, p); z.x = p.x; z.y = p.y;
  log(s, `${z.name} contorna o obstáculo.`, { unit: z.id, from, to: p, kind: 'zmove' });
  return true;
}

function bashDoor(s: CombatState, z: Unit, x: number, y: number) {
  const d = s.doors[key(x, y)]; if (!d) return;
  d.hp -= z.stats!.doorBash * rng.range(0.7, 1.3);
  if (d.hp <= 0) {
    d.broken = true; d.open = true;
    const r = s.tiles[y]; s.tiles[y] = r.slice(0, x) + '/' + r.slice(x + 1);
    log(s, `${z.name} arrebenta a porta!`, { unit: z.id, kind: 'door_break', to: { x, y } });
  } else log(s, `${z.name} esmurra a porta.`, { unit: z.id, kind: 'door_bash', to: { x, y } });
}

function wander(s: CombatState, z: Unit, steps: number) {
  const from = { x: z.x, y: z.y };
  for (let i = 0; i < steps; i++) {
    const opts: { x: number; y: number }[] = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const p = { x: z.x + dx, y: z.y + dy }; if ((dx || dy) && canStep(s, z, p)) opts.push(p); }
    if (!opts.length) break;
    const p = rng.pick(opts); faceTo(z, p); z.x = p.x; z.y = p.y;
  }
  if (from.x !== z.x || from.y !== z.y) log(s, `${z.name} cambaleia sem rumo.`, { unit: z.id, from, to: { x: z.x, y: z.y }, kind: 'zmove' });
}

function zombieAttack(s: CombatState, z: Unit, t: Unit, bonus: number) {
  const st = z.stats!;
  faceTo(z, t);
  // Grupos são perigosos: cada zumbi extra adjacente ao alvo aumenta a chance
  const crowd = s.units.filter((o) => o.side === 'zombie' && !o.out && o.id !== z.id && dist(o, t) <= 1).length;
  let hit = st.hitChance + bonus + crowd * 6 + (t.out === 'down' ? 40 : 0) - (t.defending ? 20 : 0) - ((t.attrs?.agility ?? 4) - 4) * 2;
  if (z.crawling) hit -= 15;
  hit = clamp(hit, 5, 97);
  if (rng.next() * 100 >= hit) { log(s, `${z.name} tenta agarrar ${t.name}, que se desvencilha.`, { unit: z.id, kind: 'zmiss', to: { x: t.x, y: t.y } }); return; }
  damagePlayer(s, z.name, t, 10, 'scratch', false, false, z.name, ZOMBIE_HIT_WEIGHTS, st);
  if (st.knockback && !t.out) {
    const nx = t.x + Math.sign(t.x - z.x), ny = t.y + Math.sign(t.y - z.y);
    if (walkable(s, nx, ny) && !unitAt(s, nx, ny)) { t.x = nx; t.y = ny; log(s, `${t.name} é arremessado para trás!`, { unit: t.id, kind: 'knockback' }); }
  }
}

/** Barulho acumulado no turno pode trazer novos infectados pelas bordas/pontos de surgimento. */
function reinforcements(s: CombatState, cfg: GameConfig) {
  const chance = cfg.combat.noiseReinforcementChance * Math.min(1, s.noise / 20);
  s.noise = Math.max(0, s.noise * 0.3);
  if (chance <= 0 || !rng.chance(chance)) return;
  (s as any).pendingSpawns = ((s as any).pendingSpawns ?? 0) + rng.int(1, 2);
  log(s, 'O barulho atraiu mais infectados — gemidos se aproximam!', { kind: 'reinforce' });
}
