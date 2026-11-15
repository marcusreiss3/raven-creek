import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import { env } from '../config/env.js';

/** Bancos na nuvem (Supabase, Neon, Square Cloud…) exigem SSL. DATABASE_SSL=1 força; sslmode=… na URL também ativa. */
function poolConfig(url: string): pg.PoolConfig {
  const max = Number(process.env.DB_POOL_MAX ?? 15);
  const wantSsl = process.env.DATABASE_SSL === '1' || /[?&]sslmode=(require|prefer|verify-ca|verify-full|no-verify)/.test(url) || /\.(supabase\.co|supabase\.com|neon\.tech)\b/.test(url);
  if (!wantSsl || process.env.DATABASE_SSL === '0') return { connectionString: url, max };
  // Tira o sslmode da URL: senão o pg o reinterpreta como verificação total do certificado e recusa poolers como o do Supabase.
  const clean = url.replace(/([?&])sslmode=[^&]*(&|$)/, (_m, a, b) => (b ? a : '')).replace(/[?&]$/, '');
  return { connectionString: clean, max, ssl: { rejectUnauthorized: false } };
}

export const pool = new pg.Pool(poolConfig(env.databaseUrl));
// Conexões ociosas que caem (ex.: banco reiniciado) não podem derrubar o servidor; o pool reconecta sozinho.
pool.on('error', (e) => console.error('[banco] conexão perdida:', e.message));
export const db = drizzle(pool, { schema });
export type DB = NodePgDatabase<typeof schema>;
/** Transação ou o próprio db — serviços aceitam ambos. */
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0] | DB;
export { schema };
