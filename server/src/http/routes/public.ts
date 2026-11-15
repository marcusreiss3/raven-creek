import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import sharp from 'sharp';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../../db/index.js';
import { env } from '../../config/env.js';
import { COOKIE, cookieOptions, requireUser, signToken } from '../auth.js';
import { ATTRIBUTES, ATTRIBUTE_MAX, ATTRIBUTE_MIN, ATTRIBUTE_POINTS, PROFESSIONS, SKILLS, TRAITS, TRAIT_BASE_POINTS, AGE_STAGES } from '../../game/content/character.js';
import { ITEM_DEFS, REGION_NAMES } from '../../game/content/items.js';
import { STRUCTURES } from '../../game/content/structures.js';
import { activeCharacter, buildSelfState, createCharacter } from '../../game/services/characters.js';
import { allConnections, allLocations } from '../../game/services/world.js';
import { getRecipes } from '../../game/services/config.js';
import { DEATH_CAUSES } from '../../game/rules/simulate.js';
import { pushScene, pushSelf } from '../../game/services/realtime.js';
import { playBlock, publicStatus } from '../../game/services/serverStatus.js';
import { lobbyPing, lobbyPresent } from '../../game/services/prologue.js';

export const publicRouter = Router();
const authLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: env.isTest ? 1000 : 30, standardHeaders: true, legacyHeaders: false });

const credentials = z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,20}$/, 'Usuário: 3–20 caracteres (letras, números, _).'), password: z.string().min(8, 'Senha: mínimo 8 caracteres.').max(128) });

publicRouter.post('/auth/register', authLimiter, async (req, res) => {
  const p = credentials.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const [exists] = await db.select().from(schema.users).where(sql`lower(${schema.users.username}) = ${p.data.username}`);
  if (exists) return res.status(409).json({ error: 'Nome de usuário já existe.' });
  const [u] = await db.insert(schema.users).values({ username: p.data.username, passwordHash: await bcrypt.hash(p.data.password, 10) }).returning();
  res.cookie(COOKIE, signToken(u), cookieOptions());
  res.json({ user: { id: u.id, username: u.username, role: u.role } });
});

publicRouter.post('/auth/login', authLimiter, async (req, res) => {
  const p = credentials.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Credenciais inválidas.' });
  const [u] = await db.select().from(schema.users).where(sql`lower(${schema.users.username}) = ${p.data.username}`);
  if (!u || !(await bcrypt.compare(p.data.password, u.passwordHash))) return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  if (u.bannedUntil && u.bannedUntil > new Date()) return res.status(403).json({ error: `Conta suspensa até ${u.bannedUntil.toLocaleString('pt-BR')}.` });
  res.cookie(COOKIE, signToken(u), cookieOptions());
  res.json({ user: { id: u.id, username: u.username, role: u.role } });
});

