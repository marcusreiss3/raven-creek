import { db, schema, type Tx } from '../../db/index.js';

/** Mutex assíncrono por chave (personagem, combate, local). Serializa ações no mesmo processo;
 *  o banco garante a consistência entre processos com SELECT ... FOR UPDATE e updates condicionais. */
const chains = new Map<string, Promise<unknown>>();
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  const chain = prev.then(() => next);
  chains.set(key, chain);
  try { await prev; return await fn(); }
  finally { release(); if (chains.get(key) === chain) chains.delete(key); }
}

export class GameError extends Error {
  constructor(message: string, public code = 'game_error') { super(message); }
}
export const fail = (msg: string, code?: string): never => { throw new GameError(msg, code); };

export async function adminLog(tx: Tx, actorUserId: number, action: string, targetType: string, targetId: string | number, details: Record<string, unknown> = {}) {
  await tx.insert(schema.adminLogs).values({ actorUserId, action, targetType, targetId: String(targetId), details });
}
export async function gameLog(tx: Tx, characterId: number | null, kind: string, message: string, data: Record<string, unknown> = {}) {
  await tx.insert(schema.gameLogs).values({ characterId, kind, message, data });
}
export { db };
