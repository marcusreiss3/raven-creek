import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import { env } from '../config/env.js';

/** Junta de novo um certificado PEM colado num campo de uma linha só (as quebras de linha somem no painel). */
function normalizePem(raw: string): string {
  const text = raw.replace(/\\n/g, '\n');
  const blocks = [...text.matchAll(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g)];
  if (!blocks.length) return text;
  return blocks.map(([, kind, body]) => {
    const b64 = body.replace(/\s+/g, '');
    return `-----BEGIN ${kind}-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END ${kind}-----\n`;
  }).join('');
}

/**
 * Bancos na nuvem exigem SSL.
 * - Supabase/Neon (ou DATABASE_SSL=1, ou sslmode=… na URL): SSL sem verificar o certificado.
 * - Banco da Square Cloud: cole o conteúdo do certificate.pem em DATABASE_CERT (o certificado nunca vai para o GitHub).
 */
function poolConfig(url: string): pg.PoolConfig {
  const max = Number(process.env.DB_POOL_MAX ?? 15);
  // Tira os parâmetros ssl* da URL: senão o pg tenta ler arquivos de certificado do disco ou verifica o certificado à força.
  const clean = url.replace(/([?&])(sslmode|sslcert|sslkey|sslrootcert)=[^&]*/g, '$1').replace(/[?&]+(?=&|$)/g, '').replace(/\?&/, '?');
  const certRaw = process.env.DATABASE_CERT_B64 ? Buffer.from(process.env.DATABASE_CERT_B64, 'base64').toString('utf8') : process.env.DATABASE_CERT;
  if (certRaw) {
    const pem = normalizePem(certRaw);
    // O certificado da Square Cloud serve como CA, certificado e chave do cliente (equivale a sslmode=verify-ca).
    return { connectionString: clean, max, ssl: { ca: pem, cert: pem, key: pem, checkServerIdentity: () => undefined } };
  }
  const wantSsl = process.env.DATABASE_SSL === '1' || /[?&]sslmode=(require|prefer|verify-ca|verify-full|no-verify)/.test(url) || /\.(supabase\.co|supabase\.com|neon\.tech)\b/.test(url);
  if (!wantSsl || process.env.DATABASE_SSL === '0') return { connectionString: url, max };
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
