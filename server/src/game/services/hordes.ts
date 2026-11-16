/**
 * Hordas migrando: o que cada jogador sabe delas (rádio, binóculo ou só os gemidos), e o que dá para fazer —
 * fugir (viajar), se esconder até ela passar ou atrair a horda com barulho para outro lugar.
 */
import { and, eq } from 'drizzle-orm';
import { db, schema, type Tx } from '../../db/index.js';
import { rng } from '../rules/rng.js';
import { assertCanAct, withCharacter } from './characters.js';
import { systemEmote } from './chat.js';
import { cfg, clock } from './config.js';
import { fail, gameLog } from './infra.js';
import { consumeItem, itemsOf, type CharRow } from './inventory.js';
import { bridgeBlocksHordes } from './projects.js';
import { emitAll, emitToLocation, notify, pushScene, pushSelf } from './realtime.js';
import { connectionsFrom, getLocation } from './world.js';

const H = () => ({ binocularHops: 2, lureCooldownMinutes: 20, hideMinutes: 40, moveEveryMinutes: 30, ...(cfg() as any).hordes });
const fullName = (c: Pick<CharRow, 'firstName' | 'lastName'>) => `${c.firstName} ${c.lastName}`;
const blockedForHordes = () => (bridgeBlocksHordes() ? new Set(['hw_bridge']) : new Set<string>());

/** Distância em trechos a partir de um local (até maxHops), pelas conexões que uma horda consegue usar. */
export function hopsFrom(origin: string, maxHops: number) {
  const dist = new Map<string, number>([[origin, 0]]); let frontier = [origin]; const blocked = blockedForHordes();
  for (let d = 1; d <= maxHops && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) for (const c of connectionsFrom(id)) if (!dist.has(c.other) && !blocked.has(c.other)) { dist.set(c.other, d); next.push(c.other); }
    frontier = next;
  }
  return dist;
}

/** Caminho completo que a horda vai seguir até o alvo (o mesmo cálculo da simulação). */
export function hordePath(from: string, to: string | null) {
  if (!to || from === to) return [] as string[];
  const prev = new Map<string, string>(); const q = [from]; const seen = new Set([from]); const blocked = blockedForHordes();
  while (q.length) {
    const cur = q.shift()!; if (cur === to) break;
    for (const c of connectionsFrom(cur)) if (!seen.has(c.other) && !blocked.has(c.other)) { seen.add(c.other); prev.set(c.other, cur); q.push(c.other); }
  }
  if (!prev.has(to)) return [];
  const path = [to]; let cur = to; while (prev.get(cur) && prev.get(cur) !== from) { cur = prev.get(cur)!; path.unshift(cur); }
  return path;
}

type Source = 'radio' | 'binoculars' | 'heard';
export type HordeIntel = {
  id: number; source: Source; locationId: string; locationName: string; distance: number | null;
  size: number | null; path: string[]; targetName: string | null; nextMoveAt: string; headingHere: boolean; etaMinutes: number | null;
};

/** O que este personagem sabe das hordas ativas. */
export async function hordeIntel(characterId: number, tx: Tx = db): Promise<{ hordes: HordeIntel[]; gear: { radio: boolean; binoculars: boolean } }> {
  const [ch] = await tx.select().from(schema.characters).where(eq(schema.characters.id, characterId));
  if (!ch) fail('Personagem não encontrado.');
  const items = await itemsOf(tx, 'character', ch!.id);
  const radio = items.some((i) => i.defId === 'radio' && (i.durability ?? 1) > 0);
  const binoculars = items.some((i) => i.defId === 'binoculars' && (i.durability ?? 1) > 0);
  const hordes = await tx.select().from(schema.hordes).where(eq(schema.hordes.active, true));
  const here = ch!.locationId;
  const dist = hopsFrom(here, Math.max(H().binocularHops, 1));
  const out: HordeIntel[] = [];
  for (const h of hordes) {
    const d = dist.get(h.locationId) ?? null;
    let source: Source | null = null;
    if (d !== null && d <= H().binocularHops && binoculars) source = 'binoculars';
    else if (radio) source = 'radio';
    else if (d !== null && d <= 1) source = 'heard';
    if (!source) continue;
    const full = hordePath(h.locationId, h.targetLocationId);
    const stepsShown = source === 'radio' ? 6 : source === 'binoculars' ? 3 : 0;
    const path = full.slice(0, stepsShown);
    const idx = full.indexOf(here);
    const headingHere = idx >= 0 && source !== 'heard';
    const step = H().moveEveryMinutes;
    const toNext = Math.max(0, Math.round((new Date(h.nextMoveAt).getTime() - Date.now()) / 60000));
    out.push({
      id: h.id, source, locationId: h.locationId, locationName: getLocation(h.locationId)?.name ?? h.locationId, distance: d,
      size: source === 'heard' ? null : source === 'radio' ? Math.max(5, Math.round(h.size / 5) * 5) : h.size,
      path, targetName: source === 'radio' && h.targetLocationId ? getLocation(h.targetLocationId)?.name ?? null : null,
      nextMoveAt: new Date(h.nextMoveAt).toISOString(), headingHere,
      etaMinutes: headingHere ? toNext + idx * step : null,
    });
  }
  out.sort((a, b) => (a.distance ?? 99) - (b.distance ?? 99));
  return { hordes: out, gear: { radio, binoculars } };
}

