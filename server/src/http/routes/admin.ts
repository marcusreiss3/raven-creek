import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../../db/index.js';
import { requireRole, STAFF } from '../auth.js';
import { adminLog } from '../../game/services/infra.js';
import { buildSelfState, withCharacter } from '../../game/services/characters.js';
import { allItemDefs, cfg, clock, getEventDefs, reloadData, setGameTime, setWeather, updateGameConfig } from '../../game/services/config.js';
import { addItem } from '../../game/services/inventory.js';
import { killCharacter } from '../../game/services/death.js';
import { eligibleEvents, randomVehicle } from '../../game/services/events.js';
import { applyWorldEvent, spawnHorde } from '../../game/services/worldsim.js';
import { lootProbabilities } from '../../game/rules/loot.js';
import { allLocations, buildScene, getLocation, loadWorld } from '../../game/services/world.js';
import { emitAll, emitToUser, isUserOnline, notify, onlineUserIds, pushScene, pushSelf } from '../../game/services/realtime.js';
import { deleteMessage, systemEmote } from '../../game/services/chat.js';
import { defaultGameConfig } from '../../game/content/defaultConfig.js';
import { VEHICLE_TYPES } from '../../game/content/structures.js';
import { ARENAS } from '../../game/combat/maps.js';
import { CLIENT_PUBLIC_DIR } from '../paths.js';
import { pauseGame, resumeGame, serverStatus, setOpening } from '../../game/services/serverStatus.js';
import { kickEveryone } from '../../game/services/serverControl.js';
import { resetCharacters, resetWorld } from '../../game/services/reset.js';
import { professionById } from '../../game/content/character.js';
import { activePrologue, finishPrologue, joinPrologueLate, lobbyPresent, prologueEndsAt, prologueLatecomers, sessionMinute } from '../../game/services/prologue.js';
import { prologueCandidates, startPrologueNow } from '../../game/services/prologueControl.js';
import { validateDia1 } from '../../game/content/dia1/validate.js';
import { getTrack } from '../../game/content/dia1/index.js';

export const adminRouter = Router();
const staff = requireRole(...STAFF);
const gm = requireRole('gm');
const mod = requireRole('moderator');
const adminOnly = requireRole('admin');
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch((e) => {
  res.status(400).json({ error: e?.issues?.[0]?.message ?? e?.message ?? String(e) });
});
const uid = (req: Request) => req.user!.id;
const num = (v: unknown) => Number(v);

adminRouter.use(staff);

adminRouter.get('/overview', wrap(async (req, res) => {
  const [{ users }] = await db.select({ users: sql<number>`count(*)::int` }).from(schema.users);
  const [{ alive }] = await db.select({ alive: sql<number>`count(*)::int` }).from(schema.characters).where(eq(schema.characters.alive, true));
  const [{ dead }] = await db.select({ dead: sql<number>`count(*)::int` }).from(schema.characters).where(eq(schema.characters.alive, false));
  const [{ combats }] = await db.select({ combats: sql<number>`count(*)::int` }).from(schema.combats).where(eq(schema.combats.status, 'active'));
  const [{ reports }] = await db.select({ reports: sql<number>`count(*)::int` }).from(schema.reports).where(eq(schema.reports.status, 'open'));
  res.json({ users, alive, dead, combats, reports, online: onlineUserIds().length, clock: clock(), role: req.user!.role });
}));

// ───────── Jogadores
adminRouter.get('/users', wrap(async (_req, res) => {
  const rows = await db.select({ id: schema.users.id, username: schema.users.username, role: schema.users.role, createdAt: schema.users.createdAt, bannedUntil: schema.users.bannedUntil, mutedUntil: schema.users.mutedUntil }).from(schema.users).orderBy(schema.users.id);
  res.json({ users: rows.map((u) => ({ ...u, online: isUserOnline(u.id) })) });
}));
adminRouter.patch('/users/:id', mod, wrap(async (req, res) => {
  const b = z.object({ role: z.enum(['player', 'gm', 'moderator', 'admin']).optional(), banHours: z.number().min(0).max(24 * 365).optional(), muteHours: z.number().min(0).max(24 * 30).optional(), reason: z.string().max(300).default('') }).parse(req.body);
  const id = num(req.params.id);
  if (b.role && req.user!.role !== 'admin') throw new Error('Somente administradores alteram cargos.');
  const patch: Record<string, unknown> = {};
  if (b.role) patch.role = b.role;
  if (b.banHours !== undefined) { patch.bannedUntil = b.banHours ? new Date(Date.now() + b.banHours * 3_600_000) : null; patch.tokenVersion = sql`${schema.users.tokenVersion} + 1`; }
  if (b.muteHours !== undefined) patch.mutedUntil = b.muteHours ? new Date(Date.now() + b.muteHours * 3_600_000) : null;
  await db.transaction(async (tx) => { await tx.update(schema.users).set(patch).where(eq(schema.users.id, id)); await adminLog(tx, uid(req), 'user.update', 'user', id, b); });
  if (b.banHours) emitToUser(id, 'force:logout', { reason: b.reason });
  res.json({ ok: true });
}));

