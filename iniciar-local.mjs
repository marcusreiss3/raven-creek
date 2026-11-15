/**
 * Iniciador local "um clique": instala dependências, sobe um PostgreSQL embutido (sem instalar nada no sistema),
 * aplica migrações, popula o mundo na primeira vez e inicia servidor + cliente.
 * Uso: node iniciar-local.mjs   (no Windows: dê dois cliques em INICIAR.bat)
 */
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const LOG = join(root, 'raven-creek.log');
writeFileSync(LOG, `=== ${new Date().toISOString()} · Node ${process.version} · ${process.platform} ===\n`);
const toFile = (t) => { try { appendFileSync(LOG, t); } catch { /* ignora */ } };
const log = (m) => { console.log(`\x1b[33m[raven creek]\x1b[0m ${m}`); toFile(`[raven creek] ${m}\n`); };
process.on('uncaughtException', (e) => { toFile(`ERRO: ${e?.stack ?? e}\n`); console.error(e); });
process.on('unhandledRejection', (e) => { toFile(`ERRO: ${e?.stack ?? e}\n`); console.error(e); });
const portFree = (port) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(port, '127.0.0.1'); });
const freePort = async (start) => { for (let p = start; p < start + 50; p++) if (await portFree(p)) return p; throw new Error('Nenhuma porta livre perto de ' + start); };
const httpOk = (url) => new Promise((res) => { const r = http.get(url, (x) => { x.resume(); res(x.statusCode < 500); }); r.on('error', () => res(false)); r.setTimeout(3000, () => { r.destroy(); res(false); }); });
const run = (cmd, args, cwd, env = {}) => {
  const r = spawnSync([cmd, ...args].join(' '), { cwd, stdio: ['inherit', 'pipe', 'pipe'], shell: true, env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`; process.stdout.write(out); toFile(out);
  if (r.status !== 0) { log(`Falhou: ${cmd} ${args.join(' ')} (em ${cwd}). Detalhes em raven-creek.log`); process.exit(r.status ?? 1); }
};

// 1) Dependências
for (const dir of [root, join(root, 'server'), join(root, 'client')]) {
  if (!existsSync(join(dir, 'node_modules'))) { log(`Instalando dependências em ${dir} (só na primeira vez)…`); run('npm', ['install', '--no-audit', '--no-fund'], dir); }
}

// 2) .env do servidor
const envFile = join(root, 'server', '.env');
if (!existsSync(envFile)) {
  const example = readFileSync(join(root, 'server', '.env.example'), 'utf8')
    .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${randomBytes(32).toString('hex')}`);
  writeFileSync(envFile, example);
  log('Criado server/.env com um segredo aleatório.');
}

// 3) PostgreSQL embutido (dados persistem em .dados-postgres)
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const dataDir = join(root, '.dados-postgres');
const platformPkg = `@embedded-postgres/${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
let pgCtl = null;
try { pgCtl = (await import(platformPkg)).pg_ctl; } catch { /* pacote da plataforma indisponível */ }
// Se uma execução anterior foi fechada pelo X (ou travou), o PostgreSQL pode ter ficado rodando sozinho.
// No Windows sobram processos postgres.exe "órfãos" segurando a porta e a memória compartilhada, e o banco
// novo se recusa a subir ("pre-existing shared memory block is still in use"). Encerra só os postgres
// deste jogo (os que rodam de dentro da pasta node_modules daqui), nunca um PostgreSQL instalado no PC.
const pgDir = join(root, 'node_modules', '@embedded-postgres');
const killOrphanPostgres = () => {
  if (process.platform === 'win32') {
    const ps = `Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'postgres.exe' -or $_.Name -eq 'pg_ctl.exe') -and $_.ExecutablePath -and $_.ExecutablePath.StartsWith('${pgDir.replace(/'/g, "''")}', [System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $_.ProcessId }`;
    // -EncodedCommand evita qualquer problema de aspas entre o Node e o PowerShell
    const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { encoding: 'utf8', timeout: 30000 });
    if (r.error || r.status) toFile(`[powershell] status ${r.status} ${r.error ?? ''} ${r.stderr ?? ''}\n`);
    return (r.stdout ?? '').split(/\s+/).filter((x) => /^\d+$/.test(x)).length;
  }
  return spawnSync('pkill', ['-f', pgDir]).status === 0 ? 1 : 0;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Windows: quem está ocupando uma porta (PID e nome do programa), para o log e para decidir se pode encerrar.
