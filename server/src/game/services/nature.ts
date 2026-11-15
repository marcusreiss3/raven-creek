import { and, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import { db, schema, type Tx } from '../../db/index.js';
import { SEASON_NAMES, type Season } from '../rules/clock.js';
import { clamp, rng } from '../rules/rng.js';
import { makeWound } from '../rules/body.js';
import { assertCanAct, withCharacter } from './characters.js';
import { systemEmote } from './chat.js';
import { cfg, clock, itemDef } from './config.js';
import { fail, gameLog } from './infra.js';
import { addItem, consumeItem, hasTool, itemsOf, type CharRow } from './inventory.js';
import { emitAll, emitToLocation, isUserOnline, notify, pushScene, pushSelf } from './realtime.js';
import { giveXp } from './survival.js';
import { connectionsFrom, getLocation } from './world.js';

const fullName = (c: CharRow) => `${c.firstName} ${c.lastName}`;
const N = () => ({ fireMaxMinutes: 480, fireWarmth: 16, smokeThreatMultiplier: 1.5, huntMinutes: 30, huntEnergy: 18, fishMinutes: 20, fishEnergy: 10, ...((cfg() as any).nature ?? {}) });
const S = () => (cfg() as any).seasons ?? {};
export const season = (): Season => (clock() as any).season ?? 'autumn';
const seasonMult = (key: string) => Number(S()[key]?.[season()] ?? 1);
export const cropMultiplier = () => seasonMult('cropMultiplier');

// ───────────────────────── Fogueiras ─────────────────────────
/** Locais onde dá para acender fogo: ao ar livre, ou em cabanas e casas de fazenda (lareira/fogão a lenha). */
const FIRE_INDOOR_OK = new Set(['cabin', 'farm', 'camp']);
export function canHaveFire(locationId: string) {
  const l = getLocation(locationId); if (!l) return false;
  return !l.indoor || FIRE_INDOOR_OK.has(l.category);
}

let fireCache = new Map<string, Date>();
export async function loadFires() {
  const rows = await db.select().from(schema.campfires).where(gt(schema.campfires.fuelUntil, new Date()));
  fireCache = new Map(rows.map((r) => [r.locationId, r.fuelUntil]));
}
export const fireLit = (locationId: string) => (fireCache.get(locationId)?.getTime() ?? 0) > Date.now();
export const fireMinutesLeft = (locationId: string) => Math.max(0, Math.round(((fireCache.get(locationId)?.getTime() ?? 0) - Date.now()) / 60000));
/** Calor da fogueira (°C a mais) para quem está no local. */
export const fireWarmth = (locationId: string) => (fireLit(locationId) ? N().fireWarmth : 0);
/** Fumaça: quem está perto de uma fogueira é achado com mais facilidade. */
export const smokeMultiplier = (locationId: string) => (fireLit(locationId) && !getLocation(locationId)?.indoor ? N().smokeThreatMultiplier : 1);
/** Nomes de locais vizinhos com fogueira acesa (a fumaça é vista de longe). */
export function smokeNearby(locationId: string) {
  return connectionsFrom(locationId).map((c) => c.other).filter((id) => fireLit(id) && !getLocation(id)?.indoor).map((id) => getLocation(id)?.name ?? id);
}

function fuelOf(defId: string) { return Number(itemDef(defId)?.props?.fuelMinutes ?? 0); }

export async function lightFire(characterId: number, fuelItemId: number) {
  const r = await withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: true });
    if (!canHaveFire(ch.locationId)) fail('Aqui dentro não dá para acender fogo com segurança. Procure um lugar aberto, uma cabana ou uma casa de fazenda.');
    const items = await itemsOf(tx, 'character', ch.id);
    const [cur] = await tx.select().from(schema.campfires).where(eq(schema.campfires.locationId, ch.locationId)).for('update');
    const burning = !!cur && cur.fuelUntil > new Date();
    if (!burning && !hasTool(items, 'fire')) fail('Você precisa de um isqueiro ou fósforos.');
    const it = items.find((i) => i.id === fuelItemId);
    if (!it || fuelOf(it.defId) <= 0) fail('Escolha algo que queime: lenha, tora, tábua…');
    const w = clock().weather;
    if (!burning && !getLocation(ch.locationId)!.indoor && w === 'storm' && rng.chance(0.6)) {
      // a transação é desfeita pelo erro: o combustível não se perde, só a tentativa
      fail('O vento e a chuva apagam a chama antes de pegar. Tente de novo ou espere a tempestade passar.');
    }
    const base = cur && cur.fuelUntil > new Date() ? cur.fuelUntil.getTime() : Date.now();
    const until = new Date(Math.min(Date.now() + N().fireMaxMinutes * 60000, base + fuelOf(it!.defId) * 60000));
    await consumeItem(tx, it!.id, 'character', ch.id, 1);
    if (cur) await tx.update(schema.campfires).set({ fuelUntil: until, ...(cur.fuelUntil <= new Date() ? { litBy: ch.id, litAt: new Date() } : {}) }).where(eq(schema.campfires.locationId, ch.locationId));
    else await tx.insert(schema.campfires).values({ locationId: ch.locationId, fuelUntil: until, litBy: ch.id });
    const wasLit = !!cur && cur.fuelUntil > new Date();
    await systemEmote(ch.locationId, wasLit ? `${fullName(ch)} alimenta a fogueira com ${itemDef(it!.defId)?.name.toLowerCase()}.` : `${fullName(ch)} acende uma fogueira. O calor se espalha — e a fumaça sobe.`);
    await giveXp(tx, ch, 'survival', wasLit ? 1 : 3, 'fire');
    return { ok: true, wasLit, minutes: Math.round((until.getTime() - Date.now()) / 60000), locationId: ch.locationId };
  });
  await loadFires();
  if (!r.wasLit && !getLocation(r.locationId)?.indoor) {
    const name = getLocation(r.locationId)?.name;
    for (const c of connectionsFrom(r.locationId)) emitToLocation(c.other, 'notify', { text: `Uma coluna de fumaça sobe na direção de ${name}.`, level: 'info', at: Date.now() });
  }
  pushScene(r.locationId); for (const c of connectionsFrom(r.locationId)) pushScene(c.other);
  return r;
}

