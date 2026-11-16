import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { parseCookie } from 'cookie';
import { and, eq, inArray, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { env } from '../config/env.js';
import { COOKIE, userFromToken, type AuthUser } from '../http/auth.js';
import { activeCharacter, buildSelfState, conditionsOf, withTwoCharacters, woundsOf } from '../game/services/characters.js';
import { describeAppearance } from '../game/rules/appearance.js';
import { GameError, gameLog } from '../game/services/infra.js';
import { emitToLocation, emitToRoom, emitToUser, flushNow, isUserOnline, notify, pushScene, pushSelf, registerBuilders, setIO, trackConnect, trackDisconnect } from '../game/services/realtime.js';
import { nearbyGroupIds } from '../game/services/roads.js';
import { isPaused, playBlock } from '../game/services/serverStatus.js';
import { installServerControl } from '../game/services/serverControl.js';
import '../game/services/prologueControl.js';
import { isPrologueMember, phoneSend, familyReply, socialLike, socialComment, prologueLeave, prologueFreeIdle, phoneState, prologueVote, setLight } from '../game/services/prologue.js';
import { buildScene, getLocation } from '../game/services/world.js';
import { localHistory, onRetune, privateHistory, sendChat } from '../game/services/chat.js';
import * as survival from '../game/services/survival.js';
import { startExplore } from '../game/services/explore.js';
import { decideEncounter, follow, joinTravel, previewTravel, startTravel, togglePause, turnBack } from '../game/services/travel.js';
import { attackCharacter, combatAction, getCombatView, joinCombat } from '../game/services/combat.js';
import * as bases from '../game/services/bases.js';
import * as vehicles from '../game/services/vehicles.js';
import { itemsOf, transferItem, describeItem } from '../game/services/inventory.js';
import { itemDef } from '../game/services/config.js';
import { systemEmote } from '../game/services/chat.js';
import * as nature from '../game/services/nature.js';
import * as dogs from '../game/services/dogs.js';
import * as stories from '../game/services/stories.js';
import * as hordes from '../game/services/hordes.js';
import * as risen from '../game/services/risen.js';
import { deliverMaterials, listProjects, startClaimPower, startProjectWork, togglePower } from '../game/services/projects.js';

const id = z.number().int().positive();
/** Todas as ações aceitas do cliente, validadas por esquema. O servidor decide os resultados. */
const actionSchemas = {
  explore: z.object({}), rest: z.object({}), sleep: z.object({}), wake: z.object({}),
  travel: z.object({ toId: z.string(), vehicle: z.boolean().optional(), run: z.boolean().optional() }), travel_preview: z.object({ toId: z.string() }),
  travel_decide: z.object({ choice: z.enum(['fight', 'sneak', 'retreat', 'detour']) }), travel_pause: z.object({ pause: z.boolean().optional() }), travel_back: z.object({}), travel_join: z.object({ targetId: id }),
  projects_list: z.object({}).optional(), project_deliver: z.object({ projectId: z.string(), itemId: z.string().optional() }), project_work: z.object({ projectId: z.string() }),
  project_claim: z.object({}).optional(), project_power: z.object({ on: z.boolean() }),
  fire_light: z.object({ itemId: id }), fire_out: z.object({}).optional(), hunt: z.object({}).optional(), fish: z.object({}).optional(),
  mysteries_list: z.object({}).optional(), horde_intel: z.object({}).optional(), horde_hide: z.object({}).optional(), horde_stop_hide: z.object({}).optional(),
  horde_lure: z.object({ method: z.enum(['firecrackers', 'alarm_clock', 'horn', 'shout']) }), safe_open: z.object({ mysteryId: z.string(), code: z.string().max(12) }),
  mural_list: z.object({}).optional(), mural_post: z.object({ content: z.string().min(1).max(600) }), mural_delete: z.object({ postId: id }),
  corpse_destroy: z.object({ containerId: id }), risen_fight: z.object({ risenId: id }),
  dog_tame: z.object({ dogId: id, itemId: id }), dog_feed: z.object({ itemId: id }), dog_treat: z.object({ itemId: id }), dog_scavenge: z.object({}).optional(), dog_pet: z.object({}).optional(), dog_rename: z.object({ name: z.string().min(2).max(20) }), dog_release: z.object({}).optional(), follow: z.object({ targetId: id.nullable() }),
  pickup: z.object({ itemId: id, qty: z.number().int().positive().optional() }), drop: z.object({ itemId: id, qty: z.number().int().positive().optional() }),
  give: z.object({ targetId: id, itemId: id, qty: z.number().int().positive().optional() }), equip: z.object({ itemId: id, slot: z.string().optional() }),
  unequip: z.object({ itemId: id }), use: z.object({ itemId: id }), repair_item: z.object({ itemId: id }), tear: z.object({ itemId: id }), dismantle: z.object({ itemId: id }), reload: z.object({}), unload: z.object({ itemId: id }),
  treat: z.object({ targetId: id, woundId: id.nullable().optional(), itemId: id }), diagnose: z.object({ targetId: id }), patient_sheet: z.object({ targetId: id }),
  amputate: z.object({ targetId: id, region: z.string() }), amputation_request: z.object({ targetId: id, region: z.string() }), amputation_consent: z.object({ actorId: id, region: z.string() }),
  container_open: z.object({ containerId: id }), store: z.object({ itemId: id, containerId: id, qty: z.number().int().positive().optional() }),
  take: z.object({ itemId: id, containerId: id, qty: z.number().int().positive().optional() }),
  combat: z.object({ action: z.any() }), combat_join: z.object({ combatId: id, sideCharacterId: id.optional() }), combat_view: z.object({ combatId: id }),
  attack_character: z.object({ targetId: id }), search_body: z.object({ targetId: id }), steal: z.object({ targetId: id, itemId: id }),
  craft: z.object({ recipeId: z.string() }), claim_base: z.object({ name: z.string().max(40) }), build: z.object({ kind: z.string() }),
  repair: z.object({ structureId: id }), fuel_generator: z.object({ structureId: id, itemId: id }),
  faction_create: z.object({ name: z.string(), emblem: z.string().max(20).default('banner'), color: z.string().default('#b45309') }), faction_invite: z.object({ targetId: id }),
  faction_answer: z.object({ factionId: id, accept: z.boolean() }), faction_leave: z.object({}), faction_rank: z.object({ targetId: id, rank: z.string() }),
  faction_info: z.object({}), base_to_faction: z.object({ baseId: id }),
  vehicle_enter: z.object({ vehicleId: id }), vehicle_exit: z.object({}), vehicle_start: z.object({ approach: z.enum(['careful', 'normal', 'risky']).optional() }),
  vehicle_stop: z.object({}), vehicle_service: z.object({ vehicleId: id, itemId: id }), vehicle_inspect: z.object({ vehicleId: id }),
  block_user: z.object({ userId: id }), unblock_user: z.object({ userId: id }), blocked_list: z.object({}).optional(), report: z.object({ userId: id, messageId: id.optional(), reason: z.string().min(3).max(500) }),
  set_frequency: z.object({ frequency: z.number().min(88).max(108).nullable() }), look: z.object({ characterId: id }), tutorial: z.object({ step: z.number().int().min(0).max(50) }),
  // Dia 1 (celular)
  prologue_state: z.object({}), prologue_vote: z.object({ askId: z.string().max(120), optionId: z.string().max(60) }), prologue_light: z.object({ on: z.boolean() }),
  prologue_send: z.object({ to: z.union([id, z.literal('grupo')]), text: z.string().min(1).max(400) }),
  prologue_reply: z.object({ eventId: id, idx: z.number().int().min(0).max(5) }),
  prologue_like: z.object({ postKey: z.string().min(1).max(120) }),
  prologue_leave: z.object({}),
  prologue_comment: z.object({ postKey: z.string().min(1).max(120), text: z.string().min(1).max(240) }),
} as const;
type ActionType = keyof typeof actionSchemas;

const buckets = new Map<number, number[]>();
function actionRateLimit(userId: number) {
  const now = Date.now(); const b = (buckets.get(userId) ?? []).filter((t) => t > now - 5000);
  if (b.length >= 20) throw new GameError('Ações rápidas demais. Aguarde um instante.', 'rate_limited');
  b.push(now); buckets.set(userId, b);
}

async function dispatch(user: AuthUser, type: ActionType, payload: any) {
  const ch = await activeCharacter(user.id);
  if (!ch) throw new GameError('Crie um personagem.');
  const c = ch.id; const p = payload;
  // Dia 1: as ações do mundo ficam travadas; tudo acontece pelo celular, pelo chat do local e pelos combates.
  // Parar de seguir alguém nunca fica travado (senão quem ficou para trás não consegue mais andar).
  const unfollow = type === 'follow' && !p?.targetId;
  if (isPrologueMember(c) && !unfollow && !PROLOGUE_ALLOWED.has(type) && !(FREE_ALLOWED.has(type) && (await prologueFreeIdle(c)))) {
    throw new GameError(FREE_ALLOWED.has(type) ? 'Agora não: termine o que está acontecendo (ou saia do trabalho para andar pelo mapa).' : 'No Dia 1, suas escolhas acontecem pelo celular.', 'prologue');
  }
  switch (type) {
    case 'prologue_state': return { ok: true, phone: await phoneState(c) };
    case 'prologue_vote': try { return await prologueVote(c, p.askId, p.optionId); } catch (e: any) { throw new GameError(e.message); }
    case 'prologue_light': try { return { ok: true, ...(await setLight(c, p.on)) }; } catch (e: any) { throw new GameError(e.message); }
    case 'prologue_send': try { return await phoneSend(c, p.to, p.text); } catch (e: any) { throw new GameError(e.message); }
    case 'prologue_reply': try { return await familyReply(c, p.eventId, p.idx); } catch (e: any) { throw new GameError(e.message); }
    case 'prologue_leave': try { return await prologueLeave(c); } catch (e: any) { throw new GameError(e.message); }
    case 'prologue_like': try { return await socialLike(c, p.postKey); } catch (e: any) { throw new GameError(e.message); }
    case 'prologue_comment': try { return await socialComment(c, p.postKey, p.text); } catch (e: any) { throw new GameError(e.message); }
    case 'explore': return startExplore(c);
    case 'rest': return survival.setActivity(c, 'resting');
    case 'sleep': return survival.setActivity(c, 'sleeping');
    case 'wake': return survival.setActivity(c, 'idle');
    case 'travel': return startTravel(c, p.toId, { vehicle: p.vehicle, run: p.run });
    case 'travel_preview': return previewTravel(c, p.toId);
    case 'travel_decide': return decideEncounter(c, p.choice);
    case 'travel_pause': return togglePause(c, p.pause);
    case 'travel_back': return turnBack(c);
    case 'travel_join': return joinTravel(c, p.targetId);
    case 'projects_list': return listProjects(c);
    case 'project_deliver': return deliverMaterials(c, p.projectId, p.itemId);
    case 'project_work': return startProjectWork(c, p.projectId);
    case 'project_claim': return startClaimPower(c);
    case 'project_power': return togglePower(c, p.on);
    case 'fire_light': return nature.lightFire(c, p.itemId);
    case 'fire_out': return nature.putOutFire(c);
    case 'hunt': return nature.startHunt(c);
    case 'fish': return nature.startFish(c);
    case 'mysteries_list': return { ok: true, mysteries: await stories.listMysteries() };
    case 'safe_open': return stories.openSafe(c, p.mysteryId, p.code);
    case 'horde_intel': return { ok: true, ...(await hordes.hordeIntel(c)) };
    case 'horde_hide': return hordes.hideFromHorde(c);
    case 'horde_stop_hide': return hordes.stopHiding(c);
    case 'horde_lure': return hordes.lureHorde(c, p.method);
    case 'mural_list': return stories.listMural(c);
    case 'mural_post': return stories.postMural(c, p.content);
    case 'mural_delete': return stories.deleteMural(c, p.postId, user.role !== 'player');
    case 'corpse_destroy': return risen.destroyCorpse(c, p.containerId);
    case 'risen_fight': return risen.fightRisen(c, p.risenId);
    case 'dog_tame': return dogs.tameDog(c, p.dogId, p.itemId);
    case 'dog_feed': return dogs.feedDog(c, p.itemId);
    case 'dog_treat': return dogs.treatDog(c, p.itemId);
    case 'dog_scavenge': return dogs.sendDogScavenge(c);
    case 'dog_pet': return dogs.petDog(c);
    case 'dog_rename': return dogs.renameDog(c, p.name);
    case 'dog_release': return dogs.releaseDog(c);
    case 'follow': return follow(c, p.targetId);
    case 'pickup': return survival.pickUp(c, p.itemId, p.qty);
    case 'drop': return survival.dropItem(c, p.itemId, p.qty);
    case 'give': return survival.giveItem(c, p.targetId, p.itemId, p.qty);
    case 'equip': return survival.equip(c, p.itemId, p.slot);
    case 'unequip': return survival.unequip(c, p.itemId);
    case 'use': return survival.useItem(c, p.itemId);
    case 'repair_item': return survival.repairItem(c, p.itemId);
    case 'tear': return survival.tearClothing(c, p.itemId);
    case 'dismantle': return survival.dismantleItem(c, p.itemId);
    case 'reload': return survival.reload(c);
    case 'unload': return survival.unloadWeapon(c, p.itemId);
    case 'treat': return survival.treat(c, p.targetId, p.woundId ?? null, p.itemId);
    case 'diagnose': return survival.diagnose(c, p.targetId);
    case 'patient_sheet': return survival.patientSheet(c, p.targetId);
    case 'amputation_request': {
      const [t] = await db.select().from(schema.characters).where(eq(schema.characters.id, p.targetId));
      if (!t || t.locationId !== ch.locationId) throw new GameError('O paciente precisa estar aqui.');
      survival.requestAmputationConsent(c, p.targetId, p.region);
      emitToUser(t.userId, 'amputation:request', { actorId: c, actorName: `${ch.firstName} ${ch.lastName}`, region: p.region });
      return { ok: true };
    }
    case 'amputation_consent': {
      if (!survival.hasConsent(p.actorId, c, p.region)) throw new GameError('Pedido expirado.');
      survival.grantConsent(p.actorId, c, p.region);
      const [a] = await db.select().from(schema.characters).where(eq(schema.characters.id, p.actorId));
      if (a) notify(a.userId, `${ch.firstName} consentiu com o procedimento.`, 'info');
      return { ok: true };
    }
    case 'amputate': return survival.amputate(c, p.targetId, p.region);
    case 'container_open': {
      const [ct] = await db.select().from(schema.containers).where(eq(schema.containers.id, p.containerId));
      if (!ct || ct.locationId !== ch.locationId) throw new GameError('Esse contêiner não está aqui.');
      return { ok: true, container: { id: ct.id, name: ct.name, kind: ct.kind, capacity: ct.capacity }, items: (await itemsOf(db, 'container', ct.id)).map(describeItem) };
    }
    case 'store': return survival.storeItem(c, p.itemId, p.containerId, p.qty);
    case 'take': return survival.takeFromContainer(c, p.itemId, p.containerId, p.qty);
    case 'combat': return combatAction(c, p.action);
    case 'combat_join': return joinCombat(c, p.combatId, p.sideCharacterId);
    case 'combat_view': { const v = await getCombatView(p.combatId); return { ok: true, combat: v }; }
    case 'attack_character': return attackCharacter(c, p.targetId);
    case 'search_body': {
      const [t] = await db.select().from(schema.characters).where(eq(schema.characters.id, p.targetId));
      if (!t || t.locationId !== ch.locationId || !t.needs.unconscious) throw new GameError('Só é possível revistar alguém inconsciente aqui.');
      return { ok: true, items: (await itemsOf(db, 'character', t.id)).map(describeItem) };
    }
    case 'steal': return withTwoCharacters(c, p.targetId, async (tx, me, t) => {
      if (t.locationId !== me.locationId || !t.needs.unconscious) throw new GameError('O alvo precisa estar inconsciente e aqui.');
      if (t.protectedUntil && t.protectedUntil > new Date()) throw new GameError('Alvo sob proteção de novato.');
      const it = await transferItem(tx, p.itemId, { type: 'character', id: t.id }, { type: 'character', id: me.id });
      const name = itemDef(it.defId)?.name ?? it.defId;
      await gameLog(tx, me.id, 'theft', `Pegou ${name} de ${t.firstName} ${t.lastName} (inconsciente).`, { targetId: t.id, itemId: it.id });
      await gameLog(tx, t.id, 'theft', `Enquanto você estava inconsciente, ${me.firstName} ${me.lastName} levou ${name}.`, { thiefId: me.id, itemId: it.id });
      await systemEmote(me.locationId, `${me.firstName} ${me.lastName} revista ${t.firstName} ${t.lastName}, que está desacordado(a).`);
      pushSelf(me.id); pushSelf(t.id);
      return { ok: true };
    });
    case 'craft': return vehicles.craft(c, p.recipeId);
    case 'claim_base': return bases.claimBase(c, p.name);
    case 'build': return bases.build(c, p.kind);
    case 'repair': return bases.repairStructure(c, p.structureId);
    case 'fuel_generator': return bases.fuelGenerator(c, p.structureId, p.itemId);
    case 'faction_create': return bases.createFaction(c, p.name, p.emblem, p.color);
    case 'faction_invite': return bases.inviteToFaction(c, p.targetId);
    case 'faction_answer': return bases.answerInvite(c, p.factionId, p.accept);
    case 'faction_leave': return bases.leaveFaction(c);
    case 'faction_rank': return bases.setRank(c, p.targetId, p.rank);
    case 'faction_info': {
      const [m] = await db.select().from(schema.factionMembers).where(eq(schema.factionMembers.characterId, c));
      return { ok: true, faction: m ? await bases.factionDetails(m.factionId) : null };
    }
    case 'base_to_faction': return bases.assignBaseToFaction(c, p.baseId);
    case 'vehicle_enter': return vehicles.enterVehicle(c, p.vehicleId);
    case 'vehicle_exit': return vehicles.exitVehicle(c);
    case 'vehicle_start': return vehicles.startEngine(c, p.approach);
    case 'vehicle_stop': return vehicles.stopEngine(c);
    case 'vehicle_service': return vehicles.serviceVehicle(c, p.vehicleId, p.itemId);
    case 'vehicle_inspect': return vehicles.inspectVehicle(c, p.vehicleId);
    case 'block_user': await db.insert(schema.userBlocks).values({ userId: user.id, blockedUserId: p.userId }).onConflictDoNothing(); return { ok: true, blocked: await blockedIds(user.id) };
    case 'unblock_user': await db.delete(schema.userBlocks).where(and(eq(schema.userBlocks.userId, user.id), eq(schema.userBlocks.blockedUserId, p.userId))); return { ok: true, blocked: await blockedIds(user.id) };
    case 'blocked_list': return { ok: true, list: await blockedList(user.id) };
    case 'report': await db.insert(schema.reports).values({ reporterUserId: user.id, targetUserId: p.userId, messageId: p.messageId ?? null, reason: p.reason }); return { ok: true };
    case 'set_frequency': await db.update(schema.characters).set({ radioFrequency: p.frequency }).where(eq(schema.characters.id, c)); pushSelf(c); return { ok: true };
    case 'look': {
      const [t] = await db.select().from(schema.characters).where(eq(schema.characters.id, p.characterId));
      if (!t || t.locationId !== ch.locationId) throw new GameError('Essa pessoa não está aqui.');
      const items = await itemsOf(db, 'character', t.id);
      const worn = items.filter((i) => i.slot);
      const covered = new Set<string>(worn.flatMap((i) => Object.entries((itemDef(i.defId)?.props.protection ?? {}) as Record<string, number>).filter(([, v]) => v > 0).map(([r]) => r)));
      const impressions = describeAppearance({
        needs: t.needs, wounds: await woundsOf(db, t.id), conditions: await conditionsOf(db, t.id), covered, slots: new Set(worn.map((i) => i.slot!)),
        amputations: t.amputations, observerMedicine: ch.skills.medicine?.level ?? 0,
      });
      return { ok: true, profile: { impressions, id: t.id, userId: t.userId, name: `${t.firstName} ${t.lastName}`, age: t.age, appearance: t.appearance, portrait: t.portrait, portraitAdjust: t.portraitAdjust,
        visibleGear: items.filter((i) => i.slot).map((i) => itemDef(i.defId)?.name), amputations: t.amputations, unconscious: !!t.needs.unconscious, online: isUserOnline(t.userId), protected: !!(t.protectedUntil && t.protectedUntil > new Date()) } };
    }
    case 'tutorial': await db.update(schema.characters).set({ tutorialStep: p.step }).where(eq(schema.characters.id, c)); return { ok: true };
  }
}
/** Dia 1: quem saiu do trabalho (e não está no meio de um evento) pode andar pelo mapa. */
const FREE_ALLOWED = new Set<string>(['travel', 'travel_preview', 'travel_decide', 'travel_pause', 'travel_back', 'travel_join', 'follow']);
const PROLOGUE_ALLOWED = new Set<string>(['prologue_state', 'prologue_leave', 'prologue_vote', 'prologue_reply', 'prologue_like', 'prologue_comment', 'prologue_light', 'prologue_send', 'look', 'equip', 'unequip', 'use', 'reload', 'unload', 'treat', 'diagnose', 'patient_sheet', 'give', 'combat', 'combat_view', 'tutorial', 'block_user', 'unblock_user', 'report', 'set_frequency']);
/** Quem este usuário bloqueou, com o nome do personagem mais recente de cada um (para a lista de desbloqueio). */
async function blockedList(userId: number) {
  const rows = await db.select({ userId: schema.userBlocks.blockedUserId, createdAt: schema.userBlocks.createdAt }).from(schema.userBlocks).where(eq(schema.userBlocks.userId, userId));
  const out: { userId: number; name: string; since: string }[] = [];
  for (const r of rows) {
    const [c] = await db.select({ first: schema.characters.firstName, last: schema.characters.lastName }).from(schema.characters)
      .where(eq(schema.characters.userId, r.userId)).orderBy(desc(schema.characters.alive), desc(schema.characters.id)).limit(1);
    out.push({ userId: r.userId, name: c ? `${c.first} ${c.last}` : 'Jogador sem personagem', since: r.createdAt.toISOString() });
  }
  return out;
}
async function blockedIds(userId: number) { return (await db.select().from(schema.userBlocks).where(eq(schema.userBlocks.userId, userId))).map((b) => b.blockedUserId); }

/** Mantém as salas de cada socket coerentes com a situação do personagem (local, viagem, combate, facção, rádio). */
async function syncRooms(userId: number) {
  const io = ioRef; if (!io) return;
  const ch = await activeCharacter(userId);
  const desired = new Set<string>();
  if (ch) {
    if (ch.state !== 'traveling' && ch.combatId === null) desired.add(`loc:${ch.locationId}`);
    if (ch.state !== 'traveling' && ch.combatId !== null) desired.add(`loc:${ch.locationId}`);
    if (ch.state === 'traveling' || ch.combatId) {
      const [t] = await db.select().from(schema.travels).where(and(eq(schema.travels.characterId, ch.id), eq(schema.travels.status, ch.combatId ? 'combat' : 'active')));
      const [t2] = t ? [t] : await db.select().from(schema.travels).where(and(eq(schema.travels.characterId, ch.id), inArray(schema.travels.status, ['paused', 'awaiting_decision'])));
      if (t2) { desired.add(`travel:${t2.groupId}`); desired.delete(`loc:${ch.locationId}`); }
    }
    if (ch.combatId) desired.add(`combat:${ch.combatId}`);
    const [m] = await db.select().from(schema.factionMembers).where(eq(schema.factionMembers.characterId, ch.id));
    if (ch.radioFrequency) { const items = await itemsOf(db, 'character', ch.id); if (items.some((i) => itemDef(i.defId)?.props.radio)) desired.add(`radio:${ch.radioFrequency}`); }
  }
  const sockets = await io.in(`user:${userId}`).fetchSockets();
  for (const s of sockets) {
    for (const r of s.rooms) if (/^(loc|travel|combat|faction|radio):/.test(r) && !desired.has(r)) { s.leave(r); if (r.startsWith('loc:')) pushScene(r.slice(4)); }
    for (const r of desired) if (!s.rooms.has(r)) {
      s.join(r);
      if (r.startsWith('loc:')) { const loc = r.slice(4); s.emit('chat:history', { scope: 'local', messages: await localHistory(loc) }); s.emit('scene:update', await buildScene(loc)); pushScene(loc); }
      if (r.startsWith('combat:')) s.emit('combat:state', await getCombatView(Number(r.slice(7))));
    }
  }
}

let ioRef: Server | null = null;
export function createSocketServer(http: HttpServer) {
  const io = new Server(http, { cors: { origin: [env.clientOrigin, env.clientOrigin.replace('127.0.0.1', 'localhost'), env.clientOrigin.replace('localhost', '127.0.0.1')], credentials: true }, pingInterval: 10000, pingTimeout: 8000, connectionStateRecovery: { maxDisconnectionDuration: 60_000 } });
  ioRef = io; setIO(io); installServerControl(io);
  onRetune((characterId) => pushSelf(characterId));
  registerBuilders(async (characterId) => {
    const r = await buildSelfState(characterId); if (!r) return null;
    await syncRooms(r.userId);
    return r;
  }, (loc) => buildScene(loc));

  io.use(async (socket, next) => {
    const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
    const user = await userFromToken(cookies[COOKIE]);
    if (!user) return next(new Error('unauthorized'));
    // Jogo pausado, fechado até a abertura ou ficha aguardando aprovação: não conecta (o cliente mostra a tela de espera).
    const block = playBlock(user.role, await activeCharacter(user.id));
    if (block) return next(new Error(`blocked:${block.reason}`));
    socket.data.user = user; next();
  });

  io.on('connection', async (socket: Socket) => {
    const user = socket.data.user as AuthUser;
    // Handlers são registrados ANTES de qualquer await para não perder eventos enviados logo após conectar.
    socket.on('action', async (msg: { type: ActionType; payload?: unknown }, ack?: (r: unknown) => void) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      try {
        actionRateLimit(user.id);
        if (isPaused()) throw new GameError('O jogo está pausado pela administração.', 'paused');
        const schemaFor = actionSchemas[msg?.type as ActionType];
        if (!schemaFor) throw new GameError('Ação desconhecida.');
        const payload = schemaFor.parse(msg.payload ?? {});
        const result = await dispatch(user, msg.type, payload);
        await flushNow();
        reply({ ok: true, ...(result ?? {}) });
      } catch (e: any) {
        const message = e instanceof GameError ? e.message : e?.issues ? 'Dados inválidos.' : 'Erro interno.';
        if (!(e instanceof GameError) && !e?.issues) console.error('action', msg?.type, e);
        reply({ ok: false, error: message, code: e?.code });
      }
    });

    socket.on('chat:send', async (msg: { text: string; channel?: string; toCharacterId?: number; frequency?: number }, ack?: (r: unknown) => void) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      try {
        if (isPaused()) throw new GameError('O jogo está pausado pela administração.', 'paused');
        const fresh = (await userFromToken(cookiesOf(socket))) ?? user;
        const c = await activeCharacter(user.id);
        let travelGroup: string | null = null; let factionId: number | null = null; let hasRadio = false;
        if (c) {
          const [t] = await db.select().from(schema.travels).where(and(eq(schema.travels.characterId, c.id), eq(schema.travels.status, 'active')));
          const [t2] = t ? [t] : await db.select().from(schema.travels).where(and(eq(schema.travels.characterId, c.id), inArray(schema.travels.status, ['paused', 'awaiting_decision'])));
          travelGroup = t2?.groupId ?? null;
          const [m] = await db.select().from(schema.factionMembers).where(eq(schema.factionMembers.characterId, c.id)); factionId = m?.factionId ?? null;
          hasRadio = (await itemsOf(db, 'character', c.id)).some((i) => itemDef(i.defId)?.props.radio);
        }
        const r = await sendChat({ userId: user.id, role: fresh.role, mutedUntil: fresh.mutedUntil, character: c ? { id: c.id, name: `${c.firstName} ${c.lastName}`, locationId: c.locationId, state: c.state, radioFrequency: c.radioFrequency, hasRadio, factionId, travelGroup, skills: c.skills, attributes: c.attributes } : null },
          msg?.text, { channel: msg?.channel, toCharacterId: msg?.toCharacterId, frequency: typeof msg?.frequency === 'number' ? msg.frequency : undefined });
        if ((r as any).setFrequency && c) { await db.update(schema.characters).set({ radioFrequency: (r as any).setFrequency }).where(eq(schema.characters.id, c.id)); pushSelf(c.id); await flushNow(); }
        reply(r);
      } catch (e: any) { reply({ ok: false, error: e instanceof GameError ? e.message : 'Erro ao enviar.' }); if (!(e instanceof GameError)) console.error('chat', e); }
    });

    // Indicador "digitando…": avisa quem está no mesmo local (ou na mesma estrada) — balão "..." sobre o retrato.
    let lastTyping = 0;
    socket.on('chat:typing', async (msg: { typing?: boolean }) => {
      try {
        const typing = !!msg?.typing; const now = Date.now();
        if (typing && now - lastTyping < 1000) return;
        lastTyping = typing ? now : 0;
        const c = await activeCharacter(user.id);
        if (!c || !c.alive) return;
        const payload = { characterId: c.id, typing };
        if (c.state === 'traveling') {
          const [t] = await db.select().from(schema.travels).where(and(eq(schema.travels.characterId, c.id), inArray(schema.travels.status, ['active', 'paused', 'awaiting_decision'])));
          if (!t) return;
          emitToRoom(`travel:${t.groupId}`, 'chat:typing', payload);
          for (const g of await nearbyGroupIds(t.groupId)) emitToRoom(`travel:${g}`, 'chat:typing', payload);
        } else emitToLocation(c.locationId, 'chat:typing', payload);
      } catch { /* indicador é cosmético */ }
    });

    socket.on('scene:refresh', async () => {
      const c = await activeCharacter(user.id);
      if (c) { socket.emit('scene:update', await buildScene(c.locationId)); const s = await buildSelfState(c.id); if (s) socket.emit('state:self', s.state); }
    });

    socket.on('disconnect', async () => {
      trackDisconnect(user.id, socket.id);
      const c = await activeCharacter(user.id);
      if (c) pushScene(c.locationId);
    });
    void (async () => {
      socket.join(`user:${user.id}`);
      if (['gm', 'moderator', 'admin'].includes(user.role)) socket.join('staff');
      trackConnect(user.id, socket.id);
      await db.update(schema.users).set({ lastSeenAt: new Date() }).where(eq(schema.users.id, user.id));
      const ch = await activeCharacter(user.id);
      await syncRooms(user.id);
      if (ch) {
        const self = await buildSelfState(ch.id); if (self) socket.emit('state:self', self.state);
        const [m] = await db.select().from(schema.factionMembers).where(eq(schema.factionMembers.characterId, ch.id));
        const [t] = await db.select().from(schema.travels).where(and(eq(schema.travels.characterId, ch.id)));
        socket.emit('chat:history', { scope: 'private', messages: await privateHistory(user.id, m?.factionId ?? null, ch.radioFrequency, ch.state === 'traveling' ? t?.groupId ?? null : null) });
        pushScene(ch.locationId);
      }
      socket.emit('user:blocks', await blockedIds(user.id));
    })().catch((e) => console.error('socket init', e));
  });
  return io;
}
const cookiesOf = (s: Socket) => parseCookie(s.handshake.headers.cookie ?? '')[COOKIE];
export { getLocation };
