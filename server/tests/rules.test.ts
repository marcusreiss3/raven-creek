import { describe, expect, it, beforeEach } from 'vitest';
import { defaultGameConfig } from '../src/game/content/defaultConfig.js';
import { createCombat, findPath, hasLOS, canStep, performAction, checkEnd, startPlayerPhase, throwObject, type CombatState } from '../src/game/combat/engine.js';
import { runZombiePhase } from '../src/game/combat/ai.js';
import { makeWound, computeBodyMods } from '../src/game/rules/body.js';
import { simulate } from '../src/game/rules/simulate.js';
import { grantXp, xpForLevel } from '../src/game/rules/progression.js';
import { travelDuration } from '../src/game/rules/travel.js';
import { findCount } from '../src/game/rules/loot.js';
import { setRandomSource, seeded } from '../src/game/rules/rng.js';
import { ZOMBIE_TYPES } from '../src/game/content/zombies.js';

const cfg = structuredClone(defaultGameConfig);
const needs = () => ({ hunger: 10, thirst: 10, sleepiness: 10, stamina: 100, energy: 100, stress: 0, bodyTemp: 37, blood: 100, boredom: 0, vitality: 100 });
const ctx = (over: Partial<Parameters<typeof simulate>[5]> = {}) => ({ cfg, now: Date.now(), online: true, activity: 'idle', inCombat: false, traveling: false, temperature: 20, weather: 'clear', indoor: true, insulation: 0.3, encumbrance: 0.3, profession: 'unemployed', traits: [], endurance: 4, bedBonus: 1, ...over });

beforeEach(() => setRandomSource(seeded(42)));