adminRouter.get('/characters', wrap(async (_req, res) => {
  const rows = await db.select({ id: schema.characters.id, userId: schema.characters.userId, firstName: schema.characters.firstName, lastName: schema.characters.lastName, alive: schema.characters.alive,
    locationId: schema.characters.locationId, state: schema.characters.state, profession: schema.characters.profession, needs: schema.characters.needs, username: schema.users.username })
    .from(schema.characters).innerJoin(schema.users, eq(schema.users.id, schema.characters.userId)).orderBy(desc(schema.characters.id)).limit(500);
  res.json({ characters: rows.map((r) => ({ ...r, locationName: getLocation(r.locationId)?.name, online: isUserOnline(r.userId) })) });
}));
adminRouter.get('/characters/:id', wrap(async (req, res) => {
  const s = await buildSelfState(num(req.params.id));
  const conds = await db.select().from(schema.conditions).where(eq(schema.conditions.characterId, num(req.params.id)));
  res.json({ character: s?.state, allConditions: conds });
}));
adminRouter.patch('/characters/:id/needs', gm, wrap(async (req, res) => {
  const b = z.record(z.string(), z.number()).parse(req.body);
  const id = num(req.params.id);
  await withCharacter(id, async (tx, ch) => {
    const allowed = ['hunger', 'thirst', 'sleepiness', 'stamina', 'energy', 'stress', 'bodyTemp', 'blood', 'vitality'];
    const needs: any = { ...ch.needs }; for (const [k, v] of Object.entries(b)) if (allowed.includes(k)) needs[k] = v;
    await tx.update(schema.characters).set({ needs }).where(eq(schema.characters.id, id));
    await adminLog(tx, uid(req), 'character.needs', 'character', id, { before: ch.needs, after: needs });
  });
  pushSelf(id); res.json({ ok: true });
}));
adminRouter.post('/characters/:id/heal', gm, wrap(async (req, res) => {
  const id = num(req.params.id);
  await withCharacter(id, async (tx, ch) => {
    await tx.update(schema.wounds).set({ healedAt: new Date(), healing: 1, bleeding: 0 }).where(eq(schema.wounds.characterId, id));
    await tx.update(schema.conditions).set({ resolvedAt: new Date() }).where(eq(schema.conditions.characterId, id));
    await tx.update(schema.characters).set({ needs: { ...ch.needs, blood: 100, vitality: 100, unconscious: false, bodyTemp: 37 } }).where(eq(schema.characters.id, id));
    await adminLog(tx, uid(req), 'character.heal', 'character', id, { reason: req.body?.reason ?? '' });
  });
  pushSelf(id); res.json({ ok: true });
}));
adminRouter.post('/characters/:id/kill', gm, wrap(async (req, res) => {
  const id = num(req.params.id);
  await withCharacter(id, async (tx, ch) => { await killCharacter(tx, ch, String(req.body?.cause ?? 'admin')); await adminLog(tx, uid(req), 'character.kill', 'character', id, { reason: req.body?.reason ?? '' }); });
  res.json({ ok: true });
}));
adminRouter.post('/characters/:id/revive', adminOnly, wrap(async (req, res) => {
  const id = num(req.params.id);
  await db.transaction(async (tx) => {
    const [ch] = await tx.select().from(schema.characters).where(eq(schema.characters.id, id)).for('update');
    if (!ch || ch.alive) throw new Error('Personagem não está morto.');
    await tx.update(schema.characters).set({ alive: true, state: 'idle', deathCause: null, diedAt: null, needs: { ...ch.needs, blood: 80, vitality: 80, unconscious: false } }).where(eq(schema.characters.id, id));
    await adminLog(tx, uid(req), 'character.revive', 'character', id, { reason: req.body?.reason ?? '' });
  });
  pushSelf(id); res.json({ ok: true });
}));
adminRouter.post('/characters/:id/move', gm, wrap(async (req, res) => {
  const id = num(req.params.id); const to = String(req.body?.locationId);
  if (!getLocation(to)) throw new Error('Local inválido.');
  let from = '';
  await withCharacter(id, async (tx, ch) => {
    if (ch.state === 'combat') throw new Error('Personagem em combate.');
    from = ch.locationId;
    await tx.update(schema.travels).set({ status: 'returned' }).where(and(eq(schema.travels.characterId, id), sql`${schema.travels.status} in ('active','paused','awaiting_decision')`));
    await tx.update(schema.characters).set({ locationId: to, state: 'idle' }).where(eq(schema.characters.id, id));
    await adminLog(tx, uid(req), 'character.move', 'character', id, { from, to, reason: req.body?.reason ?? '' });
  });
  pushSelf(id); pushScene(from); pushScene(to); res.json({ ok: true });
}));
adminRouter.post('/characters/:id/encounter', gm, wrap(async (req, res) => {
  const id = num(req.params.id);
  const b = z.object({ count: z.number().int().min(1).max(8).default(2), types: z.array(z.string()).optional(), reason: z.string().max(200).default('Infectados surgem do nada!') }).parse(req.body ?? {});
  const { startCombat } = await import('../../game/services/combat.js');
  await withCharacter(id, async (tx, ch) => {
    if (ch.state !== 'idle' || !ch.alive) throw new Error('O personagem precisa estar livre (não viajando, ocupado ou em combate).');
    await startCombat(tx, { characters: [ch], locationId: ch.locationId, zombieCount: b.count, zombieTypes: b.types, reason: b.reason });
    await adminLog(tx, uid(req), 'character.encounter', 'character', id, b);
  });
  res.json({ ok: true });
}));
adminRouter.post('/characters/:id/items', gm, wrap(async (req, res) => {
  const id = num(req.params.id); const b = z.object({ defId: z.string(), qty: z.number().int().min(1).max(500) }).parse(req.body);
  await db.transaction(async (tx) => { await addItem(tx, 'character', id, b.defId, b.qty); await adminLog(tx, uid(req), 'item.grant', 'character', id, b); });
  pushSelf(id); res.json({ ok: true });
}));
adminRouter.delete('/items/:id', gm, wrap(async (req, res) => {
  const id = num(req.params.id);
  await db.transaction(async (tx) => { const [it] = await tx.delete(schema.items).where(eq(schema.items.id, id)).returning(); await adminLog(tx, uid(req), 'item.delete', 'item', id, { item: it }); if (it?.ownerType === 'character') pushSelf(Number(it.ownerId)); });
  res.json({ ok: true });
}));

