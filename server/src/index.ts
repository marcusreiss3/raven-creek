import http from 'node:http';
import { env } from './config/env.js';
import { createApp } from './http/app.js';
import { createSocketServer } from './socket/index.js';
import { loadAll } from './game/services/config.js';
import { loadWorld } from './game/services/world.js';
import { startScheduler, stopScheduler } from './game/services/scheduler.js';
import { runMigrations } from './db/migrate.js';
import { applyPatches } from './db/patches.js';
import { pool } from './db/index.js';
import { ensureProjects } from './game/services/projects.js';
import { loadFires } from './game/services/nature.js';
import { loadServerStatus } from './game/services/serverStatus.js';
import { loadPrologue } from './game/services/prologue.js';

async function main() {
  await runMigrations();
  // Rede de segurança: se o mundo não existir (ex.: seed nunca executado), cria agora. O seed é idempotente.
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM locations');
  if (rows[0].n < 100) {
    console.log('Mundo vazio — criando locais, itens, zumbis, eventos e contas iniciais…');
    const { seed } = await import('./seed/index.js');
    await seed({ demo: process.env.SEED_DEMO !== '0' });
    console.log('Mundo criado.');
  }
  await applyPatches();
  await ensureProjects();
  await loadFires();
  await loadServerStatus();
  await loadPrologue();
  await loadAll();
  await loadWorld();
  const app = createApp();
  const server = http.createServer(app);
  const io = createSocketServer(server);
  if (env.redisUrl) {
    // Escala horizontal opcional: várias instâncias compartilham eventos via Redis.
    try {
      const { createAdapter } = await import('@socket.io/redis-adapter' as string);
      const { createClient } = await import('redis' as string);
      const pub = createClient({ url: env.redisUrl }); const sub = pub.duplicate();
      await Promise.all([pub.connect(), sub.connect()]);
      io.adapter(createAdapter(pub, sub));
      console.log('Socket.IO usando adapter Redis.');
    } catch (e) { console.warn('REDIS_URL definido, mas o adapter Redis não está instalado (npm i @socket.io/redis-adapter redis).', (e as Error).message); }
  }
  await startScheduler();
  const host = process.env.HOST || undefined;
  server.listen(env.port, host, () => console.log(`Raven Creek rodando em http://${host ?? 'localhost'}:${env.port}`));
  const shutdown = async () => { stopScheduler(); io.close(); server.close(); await pool.end(); process.exit(0); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
main().catch((e) => { console.error(e); process.exit(1); });
