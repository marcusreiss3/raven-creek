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
/**
 * DATABASE_PASSWORD (opcional) substitui a senha da URL. Assim dá para colar a URL do painel como vem
 * (até com "<password>") e pôr a senha à parte, sem se preocupar com caracteres especiais (@ : / # %…).
 */
function withPassword(url: string): string {
  const pw = process.env.DATABASE_PASSWORD?.trim();
  if (!pw) return url;
  const m = url.match(/^(postgres(?:ql)?:\/\/)([^@/]*)@(.*)$/);
  if (!m) return url;
  const user = m[2].split(':')[0];
  return `${m[1]}${user}:${encodeURIComponent(pw)}@${m[3]}`;
}

function poolConfig(rawUrl: string): pg.PoolConfig {
  const url = withPassword(rawUrl.trim());
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

/** Linha de diagnóstico no log (sem a senha): ajuda a achar erro de configuração na hospedagem. */
function describe(rawUrl: string) {
  const m = rawUrl.trim().match(/^postgres(?:ql)?:\/\/([^@/]*)@([^/?]+)(\/[^?]*)?/);
  if (!m) return 'DATABASE_URL não parece uma URL postgresql://usuario:senha@host:porta/banco';
  const [user, urlPw = ''] = m[1].split(':');
  const fromEnv = process.env.DATABASE_PASSWORD?.trim();
  const pw = fromEnv ? `DATABASE_PASSWORD (${fromEnv.length} caracteres)` : /^<.*>$/.test(urlPw) ? 'AINDA É O MODELO "<password>" — defina DATABASE_PASSWORD' : urlPw ? `da própria URL (${decodeURIComponent(urlPw).length} caracteres)` : 'nenhuma';
  const cert = process.env.DATABASE_CERT || process.env.DATABASE_CERT_B64 ? 'com certificado' : 'sem certificado';
  return `usuário "${user}" em ${m[2]}, banco "${(m[3] ?? '/').slice(1) || user}", senha: ${pw}, ${cert}`;
}
if (!env.isTest && process.env.NODE_ENV === 'production') console.log(`[banco] ${describe(env.databaseUrl)}`);

export const pool = new pg.Pool(poolConfig(env.databaseUrl));
// Conexões ociosas que caem (ex.: banco reiniciado) não podem derrubar o servidor; o pool reconecta sozinho.
pool.on('error', (e) => console.error('[banco] conexão perdida:', e.message));
export const db = drizzle(pool, { schema });
export type DB = NodePgDatabase<typeof schema>;
/** Transação ou o próprio db — serviços aceitam ambos. */
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0] | DB;
export { schema };