// ───────── Logs, denúncias, chat
adminRouter.get('/logs', wrap(async (_req, res) => { res.json({ logs: await db.select().from(schema.adminLogs).orderBy(desc(schema.adminLogs.id)).limit(300) }); }));
adminRouter.get('/game-logs', wrap(async (req, res) => {
  const q = req.query.characterId ? eq(schema.gameLogs.characterId, num(req.query.characterId)) : req.query.kind ? eq(schema.gameLogs.kind, String(req.query.kind)) : undefined;
  res.json({ logs: await db.select().from(schema.gameLogs).where(q).orderBy(desc(schema.gameLogs.id)).limit(300) });
}));
adminRouter.get('/reports', wrap(async (_req, res) => {
  const rows = await db.select().from(schema.reports).orderBy(desc(schema.reports.id)).limit(200);
  const msgs = rows.filter((r) => r.messageId).length ? await db.select().from(schema.chatMessages).where(sql`${schema.chatMessages.id} in (${sql.join(rows.filter((r) => r.messageId).map((r) => sql`${r.messageId}`), sql`, `)})`) : [];
  res.json({ reports: rows.map((r) => ({ ...r, message: msgs.find((m) => m.id === r.messageId) ?? null })) });
}));
adminRouter.patch('/reports/:id', mod, wrap(async (req, res) => {
  await db.transaction(async (tx) => { await tx.update(schema.reports).set({ status: String(req.body?.status ?? 'resolved'), resolvedBy: uid(req) }).where(eq(schema.reports.id, num(req.params.id))); await adminLog(tx, uid(req), 'report.resolve', 'report', num(req.params.id), req.body ?? {}); });
  res.json({ ok: true });
}));
adminRouter.delete('/chat/:id', mod, wrap(async (req, res) => {
  const m = await deleteMessage(num(req.params.id));
  await adminLog(db, uid(req), 'chat.delete', 'message', num(req.params.id), { content: m?.content, author: m?.authorName });
  res.json({ ok: true });
}));

// ───────── Mundo
adminRouter.get('/locations', wrap(async (_req, res) => {
  const loot = await db.select().from(schema.locationLoot);
  const conns = await db.select().from(schema.connections);
  res.json({ locations: allLocations().map((l) => ({ ...l, loot: loot.find((x) => x.locationId === l.id) ?? null })), connections: conns, arenas: Object.keys(ARENAS) });
}));
const locationPatch = z.object({ name: z.string().min(2).max(80), description: z.string().max(1000), category: z.string(), sceneKey: z.string(), arenaKey: z.string(), musicKey: z.string(), danger: z.number().min(0).max(1), lootTableId: z.string().nullable(), buildable: z.boolean(), indoor: z.boolean(), x: z.number(), y: z.number(), regionId: z.string() }).partial();
adminRouter.patch('/locations/:id', gm, wrap(async (req, res) => {
  const b = locationPatch.parse(req.body); const id = String(req.params.id);
  await db.transaction(async (tx) => { await tx.update(schema.locations).set(b).where(eq(schema.locations.id, id)); await adminLog(tx, uid(req), 'location.update', 'location', id, b); });
  await loadWorld(); pushScene(id); res.json({ ok: true });
}));
adminRouter.post('/locations', gm, wrap(async (req, res) => {
  const b = locationPatch.required({ name: true, category: true, sceneKey: true, regionId: true, x: true, y: true }).extend({ id: z.string().regex(/^[a-z0-9_]{3,40}$/) }).parse(req.body);
  await db.transaction(async (tx) => {
    await tx.insert(schema.locations).values({ arenaKey: 'street', musicKey: 'explore_calm', description: '', danger: 0.3, buildable: false, indoor: false, lootTableId: null, ...b });
    await tx.insert(schema.locationLoot).values({ locationId: b.id, reserve: cfg().loot.defaultMaxReserve, maxReserve: cfg().loot.defaultMaxReserve, regenPerHour: cfg().loot.defaultRegenPerHour, zombies: 1 });
    await adminLog(tx, uid(req), 'location.create', 'location', b.id, b);
  });
  await loadWorld(); res.json({ ok: true });
}));
adminRouter.patch('/location-loot/:id', gm, wrap(async (req, res) => {
  const b = z.object({ reserve: z.number().min(0), maxReserve: z.number().min(1), regenPerHour: z.number().min(0), zombies: z.number().int().min(0).max(200) }).partial().parse(req.body);
  await db.transaction(async (tx) => { await tx.update(schema.locationLoot).set({ ...b, lastRegenAt: new Date() }).where(eq(schema.locationLoot.locationId, String(req.params.id))); await adminLog(tx, uid(req), 'location.loot', 'location', String(req.params.id), b); });
  pushScene(String(req.params.id)); res.json({ ok: true });
}));
adminRouter.post('/connections', gm, wrap(async (req, res) => {
  const b = z.object({ fromId: z.string(), toId: z.string(), distance: z.number().min(5), roadType: z.enum(['indoor', 'trail', 'dirt', 'asphalt']), travelSceneKey: z.string().default('road_asphalt_01') }).parse(req.body);
  if (!getLocation(b.fromId) || !getLocation(b.toId)) throw new Error('Locais inválidos.');
  await db.transaction(async (tx) => { const [c] = await tx.insert(schema.connections).values(b).returning(); await adminLog(tx, uid(req), 'connection.create', 'connection', c.id, b); });
  await loadWorld(); pushScene(b.fromId); pushScene(b.toId); res.json({ ok: true });
}));
adminRouter.patch('/connections/:id', gm, wrap(async (req, res) => {
  const b = z.object({ blocked: z.boolean(), blockedReason: z.string().max(200).nullable(), distance: z.number().min(5), roadType: z.enum(['indoor', 'trail', 'dirt', 'asphalt']), travelSceneKey: z.string() }).partial().parse(req.body);
  await db.transaction(async (tx) => { const [c] = await tx.update(schema.connections).set(b).where(eq(schema.connections.id, num(req.params.id))).returning(); await adminLog(tx, uid(req), 'connection.update', 'connection', num(req.params.id), b); if (c) { pushScene(c.fromId); pushScene(c.toId); } });
  await loadWorld(); res.json({ ok: true });
}));
adminRouter.delete('/connections/:id', gm, wrap(async (req, res) => {
  await db.transaction(async (tx) => { await tx.delete(schema.connections).where(eq(schema.connections.id, num(req.params.id))); await adminLog(tx, uid(req), 'connection.delete', 'connection', num(req.params.id)); });
  await loadWorld(); res.json({ ok: true });
}));
adminRouter.get('/scene/:id', wrap(async (req, res) => { res.json({ scene: await buildScene(String(req.params.id)) }); }));
adminRouter.post('/narrate', gm, wrap(async (req, res) => {
  const b = z.object({ locationId: z.string().optional(), text: z.string().min(1).max(1000), global: z.boolean().optional() }).parse(req.body);
  if (b.global) emitAll('notify', { text: b.text, level: 'warn', icon: 'narrator', at: Date.now() });
  else if (b.locationId) await systemEmote(b.locationId, b.text, 'system');
  await adminLog(db, uid(req), 'narrate', 'location', b.locationId ?? 'global', b);
  res.json({ ok: true });
}));