/** Avisa os clientes que as hordas mudaram (o mapa e o alerta da cena se atualizam). */
export function broadcastHordes() { emitAll('hordes:update', { at: Date.now() }); }

// ───────────────────────── Esconder-se ─────────────────────────
export async function hideFromHorde(characterId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch);
    const near = await nearestHorde(tx, ch.locationId, 1);
    if (!near) fail('Não há horda por perto. Esconder-se agora só gastaria tempo.');
    const stealth = ch.skills.stealth?.level ?? 0;
    const night = clock().phase === 'night';
    const failChance = Math.max(0.05, 0.25 - stealth * 0.03 - (night ? 0.05 : 0));
    if (rng.chance(failChance)) {
      const { startCombat } = await import('./combat.js');
      await startCombat(tx, { characters: [ch], locationId: ch.locationId, zombieCount: rng.int(1, 3), reason: 'Você derrubou alguma coisa ao procurar onde se esconder. Os da frente da horda ouviram.' });
      await systemEmote(ch.locationId, `${fullName(ch)} tenta se esconder, mas faz barulho — infectados vêm na direção dele!`, 'system');
      return { ok: true, hidden: false };
    }
    const minutes = H().hideMinutes;
    const runAt = new Date(Date.now() + minutes * 60000);
    const [job] = await tx.insert(schema.jobs).values({ kind: 'hide_end', characterId: ch.id, runAt, payload: { locationId: ch.locationId } }).returning();
    await tx.update(schema.characters).set({ state: 'busy', activity: 'idle', busyUntil: runAt, busyAction: { type: 'hide', jobId: job.id, label: 'Escondido, esperando a horda passar', startedAt: Date.now() } }).where(eq(schema.characters.id, ch.id));
    await systemEmote(ch.locationId, `${fullName(ch)} some num canto escuro e prende a respiração.`);
    await gameLog(tx, ch.id, 'event', 'Você se escondeu para a horda passar.');
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true, hidden: true, minutes };
  });
}

/** Sair do esconderijo antes da hora (ou fim do tempo, pelo agendador). */
export async function stopHiding(characterId: number, jobId?: number) {
  return withCharacter(characterId, async (tx, ch) => {
    const a = ch.busyAction as any;
    if (ch.state !== 'busy' || a?.type !== 'hide' || (jobId && a.jobId !== jobId)) return { ok: true, skipped: true };
    await tx.update(schema.characters).set({ state: 'idle', busyUntil: null, busyAction: null }).where(eq(schema.characters.id, ch.id));
    if (!jobId) await tx.update(schema.jobs).set({ status: 'done' }).where(and(eq(schema.jobs.id, a.jobId), eq(schema.jobs.status, 'pending')));
    const still = await nearestHorde(tx, ch.locationId, 0);
    notify(ch.userId, still ? 'Você sai do esconderijo… e a horda ainda está aqui.' : 'Você sai do esconderijo. Silêncio.', still ? 'warn' : 'info', 'hide');
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true };
  });
}

async function nearestHorde(tx: Tx, locationId: string, maxHops: number) {
  const hordes = await tx.select().from(schema.hordes).where(eq(schema.hordes.active, true));
  const dist = hopsFrom(locationId, maxHops);
  return hordes.filter((h) => dist.has(h.locationId)).sort((a, b) => dist.get(a.locationId)! - dist.get(b.locationId)!)[0] ?? null;
}

