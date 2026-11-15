import type { Server } from 'socket.io';

/**
 * Ponte entre serviços e Socket.IO. Os serviços chamam estas funções; o módulo de socket
 * registra as implementações (evita dependências circulares e permite testes sem socket).
 */
let io: Server | null = null;
const userSockets = new Map<number, Set<string>>();
const pendingSelf = new Set<number>();
const pendingScene = new Set<string>();
let flushTimer: NodeJS.Timeout | null = null;
let selfBuilder: ((characterId: number) => Promise<{ userId: number; state: unknown } | null>) | null = null;
let sceneBuilder: ((locationId: string) => Promise<unknown>) | null = null;

export function setIO(server: Server | null) { io = server; }
export function getIO() { return io; }
export function registerBuilders(self: typeof selfBuilder, scene: typeof sceneBuilder) { selfBuilder = self; sceneBuilder = scene; }

const onlineSinceMap = new Map<number, number>();
export function trackConnect(userId: number, socketId: string) {
  const set = userSockets.get(userId) ?? new Set();
  if (!set.size) onlineSinceMap.set(userId, Date.now());
  set.add(socketId); userSockets.set(userId, set);
}
export function trackDisconnect(userId: number, socketId: string) {
  const set = userSockets.get(userId); if (!set) return; set.delete(socketId);
  if (!set.size) { userSockets.delete(userId); onlineSinceMap.delete(userId); }
}
/** Desde quando o jogador está conectado sem interrupção (ms), ou null se desconectado. */
export const onlineSince = (userId: number) => (isUserOnline(userId) ? onlineSinceMap.get(userId) ?? null : null);
export const isUserOnline = (userId: number) => (userSockets.get(userId)?.size ?? 0) > 0;
export const onlineUserIds = () => [...userSockets.keys()];

export function emitToUser(userId: number, event: string, payload: unknown) { io?.to(`user:${userId}`).emit(event, payload); }
export function emitToRoom(room: string, event: string, payload: unknown) { io?.to(room).emit(event, payload); }
export function emitToLocation(locationId: string, event: string, payload: unknown) { io?.to(`loc:${locationId}`).emit(event, payload); }
export function emitAll(event: string, payload: unknown) { io?.emit(event, payload); }
export function notify(userId: number, text: string, level: 'info' | 'warn' | 'danger' | 'success' = 'info', icon?: string) { emitToUser(userId, 'notify', { text, level, icon, at: Date.now() }); }

/** Agenda reenvio do estado completo do personagem (agrupado em ~60ms). */
export function pushSelf(characterId: number) { pendingSelf.add(characterId); scheduleFlush(); }
export function pushScene(locationId: string) { pendingScene.add(locationId); scheduleFlush(); }
function scheduleFlush() {
  if (flushTimer || !io) return;
  flushTimer = setTimeout(flush, 60);
}
async function flush() {
  flushTimer = null;
  const selves = [...pendingSelf]; pendingSelf.clear();
  const scenes = [...pendingScene]; pendingScene.clear();
  for (const id of selves) {
    try { const r = await selfBuilder?.(id); if (r) emitToUser(r.userId, 'state:self', r.state); } catch (e) { console.error('pushSelf', e); }
  }
  for (const loc of scenes) {
    try { const scene = await sceneBuilder?.(loc); emitToLocation(loc, 'scene:update', scene); } catch (e) { console.error('pushScene', e); }
  }
}
export async function flushNow() { if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; } await flush(); }