// ───────── Itens, loot, zumbis, receitas
adminRouter.get('/item-defs', wrap(async (_req, res) => { res.json({ items: allItemDefs() }); }));
const itemDefSchema = z.object({ id: z.string().regex(/^[a-z0-9_]{2,40}$/), name: z.string().min(2), category: z.string(), description: z.string().default(''), weight: z.number().min(0), volume: z.number().min(0).default(1), stackable: z.boolean(), maxStack: z.number().int().min(1), durabilityMax: z.number().int().min(0), rarity: z.enum(['common', 'uncommon', 'rare', 'very_rare']), equipSlot: z.string().nullable(), icon: z.string().default('generic'), props: z.record(z.string(), z.any()) });
adminRouter.put('/item-defs/:id', gm, wrap(async (req, res) => {
  const b = itemDefSchema.parse({ ...req.body, id: req.params.id });
  await db.transaction(async (tx) => { await tx.insert(schema.itemDefs).values(b).onConflictDoUpdate({ target: schema.itemDefs.id, set: b }); await adminLog(tx, uid(req), 'itemdef.upsert', 'item_def', b.id, b); });
  await reloadData(); res.json({ ok: true });
}));
adminRouter.get('/loot-tables', wrap(async (req, res) => {
  const night = req.query.night === '1';
  const rows = await db.select().from(schema.lootTables);
  res.json({ tables: rows.map((t) => ({ ...t, entries: lootProbabilities(t.entries, night).map((e) => ({ ...e, itemName: allItemDefs().find((d) => d.id === e.itemId)?.name ?? e.itemId })) })), reserveCost: cfg().exploration.reserveCost });
}));
const lootEntry = z.object({ itemId: z.string(), weight: z.number().min(0), min: z.number().int().min(1), max: z.number().int().min(1), night: z.number().min(0).optional(), requiresTag: z.string().optional(), cost: z.number().min(0).optional() });
adminRouter.put('/loot-tables/:id', gm, wrap(async (req, res) => {
  const b = z.object({ name: z.string(), entries: z.array(lootEntry) }).parse(req.body);
  for (const e of b.entries) if (!allItemDefs().some((d) => d.id === e.itemId)) throw new Error(`Item inexistente: ${e.itemId}`);
  const entries = b.entries.map(({ itemId, weight, min, max, night, requiresTag, cost }) => ({ itemId, weight, min, max: Math.max(min, max), night, requiresTag, cost }));
  await db.transaction(async (tx) => { await tx.insert(schema.lootTables).values({ id: String(req.params.id), name: b.name, entries }).onConflictDoUpdate({ target: schema.lootTables.id, set: { name: b.name, entries, updatedAt: new Date() } }); await adminLog(tx, uid(req), 'loot.update', 'loot_table', String(req.params.id), { entries: entries.length }); });
  await reloadData(); res.json({ ok: true });
}));
adminRouter.get('/zombie-types', wrap(async (_req, res) => { res.json({ types: await db.select().from(schema.zombieTypes) }); }));
adminRouter.put('/zombie-types/:id', gm, wrap(async (req, res) => {
  const b = z.object({ name: z.string(), description: z.string(), behavior: z.enum(['shambler', 'runner', 'brute', 'wanderer', 'lurker']), stats: z.record(z.string(), z.any()), spawnWeight: z.number().min(0), nightMultiplier: z.number().min(0), allowedCategories: z.array(z.string()), enabled: z.boolean() }).parse(req.body);
  await db.transaction(async (tx) => { await tx.insert(schema.zombieTypes).values({ id: String(req.params.id), ...b, stats: b.stats as any }).onConflictDoUpdate({ target: schema.zombieTypes.id, set: { ...b, stats: b.stats as any } }); await adminLog(tx, uid(req), 'zombie.update', 'zombie_type', String(req.params.id), b); });
  await reloadData(); res.json({ ok: true });
}));