describe('Combate: tabuleiro', () => {
  const walker = ZOMBIE_TYPES.find((z) => z.id === 'walker')!;
  function arena(): CombatState {
    return createCombat('house', [{ characterId: 1, name: 'A', maxAp: 6, team: 1, stamina: 100, accuracyMult: 1, meleeMult: 1, canTwoHanded: true, skills: {}, attrs: { strength: 5, agility: 5, perception: 5 }, armor: {} }], [], { context: { type: 'location', locationId: 'x' }, isNight: false });
  }
  it('bloqueia diagonais que cortam quinas de parede', () => {
    const s = arena();
    // (4,1) é piso e (5,1) é parede; (4,2) é piso → a diagonal (4,1)->(5,2) cortaria a quina
    expect(s.tiles[1][5]).toBe('#');
    expect(canStep(s, { x: 4, y: 1 }, { x: 5, y: 2 })).toBe(false);
  });
  it('encontra caminho e respeita portas fechadas', () => {
    const s = arena();
    const p = findPath(s, { x: 1, y: 1 }, { x: 7, y: 2 });
    expect(p).toBeNull(); // porta (5,2) fechada
    expect(findPath(s, { x: 1, y: 1 }, { x: 7, y: 2 }, { allowClosedDoor: true })).not.toBeNull();
  });
  it('linha de visão é bloqueada por paredes', () => {
    const s = arena();
    expect(hasLOS(s, { x: 1, y: 1 }, { x: 3, y: 1 })).toBe(true);
    expect(hasLOS(s, { x: 1, y: 1 }, { x: 8, y: 1 })).toBe(false);
  });
  it('movimento consome PA e não permite ir além', () => {
    const s = arena(); const u = s.units[0];
    const far = performAction(s, u.id, { type: 'move', x: 14, y: 9 }, cfg);
    expect(far.ok).toBe(false);
    const near = performAction(s, u.id, { type: 'move', x: 3, y: 1 }, cfg);
    expect(near.ok).toBe(true); expect(u.ap).toBe(4);
  });
  it('zumbis perseguem, atacam e geram ferimentos; fuga encerra o combate', () => {
    const s = createCombat('street', [{ characterId: 9, name: 'P', maxAp: 6, team: 1, stamina: 100, accuracyMult: 1, meleeMult: 1, canTwoHanded: true, skills: {}, attrs: {}, armor: {} }],
      [{ type: 'walker', behavior: 'shambler', stats: walker.stats, name: 'Caminhante' }], { context: { type: 'location', locationId: 'x' }, isNight: false });
    const p = s.units[0]; const z = s.units[1];
    z.x = p.x + 1; z.y = p.y; // adjacente
    for (let i = 0; i < 6; i++) { performAction(s, p.id, { type: 'defend' }, cfg); runZombiePhase(s, cfg); startPlayerPhase(s); }
    expect(s.effects.some((e) => e.type === 'wound')).toBe(true);
    // ir até a saída e fugir
    const exit = s.exits[0]; p.x = exit.x; p.y = exit.y;
    expect(performAction(s, p.id, { type: 'flee' }, cfg).ok).toBe(true);
    expect(checkEnd(s).ended).toBe(true);
  });
  it('emboscada: zumbis surgem perto; dá para fugir mesmo colado num zumbi e sair do alcance pode ser agarrado', () => {
    setRandomSource(() => 0.01); // todas as rolagens "acertam"
    const s = createCombat('street', [{ characterId: 9, name: 'P', maxAp: 4, team: 1, stamina: 100, accuracyMult: 1, meleeMult: 1, canTwoHanded: true, skills: {}, attrs: {}, armor: {} }],
      [{ type: 'walker', behavior: 'shambler', stats: walker.stats, name: 'Caminhante' }], { context: { type: 'location', locationId: 'x' }, isNight: false });
    const p = s.units[0]; const z = s.units[1];
    const d = Math.max(Math.abs(p.x - z.x), Math.abs(p.y - z.y));
    expect(d).toBeGreaterThanOrEqual(2); expect(d).toBeLessThanOrEqual(4);
    const exit = s.exits[0]; p.x = exit.x; p.y = exit.y; z.x = exit.x - 1; z.y = exit.y; z.prone = false;
    expect(performAction(s, p.id, { type: 'flee' }, cfg).ok).toBe(true); // fugir pela saída não é mais barrado
    p.out = null; p.ap = 4;
    p.x = 5; p.y = 4; z.x = 6; z.y = 4;
    const r = performAction(s, p.id, { type: 'move', x: 2, y: 4 }, cfg);
    expect(r.ok).toBe(true);
    expect(p.x).toBe(5); // foi agarrado antes de sair do lugar
    expect(p.ap).toBe(3); // perde 1 PA pelo agarrão, não o turno inteiro
    expect(s.effects.some((e) => e.type === 'wound')).toBe(true);
  });
  it('distração atrai infectados que não estão vendo ninguém', () => {
    const s = createCombat('house', [{ characterId: 9, name: 'P', maxAp: 6, team: 1, stamina: 100, accuracyMult: 1, meleeMult: 1, canTwoHanded: true, skills: {}, attrs: {}, armor: {} }],
      [{ type: 'walker', behavior: 'shambler', stats: walker.stats, name: 'Caminhante' }], { context: { type: 'location', locationId: 'x' }, isNight: false });
    const p = s.units[0]; const z = s.units[1];
    p.x = 1; p.y = 5; z.x = 13; z.y = 9; z.hidden = false;
    const r = performAction(s, p.id, { type: 'distract', x: 7, y: 5 }, cfg);
    expect(r.ok).toBe(true);
    expect(z.lastKnown).toEqual({ x: 7, y: 5 });
  });
  it('acerto forte na cabeça elimina um zumbi comum', () => {
    setRandomSource(() => 0.01); // sempre acerta, sempre cabeça
    const s = createCombat('street', [{ characterId: 9, name: 'P', maxAp: 6, team: 1, stamina: 100, accuracyMult: 1, meleeMult: 1, canTwoHanded: true, skills: {}, attrs: {}, armor: {},
      weapon: { itemId: null, defId: 'fire_axe', name: 'Machado', durability: 50, ammo: 0, props: { weaponType: 'melee', skill: 'blade', damage: 26, range: 1, apCost: 4, staminaCost: 10, hitBonus: 0 } } }],
      [{ type: 'walker', behavior: 'shambler', stats: walker.stats, name: 'Caminhante' }], { context: { type: 'location', locationId: 'x' }, isNight: false });
    const p = s.units[0]; const z = s.units[1]; z.x = p.x + 1; z.y = p.y; z.hidden = false;
    performAction(s, p.id, { type: 'attack', targetId: z.id, aimHead: true }, cfg);
    expect(z.out).toBe('dead');
  });
  it('flecha disparada gera o efeito para cair no chão (dá para recolher)', () => {
    setRandomSource(() => 0.01);
    const s = createCombat('street', [{ characterId: 9, name: 'P', maxAp: 6, team: 1, stamina: 100, accuracyMult: 1, meleeMult: 1, canTwoHanded: true, skills: {}, attrs: {}, armor: {},
      weapon: { itemId: 77, defId: 'hunting_bow', name: 'Arco', durability: 50, ammo: 6, props: { weaponType: 'ranged', skill: 'rifle', damage: 20, range: 9, apCost: 2, staminaCost: 3, hitBonus: 5, ammoType: 'arrow', noise: 1 } } }],
      [{ type: 'walker', behavior: 'shambler', stats: walker.stats, name: 'Caminhante' }], { context: { type: 'location', locationId: 'x' }, isNight: false });
    const p = s.units[0]; const z = s.units[1]; z.x = p.x + 2; z.y = p.y; z.hidden = false;
    expect(performAction(s, p.id, { type: 'attack', targetId: z.id, aimHead: false }, cfg).ok).toBe(true);
    expect(s.effects.some((e) => e.type === 'arrow' && e.characterId === 9)).toBe(true);
    expect(p.weapon!.ammo).toBe(5);
  });
});

