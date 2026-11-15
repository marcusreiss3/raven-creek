import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema, pool } from '../src/db/index.js';
import { action, boot, connect, makePlayer, startServer, wait, waitFor } from './helpers.js';
import { addItem } from '../src/game/services/inventory.js';
import { pickUp, useItem } from '../src/game/services/survival.js';
import { startCombat, combatAction } from '../src/game/services/combat.js';
import { startTravel, processTravels } from '../src/game/services/travel.js';
import { tickCharacter, recoverJobs } from '../src/game/services/tick.js';
import { startExplore } from '../src/game/services/explore.js';
import { processJobs } from '../src/game/services/scheduler.js';
import { flushNow } from '../src/game/services/realtime.js';
import { setRandomSource, seeded } from '../src/game/rules/rng.js';

let srv: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => { await boot(); srv = await startServer(); setRandomSource(seeded(7)); });
afterAll(async () => { await srv.close(); await pool.end(); });

const charRow = async (id: number) => (await db.select().from(schema.characters).where(eq(schema.characters.id, id)))[0];

describe('Multiplayer em tempo real', () => {
  it('dois jogadores entrando no mesmo local se veem e conversam', async () => {
    const a = await makePlayer({ locationId: 'rc_alley' }); const b = await makePlayer({ locationId: 'rc_alley' });
    const sa = await connect(srv.url, a.cookie);
    const seesB = waitFor<any>(sa, 'scene:update', (s) => s?.characters?.some((c: any) => c.id === b.character.id && c.online));
    const sb = await connect(srv.url, b.cookie);
    await flushNow();
    const scene = await seesB;
    expect(scene.location.id).toBe('rc_alley');
    const got = waitFor<any>(sa, 'chat:message', (m) => m.content === 'olá do beco');
    sb.emit('chat:send', { text: 'olá do beco' }, () => undefined);
    expect((await got).authorName).toContain('Teste');
    // quando B sai, A deixa de vê-lo
    const gone = waitFor<any>(sa, 'scene:update', (s) => !s.characters.some((c: any) => c.id === b.character.id));
    const r = await action(sb, 'travel', { toId: 'rc_main_street' });
    expect(r.ok).toBe(true);
    await flushNow();
    await gone;
    sa.close(); sb.close();
  });

  it('jogador sem permissão não acessa o painel administrativo', async () => {
    const p = await makePlayer();
    const r = await request(srv.url).get('/api/admin/overview').set('Cookie', p.cookie);
    expect(r.status).toBe(403);
    const anon = await request(srv.url).get('/api/admin/config');
    expect(anon.status).toBe(401);
    const gm = await makePlayer({ role: 'gm' });
    expect((await request(srv.url).get('/api/admin/overview').set('Cookie', gm.cookie)).status).toBe(200);
    expect((await request(srv.url).put('/api/admin/config').set('Cookie', gm.cookie).send({ config: {} })).status).toBe(403);
  });

  it('tentativas de alterar informações protegidas são rejeitadas', async () => {
    const p = await makePlayer();
    const s = await connect(srv.url, p.cookie);
    const before = await charRow(p.character.id);
    // ação inexistente para "setar" necessidades
    expect((await action(s, 'set_needs', { energy: 100000 })).ok).toBe(false);
    // payload malformado
    expect((await action(s, 'pickup', { itemId: 'drop table' })).ok).toBe(false);
    // tentar pegar item de outro local (id real, mas fora do alcance)
    const [far] = await db.transaction((tx) => addItem(tx, 'location', 'pr_armory', 'pistol_9mm', 1));
    expect((await action(s, 'pickup', { itemId: far.id })).ok).toBe(false);
    // viajar para um local não conectado (teleporte)
    expect((await action(s, 'travel', { toId: 'mil_armory' })).ok).toBe(false);
    const after = await charRow(p.character.id);
    expect(after.locationId).toBe(before.locationId);
    expect(after.needs.energy).toBe(before.needs.energy);
    // upload que não é PNG
    const up = await request(srv.url).post('/api/characters/me/portrait').set('Cookie', p.cookie).attach('portrait', Buffer.from('GIF89a........'), 'x.png');
    expect(up.status).toBe(400);
    s.close();
  });
});

