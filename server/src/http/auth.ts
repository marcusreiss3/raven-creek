import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { env } from '../config/env.js';

export type AuthUser = typeof schema.users.$inferSelect;
declare global { namespace Express { interface Request { user?: AuthUser } } }

export const COOKIE = 'rc_token';
export function signToken(u: AuthUser) { return jwt.sign({ uid: u.id, tv: u.tokenVersion }, env.jwtSecret, { expiresIn: '14d' }); }
export function cookieOptions() {
  return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', maxAge: 14 * 24 * 3600 * 1000, path: '/' };
}

/** Valida o token e a versão (logout/ban invalidam sessões antigas). */
export async function userFromToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  try {
    const p = jwt.verify(token, env.jwtSecret) as { uid: number; tv: number };
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, p.uid));
    if (!u || u.tokenVersion !== p.tv) return null;
    if (u.bannedUntil && u.bannedUntil > new Date()) return null;
    return u;
  } catch { return null; }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  req.user = (await userFromToken(req.cookies?.[COOKIE])) ?? undefined;
  next();
}
export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Faça login.' });
  next();
}
export const STAFF = ['gm', 'moderator', 'admin'] as const;
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Faça login.' });
    if (req.user.role !== 'admin' && !roles.includes(req.user.role)) return res.status(403).json({ error: 'Acesso restrito.' });
    next();
  };
}