describe('Corpo e ferimentos', () => {
  it('sangramento sem tratamento reduz o sangue ao longo do tempo; bandagem reduz', () => {
    const w = makeWound('cut_deep', 'left_arm', 0.8, 'teste');
    const r1 = simulate(needs(), [w], [], [], 30 * 60000, ctx());
    const wb = { ...w, bandaged: true };
    const r2 = simulate(needs(), [wb], [], [], 30 * 60000, ctx());
    expect(r1.needs.blood).toBeLessThan(97);
    expect(r2.needs.blood).toBeGreaterThan(r1.needs.blood);
  });
  it('perna ferida reduz velocidade; braço fraturado impede armas de duas mãos', () => {
    const leg = makeWound('laceration', 'left_leg', 0.9, 't');
    const frac = makeWound('fracture', 'right_arm', 0.7, 't');
    const m = computeBodyMods([leg, frac], [], needs() as any);
    expect(m.moveMult).toBeLessThan(0.9);
    expect(m.canUseTwoHanded).toBe(false);
  });
  it('infecção zumbi evolui por estágios e mata ao fim do prazo', () => {
    const cond = { kind: 'zombie_infection', stage: 0, progress: 0, durationHours: 10, discovered: false, data: { speed: 1 } };
    let r = simulate(needs(), [], [cond], [], 3 * 3_600_000, ctx());
    expect(r.conditions[0].stage).toBeGreaterThanOrEqual(1);
    r = simulate(r.needs, [], r.conditions, [], 8 * 3_600_000, ctx());
    expect(r.death).toBe('zombie_infection');
  });
  it('amputação de membro registra penalidade permanente', () => {
    const m = computeBodyMods([], ['left_arm'], needs() as any);
    expect(m.usableHands).toBe(1); expect(m.canUseTwoHanded).toBe(false);
  });
});

describe('Progressão e anti-farm', () => {
  it('repetir a mesma ação rende cada vez menos XP', () => {
    let skills = {}; let ledger = {}; const gains: number[] = []; const now = Date.now();
    for (let i = 0; i < 5; i++) { const r = grantXp(skills, ledger, 'carpentry', 10, 'same', now + i * 1000, cfg, { profession: 'unemployed', traits: [], intellect: 4 }); skills = r.skills; ledger = r.ledger; gains.push(r.gained); }
    expect(gains[4]).toBeLessThan(gains[0] * 0.3);
  });
  it('livros respeitam nível máximo', () => {
    const r = grantXp({}, {}, 'medicine', 100000, 'book', Date.now(), cfg, { profession: 'unemployed', traits: [], intellect: 4, maxLevelFromSource: 4 });
    expect(r.skills.medicine.xp).toBeLessThanOrEqual(xpForLevel(4, cfg));
  });
  it('locais saqueados rendem menos (retornos decrescentes)', () => {
    let full = 0, empty = 0;
    for (let i = 0; i < 300; i++) {
      full += findCount({ reserveRatio: 1, skillLevel: 0, perception: 4, lightMult: 1, findMult: 1, baseFinds: 1.4, repeatPenalty: 0, minRatio: 0.05 });
      empty += findCount({ reserveRatio: 0.1, skillLevel: 0, perception: 4, lightMult: 1, findMult: 1, baseFinds: 1.4, repeatPenalty: 0, minRatio: 0.05 });
    }
    expect(empty).toBeLessThan(full * 0.5);
  });
  it('ferimentos e sobrecarga aumentam o tempo de viagem', () => {
    const base = { cfg, distance: 1000, roadType: 'asphalt', mode: 'walk' as const, bodyTravelMult: 1, encumbrance: 0.5, stamina: 100, weather: 'clear', phase: 'day', hasLight: true, indoor: false, profession: 'unemployed', traits: [] };
    const healthy = travelDuration(base).durationMs;
    expect(travelDuration({ ...base, bodyTravelMult: 0.6 }).durationMs).toBeGreaterThan(healthy);
    expect(travelDuration({ ...base, encumbrance: 1.4 }).durationMs).toBeGreaterThan(healthy);
  });
});