const portOwner = (port) => {
  if (process.platform !== 'win32') return null;
  const ns = spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout ?? '';
  // independente do idioma do Windows ("LISTENING", "ESCUTANDO"…): socket ouvindo tem endereço remoto 0.0.0.0:0 ou [::]:0
  const m = ns.split(/\r?\n/).map((l) => l.match(new RegExp(`^\\s*TCP\\s+\\S+:${port}\\s+(?:0\\.0\\.0\\.0:0|\\[::\\]:0)\\s+\\S+\\s+(\\d+)\\s*$`, 'i'))).find(Boolean);
  const pid = m?.[1];
  if (!pid || !/^\d+$/.test(pid)) return null;
  const tl = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' }).stdout ?? '';
  const name = (tl.match(/^"([^"]+)"/m) ?? [])[1] ?? '?';
  return { pid, name };
};
// Último recurso no Windows: encerra todos os postgres.exe do usuário (um PostgreSQL instalado como serviço
// roda com outra conta e o Windows não deixa encerrar sem administrador, então ele não é afetado).
const killAllUserPostgres = () => {
  if (process.platform !== 'win32') return;
  const r = spawnSync('taskkill', ['/F', '/T', '/IM', 'postgres.exe'], { encoding: 'utf8' });
  toFile(`[taskkill postgres.exe] ${(r.stdout ?? '') + (r.stderr ?? '')}\n`);
};
const freeDbPort = async () => {
  const owner = portOwner(54329);
  if (owner) toFile(`[porta 54329] ocupada pelo processo ${owner.pid} (${owner.name})\n`);
  if (owner && /postgres/i.test(owner.name)) {
    log('Um banco de dados de uma execução anterior ainda estava aberto; encerrando…');
    spawnSync('taskkill', ['/F', '/T', '/PID', owner.pid], { stdio: 'ignore' });
    killAllUserPostgres(); await sleep(2000);
  }
};
if (pgCtl && existsSync(join(dataDir, 'postmaster.pid'))) {
  log('Encerrando um banco que ficou aberto de uma execução anterior…');
  spawnSync(`"${pgCtl}" stop -D "${dataDir}" -m fast -w -t 20`, { shell: true, stdio: 'ignore' });
}
{
  const killed = killOrphanPostgres();
  if (killed) { log(`Encerrados ${killed} processo(s) do banco que tinham ficado abertos de uma execução anterior.`); await sleep(1500); }
  if (!(await portFree(54329))) await freeDbPort();
}
let PG_PORT = 54329;
if (!(await portFree(PG_PORT))) { PG_PORT = await freePort(54330); log(`A porta 54329 está ocupada; usando ${PG_PORT} para o banco.`); }
// Sempre UTF-8: no Windows o initdb usaria a codificação do sistema (WIN1252) e quebraria acentos/símbolos.
const makePg = () => new EmbeddedPostgres({ databaseDir: dataDir, user: 'raven', password: 'raven', port: PG_PORT, persistent: true, onLog: (m) => toFile(`[postgres] ${m}\n`), initdbFlags: ['--encoding=UTF8', '--locale=C'] });
let fresh = !existsSync(join(dataDir, 'PG_VERSION'));
let pg = makePg();
if (fresh) { log('Preparando o banco de dados embutido (primeira vez)…'); await pg.initialise(); }
try {
  await pg.start();
} catch (e) {
  // segunda chance: algum processo antigo ainda segurava o banco
  log('O banco não subiu na primeira tentativa; limpando processos antigos e tentando de novo…');
  toFile(`ERRO na 1ª tentativa: ${e?.stack ?? e}\n`);
  killOrphanPostgres(); killAllUserPostgres(); await sleep(3000);
  PG_PORT = (await portFree(54329)) ? 54329 : await freePort(54330);
  pg = makePg();
  try { await pg.start(); } catch (e2) {
    log('Não consegui iniciar o banco de dados. Reinicie o computador e abra o INICIAR.bat de novo.');
    log('Se continuar, envie o arquivo raven-creek.log.');
    toFile(`ERRO ao iniciar o banco: ${e2?.stack ?? e2 ?? e}\n`);
    process.exit(1);
  }
}
const DB_URL = `postgres://raven:raven@localhost:${PG_PORT}/ravencreek`;
const TEST_DB_URL = `postgres://raven:raven@localhost:${PG_PORT}/ravencreek_test`;
const query = async (sql, params = [], database = 'postgres') => { const c = pg.getPgClient(database); await c.connect(); try { return (await c.query(sql, params)).rows; } finally { await c.end(); } };
if ((await query('SHOW server_encoding'))[0].server_encoding !== 'UTF8') {
  log('O banco não está em UTF-8; recriando…');
  await pg.stop(); rmSync(dataDir, { recursive: true, force: true });
  pg = makePg(); fresh = true; await pg.initialise(); await pg.start();
}
log(`PostgreSQL embutido rodando na porta ${PG_PORT}.`);
for (const name of ['ravencreek', 'ravencreek_test']) if (!(await query('SELECT 1 FROM pg_database WHERE datname = $1', [name])).length) await pg.createDatabase(name);