export async function putOutFire(characterId: number) {
  const r = await withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: true });
    const [cur] = await tx.select().from(schema.campfires).where(eq(schema.campfires.locationId, ch.locationId));
    if (!cur || cur.fuelUntil <= new Date()) fail('Não há fogueira acesa aqui.');
    await tx.delete(schema.campfires).where(eq(schema.campfires.locationId, ch.locationId));
    await systemEmote(ch.locationId, `${fullName(ch)} abafa a fogueira com terra.`);
    return { ok: true, locationId: ch.locationId };
  });
  await loadFires(); pushScene(r.locationId); for (const c of connectionsFrom(r.locationId)) pushScene(c.other);
  return r;
}

/** Fogueiras sem combustível se apagam. */
export async function processFires() {
  const now = Date.now();
  if (![...fireCache.values()].some((d) => d.getTime() <= now)) return;
  const dead = await db.select().from(schema.campfires).where(lte(schema.campfires.fuelUntil, new Date()));
  for (const f of dead) {
    await db.delete(schema.campfires).where(eq(schema.campfires.locationId, f.locationId));
    await systemEmote(f.locationId, 'A fogueira se apaga, restando só brasas.');
    pushScene(f.locationId); for (const c of connectionsFrom(f.locationId)) pushScene(c.other);
  }
  if (dead.length) await loadFires();
}

// ───────────────────────── Caça e pesca ─────────────────────────
const HUNT_CATEGORIES = new Set(['forest', 'camp', 'field']);
const FISH_LOCATIONS = (id: string) => getLocation(id)?.category === 'lake' || id === 'hw_bridge';
export const canHunt = (locationId: string) => HUNT_CATEGORIES.has(getLocation(locationId)?.category ?? '') && !getLocation(locationId)?.indoor;
export const canFish = (locationId: string) => FISH_LOCATIONS(locationId);