describe('Combate: táticas contra infectados', () => {
  const walker = ZOMBIE_TYPES.find((z) => z.id === 'walker')!;
  const P = (id: number, name: string, extra: Record<string, unknown> = {}) => ({ characterId: id, name, maxAp: 6, team: 1, stamina: 100, accuracyMult: 1, meleeMult: 1, canTwoHanded: true, skills: {}, attrs: { strength: 5, agility: 5 }, armor: {}, ...extra });
  const Z = () => ({ type: 'walker', behavior: 'shambler', stats: walker.stats, name: 'Caminhante' });
  const two = (map = 'street') => createCombat(map, [P(1, 'Ana'), P(2, 'Beto')], [Z()], { context: { type: 'location', locationId: 'x' }, isNight: false });

  it('um amigo provoca e o outro foge mesmo com o infectado do lado', () => {
    setRandomSource(() => 0.01);
    const s = two(); const [a, b, z] = s.units;
    const exit = s.exits[0];
    b.x = exit.x; b.y = exit.y; z.x = exit.x - 1; z.y = exit.y; z.targetId = b.id; z.aware = true; z.hidden = false;
    a.x = exit.x - 4; a.y = exit.y;
    expect(performAction(s, a.id, { type: 'taunt' }, cfg).ok).toBe(true);
    expect(z.tauntBy).toBe(a.id);
    expect(performAction(s, b.id, { type: 'flee' }, cfg).ok).toBe(true);
    expect(b.out).toBe('fled');
    runZombiePhase(s, cfg);
    expect(Math.max(Math.abs(z.x - a.x), Math.abs(z.y - a.y))).toBeLessThan(4); // foi atrás de quem provocou
  });

  it('furtivo: passa por infectado distraído sem ser agarrado e foge', () => {
    setRandomSource(() => 0.01);
    const s = two(); const [a, , z] = s.units; s.units.splice(1, 1);
    const exit = s.exits[0];
    a.x = exit.x; a.y = exit.y; z.x = exit.x - 1; z.y = exit.y; z.targetId = null; z.aware = false; z.hidden = false;
    expect(performAction(s, a.id, { type: 'sneak' }, cfg).ok).toBe(true);
    expect(performAction(s, a.id, { type: 'flee' }, cfg).ok).toBe(true);
  });

  it('furtivo custa mais PA para andar', () => {
    const s = two(); const [a] = s.units; s.units.splice(1, 2);
    a.x = 5; a.y = 4; a.ap = 6;
    performAction(s, a.id, { type: 'sneak' }, cfg);
    expect(performAction(s, a.id, { type: 'move', x: 9, y: 4 }, cfg).ok).toBe(true); // 4 casas → 6 PA
    expect(a.ap).toBe(0);
  });

  it('derrubar estante prensa o infectado; alarme de carro atrai; galão aceso explode', () => {
    setRandomSource(() => 0.01);
    const s = createCombat('house', [P(1, 'Ana', { hasLighter: true })], [Z()], { context: { type: 'location', locationId: 'x' }, isNight: false });
    const [a, z] = s.units;
    // estante em (3,6) na casa
    expect(s.tiles[6][3]).toBe('S');
    a.x = 2; a.y = 6; z.x = 4; z.y = 6; z.hidden = false; z.prone = false;
    expect(performAction(s, a.id, { type: 'topple', x: 3, y: 6 }, cfg).ok).toBe(true);
    expect(z.prone).toBe(true); expect(s.tiles[6][3]).toBe('~');
    // rua: alarme
    const st = createCombat('street', [P(1, 'Ana')], [Z()], { context: { type: 'location', locationId: 'x' }, isNight: false });
    const [b, z2] = st.units;
    b.x = 4; b.y = 2; z2.x = 13; z2.y = 8; z2.hidden = false; z2.targetId = null;
    expect(st.tiles[1][4]).toBe('A');
    expect(performAction(st, b.id, { type: 'alarm', x: 4, y: 1 }, cfg).ok).toBe(true);
    expect(z2.lastKnown).toEqual({ x: 4, y: 1 });
    expect(performAction(st, b.id, { type: 'alarm', x: 4, y: 1 }, cfg).ok).toBe(false); // bateria acabou
    // galão (9,3) na rua: acende, se afasta e explode na fase dos infectados
    const sx = createCombat('street', [P(1, 'Ana', { hasLighter: true })], [Z()], { context: { type: 'location', locationId: 'x' }, isNight: false });
    const [c, z3] = sx.units;
    expect(sx.tiles[3][9]).toBe('B');
    c.x = 9; c.y = 4; z3.x = 10; z3.y = 3; z3.hidden = false;
    expect(performAction(sx, c.id, { type: 'ignite', x: 9, y: 3 }, cfg).ok).toBe(true);
    c.x = 3; c.y = 7;
    runZombiePhase(sx, cfg);
    expect(z3.out).toBe('dead');
  });

  it('arremessar um item alivia o peso e pode tirar o PA extra de sobrecarga', () => {
    const s = createCombat('street', [P(1, 'Ana', { load: 21, capacity: 20 })], [Z()], { context: { type: 'location', locationId: 'x' }, isNight: false });
    const [a, z] = s.units; z.x = 14; z.y = 10; z.hidden = false;
    startPlayerPhase(s);
    expect(a.ap).toBe(5); // sobrecarregado: −1 PA
    a.x = 5; a.y = 4;
    expect(throwObject(s, a, { x: 8, y: 4 }, { name: 'Tijolo', weight: 2 }).ok).toBe(true);
    expect(a.load).toBe(19);
    startPlayerPhase(s);
    expect(a.ap).toBe(6);
  });
});