// ───────── Eventos
adminRouter.get('/event-defs', wrap(async (_req, res) => { res.json({ events: await db.select().from(schema.eventDefs) }); }));
adminRouter.put('/event-defs/:id', gm, wrap(async (req, res) => {
  const b = z.object({ name: z.string(), scope: z.enum(['explore', 'travel', 'world']), kind: z.string(), weight: z.number().min(0), cooldownMinutes: z.number().min(0), conditions: z.record(z.string(), z.any()), effects: z.record(z.string(), z.any()), text: z.string().min(1), requiresDecision: z.boolean(), enabled: z.boolean() }).parse(req.body);
  await db.transaction(async (tx) => { await tx.insert(schema.eventDefs).values({ id: String(req.params.id), ...b }).onConflictDoUpdate({ target: schema.eventDefs.id, set: b }); await adminLog(tx, uid(req), 'event.update', 'event_def', String(req.params.id), b); });
  await reloadData(); res.json({ ok: true });
}));
adminRouter.get('/event-probabilities', wrap(async (req, res) => {
  const scope = String(req.query.scope ?? 'explore') as 'explore' | 'travel' | 'world';
  const loc = req.query.locationId ? getLocation(String(req.query.locationId)) : undefined;
  const pool = await eligibleEvents(db, { scope, category: loc?.category, danger: loc?.danger, roadType: req.query.roadType ? String(req.query.roadType) : undefined, vehicle: req.query.vehicle === '1', locationId: loc?.id });
  const total = pool.reduce((s, e) => s + e.weight, 0) || 1;
  const e = cfg().exploration;
  res.json({ scope, location: loc?.name, phase: clock().phase, weather: clock().weather, events: pool.map((p) => ({ id: p.id, name: p.name, kind: p.kind, weight: p.weight, probability: p.weight / total })),
    notes: scope === 'explore' ? `Chance de algum evento ao vasculhar: ${(e.eventChance * 100).toFixed(0)}% (após o teste de barulho).` : scope === 'world' ? `Chance por local ocupado a cada ${cfg().world.eventRollEveryMinutes} min: ${(cfg().world.worldEventChance * 100).toFixed(0)}%.` : 'Chance de encontro proporcional à distância (config. Viagens).' });
}));
adminRouter.post('/events/trigger', gm, wrap(async (req, res) => {
  const b = z.object({ eventId: z.string(), locationId: z.string() }).parse(req.body);
  const ev = getEventDefs().find((e) => e.id === b.eventId); if (!ev) throw new Error('Evento inexistente ou desativado.');
  if (!getLocation(b.locationId)) throw new Error('Local inválido.');
  await db.transaction(async (tx) => { await applyWorldEvent(tx, ev, b.locationId, uid(req)); await adminLog(tx, uid(req), 'event.trigger', 'event', b.eventId, b); });
  res.json({ ok: true });
}));
adminRouter.post('/events/schedule', gm, wrap(async (req, res) => {
  const b = z.object({ eventId: z.string(), locationId: z.string(), runAt: z.string(), note: z.string().max(300).default('') }).parse(req.body);
  await db.transaction(async (tx) => { await tx.insert(schema.scheduledEvents).values({ ...b, runAt: new Date(b.runAt), createdBy: uid(req) }); await adminLog(tx, uid(req), 'event.schedule', 'event', b.eventId, b); });
  res.json({ ok: true });
}));
adminRouter.get('/events/history', wrap(async (_req, res) => {
  res.json({ history: await db.select().from(schema.eventLog).orderBy(desc(schema.eventLog.id)).limit(200), scheduled: await db.select().from(schema.scheduledEvents).orderBy(desc(schema.scheduledEvents.id)).limit(100) });
}));