describe('Concorrência e duplicação', () => {
  it('dois jogadores tentando pegar o mesmo objeto: só um consegue', async () => {
    const a = await makePlayer({ locationId: 'rc_market' }); const b = await makePlayer({ locationId: 'rc_market' });
    const [it] = await db.transaction((tx) => addItem(tx, 'location', 'rc_market', 'hatchet', 1));
    const results = await Promise.allSettled([pickUp(a.character.id, it.id), pickUp(b.character.id, it.id)]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
    const owners = await db.select().from(schema.items).where(eq(schema.items.id, it.id));
    expect(owners).toHaveLength(1);
    expect(owners[0].ownerType).toBe('character');
  });

  it('item consumido duas vezes simultaneamente: apenas um uso', async () => {
    const p = await makePlayer();
    const items = await db.select().from(schema.items).where(and(eq(schema.items.ownerType, 'character'), eq(schema.items.ownerId, String(p.character.id)), eq(schema.items.defId, 'water_bottle')));
    const bottle = items[0];
    expect(bottle.quantity).toBe(1);
    const results = await Promise.allSettled([useItem(p.character.id, bottle.id), useItem(p.character.id, bottle.id), useItem(p.character.id, bottle.id)]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
    const left = await db.select().from(schema.items).where(eq(schema.items.id, bottle.id));
    expect(left).toHaveLength(0);
  });
});

describe('Combate, ferimentos e tempo', () => {
  it('personagem entra em combate e sofre ferimento persistido', async () => {
    const p = await makePlayer({ locationId: 'rc_hospital_corridor' });
    setRandomSource(seeded(3));
    const row = await db.transaction(async (tx) => {
      const [ch] = await tx.select().from(schema.characters).where(eq(schema.characters.id, p.character.id)).for('update');
      return startCombat(tx, { characters: [ch], locationId: 'rc_hospital_corridor', zombieCount: 2, zombieTypes: ['walker'], reason: 'teste' });
    });
    // coloca os zumbis colados no jogador e passa turnos defendendo até sofrer um golpe
    const [c0] = await db.select().from(schema.combats).where(eq(schema.combats.id, row.id));
    const st: any = c0.state; const pu = st.units.find((u: any) => u.characterId === p.character.id);
    st.units.filter((u: any) => u.side === 'zombie').forEach((z: any, i: number) => { z.hidden = false; z.x = pu.x + 1; z.y = pu.y + (i === 0 ? 0 : 1); if (st.tiles[z.y][z.x] !== '.') { z.x = pu.x; z.y = pu.y + 1; } });
    await db.update(schema.combats).set({ state: st }).where(eq(schema.combats.id, row.id));
    let wounds: any[] = [];
    for (let i = 0; i < 12 && !wounds.length; i++) {
      const cur = await charRow(p.character.id);
      if (!cur.combatId) break;
      await combatAction(p.character.id, { type: 'defend' }).catch(() => undefined);
      wounds = await db.select().from(schema.wounds).where(eq(schema.wounds.characterId, p.character.id));
    }
    expect(wounds.length).toBeGreaterThan(0);
    expect(wounds[0].region).toBeTruthy();
  });

  it('jogador não pode se deslocar durante o combate', async () => {
    const p = await makePlayer({ locationId: 'rc_parking' });
    await db.transaction(async (tx) => {
      const [ch] = await tx.select().from(schema.characters).where(eq(schema.characters.id, p.character.id)).for('update');
      await startCombat(tx, { characters: [ch], locationId: 'rc_parking', zombieCount: 1, reason: 'teste' });
    });
    await expect(startTravel(p.character.id, 'rc_main_street')).rejects.toThrow(/combate/i);
    expect((await charRow(p.character.id)).locationId).toBe('rc_parking');
  });

  it('ferimento evolui com o tempo (sangramento, contaminação, cicatrização)', async () => {
    const p = await makePlayer();
    const s = await connect(srv.url, p.cookie); // conectado: o corpo evolui normalmente
    const { makeWound } = await import('../src/game/rules/body.js');
    const [w] = await db.insert(schema.wounds).values({ characterId: p.character.id, ...makeWound('cut_shallow', 'left_arm', 0.4, 'teste') }).returning();
    await db.update(schema.characters).set({ lastTickAt: new Date() }).where(eq(schema.characters.id, p.character.id));
    await tickCharacter(p.character.id, Date.now() + 6 * 3_600_000); // 6 h jogando
    const [after] = await db.select().from(schema.wounds).where(eq(schema.wounds.id, w.id));
    expect(after.bleeding).toBeLessThan(w.bleeding);
    expect(after.contamination).toBeGreaterThan(w.contamination);
    expect(after.healing).toBeGreaterThan(0);
    const ch = await charRow(p.character.id);
    expect(ch.needs.hunger).toBeGreaterThan(15);
    s.close();
  });

  it('desconectado, o corpo fica parado: fome, sede, sono e ferimentos não mudam', async () => {
    const p = await makePlayer();
    const { makeWound } = await import('../src/game/rules/body.js');
    const [w] = await db.insert(schema.wounds).values({ characterId: p.character.id, ...makeWound('cut_shallow', 'left_arm', 0.4, 'teste') }).returning();
    const before = await charRow(p.character.id);
    await db.update(schema.characters).set({ lastTickAt: new Date(Date.now() - 8 * 3_600_000) }).where(eq(schema.characters.id, p.character.id));
    await tickCharacter(p.character.id, Date.now());
    const after = await charRow(p.character.id);
    const [wa] = await db.select().from(schema.wounds).where(eq(schema.wounds.id, w.id));
    expect(after.needs.hunger).toBe(before.needs.hunger); expect(after.needs.thirst).toBe(before.needs.thirst); expect(after.needs.sleepiness).toBe(before.needs.sleepiness);
    expect(wa.bleeding).toBe(w.bleeding); expect(wa.contamination).toBe(w.contamination);
    // ao reconectar, o tempo desconectado não é cobrado de uma vez
    expect(after.lastTickAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('ao reconectar, o tempo que ficou desconectado não é cobrado de uma vez', async () => {
    const p = await makePlayer();
    await db.update(schema.characters).set({ lastTickAt: new Date(Date.now() - 10 * 3_600_000) }).where(eq(schema.characters.id, p.character.id));
    const before = await charRow(p.character.id);
    const s = await connect(srv.url, p.cookie); await wait(200);
    await tickCharacter(p.character.id, Date.now());
    const after = await charRow(p.character.id);
    expect(after.needs.hunger - before.needs.hunger).toBeLessThan(0.5);
    s.close();
  });

  it('jogador desconectando durante viagem: a viagem continua e termina no servidor', async () => {
    const p = await makePlayer({ locationId: 'rc_main_street' });
    const s = await connect(srv.url, p.cookie);
    setRandomSource(() => 0.99); // sem encontros
    const r = await action(s, 'travel', { toId: 'rc_restaurant' });
    expect(r.ok).toBe(true);
    s.close(); await wait(100);
    // refresh não cancela: personagem segue "viajando"
    expect((await charRow(p.character.id)).state).toBe('traveling');
    // simula passagem do tempo
    await db.update(schema.travels).set({ lastProgressAt: new Date(Date.now() - r.durationMs - 1000) }).where(eq(schema.travels.characterId, p.character.id));
    await processTravels();
    const ch = await charRow(p.character.id);
    expect(ch.locationId).toBe('rc_restaurant'); expect(ch.state).toBe('idle');
    setRandomSource(seeded(11));
  });

  it('encontro na estrada: quem saiu do mesmo lugar para destinos diferentes se vê, conversa e pode acompanhar', async () => {
    setRandomSource(() => 0.99);
    const a = await makePlayer({ locationId: 'rc_main_street' }); const b = await makePlayer({ locationId: 'rc_main_street' });
    const sa = await connect(srv.url, a.cookie); const sb = await connect(srv.url, b.cookie);
    const ra = await action(sa, 'travel', { toId: 'hw_crossroads' }); const rb = await action(sb, 'travel', { toId: 'res_avenue' });
    expect(ra.ok && rb.ok).toBe(true);
    const { buildSelfState } = await import('../src/game/services/characters.js');
    const stB: any = (await buildSelfState(b.character.id))!.state;
    expect(stB.travel.nearby.map((n: any) => n.id)).toContain(a.character.id);
    // chat Local chega a quem está à vista
    const got = new Promise<any>((res) => sa.on('chat:message', (m: any) => { if (m.content === 'Ei, espera!') res(m); }));
    sb.emit('chat:send', { text: 'Ei, espera!' }, () => undefined);
    expect((await Promise.race([got, wait(2000).then(() => null)]))?.content).toBe('Ei, espera!');
    // B acompanha A: mesmo destino e mesmo ritmo
    const j = await action(sb, 'travel_join', { targetId: a.character.id });
    expect(j.ok).toBe(true);
    const [ta] = await db.select().from(schema.travels).where(and(eq(schema.travels.characterId, a.character.id), eq(schema.travels.status, 'active')));
    let [tb] = await db.select().from(schema.travels).where(and(eq(schema.travels.characterId, b.character.id), eq(schema.travels.status, 'active')));
    expect(tb.groupId).toBe(ta.groupId); expect(tb.toId).toBe('hw_crossroads'); expect(tb.durationMs).toBe(ta.durationMs); expect(tb.isLeader).toBe(false);
    // B para: fica para trás sozinho, mas continua indo para o mesmo lugar; A segue andando
    const pz = await action(sb, 'travel_pause', {});
    expect(pz).toMatchObject({ ok: true, detached: true });
    [tb] = await db.select().from(schema.travels).where(and(eq(schema.travels.characterId, b.character.id), eq(schema.travels.status, 'paused')));
    expect(tb.groupId).not.toBe(ta.groupId); expect(tb.toId).toBe('hw_crossroads'); expect(tb.isLeader).toBe(true);
    const [ta2] = await db.select().from(schema.travels).where(eq(schema.travels.id, ta.id));
    expect(ta2.status).toBe('active');
    // A chega antes
    await db.update(schema.travels).set({ lastProgressAt: new Date(Date.now() - ta.durationMs - 1000) }).where(eq(schema.travels.id, ta.id));
    await processTravels();
    expect((await charRow(a.character.id)).locationId).toBe('hw_crossroads');
    expect((await charRow(b.character.id)).state).toBe('traveling');
    // B retoma e também chega lá
    expect((await action(sb, 'travel_pause', { pause: false })).ok).toBe(true);
    await db.update(schema.travels).set({ lastProgressAt: new Date(Date.now() - ta.durationMs - 1000) }).where(eq(schema.travels.id, tb.id));
    await processTravels();
    expect((await charRow(b.character.id)).locationId).toBe('hw_crossroads');
    sa.close(); sb.close(); setRandomSource(seeded(11));
  });

  it('viajantes em estradas sem relação no mapa não se encontram', async () => {
    setRandomSource(() => 0.99);
    const a = await makePlayer({ locationId: 'rc_main_street' }); const b = await makePlayer({ locationId: 'rc_school' });
    const sa = await connect(srv.url, a.cookie); const sb = await connect(srv.url, b.cookie);
    await action(sa, 'travel', { toId: 'rc_restaurant' }); await action(sb, 'travel', { toId: 'rc_church' });
    const { buildSelfState } = await import('../src/game/services/characters.js');
    const st: any = (await buildSelfState(a.character.id))!.state;
    expect(st.travel.nearby.map((n: any) => n.id)).not.toContain(b.character.id);
    const r = await action(sa, 'travel_join', { targetId: b.character.id });
    expect(r.ok).toBe(false);
    sa.close(); sb.close(); setRandomSource(seeded(11));
  });

  it('parar a caminhada congela o tempo do grupo; continuar retoma de onde parou', async () => {
    const p = await makePlayer({ locationId: 'rc_main_street' });
    const s = await connect(srv.url, p.cookie);
    setRandomSource(() => 0.99);
    const r = await action(s, 'travel', { toId: 'rc_restaurant' });
    expect(r.ok).toBe(true);
    // metade do caminho já andada
    await db.update(schema.travels).set({ lastProgressAt: new Date(Date.now() - r.durationMs / 2) }).where(eq(schema.travels.characterId, p.character.id));
    const pz = await action(s, 'travel_pause', {});
    expect(pz).toMatchObject({ ok: true, paused: true });
    const [t1] = await db.select().from(schema.travels).where(eq(schema.travels.characterId, p.character.id));
    expect(t1.status).toBe('paused');
    expect(t1.elapsedMs).toBeGreaterThan(r.durationMs * 0.45); expect(t1.elapsedMs).toBeLessThan(r.durationMs * 0.6);
    // muito tempo parado: não chega ao destino
    await db.update(schema.travels).set({ lastProgressAt: new Date(Date.now() - r.durationMs * 10) }).where(eq(schema.travels.characterId, p.character.id));
    await processTravels();
    expect((await charRow(p.character.id)).state).toBe('traveling');
    // o próprio personagem aparece na lista do grupo para ser desenhado na cena
    const resumed = await action(s, 'travel_pause', { pause: false });
    expect(resumed).toMatchObject({ ok: true, paused: false });
    const [t2] = await db.select().from(schema.travels).where(eq(schema.travels.characterId, p.character.id));
    expect(t2.status).toBe('active'); expect(t2.elapsedMs).toBe(t1.elapsedMs);
    const { buildSelfState } = await import('../src/game/services/characters.js');
    const st: any = await buildSelfState(p.character.id);
    expect(st.state.travel.companions.map((c: any) => c.id)).toContain(p.character.id);
    // termina o restante
    await db.update(schema.travels).set({ lastProgressAt: new Date(Date.now() - r.durationMs) }).where(eq(schema.travels.characterId, p.character.id));
    await processTravels();
    expect((await charRow(p.character.id)).locationId).toBe('rc_restaurant');
    s.close(); setRandomSource(seeded(11));
  });

  it('reinicialização do servidor durante ação agendada: o job é recuperado e concluído', async () => {
    const p = await makePlayer({ locationId: 'rc_supermarket' });
    await startExplore(p.character.id);
    // simula queda: o job ficou "running" e o prazo já passou
    await db.update(schema.jobs).set({ status: 'running', runAt: new Date(Date.now() - 1000) }).where(and(eq(schema.jobs.characterId, p.character.id)));
    await recoverJobs();
    await processJobs();
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.characterId, p.character.id));
    expect(job.status).toBe('done');
    const ch = await charRow(p.character.id);
    expect(['idle', 'combat']).toContain(ch.state);
    const logs = await db.select().from(schema.gameLogs).where(and(eq(schema.gameLogs.characterId, p.character.id), eq(schema.gameLogs.kind, 'explore')));
    expect(logs.length).toBe(1);
  });

  it('exploração consome reserva persistente do local (não é infinita)', async () => {
    const p = await makePlayer({ locationId: 'rc_pharmacy' });
    const [before] = await db.select().from(schema.locationLoot).where(eq(schema.locationLoot.locationId, 'rc_pharmacy'));
    await db.update(schema.characters).set({ needs: { ...p.character.needs, energy: 100 } }).where(eq(schema.characters.id, p.character.id));
    setRandomSource(() => 0.3);
    await startExplore(p.character.id);
    await db.update(schema.jobs).set({ runAt: new Date(Date.now() - 1000) }).where(eq(schema.jobs.characterId, p.character.id));
    await processJobs();
    const [after] = await db.select().from(schema.locationLoot).where(eq(schema.locationLoot.locationId, 'rc_pharmacy'));
    expect(after.reserve).toBeLessThan(before.reserve);
    expect(after.timesSearched).toBe(before.timesSearched + 1);
    // sem energia, não pode vasculhar — mas ainda pode conversar
    await db.update(schema.characters).set({ needs: { ...p.character.needs, energy: 2 }, state: 'idle', combatId: null }).where(eq(schema.characters.id, p.character.id));
    await expect(startExplore(p.character.id)).rejects.toThrow(/exausto/);
    const s = await connect(srv.url, p.cookie);
    const ok = await new Promise<any>((r) => s.emit('chat:send', { text: 'ainda consigo falar' }, r));
    expect(ok.ok).toBe(true);
    s.close(); setRandomSource(seeded(5));
  });
});
export { isNull };

describe('Infectados nos locais', () => {
  it('chegar num local infestado pode terminar em emboscada', async () => {
    const p = await makePlayer({ locationId: 'rc_main_street' });
    const s = await connect(srv.url, p.cookie);
    await db.update(schema.locationLoot).set({ zombies: 6 }).where(eq(schema.locationLoot.locationId, 'rc_alley'));
    await db.update(schema.characters).set({ protectedUntil: null }).where(eq(schema.characters.id, p.character.id));
    setRandomSource(() => 0.99); // sem encontro no caminho
    const r = await action(s, 'travel', { toId: 'rc_alley' });
    expect(r.ok).toBe(true);
    await db.update(schema.travels).set({ lastProgressAt: new Date(Date.now() - r.durationMs - 1000) }).where(eq(schema.travels.characterId, p.character.id));
    setRandomSource(() => 0.001); // a emboscada acontece
    await processTravels();
    const ch = await charRow(p.character.id);
    expect(ch.locationId).toBe('rc_alley'); expect(ch.state).toBe('combat'); expect(ch.combatId).not.toBeNull();
    s.close(); setRandomSource(seeded(11));
  });

  it('quem fica parado num local infestado pode ser encontrado; desconectados não', async () => {
    const { processLurkingZombies } = await import('../src/game/services/zombies.js');
    const on = await makePlayer({ locationId: 'rc_parking' }); const off = await makePlayer({ locationId: 'rc_parking' });
    const s = await connect(srv.url, on.cookie);
    await db.update(schema.locationLoot).set({ zombies: 5 }).where(eq(schema.locationLoot.locationId, 'rc_parking'));
    setRandomSource(() => 0.001);
    await processLurkingZombies();
    expect((await charRow(on.character.id)).state).toBe('combat');
    expect((await charRow(off.character.id)).state).toBe('idle');
    s.close(); setRandomSource(seeded(11));
  });

  it('base fortificada segura os infectados do lado de fora; local comum se repovoa', async () => {
    const { respawnZombies, baseRespawnFactor } = await import('../src/game/services/zombies.js');
    expect(baseRespawnFactor(0)).toBe(1); expect(baseRespawnFactor(10)).toBeCloseTo(1 - 10 / 24); expect(baseRespawnFactor(24)).toBe(0);
    const [b] = await db.insert(schema.bases).values({ locationId: 'rc_apartment_5a', name: 'Forte' }).onConflictDoNothing().returning();
    const baseId = b?.id ?? (await db.select().from(schema.bases).where(eq(schema.bases.locationId, 'rc_apartment_5a')))[0].id;
    await db.insert(schema.baseStructures).values([{ baseId, kind: 'barricade', hp: 100, maxHp: 100 }, { baseId, kind: 'door_reinforcement', hp: 100, maxHp: 100 }]);
    await db.update(schema.locationLoot).set({ zombies: 0 }).where(inArray(schema.locationLoot.locationId, ['rc_apartment_5a', 'rc_main_street']));
    setRandomSource(() => 0.001);
    await respawnZombies(6);
    const [fort] = await db.select().from(schema.locationLoot).where(eq(schema.locationLoot.locationId, 'rc_apartment_5a'));
    const [street] = await db.select().from(schema.locationLoot).where(eq(schema.locationLoot.locationId, 'rc_main_street'));
    expect(fort.zombies).toBe(0); expect(street.zombies).toBeGreaterThan(0);
    setRandomSource(seeded(11));
  });

  it('sem infectados no local, ninguém é atacado parado', async () => {
    const { processLurkingZombies } = await import('../src/game/services/zombies.js');
    const p = await makePlayer({ locationId: 'rc_city_hall' });
    const s = await connect(srv.url, p.cookie);
    await db.update(schema.locationLoot).set({ zombies: 0 }).where(eq(schema.locationLoot.locationId, 'rc_city_hall'));
    setRandomSource(() => 0.001);
    await processLurkingZombies();
    expect((await charRow(p.character.id)).state).toBe('idle');
    s.close(); setRandomSource(seeded(11));
  });
});

describe('Projetos da comunidade', () => {
  it('materiais liberam o trabalho aos poucos; turnos concluem a obra; dependentes são liberados e o efeito liga', async () => {
    const P = await import('../src/game/services/projects.js');
    const { PROJECTS } = await import('../src/game/content/projects.js');
    const def = PROJECTS.find((x) => x.id === 'substation')!;
    const p = await makePlayer({ locationId: 'in_substation' });
    const s = await connect(srv.url, p.cookie);
    await db.update(schema.locationLoot).set({ zombies: 0 }).where(eq(schema.locationLoot.locationId, 'in_substation'));
    await db.update(schema.characters).set({ needs: sql`jsonb_set(needs, '{energy}', '100')` }).where(eq(schema.characters.id, p.character.id));
    // sem materiais, não dá para trabalhar
    expect((await action(s, 'project_work', { projectId: 'substation' })).ok).toBe(false);
    // entrega metade dos materiais
    await db.transaction(async (tx) => { for (const m of def.materials) await addItem(tx, 'character', p.character.id, m.itemId, Math.ceil(m.qty / 2)); for (const t of def.tools) await addItem(tx, 'character', p.character.id, t, 1); });
    const d1 = await action(s, 'project_deliver', { projectId: 'substation' });
    expect(d1.ok).toBe(true);
    // turnos até travar por falta de materiais (~50%)
    const work = async () => { try { return await P.startProjectWork(p.character.id, 'substation'); } catch (e: any) { return { ok: false, error: e.message }; } };
    for (let i = 0; i < 200; i++) {
      const w: any = await work();
      if (!w.ok) { expect(w.error).toMatch(/materiais/i); break; }
      const [job] = await db.select().from(schema.jobs).where(and(eq(schema.jobs.characterId, p.character.id), eq(schema.jobs.kind, 'project_work'), eq(schema.jobs.status, 'pending')));
      await db.update(schema.jobs).set({ status: 'done' }).where(eq(schema.jobs.id, job.id));
      await P.completeProjectWork(job.id, p.character.id, 'substation');
      await db.update(schema.characters).set({ needs: sql`jsonb_set(needs, '{energy}', '100')` }).where(eq(schema.characters.id, p.character.id));
    }
    let [row] = await db.select().from(schema.communityProjects).where(eq(schema.communityProjects.id, 'substation'));
    expect(row.status).toBe('active');
    expect(row.laborMinutes).toBeGreaterThan(def.laborMinutes * 0.4); expect(row.laborMinutes).toBeLessThanOrEqual(def.laborMinutes * 0.52);
    // resto dos materiais e o resto do trabalho
    await db.transaction(async (tx) => { for (const m of def.materials) await addItem(tx, 'character', p.character.id, m.itemId, m.qty); });
    expect((await action(s, 'project_deliver', { projectId: 'substation' })).ok).toBe(true);
    for (let i = 0; i < 200; i++) {
      const w: any = await work();
      if (!w.ok) break;
      const [job] = await db.select().from(schema.jobs).where(and(eq(schema.jobs.characterId, p.character.id), eq(schema.jobs.kind, 'project_work'), eq(schema.jobs.status, 'pending')));
      await db.update(schema.jobs).set({ status: 'done' }).where(eq(schema.jobs.id, job.id));
      const r = await P.completeProjectWork(job.id, p.character.id, 'substation');
      await db.update(schema.characters).set({ needs: sql`jsonb_set(needs, '{energy}', '100')` }).where(eq(schema.characters.id, p.character.id));
      if (r.completed) break;
    }
    [row] = await db.select().from(schema.communityProjects).where(eq(schema.communityProjects.id, 'substation'));
    expect(row.status).toBe('complete'); expect(row.integrity).toBe(100);
    expect(P.isPowered('rc_main_street')).toBe(true);
    expect(P.isPowered('fm_miller_farm')).toBe(false); // fazendas não estão na rede
    const [radio] = await db.select().from(schema.communityProjects).where(eq(schema.communityProjects.id, 'radio_tower'));
    expect(radio.status).toBe('active');
    // desgaste: abaixo do mínimo, a luz apaga
    await db.update(schema.communityProjects).set({ integrity: 41 }).where(eq(schema.communityProjects.id, 'substation'));
    await P.processProjects(10);
    expect(P.isPowered('rc_main_street')).toBe(false);
    s.close();
  });

  it('o hospital só reabre com todas as alas sem infectados', async () => {
    const P = await import('../src/game/services/projects.js');
    const { PROJECTS, HOSPITAL_LOCATIONS } = await import('../src/game/content/projects.js');
    const def = PROJECTS.find((x) => x.id === 'hospital')!;
    await db.update(schema.communityProjects).set({ laborMinutes: def.laborMinutes - 5, delivered: Object.fromEntries(def.materials.map((m) => [m.itemId, m.qty])) }).where(eq(schema.communityProjects.id, 'hospital'));
    await db.update(schema.locationLoot).set({ zombies: 0 }).where(inArray(schema.locationLoot.locationId, HOSPITAL_LOCATIONS));
    await db.update(schema.locationLoot).set({ zombies: 2 }).where(eq(schema.locationLoot.locationId, 'rc_hospital_morgue'));
    const p = await makePlayer({ locationId: 'rc_hospital_surgery' });
    const s = await connect(srv.url, p.cookie);
    await db.transaction(async (tx) => { await addItem(tx, 'character', p.character.id, 'hammer', 1); });
    const w = await action(s, 'project_work', { projectId: 'hospital' });
    expect(w.ok).toBe(true);
    let [job] = await db.select().from(schema.jobs).where(and(eq(schema.jobs.characterId, p.character.id), eq(schema.jobs.kind, 'project_work'), eq(schema.jobs.status, 'pending')));
    await db.update(schema.jobs).set({ status: 'done' }).where(eq(schema.jobs.id, job.id));
    expect((await P.completeProjectWork(job.id, p.character.id, 'hospital')).completed).toBe(false);
    // limpou o necrotério → próximo turno conclui
    await db.update(schema.locationLoot).set({ zombies: 0 }).where(eq(schema.locationLoot.locationId, 'rc_hospital_morgue'));
    await db.update(schema.communityProjects).set({ laborMinutes: def.laborMinutes - 5 }).where(eq(schema.communityProjects.id, 'hospital'));
    await db.update(schema.characters).set({ needs: sql`jsonb_set(needs, '{energy}', '100')` }).where(eq(schema.characters.id, p.character.id));
    await wait(1200);
    expect((await action(s, 'project_work', { projectId: 'hospital' })).ok).toBe(true);
    [job] = await db.select().from(schema.jobs).where(and(eq(schema.jobs.characterId, p.character.id), eq(schema.jobs.kind, 'project_work'), eq(schema.jobs.status, 'pending')));
    expect((await P.completeProjectWork(job.id, p.character.id, 'hospital')).completed).toBe(true);
    expect(P.healingBonus('rc_hospital_ward')).toBeGreaterThan(1);
    s.close();
  });
});

describe('Sobrevivência: fogueira, caça, pesca, comida e cachorros', () => {
  const nature = () => import('../src/game/services/nature.js');
  const inv = async (id: number) => db.select().from(schema.items).where(and(eq(schema.items.ownerType, 'character'), eq(schema.items.ownerId, String(id))));
  it('fogueira: acende, aquece, permite assar; fumaça é vista do vizinho; apaga', async () => {
    const n = await nature();
    const { craft } = await import('../src/game/services/vehicles.js');
    const { buildScene } = await import('../src/game/services/world.js');
    const p = await makePlayer({ locationId: 'fo_trailhead' });
    await db.update(schema.locationLoot).set({ zombies: 0 }).where(eq(schema.locationLoot.locationId, 'fo_trailhead'));
    await db.transaction(async (tx) => { await addItem(tx, 'character', p.character.id, 'lighter'); await addItem(tx, 'character', p.character.id, 'firewood', 2); await addItem(tx, 'character', p.character.id, 'raw_meat', 1); });
    await expect(craft(p.character.id, 'cook_meat')).rejects.toThrow(/fogo/);
    const wood = (await inv(p.character.id)).find((i) => i.defId === 'firewood')!;
    setRandomSource(() => 0.99);
    await n.lightFire(p.character.id, wood.id);
    expect(n.fireLit('fo_trailhead')).toBe(true);
    expect(n.fireWarmth('fo_trailhead')).toBeGreaterThan(0);
    expect(n.smokeNearby('fo_pine_trail')).toContain('Entrada da Trilha Blackpine');
    const scene = await buildScene('fo_trailhead');
    expect(scene!.campfire).toMatchObject({ lit: true, canHaveFire: true });
    expect(scene!.campfire.minutesLeft).toBeGreaterThan(50);
    await craft(p.character.id, 'cook_meat');
    expect((await inv(p.character.id)).some((i) => i.defId === 'cooked_meat')).toBe(true);
    await n.putOutFire(p.character.id);
    expect(n.fireLit('fo_trailhead')).toBe(false);
    setRandomSource(seeded(11));
  });

  it('pesca e caça viram jobs no servidor e rendem carne/peixe crus', async () => {
    const n = await nature();
    const { equip } = await import('../src/game/services/survival.js');
    const f = await makePlayer({ locationId: 'fm_creek' });
    await db.transaction((tx) => addItem(tx, 'character', f.character.id, 'fishing_rod'));
    await expect(n.startHunt(f.character.id)).rejects.toThrow(/caça/);
    await n.startFish(f.character.id);
    await db.update(schema.jobs).set({ runAt: new Date(Date.now() - 1000) }).where(eq(schema.jobs.characterId, f.character.id));
    setRandomSource(() => 0.01);
    await processJobs();
    expect((await inv(f.character.id)).some((i) => i.defId === 'raw_fish')).toBe(true);
    expect((await charRow(f.character.id)).state).toBe('idle');

    const h = await makePlayer({ locationId: 'fo_pine_trail' });
    await db.update(schema.locationLoot).set({ zombies: 0 }).where(eq(schema.locationLoot.locationId, 'fo_pine_trail'));
    await db.transaction((tx) => addItem(tx, 'character', h.character.id, 'hunting_knife'));
    const knife = (await inv(h.character.id)).find((i) => i.defId === 'hunting_knife')!;
    await equip(h.character.id, knife.id);
    await n.startHunt(h.character.id);
    await db.update(schema.jobs).set({ runAt: new Date(Date.now() - 1000) }).where(eq(schema.jobs.characterId, h.character.id));
    await processJobs();
    expect((await inv(h.character.id)).some((i) => i.defId === 'raw_meat')).toBe(true);
    setRandomSource(seeded(11));
  });

  it('carne crua estraga com o tempo (mais devagar no inverno); carne salgada não', async () => {
    const n = await nature();
    const p = await makePlayer({ locationId: 'rc_alley' });
    await db.transaction(async (tx) => { await addItem(tx, 'character', p.character.id, 'raw_meat', 2, { data: { age: 23.99, ageAt: Date.now() - 3_600_000 * 10 } }); await addItem(tx, 'character', p.character.id, 'salted_meat', 1); });
    await n.processSpoilage();
    const items = await inv(p.character.id);
    expect(items.some((i) => i.defId === 'raw_meat')).toBe(false);
    expect(items.find((i) => i.defId === 'spoiled_food')?.quantity).toBe(2);
    expect(items.some((i) => i.defId === 'salted_meat')).toBe(true);
  });

  it('cachorro de rua: comida conquista, ele ajuda a vasculhar e a evitar emboscadas; soltar devolve à rua', async () => {
    const dogs = await import('../src/game/services/dogs.js');
    const p = await makePlayer({ locationId: 'hw_motel' });
    const [d] = await db.insert(schema.companions).values({ name: 'Bolt', locationId: 'hw_motel', status: 'stray', data: { look: 'vira-lata caramelo' } }).returning();
    await db.transaction((tx) => addItem(tx, 'character', p.character.id, 'raw_meat', 3));
    setRandomSource(() => 0.5);
    let tamed = false;
    for (let i = 0; i < 3 && !tamed; i++) {
      const meat = (await inv(p.character.id)).find((x) => x.defId === 'raw_meat')!;
      tamed = (await dogs.tameDog(p.character.id, d.id, meat.id)).tamed;
    }
    expect(tamed).toBe(true);
    expect(await dogs.dogFindBonus(p.character.id)).toBeGreaterThan(1);
    expect(await dogs.dogThreatMultiplier([p.character.id])).toBeLessThan(1);
    const view = await dogs.dogView(p.character.id);
    expect(view?.name).toBe('Bolt');
    await dogs.renameDog(p.character.id, 'Caramelo');
    expect((await dogs.dogView(p.character.id))?.name).toBe('Caramelo');
    await dogs.releaseDog(p.character.id);
    expect(await dogs.dogView(p.character.id)).toBeNull();
    await db.delete(schema.companions).where(eq(schema.companions.id, d.id));
    setRandomSource(seeded(11));
  });
});

describe('Bilhetes, mural e mortos que levantam', () => {
  const inv = async (id: number) => db.select().from(schema.items).where(and(eq(schema.items.ownerType, 'character'), eq(schema.items.ownerId, String(id))));
  it('bilhetes: cada um existe uma vez; o texto vai para o diário de todos; o cofre abre com o código montado', async () => {
    const st = await import('../src/game/services/stories.js');
    const { MYSTERIES } = await import('../src/game/content/mysteries.js');
    const doyle = MYSTERIES.find((m) => m.id === 'cofre_prefeitura')!;
    setRandomSource(() => 0.01);
    for (const f of doyle.fragments) {
      const p = await makePlayer({ locationId: f.locationIds[0] });
      const ch = await charRow(p.character.id);
      const got = await db.transaction((tx) => st.maybeFindNote(tx, ch));
      expect(got).toBe(f.title);
      const again = await db.transaction((tx) => st.maybeFindNote(tx, ch)); // já achado: não repete
      expect(again).toBeNull();
      const note = (await inv(p.character.id)).find((i) => i.defId === 'note')!;
      expect(note.data.fragmentId).toBe(f.id);
    }
    const list = await st.listMysteries();
    const m = list.find((x) => x.id === 'cofre_prefeitura')!;
    expect(m.found).toBe(4); expect(m.status).toBe('revealed');
    expect(m.fragments.every((f) => f.found && (('text' in f && f.text) || '').length > 20)).toBe(true);
    expect(list.find((x) => x.id === 'paciente_zero')!.title).toBe('Mistério desconhecido');

    const opener = await makePlayer({ locationId: 'rc_city_hall' });
    const { buildScene } = await import('../src/game/services/world.js');
    expect((await buildScene('rc_city_hall'))!.safes).toHaveLength(1);
    expect((await st.openSafe(opener.character.id, 'cofre_prefeitura', '1234')).opened).toBe(false);
    expect((await st.openSafe(opener.character.id, 'cofre_prefeitura', '4719')).opened).toBe(true);
    expect((await inv(opener.character.id)).some((i) => i.defId === 'pistol_9mm')).toBe(true);
    expect((await buildScene('rc_city_hall'))!.safes).toHaveLength(0);
    await expect(st.openSafe(opener.character.id, 'cofre_prefeitura', '4719')).rejects.toThrow(/vazio/);
    setRandomSource(seeded(11));
  });

  it('esconderijo aparece quando todas as peças são achadas; quem pega primeiro resolve o mistério', async () => {
    const st = await import('../src/game/services/stories.js');
    const { takeFromContainer } = await import('../src/game/services/survival.js');
    const { MYSTERIES } = await import('../src/game/content/mysteries.js');
    const abe = MYSTERIES.find((m) => m.id === 'esconderijo_cacador')!;
    setRandomSource(() => 0.01);
    for (const f of abe.fragments) { const p = await makePlayer({ locationId: f.locationIds[0] }); await db.transaction(async (tx) => st.maybeFindNote(tx, await charRow(p.character.id))); }
    const [stash] = await db.select().from(schema.containers).where(and(eq(schema.containers.locationId, 'fo_deep_woods'), eq(schema.containers.kind, 'stash')));
    expect(stash).toBeTruthy();
    const items = await db.select().from(schema.items).where(and(eq(schema.items.ownerType, 'container'), eq(schema.items.ownerId, String(stash.id))));
    const rifle = items.find((i) => i.defId === 'hunting_rifle')!;
    const finder = await makePlayer({ locationId: 'fo_deep_woods' });
    await takeFromContainer(finder.character.id, rifle.id, stash.id);
    const m = (await st.listMysteries()).find((x) => x.id === 'esconderijo_cacador')!;
    expect(m.status).toBe('claimed'); expect(m.claimedBy).toContain('Teste');
    setRandomSource(seeded(11));
  });

  it('mural: recados ficam no local; espera entre recados; só o autor (ou staff) arranca', async () => {
    const st = await import('../src/game/services/stories.js');
    const a = await makePlayer({ locationId: 'rc_church' }); const b = await makePlayer({ locationId: 'rc_church' });
    await st.postMural(a.character.id, 'Fui pra fazenda Miller.\nNão entrem no hospital!');
    await expect(st.postMural(a.character.id, 'outro')).rejects.toThrow(/Espere/);
    await st.postMural(b.character.id, 'Recebido. — B');
    const l = await st.listMural(b.character.id);
    expect(l.posts.map((p) => p.content)).toEqual(['Recebido. — B', 'Fui pra fazenda Miller.\nNão entrem no hospital!']);
    const { buildScene } = await import('../src/game/services/world.js');
    expect((await buildScene('rc_church'))!.muralCount).toBe(2);
    const postA = l.posts.find((p) => p.characterId === a.character.id)!;
    await expect(st.deleteMural(b.character.id, postA.id, false)).rejects.toThrow(/próprios/);
    await st.deleteMural(a.character.id, postA.id, false);
    expect((await st.listMural(a.character.id)).posts).toHaveLength(1);
  });

  it('morto levanta como infectado nomeado com os pertences; derrubá-lo devolve os itens; dá para impedir antes', async () => {
    const rs = await import('../src/game/services/risen.js');
    const { killCharacter } = await import('../src/game/services/death.js');
    const { buildScene } = await import('../src/game/services/world.js');
    const dead = await makePlayer({ locationId: 'rc_alley' });
    await db.transaction((tx) => addItem(tx, 'character', dead.character.id, 'crowbar'));
    await db.transaction(async (tx) => killCharacter(tx, await charRow(dead.character.id), 'blood_loss'));
    const before = await buildScene('rc_alley');
    const pend = before!.pendingCorpses.find((c) => c.name.includes(dead.character.lastName))!;
    expect(pend).toBeTruthy();
    await db.update(schema.risen).set({ risesAt: new Date(Date.now() - 1000) }).where(eq(schema.risen.characterId, dead.character.id));
    await rs.processRisen();
    const scene = await buildScene('rc_alley');
    const r = scene!.risen.find((x) => x.name.includes(dead.character.lastName))!;
    expect(r.carrying).toBeGreaterThanOrEqual(1);
    expect(scene!.containers.some((c) => c.name.includes(dead.character.lastName))).toBe(false);

    const hunter = await makePlayer({ locationId: 'rc_alley' });
    await db.update(schema.locationLoot).set({ zombies: 0 }).where(eq(schema.locationLoot.locationId, 'rc_alley'));
    await rs.fightRisen(hunter.character.id, r.id);
    const h = await charRow(hunter.character.id);
    expect(h.state).toBe('combat');
    const [cb] = await db.select().from(schema.combats).where(eq(schema.combats.id, h.combatId!));
    const zu = (cb.state as any).units.find((u: any) => u.risenId === r.id);
    const { ZOMBIE_TYPES } = await import('../src/game/content/zombies.js');
    expect(zu.name).toContain('(infectado)'); expect(zu.maxBody).toBeGreaterThan(ZOMBIE_TYPES.find((z) => z.id === 'walker')!.stats.body);
    await db.transaction((tx) => rs.settleRisen(tx, [{ risenId: r.id, out: 'dead' }], 'rc_alley', 'Teste'));
    const [rest] = await db.select().from(schema.containers).where(eq(schema.containers.name, `Restos de ${r.name}`));
    const loot = await db.select().from(schema.items).where(and(eq(schema.items.ownerType, 'container'), eq(schema.items.ownerId, String(rest.id))));
    expect(loot.some((i) => i.defId === 'crowbar')).toBe(true);

    const dead2 = await makePlayer({ locationId: 'rc_alley' });
    await db.transaction(async (tx) => killCharacter(tx, await charRow(dead2.character.id), 'blood_loss'));
    const c2 = (await buildScene('rc_alley'))!.pendingCorpses.find((c) => c.name.includes(dead2.character.lastName))!;
    const priest = await makePlayer({ locationId: 'rc_alley' });
    await rs.destroyCorpse(priest.character.id, c2.containerId);
    await db.update(schema.risen).set({ risesAt: new Date(Date.now() - 1000) }).where(eq(schema.risen.characterId, dead2.character.id));
    await rs.processRisen();
    expect((await buildScene('rc_alley'))!.risen.some((x) => x.name.includes(dead2.character.lastName))).toBe(false);
  });
});

describe('Vícios no jogo', () => {
  it('fumar exige isqueiro e zera a fissura; uísque tem doses e embriaga', async () => {
    const p = await makePlayer({ locationId: 'rc_alley' });
    await db.update(schema.characters).set({ traits: ['smoker'], needs: { ...(await charRow(p.character.id)).needs, nicotine: 70, nicotineDep: 70 } }).where(eq(schema.characters.id, p.character.id));
    await db.transaction(async (tx) => { await addItem(tx, 'character', p.character.id, 'cigarettes', 2); await addItem(tx, 'character', p.character.id, 'whiskey', 1); });
    const items = async () => db.select().from(schema.items).where(and(eq(schema.items.ownerType, 'character'), eq(schema.items.ownerId, String(p.character.id))));
    const cig = (await items()).find((i) => i.defId === 'cigarettes')!;
    await expect(useItem(p.character.id, cig.id)).rejects.toThrow(/isqueiro/);
    await db.transaction((tx) => addItem(tx, 'character', p.character.id, 'lighter'));
    await useItem(p.character.id, cig.id);
    let n = (await charRow(p.character.id)).needs as any;
    expect(n.nicotine).toBe(0);
    expect((await items()).find((i) => i.defId === 'cigarettes')!.quantity).toBe(1);
    const w = (await items()).find((i) => i.defId === 'whiskey')!;
    await db.update(schema.items).set({ durability: 6 }).where(eq(schema.items.id, w.id));
    await useItem(p.character.id, w.id); await useItem(p.character.id, w.id);
    expect((await items()).find((i) => i.defId === 'whiskey')!.durability).toBe(4);
    n = (await charRow(p.character.id)).needs as any;
    expect(n.drunk).toBe(44);
  });
});

describe('Regras de PVP, criação e auditoria', () => {
  it('PVP respeita proteção de novato e não permite atacar desconectados', async () => {
    const { attackCharacter } = await import('../src/game/services/combat.js');
    const a = await makePlayer({ locationId: 'rc_church' }); const b = await makePlayer({ locationId: 'rc_church' });
    await expect(attackCharacter(a.character.id, b.character.id)).rejects.toThrow(/proteção de novato/);
    await db.update(schema.characters).set({ protectedUntil: null }).where(eq(schema.characters.id, b.character.id));
    await expect(attackCharacter(a.character.id, b.character.id)).rejects.toThrow(/desconectados/);
    const sb = await connect(srv.url, b.cookie); await wait(200);
    const r = await attackCharacter(a.character.id, b.character.id);
    expect(r.combatId).toBeGreaterThan(0);
    const logs = await db.select().from(schema.gameLogs).where(and(eq(schema.gameLogs.characterId, b.character.id), eq(schema.gameLogs.kind, 'pvp')));
    expect(logs.length).toBe(1);
    sb.close();
  });

  it('criação de personagem valida pontos de atributo e características', async () => {
    const p = await makePlayer();
    await db.update(schema.characters).set({ alive: false }).where(eq(schema.characters.id, p.character.id));
    const bad = await request(srv.url).post('/api/characters').set('Cookie', p.cookie).send({ firstName: 'Ana', lastName: 'Silva', age: 30, profession: 'doctor', traits: ['tough', 'fast_learner'], attributes: { strength: 8, agility: 8, endurance: 8, perception: 8, intellect: 8 } });
    expect(bad.status).toBe(400);
    const good = await request(srv.url).post('/api/characters').set('Cookie', p.cookie).send({ firstName: 'Ana', lastName: 'Silva', age: 30, profession: 'doctor', traits: ['keen_eye', 'smoker'], attributes: { strength: 4, agility: 4, endurance: 5, perception: 4, intellect: 5 } });
    expect(good.status).toBe(200);
    const twice = await request(srv.url).post('/api/characters').set('Cookie', p.cookie).send({ firstName: 'Ana', lastName: 'Silva', age: 30, profession: 'doctor', traits: [], attributes: { strength: 4, agility: 4, endurance: 5, perception: 4, intellect: 5 } });
    expect(twice.status).toBe(400);
  });

  it('ações administrativas sensíveis geram log de auditoria', async () => {
    const adm = await makePlayer({ role: 'admin' }); const p = await makePlayer();
    const r = await request(srv.url).post(`/api/admin/characters/${p.character.id}/items`).set('Cookie', adm.cookie).send({ defId: 'pistol_9mm', qty: 1 });
    expect(r.status).toBe(200);
    const logs = await db.select().from(schema.adminLogs).where(and(eq(schema.adminLogs.action, 'item.grant'), eq(schema.adminLogs.targetId, String(p.character.id))));
    expect(logs).toHaveLength(1);
    expect(logs[0].actorUserId).toBe(adm.user.id);
  });
});

describe('Chat', () => {
  it('sussurro só para quem está no mesmo local; formatação e quebras de linha preservadas', async () => {
    const a = await makePlayer({ locationId: 'rc_market' }); const b = await makePlayer({ locationId: 'rc_market' }); const c = await makePlayer({ locationId: 'rc_alley' });
    const sa = await connect(srv.url, a.cookie); const sb = await connect(srv.url, b.cookie);
    const send = (s: any, payload: any) => new Promise<any>((r) => s.emit('chat:send', payload, r));
    expect((await send(sa, { text: 'oi', channel: 'pm', toCharacterId: c.character.id })).ok).toBe(false);
    const got = waitFor<any>(sb, 'chat:message', (m) => m.channel === 'pm');
    expect((await send(sa, { text: '**Olho para ele.**\nE espero.', channel: 'pm', toCharacterId: b.character.id })).ok).toBe(true);
    expect((await got).content).toBe('**Olho para ele.**\nE espero.');
    expect((await send(sa, { text: '/ooc teste' })).ok).toBe(false);
    sa.close(); sb.close();
  });
});