describe('Estações e cachorro no combate', () => {
  it('estações giram a cada daysPerSeason dias, a partir do outono', async () => {
    const { seasonOf } = await import('../src/game/rules/clock.js');
    expect(seasonOf(1, cfg).season).toBe('autumn');
    expect(seasonOf(10, cfg)).toMatchObject({ season: 'autumn', dayOfSeason: 10 });
    expect(seasonOf(11, cfg)).toMatchObject({ season: 'winter', dayOfSeason: 1 });
    expect(seasonOf(21, cfg).season).toBe('spring');
    expect(seasonOf(31, cfg).season).toBe('summer');
    expect(seasonOf(41, cfg).season).toBe('autumn');
  });

  it('o cachorro derruba um infectado perto do dono na fase dos infectados', () => {
    setRandomSource(() => 0.01);
    const walker = ZOMBIE_TYPES.find((z) => z.id === 'walker')!;
    const s = createCombat('street', [{ characterId: 1, name: 'Ana', maxAp: 6, team: 1, stamina: 100, accuracyMult: 1, meleeMult: 1, canTwoHanded: true, skills: {}, attrs: { strength: 5, agility: 5 }, armor: {}, dog: { name: 'Rex', chance: 0.35, bites: 0 } }],
      [{ type: 'walker', behavior: 'shambler', stats: walker.stats, name: 'Caminhante' }], { context: { type: 'location', locationId: 'x' }, isNight: false });
    const [a, z] = s.units; z.hidden = false; z.x = a.x + 2; z.y = a.y;
    runZombiePhase(s, cfg);
    expect(a.dog!.bites).toBe(1);
    expect(s.log.some((l) => l.text.includes('Rex'))).toBe(true);
    expect(Math.max(Math.abs(z.x - a.x), Math.abs(z.y - a.y))).toBe(2); // caído, não andou
  });
});