publicRouter.post('/auth/logout', requireUser, async (req, res) => {
  await db.update(schema.users).set({ tokenVersion: req.user!.tokenVersion + 1 }).where(eq(schema.users.id, req.user!.id));
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

publicRouter.get('/auth/me', async (req, res) => {
  if (!req.user) return res.json({ user: null });
  const ch = await activeCharacter(req.user.id);
  res.json({
    user: { id: req.user.id, username: req.user.username, role: req.user.role, settings: req.user.settings }, characterId: ch?.id ?? null,
    // Controle do jogo: por que não dá para jogar agora (pausa, abertura agendada, ficha pendente) e ficha recusada.
    character: ch ? { id: ch.id, name: `${ch.firstName} ${ch.lastName}`, approved: ch.approved, portrait: ch.portrait } : null,
    block: playBlock(req.user.role, ch), server: publicStatus(),
    rejection: (req.user.settings as any)?.rejection ?? null,
  });
});

/** Sala de espera do Dia 1: "estou aqui" (a cada poucos segundos). Quem está aqui na hora da abertura entra na sessão. */
publicRouter.post('/prologue/lobby', requireUser, async (req, res) => {
  const ch = await activeCharacter(req.user!.id);
  if (ch?.approved) lobbyPing(ch.id);
  res.json({ ok: true, block: playBlock(req.user!.role, ch), server: publicStatus(), waiting: lobbyPresent().length });
});

publicRouter.put('/me/settings', requireUser, async (req, res) => {
  const s = z.object({ musicVolume: z.number().min(0).max(1).optional(), sfxVolume: z.number().min(0).max(1).optional(), muted: z.boolean().optional(), chatWidth: z.number().min(260).max(700).optional(), chatCollapsed: z.boolean().optional() }).parse(req.body);
  const settings = { ...req.user!.settings, ...s };
  await db.update(schema.users).set({ settings }).where(eq(schema.users.id, req.user!.id));
  res.json({ settings });
});

/** Conteúdo estático para a criação de personagem e interface. */
publicRouter.get('/content', (_req, res) => {
  res.json({
    attributes: ATTRIBUTES, attributePoints: ATTRIBUTE_POINTS, attributeMin: ATTRIBUTE_MIN, attributeMax: ATTRIBUTE_MAX,
    professions: PROFESSIONS.map((p) => ({ id: p.id, name: p.name, description: p.description, perks: p.perks, skills: p.skills, items: p.items, traitPoints: p.modifiers?.traitPoints ?? 0 })),
    traits: TRAITS, traitBasePoints: TRAIT_BASE_POINTS, ageStages: AGE_STAGES.map((s) => ({ minAge: s.minAge, name: s.name, description: s.description })), skills: SKILLS, regions: REGION_NAMES,
    itemNames: Object.fromEntries(ITEM_DEFS.map((d) => [d.id, d.name])),
    structures: Object.entries(STRUCTURES).map(([id, s]) => ({ id, ...s })),
    recipes: getRecipes().map((r) => ({ id: r.id, name: r.name, skill: r.skill, minLevel: r.minLevel, requiresKnowledge: r.requiresKnowledge, inputs: r.inputs, tools: r.tools, output: r.output })),
  });
});

/** Mapa do mundo: nós e conexões (sem informações de loot/perigo exatos). */
publicRouter.get('/world/map', requireUser, async (_req, res) => {
  const regions = await db.select().from(schema.regions);
  const bases = await db.select({ locationId: schema.bases.locationId, name: schema.bases.name, factionId: schema.bases.factionId }).from(schema.bases);
  const factions = await db.select({ id: schema.factions.id, name: schema.factions.name, emblem: schema.factions.emblem, color: schema.factions.color }).from(schema.factions);
  const { PROJECTS } = await import('../../game/content/projects.js');
  res.json({
    regions,
    locations: allLocations().map((l) => ({ id: l.id, name: l.name, regionId: l.regionId, category: l.category, x: l.x, y: l.y, indoor: l.indoor, danger: l.danger, description: l.description, buildable: l.buildable })),
    bases: bases.map((b) => ({ ...b, faction: factions.find((f) => f.id === b.factionId) ?? null })),
    projects: PROJECTS.map((p) => ({ id: p.id, name: p.name, locationId: p.locationId })),
    connections: allConnections().map((c) => ({ id: c.id, fromId: c.fromId, toId: c.toId, distance: c.distance, roadType: c.roadType, blocked: c.blocked })),
  });
});

publicRouter.post('/characters', requireUser, async (req, res) => {
  try {
    const ch = await createCharacter(req.user!.id, req.body);
    res.json({ characterId: ch.id });
  } catch (e: any) {
    if (e?.issues) return res.status(400).json({ error: e.issues[0].message });
    if (e?.cause) { console.error('[criar personagem] falha no banco:', e.cause?.code, e.cause?.message, e.cause?.detail ?? ''); return res.status(500).json({ error: `Erro no banco ao salvar o personagem: ${e.cause.message}${e.cause.detail ? ` (${e.cause.detail})` : ''}` }); }
    res.status(400).json({ error: e.message });
  }
});

publicRouter.get('/characters/me', requireUser, async (req, res) => {
  const ch = await activeCharacter(req.user!.id);
  if (!ch) return res.json({ character: null });
  res.json({ character: (await buildSelfState(ch.id))?.state });
});

// ── Upload de retrato: valida tipo real, dimensões e re-codifica o PNG (remove metadados/carga oculta).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export async function processPortrait(buf: Buffer) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_MAGIC)) throw new Error('O arquivo precisa ser um PNG.');
  const meta = await sharp(buf, { limitInputPixels: 4096 * 4096 }).metadata();
  if (meta.format !== 'png') throw new Error('O arquivo precisa ser um PNG.');
  if (!meta.width || !meta.height || meta.width < 200 || meta.height < 250) throw new Error('Imagem pequena demais (mínimo 200×250 px).');
  if (meta.width > 4096 || meta.height > 4096) throw new Error('Imagem grande demais (máximo 4096×4096 px).');
  const out = await sharp(buf).ensureAlpha().resize({ height: 1200, width: 1000, fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
  return { out, hasAlpha: !!meta.hasAlpha, width: meta.width, height: meta.height };
}
publicRouter.post('/characters/me/portrait', requireUser, upload.single('portrait'), async (req, res) => {
  const ch = await activeCharacter(req.user!.id);
  if (!ch) return res.status(400).json({ error: 'Crie um personagem primeiro.' });
  if (!req.file) return res.status(400).json({ error: 'Envie um arquivo PNG.' });
  try {
    const { out, hasAlpha } = await processPortrait(req.file.buffer);
    const dir = path.resolve(env.uploadDir, 'portraits'); await fs.mkdir(dir, { recursive: true });
    const name = `${ch.id}_${randomBytes(6).toString('hex')}.png`;
    await fs.writeFile(path.join(dir, name), out);
    if (ch.portrait?.startsWith('/uploads/portraits/')) await fs.rm(path.join(dir, path.basename(ch.portrait)), { force: true });
    const url = `/uploads/portraits/${name}`;
    await db.update(schema.characters).set({ portrait: url }).where(eq(schema.characters.id, ch.id));
    pushSelf(ch.id); pushScene(ch.locationId);
    res.json({ portrait: url, warning: hasAlpha ? null : 'A imagem não tem transparência — o fundo aparecerá no cenário.' });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
publicRouter.put('/characters/me/portrait-adjust', requireUser, async (req, res) => {
  const p = z.object({ scale: z.number().min(0.5).max(1.8), x: z.number().min(-40).max(40), y: z.number().min(-40).max(40) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Ajuste inválido.' });
  const ch = await activeCharacter(req.user!.id); if (!ch) return res.status(400).json({ error: 'Sem personagem.' });
  await db.update(schema.characters).set({ portraitAdjust: p.data }).where(eq(schema.characters.id, ch.id));
  pushSelf(ch.id); pushScene(ch.locationId);
  res.json({ ok: true });
});
publicRouter.put('/characters/me/profile', requireUser, async (req, res) => {
  const p = z.object({ appearance: z.string().max(600), backstory: z.string().max(2000) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Dados inválidos.' });
  const ch = await activeCharacter(req.user!.id); if (!ch) return res.status(400).json({ error: 'Sem personagem.' });
  await db.update(schema.characters).set(p.data).where(eq(schema.characters.id, ch.id));
  pushSelf(ch.id); res.json({ ok: true });
});

/** Memorial dos mortos. */
publicRouter.get('/memorial', async (_req, res) => {
  const rows = await db.select({ id: schema.characters.id, firstName: schema.characters.firstName, lastName: schema.characters.lastName, profession: schema.characters.profession,
    diedAt: schema.characters.diedAt, deathCause: schema.characters.deathCause, createdAt: schema.characters.createdAt, portrait: schema.characters.portrait, epitaph: schema.characters.epitaph, locationId: schema.characters.locationId })
    .from(schema.characters).where(eq(schema.characters.alive, false)).orderBy(desc(schema.characters.diedAt)).limit(100);
  res.json({ dead: rows.map((r) => ({ ...r, cause: DEATH_CAUSES[r.deathCause ?? 'unknown'] ?? r.deathCause, profession: PROFESSIONS.find((p) => p.id === r.profession)?.name, survivedHours: r.diedAt ? Math.round((r.diedAt.getTime() - r.createdAt.getTime()) / 3_600_000 * 10) / 10 : null })) });
});
publicRouter.put('/memorial/:id/epitaph', requireUser, async (req, res) => {
  const text = String(req.body?.epitaph ?? '').slice(0, 200);
  await db.update(schema.characters).set({ epitaph: text }).where(and(eq(schema.characters.id, Number(req.params.id)), eq(schema.characters.userId, req.user!.id), eq(schema.characters.alive, false)));
  res.json({ ok: true });
});