// ───────────────────────── Atrair com barulho ─────────────────────────
export type LureMethod = 'firecrackers' | 'alarm_clock' | 'horn' | 'shout';
const LURE: Record<LureMethod, { range: number; noiseHere: number; label: string }> = {
  firecrackers: { range: 3, noiseHere: 0.55, label: 'estoura um rojão' },
  alarm_clock: { range: 2, noiseHere: 0, label: 'dá corda num despertador e deixa no chão' },
  horn: { range: 2, noiseHere: 0.4, label: 'mete a mão na buzina' },
  shout: { range: 1, noiseHere: 0.7, label: 'grita e bate num pedaço de metal' },
};
const lastLure = new Map<number, number>();

export async function lureHorde(characterId: number, method: LureMethod) {
  const def = LURE[method]; if (!def) fail('Jeito de fazer barulho desconhecido.');
  const wait = (lastLure.get(characterId) ?? 0) + H().lureCooldownMinutes * 60000 - Date.now();
  if (wait > 0) fail(`Você acabou de fazer barulho. Espere ${Math.ceil(wait / 60000)} min.`);
  const res = await withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch);
    const loc = getLocation(ch.locationId)!;
    const items = await itemsOf(tx, 'character', ch.id);
    if (method === 'firecrackers' || method === 'alarm_clock') {
      const it = items.find((i) => i.defId === method);
      if (!it) fail(method === 'firecrackers' ? 'Você não tem rojão.' : 'Você não tem despertador.');
    }
    if (method === 'horn') {
      if (!ch.vehicleId) fail('Você precisa estar num veículo para buzinar.');
      const [v] = await tx.select().from(schema.vehicles).where(eq(schema.vehicles.id, ch.vehicleId!));
      if (!v || v.battery < 10) fail('A bateria não tem carga nem para a buzina.');
      await tx.update(schema.vehicles).set({ battery: Math.max(0, v.battery - 5) }).where(eq(schema.vehicles.id, v.id));
    }
    const dist = hopsFrom(ch.locationId, def.range);
    const hordes = (await tx.select().from(schema.hordes).where(eq(schema.hordes.active, true))).filter((h) => dist.has(h.locationId));
    if (!hordes.length) fail('Nenhuma horda perto o bastante para ouvir daqui.');
    if (method === 'firecrackers' || method === 'alarm_clock') {
      const it = items.find((i) => i.defId === method)!;
      await consumeItem(tx, it.id, 'character', ch.id, 1);
    }
    // o despertador toca depois: dá tempo de sair dali antes de a horda chegar
    const delay = method === 'alarm_clock' ? 10 : 3;
    for (const h of hordes) {
      const soon = new Date(Math.min(new Date(h.nextMoveAt).getTime(), Date.now() + delay * 60000));
      await tx.update(schema.hordes).set({ targetLocationId: ch.locationId, nextMoveAt: soon }).where(eq(schema.hordes.id, h.id));
    }
    await systemEmote(ch.locationId, `${fullName(ch)} ${def.label}.${method === 'alarm_clock' ? ' Tic, tac, tic…' : ' O barulho ecoa longe.'}`, 'system');
    for (const id of dist.keys()) if (id !== ch.locationId) emitToLocation(id, 'notify', { text: `${method === 'alarm_clock' ? 'Um despertador toca' : 'Um barulho alto'} vindo de ${loc.name}. Se havia horda por perto, ela vai para lá.`, level: 'warn', icon: 'horde', at: Date.now() });
    await gameLog(tx, ch.id, 'event', `Você fez barulho em ${loc.name} e atraiu ${hordes.length} horda(s) para cá.`);
    notify(ch.userId, `${hordes.length > 1 ? `${hordes.length} hordas mudaram` : 'A horda mudou'} de rumo e ${hordes.length > 1 ? 'vêm' : 'vem'} para ${loc.name}. ${method === 'alarm_clock' ? 'Você tem uns minutos antes de o despertador tocar: saia daqui.' : 'Melhor não estar aqui quando chegar.'}`, 'warn', 'horde');
    pushScene(ch.locationId); pushSelf(ch.id);
    return { ok: true, affected: hordes.length, locationId: ch.locationId };
  });
  lastLure.set(characterId, Date.now());
  broadcastHordes();
  if (def.noiseHere > 0) {
    const { zombieNoiseCheck } = await import('./zombies.js');
    await zombieNoiseCheck(res.locationId, characterId, def.noiseHere).catch(() => undefined);
  }
  return { ok: true, affected: res.affected };
}