describe('Fuga automática', () => {
  it('desconectado encurralado sem caminho até a saída escapa depois de algumas rodadas (não trava o servidor)', async () => {
    const { runAutoFlee } = await import('../src/game/combat/engine.js');
    const s = createCombat('street', [{ characterId: 1, name: 'Ana', maxAp: 4, team: 1, stamina: 100, accuracyMult: 1, meleeMult: 1, canTwoHanded: true, skills: {}, attrs: {}, armor: {}, autoFlee: true }], [], { context: { type: 'location', locationId: 'x' }, isNight: false });
    const [a] = s.units; s.exits = [];
    runAutoFlee(s); runAutoFlee(s); expect(a.out).toBeNull();
    runAutoFlee(s); expect(a.out).toBe('fled');
  });
});

describe('Vícios', () => {
  it('fumante sem cigarro entra em abstinência (estresse e mira); fumar alivia; quem não fuma não sente nada', async () => {
    const { stepAddiction, smoke, addictionMods } = await import('../src/game/rules/addiction.js');
    const smoker: any = { stress: 10, thirst: 10 }; const clean: any = { stress: 10, thirst: 10 };
    for (let i = 0; i < 8; i++) { stepAddiction(smoker, ['smoker'], 1, cfg); stepAddiction(clean, [], 1, cfg); }
    expect(smoker.nicotine).toBeGreaterThan(50); expect(smoker.stress).toBeGreaterThan(12);
    expect(clean.nicotine ?? 0).toBe(0); expect(clean.stress).toBe(10);
    expect(addictionMods(smoker).accuracy).toBeLessThan(0);
    const body = computeBodyMods([], [], { ...needs(), ...smoker });
    expect(body.notes.some((x: string) => x.includes('nicotina'))).toBe(true);
    smoke(smoker, cfg);
    expect(smoker.nicotine).toBe(0); expect(smoker.nicotineDep).toBeGreaterThanOrEqual(70);
  });

  it('quem fuma ou bebe com frequência acaba viciado; parar por dias desfaz a dependência', async () => {
    const { smoke, drink, isAddicted, stepAddiction } = await import('../src/game/rules/addiction.js');
    const n: any = { stress: 0, thirst: 0 };
    for (let i = 0; i < 7; i++) smoke(n, cfg);
    expect(isAddicted(n.nicotineDep, cfg)).toBe(true);
    for (let i = 0; i < 4; i++) drink(n, 22, cfg);
    expect(n.drunk).toBe(88);
    expect(computeBodyMods([], [], { ...needs(), ...n }).accuracyMult).toBeLessThan(0.75);
    stepAddiction(n, [], 10, cfg);
    expect(n.drunk).toBeLessThan(10);
    for (let d = 0; d < 20; d++) stepAddiction(n, [], 24, cfg);
    expect(isAddicted(n.nicotineDep, cfg)).toBe(false);
  });
});

describe('velhice', () => {
  it('não pesa antes dos 60 e piora a cada faixa', async () => {
    const { ageStageFor, withAgeTrait, charMod } = await import('../src/game/content/character.js');
    expect(ageStageFor(59)).toBeNull();
    expect(withAgeTrait(['smoker'], 45)).toEqual(['smoker']);
    const at = (age: number, key: string, fb = 1) => charMod('unemployed', withAgeTrait([], age), key, fb);
    expect(at(30, 'staminaMax')).toBe(1);
    expect(at(62, 'staminaMax')).toBeCloseTo(0.9);
    expect(at(75, 'staminaMax')).toBeCloseTo(0.8);
    expect(at(85, 'staminaMax')).toBeCloseTo(0.7);
    expect(at(85, 'healing')).toBeLessThan(at(75, 'healing'));
    expect(at(75, 'carryBonus', 0)).toBe(-2);
    expect(at(62, 'rangedAcc', 0)).toBe(0);
  });
  it('troca a faixa antiga pela nova e soma com defeitos', async () => {
    const { withAgeTrait, charMod } = await import('../src/game/content/character.js');
    expect(withAgeTrait(['smoker', 'age_60'], 70)).toEqual(['smoker', 'age_70']);
    expect(charMod('unemployed', ['smoker', 'age_70'], 'staminaMax')).toBeCloseTo(0.72);
  });
});
