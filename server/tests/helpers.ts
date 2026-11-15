import http from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { io as ioClient, type Socket } from 'socket.io-client';
import { db, schema } from '../src/db/index.js';
import { loadAll } from '../src/game/services/config.js';
import { loadWorld } from '../src/game/services/world.js';
import { createApp } from '../src/http/app.js';
import { createSocketServer } from '../src/socket/index.js';
import { createCharacter } from '../src/game/services/characters.js';
import { signToken, COOKIE } from '../src/http/auth.js';

let counter = 0;
export async function boot() { await loadAll(); await loadWorld(); const { ensureProjects } = await import('../src/game/services/projects.js'); await ensureProjects(); }

export async function makePlayer(opts: { role?: 'player' | 'gm' | 'moderator' | 'admin'; profession?: string; locationId?: string } = {}) {
  const username = `t${Date.now().toString(36)}${counter++}`;
  const [u] = await db.insert(schema.users).values({ username, passwordHash: await bcrypt.hash('senha1234', 4), role: opts.role ?? 'player' }).returning();
  const ch = await createCharacter(u.id, { firstName: 'Teste', lastName: username, age: 30, appearance: '', backstory: '', profession: opts.profession ?? 'unemployed', traits: [], attributes: { strength: 5, agility: 5, endurance: 4, perception: 4, intellect: 4 } });
  if (opts.locationId) await db.update(schema.characters).set({ locationId: opts.locationId }).where(eq(schema.characters.id, ch.id));
  const cookie = `${COOKIE}=${signToken(u)}`;
  return { user: u, character: ch, cookie };
}

export async function startServer() {
  const app = createApp();
  const server = http.createServer(app);
  createSocketServer(server);
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as AddressInfo).port;
  return { url: `http://localhost:${port}`, close: () => new Promise<void>((r) => server.close(() => r())), server };
}

export function connect(url: string, cookie: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioClient(url, { extraHeaders: { cookie }, transports: ['websocket'], reconnection: false });
    s.on('connect', () => resolve(s)); s.on('connect_error', reject);
  });
}
export const action = (s: Socket, type: string, payload: unknown = {}) => new Promise<any>((r) => s.emit('action', { type, payload }, r));
export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
export function waitFor<T>(s: Socket, event: string, pred: (x: T) => boolean = () => true, timeout = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { s.off(event, h); reject(new Error(`timeout esperando ${event}`)); }, timeout);
    const h = (x: T) => { if (pred(x)) { clearTimeout(t); s.off(event, h); resolve(x); } };
    s.on(event, h);
  });
}
