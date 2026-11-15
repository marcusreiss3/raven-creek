import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { env } from './env.js';

/**
 * Segredo que assina os logins (JWT). Se JWT_SECRET não for definido na hospedagem, o servidor gera um segredo
 * aleatório na primeira subida e o guarda no banco (game_config, chave "jwt"), para que os logins sobrevivam a
 * reinicializações. Em desenvolvimento, sem JWT_SECRET e sem segredo salvo, continua o valor padrão do .env.
 */
export async function ensureJwtSecret() {
  if (process.env.JWT_SECRET || env.isTest) return;
  const read = async () => {
    const [r] = await db.select().from(schema.gameConfig).where(eq(schema.gameConfig.key, 'jwt'));
    return (r?.value as { secret?: string } | undefined)?.secret;
  };
  let secret = await read();
  if (!secret && process.env.NODE_ENV === 'production') {
    await db.insert(schema.gameConfig).values({ key: 'jwt', value: { secret: crypto.randomBytes(48).toString('base64url') } }).onConflictDoNothing();
    secret = await read();
    console.log('JWT_SECRET não definido: segredo de login gerado e salvo no banco.');
  }
  if (secret) env.jwtSecret = secret;
}
