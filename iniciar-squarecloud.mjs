// Inicia o Raven Creek numa hospedagem Linux (Square Cloud ou parecida).
// 1) instala as dependências do servidor e do cliente (só quando package.json/lock mudam);
// 2) compila o cliente (só quando o código do cliente muda);
// 3) sobe o servidor, que entrega o site, a API e o Socket.IO na mesma porta (PORT, 80 na Square Cloud).
// Variável obrigatória: DATABASE_URL (JWT_SECRET é opcional: sem ele, o servidor gera um e guarda no banco). Veja docs/HOSPEDAGEM.md.
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, cpSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = dirname(fileURLToPath(import.meta.url));
const serverDir = join(root, 'server');
const clientDir = join(root, 'client');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const log = (m) => console.log(`[raven-creek] ${m}`);

const missing = ['DATABASE_URL'].filter((k) => !process.env[k]);
if (missing.length) {
  log(`Faltam variáveis de ambiente: ${missing.join(', ')}. Configure no painel da hospedagem (Variáveis de ambiente).`);
  process.exit(1);
}
if (!process.env.SEED_ADMIN_PASSWORD) log('Aviso: SEED_ADMIN_PASSWORD não definida — num banco novo, a conta admin seria criada com a senha padrão.');

function run(args, cwd, extraEnv = {}) {
  const r = spawnSync(npm, args, { cwd, stdio: 'inherit', env: { ...process.env, ...extraEnv }, shell: process.platform === 'win32' });
  if (r.status !== 0) { log(`Falhou: npm ${args.join(' ')} (em ${cwd})`); process.exit(r.status ?? 1); }
}

function hashFiles(paths) {
  const h = createHash('sha1');
  const walk = (p) => {
    if (!existsSync(p)) return;
    const st = statSync(p);
    if (st.isDirectory()) { for (const n of readdirSync(p).sort()) if (n !== 'node_modules' && n !== 'dist') walk(join(p, n)); return; }
    h.update(p.slice(root.length)); h.update(readFileSync(p));
  };
  paths.forEach(walk);
  return h.digest('hex');
}

// Precisa das devDependencies (tsx no servidor; vite/tailwind no cliente), mesmo com NODE_ENV=production.
function install(dir) {
  const stamp = join(dir, 'node_modules', '.raven-install');
  const want = hashFiles([join(dir, 'package.json'), join(dir, 'package-lock.json')]);
  if (existsSync(stamp) && readFileSync(stamp, 'utf8') === want) return;
  log(`Instalando dependências em ${dir.slice(root.length + 1)}…`);
  run(['install', '--include=dev', '--no-audit', '--no-fund'], dir);
  writeFileSync(stamp, want);
}

install(serverDir);
install(clientDir);

const dist = join(clientDir, 'dist');
const buildStamp = join(dist, '.raven-build');
const pub = join(clientDir, 'public');
const srcHash = hashFiles([
  join(clientDir, 'src'), join(clientDir, 'index.html'), join(clientDir, 'vite.config.ts'), join(clientDir, 'package-lock.json'),
  ...readdirSync(pub).filter((n) => n !== 'assets').map((n) => join(pub, n)),
]);
if (!existsSync(buildStamp) || readFileSync(buildStamp, 'utf8') !== srcHash) {
  log('Compilando o cliente…');
  run(['exec', '--', 'vite', 'build'], clientDir, { RC_SKIP_PUBLIC_COPY: '1' });
  // Copia o que está na raiz de public/ (ícones, manifest, fontes); public/assets é servido direto pelo servidor.
  for (const n of readdirSync(pub)) if (n !== 'assets') cpSync(join(pub, n), join(dist, n), { recursive: true });
  writeFileSync(buildStamp, srcHash);
}

mkdirSync(join(serverDir, process.env.UPLOAD_DIR ?? 'uploads'), { recursive: true });
log('Subindo o servidor…');
const child = spawn(process.execPath, [join(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/index.ts'], {
  cwd: serverDir,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production', HOST: process.env.HOST || '0.0.0.0', PORT: process.env.PORT || '80' },
});
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => child.kill(sig));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 0 : 1)));