// ───────── Hordas, veículos, bases
adminRouter.get('/hordes', wrap(async (_req, res) => { res.json({ hordes: (await db.select().from(schema.hordes).orderBy(desc(schema.hordes.id)).limit(50)).map((h) => ({ ...h, locationName: getLocation(h.locationId)?.name, targetName: h.targetLocationId ? getLocation(h.targetLocationId)?.name : null })) }); }));
adminRouter.post('/hordes', gm, wrap(async (req, res) => {
  const b = z.object({ locationId: z.string().optional(), targetLocationId: z.string().optional(), size: z.number().int().min(3).max(200).optional() }).parse(req.body);
  await db.transaction(async (tx) => {
    const h = await spawnHorde(tx, b.locationId);
    if (!h) throw new Error('Limite de hordas ativas atingido.');
    if (b.targetLocationId || b.size) await tx.update(schema.hordes).set({ targetLocationId: b.targetLocationId ?? h.targetLocationId, size: b.size ?? h.size }).where(eq(schema.hordes.id, h.id));
    await adminLog(tx, uid(req), 'horde.spawn', 'horde', h.id, b);
  });
  res.json({ ok: true });
}));
adminRouter.patch('/hordes/:id', gm, wrap(async (req, res) => {
  const b = z.object({ active: z.boolean(), targetLocationId: z.string().nullable(), size: z.number().int().min(1) }).partial().parse(req.body);
  await db.transaction(async (tx) => { await tx.update(schema.hordes).set(b).where(eq(schema.hordes.id, num(req.params.id))); await adminLog(tx, uid(req), 'horde.update', 'horde', num(req.params.id), b); });
  res.json({ ok: true });
}));
adminRouter.get('/vehicles', wrap(async (_req, res) => { res.json({ vehicles: (await db.select().from(schema.vehicles)).map((v) => ({ ...v, locationName: v.locationId ? getLocation(v.locationId)?.name : 'em trânsito' })), types: VEHICLE_TYPES }); }));
adminRouter.post('/vehicles', gm, wrap(async (req, res) => {
  const b = z.object({ locationId: z.string(), type: z.string().optional() }).parse(req.body);
  const v = randomVehicle(b.locationId);
  if (b.type && VEHICLE_TYPES[b.type]) { const t = VEHICLE_TYPES[b.type]; Object.assign(v, { type: b.type, name: t.name, seats: t.seats, storage: t.storage, fuelMax: t.fuelMax, speed: t.speed, consumption: t.consumption, noise: t.noise }); }
  await db.transaction(async (tx) => { const [row] = await tx.insert(schema.vehicles).values(v).returning(); await adminLog(tx, uid(req), 'vehicle.spawn', 'vehicle', row.id, b); });
  pushScene(b.locationId); res.json({ ok: true });
}));
adminRouter.patch('/vehicles/:id', gm, wrap(async (req, res) => {
  const b = z.object({ fuel: z.number(), engine: z.number(), tires: z.number(), battery: z.number(), body: z.number(), hasKey: z.boolean(), locationId: z.string() }).partial().parse(req.body);
  await db.transaction(async (tx) => { await tx.update(schema.vehicles).set(b).where(eq(schema.vehicles.id, num(req.params.id))); await adminLog(tx, uid(req), 'vehicle.update', 'vehicle', num(req.params.id), b); });
  res.json({ ok: true });
}));
adminRouter.get('/bases', wrap(async (_req, res) => {
  const bases = await db.select().from(schema.bases); const st = await db.select().from(schema.baseStructures);
  res.json({ bases: bases.map((b) => ({ ...b, locationName: getLocation(b.locationId)?.name, structures: st.filter((s) => s.baseId === b.id) })) });
}));
adminRouter.delete('/bases/:id', gm, wrap(async (req, res) => {
  await db.transaction(async (tx) => {
    const [b] = await tx.select().from(schema.bases).where(eq(schema.bases.id, num(req.params.id)));
    if (!b) throw new Error('Base não encontrada.');
    await tx.update(schema.containers).set({ baseId: null, kind: 'chest' }).where(eq(schema.containers.baseId, b.id));
    await tx.delete(schema.bases).where(eq(schema.bases.id, b.id));
    await adminLog(tx, uid(req), 'base.delete', 'base', b.id, { base: b });
    pushScene(b.locationId);
  });
  res.json({ ok: true });
}));

// ───────── Configuração global
adminRouter.get('/config', wrap(async (_req, res) => { res.json({ config: cfg(), defaults: defaultGameConfig, clock: clock() }); }));
adminRouter.put('/config', adminOnly, wrap(async (req, res) => {
  const before = cfg();
  await updateGameConfig(req.body?.config, uid(req));
  await adminLog(db, uid(req), 'config.update', 'config', 'game', { before, after: cfg() });
  res.json({ ok: true, config: cfg() });
}));
adminRouter.post('/world/time', gm, wrap(async (req, res) => { const h = z.number().min(0).max(23).parse(req.body?.hour); await setGameTime(h); await adminLog(db, uid(req), 'world.time', 'world', 'clock', { hour: h }); emitAll('world:clock', clock()); res.json({ ok: true }); }));
adminRouter.post('/world/weather', gm, wrap(async (req, res) => { const w = z.enum(['clear', 'cloudy', 'rain', 'storm', 'fog', 'snow']).parse(req.body?.weather); await setWeather(w); await adminLog(db, uid(req), 'world.weather', 'world', 'weather', { weather: w }); emitAll('world:weather', { weather: w }); res.json({ ok: true }); }));

