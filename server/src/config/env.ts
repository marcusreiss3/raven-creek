import 'dotenv/config';

const isTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

export const env = {
  isTest,
  databaseUrl: isTest
    ? (process.env.TEST_DATABASE_URL ?? 'postgres://raven:raven@localhost:5432/ravencreek_test')
    : (process.env.DATABASE_URL ?? 'postgres://raven:raven@localhost:5432/ravencreek'),
  redisUrl: process.env.REDIS_URL || '',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  port: Number(process.env.PORT ?? 4000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  worldTickMs: Number(process.env.WORLD_TICK_MS ?? 5000),
  seedAdminUser: process.env.SEED_ADMIN_USER ?? 'admin',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD ?? 'admin1234',
};
