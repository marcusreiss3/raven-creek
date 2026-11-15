/** Controle do jogo pela administração: aprovação de fichas, pausa, abertura agendada e resets. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { db, schema, pool } from '../src/db/index.js';
import { boot, connect, makePlayer, startServer, wait, waitFor } from './helpers.js';
import { clock } from '../src/game/services/config.js';
import { addItem } from '../src/game/services/inventory.js';
import { resetServerStatusForTests, serverStatus } from '../src/game/services/serverStatus.js';
import { signToken, COOKIE } from '../src/http/auth.js';
import { worldTick } from '../src/game/services/scheduler.js';

let srv: Awaited<ReturnType<typeof startServer>>;
let admin: { cookie: string; id: number };
beforeAll(async () => {
  await boot(); await resetServerStatusForTests(); srv = await startServer();
  const [u] = await db.insert(schema.users).values({ username: `adm${Date.now().toString(36)}`, passwordHash: await bcrypt.hash('x', 4), role: 'admin' }).returning();
  admin = { cookie: `${COOKIE}=${signToken(u)}`, id: u.id };
});
afterAll(async () => { await resetServerStatusForTests(); await srv.close(); await pool.end(); });

const api = () => request(srv.url);
const post = (path: string, body: object = {}, cookie = admin.cookie) => api().post(`/api/admin${path}`).set('Cookie', cookie).send(body);
async function newAccount(role: 'player' | 'gm' = 'player') {
  const [u] = await db.insert(schema.users).values({ username: `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, passwordHash: await bcrypt.hash('x', 4), role }).returning();
  return { user: u, cookie: `${COOKIE}=${signToken(u)}` };
}
const sheet = { firstName: 'Nova', lastName: 'Ficha', age: 28, appearance: 'Jaqueta rasgada.', backstory: 'Veio do norte.', profession: 'unemployed', traits: [], attributes: { strength: 5, agility: 5, endurance: 4, perception: 4, intellect: 4 } };
const connectError = (cookie: string) => connect(srv.url, cookie).then((s) => { s.close(); return 'conectou'; }, (e: Error) => e.message);

describe('Admin sem personagem', () => {
  it('admin entra e usa o painel sem ter personagem', async () => {
    const me = await api().get('/api/auth/me').set('Cookie', admin.cookie);
    expect(me.body.user.role).toBe('admin');
    expect(me.body.characterId).toBeNull();
    expect((await api().get('/api/admin/server').set('Cookie', admin.cookie)).status).toBe(200);
  });
});

describe('Aprovação de fichas', () => {
  it('com aprovação ligada, a ficha nasce pendente e só joga depois de aprovada', async () => {
    expect((await post('/server/opening', { requireApproval: true })).status).toBe(200);
    const p = await newAccount();
    const created = await api().post('/api/characters').set('Cookie', p.cookie).send(sheet);
    if (created.status !== 200) console.log('ERRO FICHA', created.body);
    expect(created.status).toBe(200);
    const me = await api().get('/api/auth/me').set('Cookie', p.cookie);
    expect(me.body.character.approved).toBe(false);
    expect(me.body.block.reason).toBe('pending');
    expect(await connectError(p.cookie)).toBe('blocked:pending');
    const list = await api().get('/api/admin/server').set('Cookie', admin.cookie);
    expect(list.body.pending.some((c: any) => c.id === created.body.characterId && c.backstory === 'Veio do norte.')).toBe(true);
    expect((await post(`/characters/${created.body.characterId}/approve`)).status).toBe(200);
    expect((await api().get('/api/auth/me').set('Cookie', p.cookie)).body.block).toBeNull();
    expect(await connectError(p.cookie)).toBe('conectou');
  });

  it('ficha da equipe já nasce aprovada', async () => {
    const g = await newAccount('gm');
    await api().post('/api/characters').set('Cookie', g.cookie).send(sheet);
    expect((await api().get('/api/auth/me').set('Cookie', g.cookie)).body.character.approved).toBe(true);
  });

  it('ficha recusada some, o jogador vê o motivo e pode mandar outra', async () => {
    const p = await newAccount();
    const { body } = await api().post('/api/characters').set('Cookie', p.cookie).send(sheet);
    expect((await post(`/characters/${body.characterId}/reject`, { reason: 'História curta demais.' })).status).toBe(200);
    const me = await api().get('/api/auth/me').set('Cookie', p.cookie);
    expect(me.body.characterId).toBeNull();
    expect(me.body.rejection.reason).toBe('História curta demais.');
    expect((await db.select().from(schema.items).where(eq(schema.items.ownerId, String(body.characterId)))).length).toBe(0);
    await api().post('/api/characters').set('Cookie', p.cookie).send(sheet);
    expect((await api().get('/api/auth/me').set('Cookie', p.cookie)).body.rejection).toBeNull();
  });

  it('aprovar todas de uma vez; mestre aprova, mas não pausa nem reseta', async () => {
    const a = await newAccount(); const b = await newAccount();
    await api().post('/api/characters').set('Cookie', a.cookie).send(sheet);
    await api().post('/api/characters').set('Cookie', b.cookie).send(sheet);
    const gm = await newAccount('gm');
    const r = await post('/characters/approve-all', {}, gm.cookie);
    expect(r.status).toBe(200); expect(r.body.approved).toBeGreaterThanOrEqual(2);
    expect((await post('/server/pause', {}, gm.cookie)).status).toBe(403);
    expect((await post('/reset/characters', { confirm: 'RESETAR' }, gm.cookie)).status).toBe(403);
    const pl = await newAccount();
    expect((await api().get('/api/admin/server').set('Cookie', pl.cookie)).status).toBe(403);
    await post('/server/opening', { requireApproval: false });
  });
});

describe('Pausa', () => {
  it('pausar desconecta todo mundo, bloqueia entrada, congela o relógio e não cobra o tempo parado', async () => {
    const p = await makePlayer({ locationId: 'rc_alley' });
    const s = await connect(srv.url, p.cookie);
    const told = waitFor<any>(s, 'server:status', (x) => x.reason === 'paused');
    const dropped = new Promise((r) => s.on('disconnect', r));
    const [before] = await db.select().from(schema.characters).where(eq(schema.characters.id, p.character.id));
    expect((await post('/server/pause', { message: 'Manutenção rápida' })).status).toBe(200);
    expect((await told).pauseMessage).toBe('Manutenção rápida');
    await dropped;
    expect(await connectError(p.cookie)).toBe('blocked:paused');
    expect(await connectError(admin.cookie)).toBe('blocked:paused');
    const me = await api().get('/api/auth/me').set('Cookie', p.cookie);
    expect(me.body.block).toMatchObject({ reason: 'paused', message: 'Manutenção rápida' });
    const c1 = clock().total;
    await wait(700);
    expect(clock().total).toBe(c1); // relógio do jogo parado
    await worldTick(); // não processa nada enquanto pausado
    const r = await post('/server/resume');
    expect(r.status).toBe(200); expect(r.body.pausedMs).toBeGreaterThanOrEqual(600);
    const [after] = await db.select().from(schema.characters).where(eq(schema.characters.id, p.character.id));
    const shifted = after.lastTickAt.getTime() - before.lastTickAt.getTime();
    expect(shifted).toBeGreaterThanOrEqual(r.body.pausedMs - 5);
    expect(after.protectedUntil!.getTime() - before.protectedUntil!.getTime()).toBeGreaterThanOrEqual(r.body.pausedMs - 5);
    expect(Math.abs(clock().total - c1)).toBeLessThan(1); // retoma de onde parou
    expect(serverStatus().paused).toBe(false);
    expect(await connectError(p.cookie)).toBe('conectou');
  });
});

describe('Abertura agendada', () => {
  it('fechado até a abertura: jogador espera, equipe entra; abrir libera', async () => {
    const p = await makePlayer();
    const g = await makePlayer({ role: 'gm' });
    const s = await connect(srv.url, p.cookie);
    const kicked = waitFor<any>(s, 'server:status', (x) => x.reason === 'closed');
    const opensAt = Date.now() + 3_600_000;
    expect((await post('/server/opening', { opensAt, openMessage: 'Abre sábado' })).status).toBe(200);
    expect((await kicked).opensAt).toBe(opensAt);
    expect(await connectError(p.cookie)).toBe('blocked:closed');
    expect(await connectError(g.cookie)).toBe('conectou');
    // durante o período fechado dá para criar ficha
    const n = await newAccount();
    expect((await api().post('/api/characters').set('Cookie', n.cookie).send(sheet)).status).toBe(200);
    expect((await api().get('/api/auth/me').set('Cookie', n.cookie)).body.block).toMatchObject({ reason: 'closed', opensAt });
    await post('/server/opening', { opensAt: null });
    expect(await connectError(p.cookie)).toBe('conectou');
  });
});

describe('Resets', () => {
  it('confirmação obrigatória', async () => {
    expect((await post('/reset/characters', { confirm: 'sim' })).status).toBe(400);
    expect((await post('/reset/world', { confirm: 'sim', opensAt: null })).status).toBe(400);
  });

  it('resetar personagens apaga o progresso dos jogadores e mantém contas e mundo', async () => {
    const p = await makePlayer({ locationId: 'rc_alley' });
    await addItem(db, 'character', p.character.id, 'baseball_bat', 1);
    await db.update(schema.locationLoot).set({ reserve: 3 }).where(eq(schema.locationLoot.locationId, 'rc_alley'));
    const users0 = (await db.select({ n: sql<number>`count(*)::int` }).from(schema.users))[0].n;
    const r = await post('/reset/characters', { confirm: 'RESETAR' });
    expect(r.status).toBe(200); expect(r.body.characters).toBeGreaterThan(0);
    expect((await db.select({ n: sql<number>`count(*)::int` }).from(schema.characters))[0].n).toBe(0);
    expect((await db.select({ n: sql<number>`count(*)::int` }).from(schema.items).where(eq(schema.items.ownerType, 'character')))[0].n).toBe(0);
    expect((await db.select({ n: sql<number>`count(*)::int` }).from(schema.users))[0].n).toBe(users0);
    expect((await db.select().from(schema.locationLoot).where(eq(schema.locationLoot.locationId, 'rc_alley')))[0].reserve).toBe(3);
    expect((await api().get('/api/auth/me').set('Cookie', p.cookie)).body.characterId).toBeNull();
  });

  it('resetar o mundo volta tudo ao início, fecha até a data escolhida e pede aprovação', async () => {
    const p = await makePlayer({ locationId: 'rc_alley' });
    await addItem(db, 'location', 'rc_alley', 'baseball_bat', 1);
    await db.update(schema.locationLoot).set({ reserve: 3, zombies: 0 }).where(eq(schema.locationLoot.locationId, 'rc_alley'));
    await db.delete(schema.vehicles);
    const opensAt = Date.now() + 2 * 86_400_000;
    const r = await post('/reset/world', { confirm: 'RESETAR', opensAt, requireApproval: true, openMessage: 'Temporada 2' });
    expect(r.status).toBe(200);
    const [ll] = await db.select().from(schema.locationLoot).where(eq(schema.locationLoot.locationId, 'rc_alley'));
    expect(ll.reserve).toBe(ll.maxReserve);
    expect((await db.select({ n: sql<number>`count(*)::int` }).from(schema.items))[0].n).toBe(0);
    expect((await db.select({ n: sql<number>`count(*)::int` }).from(schema.vehicles))[0].n).toBeGreaterThan(0); // veículos do início de volta
    expect((await db.select({ n: sql<number>`count(*)::int` }).from(schema.containers))[0].n).toBeGreaterThan(0);
    expect((await db.select({ n: sql<number>`count(*)::int` }).from(schema.characters))[0].n).toBe(0);
    const c = clock(); expect(c.day).toBe(1); expect(c.hour).toBe(8);
    expect(serverStatus()).toMatchObject({ opensAt, requireApproval: true, openMessage: 'Temporada 2' });
    // a galera cria ficha durante o fechamento e fica aguardando
    const me0 = await api().get('/api/auth/me').set('Cookie', p.cookie);
    expect(me0.body.characterId).toBeNull();
    await api().post('/api/characters').set('Cookie', p.cookie).send(sheet);
    const me = await api().get('/api/auth/me').set('Cookie', p.cookie);
    expect(me.body.character.approved).toBe(false);
    expect(me.body.block.reason).toBe('closed');
    // abriu, mas a ficha ainda não foi aprovada
    await post('/server/opening', { opensAt: null });
    expect((await api().get('/api/auth/me').set('Cookie', p.cookie)).body.block.reason).toBe('pending');
  });
});
