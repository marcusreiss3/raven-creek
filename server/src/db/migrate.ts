import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  await migrate(db, { migrationsFolder: path.resolve(here, '../../drizzle') });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations().then(async () => { console.log('Migrações aplicadas.'); await pool.end(); })
    .catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
}