const dbEnv = { DATABASE_URL: DB_URL, TEST_DATABASE_URL: TEST_DB_URL };
run('npm', ['run', 'db:migrate'], join(root, 'server'), dbEnv);
// Garante que o mundo existe (o seed é idempotente: não apaga progresso, só completa o que faltar).
const count = async () => Number((await query('SELECT count(*)::int AS n FROM locations', [], 'ravencreek'))[0].n);
if ((await count()) < 100) {
  log('Criando o mundo: 112 locais, itens, zumbis, eventos, contas de demonstração…');
  run('npm', ['run', 'db:seed'], join(root, 'server'), dbEnv);
}
log(`Mundo carregado: ${await count()} locais.`);

// 4) Servidor e cliente. O servidor fica só em 127.0.0.1; o cliente (Vite) também escuta na rede local
//    para os celulares da casa entrarem pelo IP do PC. O Vite repassa /api e o socket para o servidor.
const SERVER_PORT = await freePort(4000);
const CLIENT_PORT = await freePort(5173);
const URL_GAME = `http://127.0.0.1:${CLIENT_PORT}`;
log(`Iniciando servidor (porta ${SERVER_PORT}) e cliente (porta ${CLIENT_PORT})…`);
const pipeOut = (child, tag) => {
  const w = (d) => { process.stdout.write(d); toFile(String(d).split('\n').map((l) => (l ? `[${tag}] ${l}` : l)).join('\n')); };
  child.stdout?.on('data', w); child.stderr?.on('data', w);
};
const serverEnv = { ...process.env, ...dbEnv, PORT: String(SERVER_PORT), HOST: '127.0.0.1', CLIENT_ORIGIN: URL_GAME };
const clientEnv = { ...process.env, API_URL: `http://127.0.0.1:${SERVER_PORT}` };
const children = [
  spawn(`npm run dev`, { cwd: join(root, 'server'), stdio: ['ignore', 'pipe', 'pipe'], shell: true, env: serverEnv }),
  spawn(`npm run dev -- --host 0.0.0.0 --port ${CLIENT_PORT} --strictPort`, { cwd: join(root, 'client'), stdio: ['ignore', 'pipe', 'pipe'], shell: true, env: clientEnv }),
];
pipeOut(children[0], 'servidor'); pipeOut(children[1], 'cliente');
let stopping = false;
for (const [i, c] of children.entries()) c.on('exit', (code) => { if (!stopping) log(`${i ? 'Cliente' : 'Servidor'} parou (código ${code}). Veja raven-creek.log.`); });

// 5) Confere se tudo respondeu e abre o navegador
(async () => {
  for (let i = 0; i < 60; i++) {
    const api = await httpOk(`http://127.0.0.1:${SERVER_PORT}/api/health`);
    const web = await httpOk(`${URL_GAME}/api/health`);
    if (api && web) {
      // endereços deste PC na rede local (Wi-Fi/cabo), para abrir no celular
      const lan = Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)).map((a) => `http://${a.address}:${CLIENT_PORT}`);
      writeFileSync(join(root, 'raven-creek-url.txt'), [URL_GAME, ...lan.map((u) => `${u}  (celular na mesma rede)`)].join('\n') + '\n');
      log(`Pronto! Abra ${URL_GAME}`);
      if (lan.length) {
        log(`No celular (ligado no mesmo Wi-Fi), abra: ${lan.join('  ou  ')}`);
        log('Se o Windows perguntar sobre o firewall, permita o Node.js em "Redes privadas".');
      }
      log('Contas: admin / admin1234  ·  alice / senha1234  ·  bruno / senha1234');
      log('Para encerrar, feche esta janela ou pressione Ctrl+C.');
      if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', URL_GAME], { detached: true, stdio: 'ignore' }).unref();
      else if (process.platform === 'darwin') spawn('open', [URL_GAME], { detached: true, stdio: 'ignore' }).unref();
      return;
    }
    if (i % 5 === 4) log(`Aguardando… servidor ${api ? 'ok' : 'ainda não respondeu'}, cliente ${web ? 'ok' : 'ainda não respondeu'}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  log('O jogo não respondeu em 2 minutos. Envie o arquivo raven-creek.log para diagnóstico.');
})();

const stop = async () => {
  if (stopping) return; stopping = true;
  log('Encerrando…');
  for (const c of children) { try { if (process.platform === 'win32') spawnSync(`taskkill /pid ${c.pid} /T /F`, { shell: true, stdio: 'ignore' }); else c.kill(); } catch { /* já encerrado */ } }
  try { await pg.stop(); } catch { /* já parado */ }
  process.exit(0);
};
process.on('SIGINT', stop); process.on('SIGTERM', stop); process.on('SIGHUP', stop);