// ───────── Controle do jogo: pausa, abertura, aprovação de fichas e resets
async function pendingCharacters() {
  const c = schema.characters;
  const rows = await db.select({ id: c.id, userId: c.userId, username: schema.users.username, firstName: c.firstName, lastName: c.lastName, age: c.age, profession: c.profession,
    traits: c.traits, attributes: c.attributes, appearance: c.appearance, backstory: c.backstory, portrait: c.portrait, createdAt: c.createdAt })
    .from(c).innerJoin(schema.users, eq(schema.users.id, c.userId)).where(and(eq(c.approved, false), eq(c.alive, true))).orderBy(c.id);
  return rows.map((r) => ({ ...r, professionName: professionById(r.profession)?.name ?? r.profession, online: isUserOnline(r.userId) }));
}
adminRouter.get('/server', wrap(async (_req, res) => {
  const [{ characters }] = await db.select({ characters: sql<number>`count(*)::int` }).from(schema.characters).where(eq(schema.characters.alive, true));
  res.json({ status: serverStatus(), pending: await pendingCharacters(), characters, online: onlineUserIds().length, now: Date.now() });
}));
adminRouter.post('/server/pause', adminOnly, wrap(async (req, res) => {
  const message = z.string().trim().max(300).parse(req.body?.message ?? '');
  const st = await pauseGame(message);
  await adminLog(db, uid(req), 'server.pause', 'server', 'game', { message });
  res.json({ ok: true, status: st });
}));
adminRouter.post('/server/resume', adminOnly, wrap(async (req, res) => {
  const r = await resumeGame();
  await adminLog(db, uid(req), 'server.resume', 'server', 'game', { pausedMs: r.pausedMs });
  res.json({ ok: true, status: r.status, pausedMs: r.pausedMs });
}));
adminRouter.post('/server/opening', adminOnly, wrap(async (req, res) => {
  const b = z.object({ opensAt: z.number().int().positive().nullable().optional(), requireApproval: z.boolean().optional(), openMessage: z.string().trim().max(300).optional() }).parse(req.body ?? {});
  const st = await setOpening(b);
  if (st.opensAt && st.opensAt > Date.now()) kickEveryone('closed', true); // fechou: jogadores saem, a equipe fica
  await adminLog(db, uid(req), 'server.opening', 'server', 'game', b);
  res.json({ ok: true, status: st });
}));
adminRouter.post('/characters/approve-all', gm, wrap(async (req, res) => {
  const rows = await db.update(schema.characters).set({ approved: true }).where(and(eq(schema.characters.approved, false), eq(schema.characters.alive, true))).returning({ id: schema.characters.id });
  await adminLog(db, uid(req), 'character.approve_all', 'character', '*', { count: rows.length });
  res.json({ ok: true, approved: rows.length });
}));
adminRouter.post('/characters/:id/approve', gm, wrap(async (req, res) => {
  const id = num(req.params.id);
  const [ch] = await db.update(schema.characters).set({ approved: true }).where(and(eq(schema.characters.id, id), eq(schema.characters.approved, false))).returning();
  if (!ch) throw new Error('Ficha não encontrada ou já aprovada.');
  await adminLog(db, uid(req), 'character.approve', 'character', id, { name: `${ch.firstName} ${ch.lastName}` });
  res.json({ ok: true });
}));
adminRouter.post('/characters/:id/reject', gm, wrap(async (req, res) => {
  const id = num(req.params.id);
  const reason = z.string().trim().max(500).parse(req.body?.reason ?? '');
  await db.transaction(async (tx) => {
    const [ch] = await tx.select().from(schema.characters).where(and(eq(schema.characters.id, id), eq(schema.characters.approved, false))).for('update');
    if (!ch) throw new Error('Ficha não encontrada ou já aprovada.');
    const name = `${ch.firstName} ${ch.lastName}`;
    await tx.delete(schema.items).where(and(eq(schema.items.ownerType, 'character'), eq(schema.items.ownerId, String(id))));
    await tx.delete(schema.gameLogs).where(eq(schema.gameLogs.characterId, id));
    await tx.delete(schema.characters).where(eq(schema.characters.id, id));
    // A pessoa vê o motivo na próxima vez que entrar e pode criar outra ficha.
    await tx.update(schema.users).set({ settings: sql`${schema.users.settings} || ${JSON.stringify({ rejection: { name, reason, at: Date.now() } })}::jsonb` }).where(eq(schema.users.id, ch.userId));
    await adminLog(tx, uid(req), 'character.reject', 'character', id, { name, reason });
  });
  res.json({ ok: true });
}));
const RESET_WORD = 'RESETAR';
adminRouter.post('/reset/characters', adminOnly, wrap(async (req, res) => {
  if (req.body?.confirm !== RESET_WORD) throw new Error(`Digite ${RESET_WORD} para confirmar.`);
  kickEveryone('reset');
  const r = await resetCharacters();
  await adminLog(db, uid(req), 'reset.characters', 'server', 'game', r);
  res.json({ ok: true, ...r });
}));
adminRouter.post('/reset/world', adminOnly, wrap(async (req, res) => {
  const b = z.object({ confirm: z.literal(RESET_WORD, { message: `Digite ${RESET_WORD} para confirmar.` }), opensAt: z.number().int().positive().nullable(),
    requireApproval: z.boolean().default(true), openMessage: z.string().trim().max(300).default('') }).parse(req.body ?? {});
  kickEveryone('reset');
  const r = await resetWorld();
  const st = await setOpening({ opensAt: b.opensAt, requireApproval: b.requireApproval, openMessage: b.openMessage });
  await adminLog(db, uid(req), 'reset.world', 'server', 'game', { ...r, opensAt: b.opensAt, requireApproval: b.requireApproval });
  res.json({ ok: true, ...r, status: st });
}));

