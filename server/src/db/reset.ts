import { pool } from './index.js';

export async function resetDatabase() {
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;');
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('reset.ts')) {
  resetDatabase().then(async () => { console.log('Banco limpo.'); await pool.end(); });
}
