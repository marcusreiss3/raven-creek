/** Prepara o banco de TESTE (TEST_DATABASE_URL): apaga tudo, migra e popula. */
export default async function setup() {
  process.env.NODE_ENV = 'test';
  const { resetDatabase } = await import('../src/db/reset.js');
  const { runMigrations } = await import('../src/db/migrate.js');
  const { seed } = await import('../src/seed/index.js');
  const { pool } = await import('../src/db/index.js');
  await resetDatabase();
  await runMigrations();
  await seed({ demo: false });
  await pool.end();
}
