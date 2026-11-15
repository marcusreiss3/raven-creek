import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import { env } from '../config/env.js';

export const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 15 });
// Conexões ociosas que caem (ex.: banco reiniciado) não podem derrubar o servidor; o pool reconecta sozinho.
pool.on('error', (e) => console.error('[banco] conexão perdida:', e.message));
export const db = drizzle(pool, { schema });
export type DB = NodePgDatabase<typeof schema>;
/** Transação ou o próprio db — serviços aceitam ambos. */
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0] | DB;
export { schema };