async function startOutdoorJob(characterId: number, kind: 'hunt' | 'fish') {
  const n = N();
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch);
    if (kind === 'hunt' && !canHunt(ch.locationId)) fail('Não há caça por aqui. Tente na floresta, num acampamento ou nos campos.');
    if (kind === 'fish' && !canFish(ch.locationId)) fail('Só dá para pescar em lagos, riachos ou da ponte.');
    const items = await itemsOf(tx, 'character', ch.id);
    const weapon = items.find((i) => i.slot === 'primary'); const wd = weapon ? itemDef(weapon.defId) : null;
    if (kind === 'hunt') {
      const ok = wd && (wd.props.weaponType === 'ranged' || wd.id === 'spear' || wd.props.skill === 'blade');
      if (!ok) fail('Equipe uma arma para caçar: espingarda, rifle, pistola, lança ou faca.');
      if (wd!.props.weaponType === 'ranged' && Number(weapon!.data.ammo ?? 0) < 1) fail('Sua arma está sem munição carregada.');
    } else if (!hasTool(items, 'fishing')) fail('Você precisa de uma vara de pescar (dá para improvisar com tábua, corda e prego).');
    const energy = kind === 'hunt' ? n.huntEnergy : n.fishEnergy;
    if (ch.needs.energy < energy) fail('Energia insuficiente.', 'no_energy');
    const minutes = kind === 'hunt' ? n.huntMinutes : n.fishMinutes;
    const runAt = new Date(Date.now() + minutes * 60000);
    const [job] = await tx.insert(schema.jobs).values({ kind: `${kind}_complete`, characterId: ch.id, runAt, payload: {} }).returning();
    await tx.update(schema.characters).set({
      state: 'busy', activity: 'idle', busyUntil: runAt,
      busyAction: { type: kind, jobId: job.id, label: kind === 'hunt' ? 'Caçando' : 'Pescando', startedAt: Date.now() },
      needs: { ...ch.needs, energy: ch.needs.energy - energy, stamina: clamp(ch.needs.stamina - (kind === 'hunt' ? 12 : 4), 0, 100) },
    }).where(eq(schema.characters.id, ch.id));
    await systemEmote(ch.locationId, kind === 'hunt' ? `${fullName(ch)} some entre as árvores, atrás de rastros.` : `${fullName(ch)} joga a linha na água e espera.`);
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true, minutes };
  });
}
export const startHunt = (id: number) => startOutdoorJob(id, 'hunt');
export const startFish = (id: number) => startOutdoorJob(id, 'fish');

export async function completeOutdoorJob(jobId: number, characterId: number, kind: 'hunt' | 'fish', dogBonus = 0) {
  let noisyAt: string | null = null; let hunterRow: CharRow | null = null;
  const res = await withCharacter(characterId, async (tx, ch) => {
    if (ch.state !== 'busy' || (ch.busyAction as any)?.jobId !== jobId) return { skipped: true };
    await tx.update(schema.characters).set({ state: 'idle', busyUntil: null, busyAction: null }).where(eq(schema.characters.id, ch.id));
    const items = await itemsOf(tx, 'character', ch.id);
    const surv = ch.skills.survival?.level ?? 0; const night = clock().phase === 'night';
    let msg = '';
    if (kind === 'hunt') {
      const weapon = items.find((i) => i.slot === 'primary'); const wd = weapon ? itemDef(weapon.defId) : null;
      const ranged = wd?.props.weaponType === 'ranged';
      const rifle = wd?.id === 'hunting_rifle';
      const bow = wd?.props.ammoType === 'arrow';
      const chance = clamp((0.3 + surv * 0.05 + (rifle ? 0.25 : bow ? 0.2 : ranged ? 0.12 : 0) + dogBonus) * seasonMult('huntMultiplier') * (night ? 0.7 : 1), 0.05, 0.9);
      if (ranged && weapon) {
        const ammo = Number(weapon.data.ammo ?? 0);
        // arco: silencioso, e a flecha quase sempre volta
        const spent = bow ? (rng.chance(0.3) ? 1 : 0) : 1;
        if (spent) await tx.update(schema.items).set({ data: { ...weapon.data, ammo: Math.max(0, ammo - 1) } }).where(eq(schema.items.id, weapon.id));
        if (!bow) noisyAt = ch.locationId;
      }
      if (rng.chance(chance)) {
        const big = rng.chance(rifle ? 0.55 : 0.3);
        const qty = big ? rng.int(3, 5) : rng.int(1, 2);
        await addItem(tx, 'character', ch.id, 'raw_meat', qty);
        msg = big ? `Você abate um cervo e volta com ${qty} porções de carne crua.` : `Você pega ${qty === 1 ? 'um coelho' : 'dois coelhos'}: ${qty} porção(ões) de carne crua.`;
        await giveXp(tx, ch, 'survival', big ? 14 : 8, 'hunt');
        if (wd) await giveXp(tx, ch, String(wd.props.skill ?? 'rifle'), 4, 'hunt_weapon');
      } else msg = rng.chance(0.15) ? 'Um javali investe contra você antes de fugir!' : 'Horas de espera e nenhum animal. A floresta está quieta demais.';
      if (msg.startsWith('Um javali')) await tx.insert(schema.wounds).values({ characterId: ch.id, ...makeWound('laceration', rng.pick(['left_leg', 'right_leg']), rng.range(0.2, 0.45), 'javali') });
    } else {
      const rod = items.find((i) => itemDef(i.defId)?.props.fishing);
      const rain = ['rain', 'cloudy'].includes(clock().weather);
      const chance = clamp((0.4 + surv * 0.04 + (rain ? 0.1 : 0)) * seasonMult('fishMultiplier'), 0.05, 0.9);
      if (rod) { if (rod.durability <= 1) await tx.delete(schema.items).where(eq(schema.items.id, rod.id)); else await tx.update(schema.items).set({ durability: rod.durability - 1 }).where(eq(schema.items.id, rod.id)); }
      if (rng.chance(chance)) {
        const qty = rng.chance(0.25) ? 2 : 1;
        await addItem(tx, 'character', ch.id, 'raw_fish', qty);
        msg = qty > 1 ? 'Dois peixes! A água hoje está generosa.' : 'Um peixe morde a isca. Você o puxa para a margem.';
        await giveXp(tx, ch, 'survival', 6, 'fish');
      } else msg = season() === 'winter' ? 'A água gelada não ajuda. Nenhum peixe hoje.' : 'Nem uma beliscada. Os peixes não quiseram conversa.';
    }
    await gameLog(tx, ch.id, 'explore', msg);
    notify(ch.userId, msg, msg.includes('javali') ? 'danger' : msg.match(/peixe|carne|coelho/) ? 'success' : 'info');
    await systemEmote(ch.locationId, kind === 'hunt' ? `${fullName(ch)} volta da caçada.` : `${fullName(ch)} recolhe a linha.`);
    pushSelf(ch.id); pushScene(ch.locationId);
    hunterRow = ch;
    return { ok: true, msg };
  });
  // tiro na floresta atrai infectados
  if (noisyAt && hunterRow) {
    const { zombieNoiseCheck } = await import('./zombies.js');
    await zombieNoiseCheck(noisyAt, characterId, 0.18).catch(() => undefined);
  }
  return res;
}

