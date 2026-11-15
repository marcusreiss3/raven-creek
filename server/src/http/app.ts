import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { env } from '../config/env.js';
import { authenticate } from './auth.js';
import { publicRouter } from './routes/public.js';
import { adminRouter } from './routes/admin.js';
import { CLIENT_DIST_DIR, CLIENT_PUBLIC_DIR } from './paths.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && origin === env.clientOrigin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Allow-Credentials', 'true'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE'); }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: '300kb' }));
  app.use(cookieParser());
  app.use('/api', rateLimit({ windowMs: 60_000, limit: env.isTest ? 10000 : 400, standardHeaders: true, legacyHeaders: false }));
  app.use('/api', authenticate);
  app.use('/api', publicRouter);
  app.use('/api/admin', adminRouter);
  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.use('/uploads', express.static(path.resolve(env.uploadDir), { setHeaders: (res) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Content-Disposition', 'inline'); } }));
  // Assets substituíveis (placeholders/artes definitivas) sempre a partir de client/public/assets.
  app.use('/assets', express.static(path.join(CLIENT_PUBLIC_DIR, 'assets')));
  // Em produção, o servidor também entrega o cliente compilado.
  if (fs.existsSync(CLIENT_DIST_DIR)) {
    app.use(express.static(CLIENT_DIST_DIR));
    app.get(/^\/(?!api|uploads|socket\.io).*/, (_req, res) => res.sendFile(path.join(CLIENT_DIST_DIR, 'index.html')));
  }
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err); res.status(err?.status ?? 500).json({ error: err?.status === 413 ? 'Arquivo grande demais.' : 'Erro interno.' });
  });
  return app;
}