// ───────── Dia 1 (prólogo pelo celular)
adminRouter.get('/prologue', wrap(async (_req, res) => {
  const s = activePrologue();
  const v = validateDia1();
  let groups: unknown[] = [];
  if (s) {
    const gs = await db.select().from(schema.prologueGroups).where(eq(schema.prologueGroups.sessionId, s.id));
    const ms = await db.select().from(schema.prologueMembers).where(eq(schema.prologueMembers.sessionId, s.id));
    const chars = ms.length ? await db.select({ id: schema.characters.id, firstName: schema.characters.firstName, lastName: schema.characters.lastName }).from(schema.characters).where(inArray(schema.characters.id, ms.map((m) => m.characterId))) : [];
    groups = gs.filter((g) => g.status !== 'merged').map((g) => ({ id: g.id, track: getTrack(g.track)?.name ?? g.track, beat: g.beatId, phase: g.phase, status: g.status, location: getLocation(g.locationId)?.name ?? g.locationId,
      members: ms.filter((m) => m.groupId === g.id).map((m) => { const c = chars.find((x) => x.id === m.characterId); return { id: m.characterId, name: c ? `${c.firstName} ${c.lastName}` : '?', status: m.status, online: isUserOnline(m.userId) }; }) }));
  }
  res.json({ settings: { enabled: serverStatus().prologueEnabled, speed: serverStatus().prologueSpeed }, running: s ? { id: s.id, minute: Math.floor(sessionMinute(s)), act: s.data.act, signal: s.data.signal, speed: s.speed, startedAt: s.startedAt, endsAt: prologueEndsAt() } : null,
    groups, latecomers: await prologueLatecomers(onlineUserIds()), lobby: lobbyPresent().length, candidates: (await prologueCandidates()).length, content: { ...v.stats, errors: v.errors, warnings: v.warnings.length } });
}));
adminRouter.post('/prologue/settings', adminOnly, wrap(async (req, res) => {
  const b = z.object({ enabled: z.boolean().optional(), speed: z.number().min(0.5).max(20).optional() }).parse(req.body ?? {});
  const st = await setOpening({ ...(b.enabled !== undefined ? { prologueEnabled: b.enabled } : {}), ...(b.speed !== undefined ? { prologueSpeed: b.speed } : {}) });
  await adminLog(db, uid(req), 'prologue.settings', 'server', 'prologue', b);
  res.json({ ok: true, status: st });
}));
adminRouter.post('/prologue/start', adminOnly, wrap(async (req, res) => {
  const speed = z.number().min(0.5).max(20).optional().parse(req.body?.speed);
  const r = await startPrologueNow(speed);
  await adminLog(db, uid(req), 'prologue.start', 'server', 'prologue', r);
  res.json({ ok: true, ...r });
}));
adminRouter.post('/prologue/join', wrap(async (req, res) => {
  const characterId = z.number().int().positive().parse(req.body?.characterId);
  const r = await joinPrologueLate(characterId);
  await adminLog(db, uid(req), 'prologue.join', 'character', String(characterId), r);
  res.json(r);
}));
adminRouter.post('/prologue/stop', adminOnly, wrap(async (req, res) => {
  await finishPrologue();
  await adminLog(db, uid(req), 'prologue.stop', 'server', 'prologue', {});
  res.json({ ok: true });
}));

// ───────── Catálogo de assets
adminRouter.get('/assets', wrap(async (_req, res) => {
  const rows = await db.select().from(schema.assets).orderBy(schema.assets.kind, schema.assets.key);
  const usage = allLocations().reduce<Record<string, string[]>>((acc, l) => { (acc[l.sceneKey] ??= []).push(l.name); return acc; }, {});
  res.json({ assets: await Promise.all(rows.map(async (a) => ({ ...a, exists: await fs.access(path.join(CLIENT_PUBLIC_DIR, a.path)).then(() => true, () => false), usedBy: usage[a.key] ?? [] }))) });
}));
const assetUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
adminRouter.post('/assets/:key', adminOnly, assetUpload.single('file'), wrap(async (req, res) => {
  const [a] = await db.select().from(schema.assets).where(eq(schema.assets.key, String(req.params.key)));
  if (!a) throw new Error('Asset não catalogado.');
  if (!req.file) throw new Error('Envie um arquivo.');
  if (a.kind === 'audio') {
    const ok = req.file.buffer.subarray(0, 3).toString() === 'ID3' || req.file.buffer.subarray(0, 4).toString() === 'OggS' || (req.file.buffer[0] === 0xff && (req.file.buffer[1] & 0xe0) === 0xe0);
    if (!ok) throw new Error('Áudio deve ser MP3 ou OGG.');
    await fs.mkdir(path.dirname(path.join(CLIENT_PUBLIC_DIR, a.path)), { recursive: true });
    await fs.writeFile(path.join(CLIENT_PUBLIC_DIR, a.path), req.file.buffer);
  } else {
    const meta = await sharp(req.file.buffer).metadata();
    if (!['png', 'jpeg', 'webp'].includes(meta.format ?? '')) throw new Error('Imagem deve ser PNG, JPG ou WEBP.');
    // Cenários são WEBP (leves para carregar); o resto continua PNG.
    const out = await (a.path.endsWith('.webp') ? sharp(req.file.buffer).webp({ quality: 84 }) : sharp(req.file.buffer).png()).toBuffer();
    await fs.mkdir(path.dirname(path.join(CLIENT_PUBLIC_DIR, a.path)), { recursive: true });
    await fs.writeFile(path.join(CLIENT_PUBLIC_DIR, a.path), out);
  }
  await db.update(schema.assets).set({ isPlaceholder: false, updatedAt: new Date() }).where(eq(schema.assets.key, a.key));
  await adminLog(db, uid(req), 'asset.upload', 'asset', a.key, { size: req.file.size });
  res.json({ ok: true });
}));
export { notify };