// ───────────────────────── Comida estragando ─────────────────────────
/** Itens perecíveis viram comida estragada depois de `perishHours` (mais rápido no verão, bem devagar no inverno). */
export async function processSpoilage() {
  const perishable = [...new Set(((await db.select({ id: schema.itemDefs.id, props: schema.itemDefs.props }).from(schema.itemDefs)) as { id: string; props: any }[])
    .filter((d) => Number(d.props?.perishHours ?? 0) > 0).map((d) => d.id))];
  if (!perishable.length) return;
  const mult = Math.max(0.05, seasonMult('spoilMultiplier'));
  const rows = await db.select().from(schema.items).where(inArray(schema.items.defId, perishable));
  const now = Date.now(); const touched = new Set<string>();
  for (const it of rows) {
    const hours = Number(itemDef(it.defId)?.props.perishHours ?? 0);
    // idade "efetiva": acumula conforme a estação (guardada no item)
    const last = Number(it.data.ageAt ?? it.createdAt.getTime());
    const age = Number(it.data.age ?? 0) + ((now - last) / 3_600_000) * mult;
    if (age >= hours) {
      await db.transaction(async (tx) => {
        await tx.delete(schema.items).where(eq(schema.items.id, it.id));
        await addItem(tx, it.ownerType, it.ownerId, 'spoiled_food', it.quantity);
      });
      touched.add(`${it.ownerType}:${it.ownerId}`);
    } else await db.update(schema.items).set({ data: { ...it.data, age, ageAt: now } }).where(eq(schema.items.id, it.id));
  }
  for (const k of touched) { const [t, id] = k.split(':'); if (t === 'character') pushSelf(Number(id)); if (t === 'location') pushScene(id); }
}

// ───────────────────────── Estações ─────────────────────────
let lastSeason: string | null = null;
const SEASON_TEXT: Record<Season, string> = {
  spring: 'A primavera chegou a Raven Creek. O degelo traz chuva — e as plantações voltam a crescer.',
  summer: 'O verão chegou. Dias quentes: a comida estraga rápido e a sede aperta.',
  autumn: 'O outono chegou. As noites esfriam; é hora de estocar comida e lenha.',
  winter: 'O inverno chegou. Frio cortante, neve, plantações paradas: roupa quente e fogueira viram questão de vida.',
};
export async function processSeasonChange() {
  const s = season();
  if (lastSeason && lastSeason !== s) emitAll('notify', { text: SEASON_TEXT[s as Season], level: 'warn', icon: s, at: Date.now() });
  lastSeason = s;
}
export { SEASON_NAMES, isUserOnline, sql, and };
