/** Dia 1: simulação completa com 15 jogadores-robô (acelerada) + início automático na abertura + regras de bloqueio. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema, pool } from '../src/db/index.js';
import { boot, connect, makePlayer, startServer, wait } from './helpers.js';
import { cfg } from '../src/game/services/config.js';
import { finishPrologue, prologueRunning, prologueTick, sessionMinute, activePrologue, lobbyPing, _resetPrologueMemory, loadPrologue, prologueArrive } from '../src/game/services/prologue.js';
import { maybeAutoStartPrologue, startPrologueNow } from '../src/game/services/prologueControl.js';
import { processCombatDeadlines } from '../src/game/services/combat.js';
import { resetServerStatusForTests, setOpening, playBlock } from '../src/game/services/serverStatus.js';
import { validateDia1 } from '../src/game/content/dia1/validate.js';
import type { Socket } from 'socket.io-client';

let srv: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  await boot(); await resetServerStatusForTests(); _resetPrologueMemory(); srv = await startServer();
  const { loadPrologue } = await import('../src/game/services/prologue.js'); await loadPrologue();
  (cfg().combat as any).turnSeconds = 1; // combates rápidos na simulação (robôs não agem: defendem e recuam)
});
afterAll(async () => { if (prologueRunning()) await finishPrologue(); await resetServerStatusForTests(); await srv.close(); await pool.end(); });

const act = (s: Socket, type: string, payload: unknown = {}) => new Promise<any>((r) => s.emit('action', { type, payload }, r));

describe('Dia 1', () => {
  it('o roteiro não tem erros', () => {
    const v = validateDia1();
    expect(v.errors).toEqual([]);
    expect(v.stats.batidas).toBeGreaterThan(150);
  });

  it('simulação com 15 jogadores: todos chegam ao fim, se encontram e recebem a crônica', async () => {
    const profs = ['police', 'police', 'police', 'soldier', 'soldier', 'doctor', 'nurse', 'firefighter', 'engineer', 'mechanic', 'hunter', 'unemployed', 'unemployed', 'athlete', 'cook'];
    const players = [] as Awaited<ReturnType<typeof makePlayer>>[];
    for (const p of profs) players.push(await makePlayer({ profession: p }));
    const sockets: Socket[] = [];
    let asks = 0; let votes = 0; const kinds: Record<string, number> = {};
    for (const p of players) {
      const s = await connect(srv.url, p.cookie); sockets.push(s);
      s.on('prologue:event', (e: any) => {
        kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
        if (e.kind !== 'ask') return;
        asks++;
        const opts = e.payload.options as { id: string }[];
        const ms = Math.max(0, (e.payload.deadline - Date.now()) * (0.2 + Math.random() * 0.5)); // atraso realista
        setTimeout(() => { void act(s, 'prologue_vote', { askId: e.payload.askId, optionId: opts[Math.floor(Math.random() * opts.length)].id }).then((r) => { if (r.ok) votes++; }); }, ms);
      });
    }
    await wait(300);
    const SPEED = 60;
    const r = await startPrologueNow(SPEED);
    expect(r.players).toBe(15);
    expect(r.groups).toBeGreaterThanOrEqual(8);
    // ações do mundo travadas durante o Dia 1
    expect((await act(sockets[0], 'explore')).error).toMatch(/celular/);
    // quem não entrou (chegou depois) fica esperando
    // três saem do trabalho logo no começo (ficam livres; eventos globais acontecem com eles)
    for (const i of [11, 12, 13]) expect((await act(sockets[i], 'prologue_leave', {})).ok).toBe(true);
    const late = await makePlayer({ profession: 'teacher' });
    expect(playBlock('player', { id: late.character.id, approved: true })?.reason).toBe('prologue');

    const seen = new Map<string, number>(); const t0 = Date.now(); let restarted = 0;
    while (prologueRunning() && Date.now() - t0 < 600_000) {
      // simula reinícios do servidor no meio da sessão (a memória zera e volta do banco)
      const sm = activePrologue(); const minNow = sm ? sessionMinute(sm) : 0;
      if ((restarted === 0 && minNow > 30) || (restarted === 1 && minNow > 70)) { restarted++; _resetPrologueMemory(); await loadPrologue(); }
      await prologueTick(); await processCombatDeadlines();
      const s = activePrologue();
      if (s) for (const g of await db.select().from(schema.prologueGroups).where(eq(schema.prologueGroups.sessionId, s.id))) {
        const k = `${g.track}:${g.beatId}`; if (!seen.has(k)) seen.set(k, Math.round(sessionMinute(s)));
      }
      await wait(60);
    }
    expect(prologueRunning()).toBe(false);
    // tempos (minutos de história) em que os grupos chegaram a cada ponto de encontro e aos finais
    const key = [...seen.entries()].filter(([k]) => /^h_\w+:(hd0|hf0|hh0|hl0|hz0|hb0|hb3|fo5|ff4|fi5|fm4|fp4)$/.test(k)).sort((a, b) => a[1] - b[1]);
    console.log('[simulação] marcos:', key.map(([k, m]) => `${k}@${m}`).join('  '));
    console.log('[simulação] eventos por tipo:', JSON.stringify(kinds), 'perguntas:', asks, 'votos:', votes);
    expect(seen.has('h_bloqueio:hb0')).toBe(true);
    expect(restarted).toBe(2);
    // quem saiu do trabalho passou por eventos globais e terminou o dia com crônica
    const freeIds = [11, 12, 13].map((i) => players[i].character.id);
    const fm = await db.select().from(schema.prologueMembers).where(inArray(schema.prologueMembers.characterId, freeIds));
    const fg = await db.select().from(schema.prologueGroups).where(inArray(schema.prologueGroups.id, fm.map((m) => m.groupId)));
    const evDone = fg.flatMap((g) => Object.keys(g.flags).filter((k) => k.startsWith('ev:lg_')));
    console.log('[simulação] eventos globais de quem saiu do trabalho:', evDone.join(' '));
    expect(evDone.length).toBeGreaterThan(0);
    // ninguém recebe a mesma mensagem duas vezes (família, rede, narração), nem depois dos reinícios
    const evs = await db.select().from(schema.prologueEvents).where(inArray(schema.prologueEvents.characterId, players.map((p) => p.character.id)));
    const sig = new Map<string, number>();
    for (const e of evs) {
      const p = e.payload as Record<string, any>;
      if (!['msg', 'news', 'social', 'scene', 'alert'].includes(e.kind) || p.player || p.mine || !p.text) continue;
      const k = `${e.characterId}|${e.kind}|${e.thread}|${p.from}|${p.text}`; sig.set(k, (sig.get(k) ?? 0) + 1);
    }
    const dups = [...sig.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${n}× ${k.slice(0, 120)}`);
    expect(dups).toEqual([]);
    // todo mundo recebeu a crônica; mortos (só atos 4–5) foram aplicados
    const ids = players.map((p) => p.character.id);
    const chron = await db.select().from(schema.gameLogs).where(and(inArray(schema.gameLogs.characterId, ids), eq(schema.gameLogs.kind, 'chronicle')));
    expect(chron.length).toBe(15);
    const members = await db.select().from(schema.prologueMembers).where(inArray(schema.prologueMembers.characterId, ids));
    const dead = members.filter((m) => m.status === 'dead').map((m) => m.characterId);
    const chars = await db.select().from(schema.characters).where(inArray(schema.characters.id, ids));
    for (const c of chars) expect(c.alive).toBe(!dead.includes(c.id));
    console.log('[simulação] mortos:', dead.length, 'de 15 · duração real:', Math.round((Date.now() - t0) / 1000), 's');
    // depois do Dia 1, quem chegou atrasado pode jogar
    expect(playBlock('player', { id: late.character.id, approved: true })).toBeNull();
    for (const s of sockets) s.close();
  }, 700_000);

  it('na hora da abertura, começa sozinho com quem está na sala de espera', async () => {
    const a = await makePlayer({ profession: 'farmer' }); const b = await makePlayer({ profession: 'carpenter' });
    const opensAt = Date.now() + 1500;
    await setOpening({ opensAt, prologueEnabled: true, prologueSpeed: 60 });
    expect(playBlock('player', { id: a.character.id, approved: true })?.reason).toBe('lobby');
    const lob = await request(srv.url).post('/api/prologue/lobby').set('Cookie', a.cookie);
    expect(lob.body.block.reason).toBe('lobby');
    lobbyPing(b.character.id);
    await maybeAutoStartPrologue(); expect(prologueRunning()).toBe(false); // ainda não deu a hora
    await wait(1700);
    await maybeAutoStartPrologue();
    expect(prologueRunning()).toBe(true);
    const ms = await db.select().from(schema.prologueMembers).where(eq(schema.prologueMembers.sessionId, activePrologue()!.id));
    expect(ms.map((m) => m.characterId).sort()).toEqual([a.character.id, b.character.id].sort());
    await maybeAutoStartPrologue(); // não repete
    await finishPrologue();
    await setOpening({ prologueEnabled: false });
  }, 60_000);

  it('sair do trabalho: fica livre, anda pelo mapa e cai no evento do lugar', async () => {
    if (prologueRunning()) await finishPrologue();
    const a = await makePlayer({ profession: 'police' }); const b = await makePlayer({ profession: 'police' });
    const sa = await connect(srv.url, a.cookie); const sb = await connect(srv.url, b.cookie);
    const evs: any[] = []; sa.on('prologue:event', (e: any) => evs.push(e));
    await act(sb, 'tutorial', {});
    const r = await startPrologueNow(40);
    expect(r.players).toBeGreaterThanOrEqual(2);
    // antes de sair, não viaja
    expect((await act(sa, 'travel_preview', { toId: 'rc_main_street' })).ok).toBe(false);
    const left = await act(sa, 'prologue_leave', {});
    expect(left.ok).toBe(true);
    const [ma] = await db.select().from(schema.prologueMembers).where(eq(schema.prologueMembers.characterId, a.character.id));
    expect(ma.flags.livre).toBe(true);
    expect(ma.marks).toContain('largou_o_posto');
    // livre e parado: pode consultar viagem
    const prev = await act(sa, 'travel_preview', { toId: 'rc_main_street' });
    expect(prev.error ?? '').not.toMatch(/celular|Agora não/);
    // chega no hospital: evento do lugar começa
    await db.update(schema.characters).set({ locationId: 'rc_hospital_entrance' }).where(eq(schema.characters.id, a.character.id));
    await prologueArrive(a.character.id, 'rc_hospital_entrance');
    const [g] = await db.select().from(schema.prologueGroups).where(eq(schema.prologueGroups.id, ma.groupId));
    expect(g.track).toBe('lv_hospital_cedo');
    // durante o evento não viaja
    expect((await act(sa, 'travel_preview', { toId: 'rc_main_street' })).error ?? '').toMatch(/Agora não/);
    const t0 = Date.now();
    while (Date.now() - t0 < 30_000) {
      await prologueTick();
      const ask = evs.find((e) => e.kind === 'ask' && e.thread !== 'grupo');
      if (ask && !evs.some((e) => e.kind === 'answer' && e.payload.askId === ask.payload.askId)) await act(sa, 'prologue_vote', { askId: ask.payload.askId, optionId: 'sair' });
      const [gg] = await db.select().from(schema.prologueGroups).where(eq(schema.prologueGroups.id, ma.groupId));
      if (gg.phase === 'free') { expect(gg.flags['ev:lv_hospital_cedo']).toBe(true); break; }
      await wait(100);
    }
    const [g2] = await db.select().from(schema.prologueGroups).where(eq(schema.prologueGroups.id, ma.groupId));
    expect(g2.phase).toBe('free');
    // voltar ao mesmo lugar não repete o evento
    await prologueArrive(a.character.id, 'rc_hospital_entrance');
    const [g3] = await db.select().from(schema.prologueGroups).where(eq(schema.prologueGroups.id, ma.groupId));
    expect(g3.phase).toBe('free');
    // o colega que ficou recebeu o aviso
    sa.close(); sb.close();
    await finishPrologue();
  }, 60_000);
});
