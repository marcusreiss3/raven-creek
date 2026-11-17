import { sql } from 'drizzle-orm';
import { db, pool, schema } from '../../db/index.js';
import { env } from '../../config/env.js';
import { cfg } from './config.js';
import { completeExplore } from './explore.js';
import { completeBuild } from './bases.js';
import { processCombatDeadlines } from './combat.js';
import { processNeeds, recoverJobs } from './tick.js';
import { processRoadSightings, processTravels } from './travel.js';
import { cleanupCorpses, processHordes, processScheduledEvents, processWeather, processWorldEvents } from './worldsim.js';
import { processBaseProduction } from './bases.js';
import { emitAll } from './realtime.js';
import { clock } from './config.js';
import { eq } from 'drizzle-orm';
import { processLurkingZombies, respawnZombies } from './zombies.js';
import { completeClaimPower, completeProjectWork, processProjects } from './projects.js';
import { completeOutdoorJob, processFires, processSeasonChange, processSpoilage } from './nature.js';
import { dogHuntBonus, processDogs } from './dogs.js';
import { processRisen } from './risen.js';
import { isPaused } from './serverStatus.js';
import { prologueRunning, prologueTick } from './prologue.js';
import { maybeAutoStartPrologue } from './prologueControl.js';

type JobRow = typeof schema.jobs.$inferSelect;

/** Executa jobs vencidos com FOR UPDATE SKIP LOCKED — seguro com várias instâncias. */
export async function processJobs(limit = 50) {
  for (let i = 0; i < limit; i++) {
    const res = await db.execute(sql`UPDATE jobs SET status = 'running', attempts = attempts + 1
      WHERE id = (SELECT id FROM jobs WHERE status = 'pending' AND run_at <= now() ORDER BY run_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`);
    const job = (res.rows?.[0] ?? null) as any;
    if (!job) return;
    const j: JobRow = { ...job, characterId: job.character_id, runAt: job.run_at };
    try {
      if (j.kind === 'explore_complete') await completeExplore(j.id, j.characterId!);
      else if (j.kind === 'build_complete') await completeBuild(j.id, j.characterId!, Number(j.payload.structureId));
      else if (j.kind === 'project_work') await completeProjectWork(j.id, j.characterId!, String(j.payload.projectId));
      else if (j.kind === 'hunt_complete') await completeOutdoorJob(j.id, j.characterId!, 'hunt', await dogHuntBonus(j.characterId!));
      else if (j.kind === 'fish_complete') await completeOutdoorJob(j.id, j.characterId!, 'fish');
      else if (j.kind === 'dog_scavenge') await (await import('./dogs.js')).completeDogScavenge(j.characterId!, Number(j.payload.dogId), String(j.payload.locationId));
      else if (j.kind === 'hide_end') await (await import('./hordes.js')).stopHiding(j.characterId!, j.id);
      else if (j.kind === 'read_complete') await (await import('./survival.js')).completeReading(j.id, j.characterId!);
      else if (j.kind === 'project_claim') await completeClaimPower(j.id, j.characterId!, Number(j.payload.factionId));
      await db.update(schema.jobs).set({ status: 'done' }).where(eq(schema.jobs.id, j.id));
    } catch (e) {
      console.error('job', j.id, j.kind, e);
      await db.update(schema.jobs).set({ status: j.attempts >= 3 ? 'failed' : 'pending', lastError: String((e as Error).message ?? e) }).where(eq(schema.jobs.id, j.id));
      if (j.attempts >= 3 && j.characterId) await db.update(schema.characters).set({ state: 'idle', busyUntil: null, busyAction: null }).where(eq(schema.characters.id, j.characterId));
    }
  }
}

let running = false; let timer: NodeJS.Timeout | null = null; let lastSlow = 0; let lastClockBroadcast = 0;
const LEADER_LOCK = 4242;
/** Ao retomar de uma pausa: os processos lentos (produção, respawn) não contam o tempo parado. */
export function shiftSchedulerClock(ms: number) { if (lastSlow) lastSlow += ms; }

/** Um tick do mundo. Só a instância que detém o advisory lock processa (evita duplicidade). */
export async function worldTick() {
  if (running || isPaused()) return; running = true;
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [LEADER_LOCK]);
    if (!rows[0].ok) return;
    try {
      const dia1 = prologueRunning(); // durante o Dia 1, o mundo não sorteia emboscadas/eventos (a história conduz)
      await processJobs();
      await processTravels();
      if (!dia1) await processRoadSightings();
      await processCombatDeadlines();
      await processNeeds();
      await processFires();
      await processRisen();
      await (await import('./heli.js')).processHeli(); // capítulo 1: queda do helicóptero (sobrevive a reinício)
      const now = Date.now();
      const slowEvery = cfg().world.eventRollEveryMinutes * 60000;
      if (now - lastSlow > slowEvery) {
        const hours = lastSlow ? (now - lastSlow) / 3_600_000 : 0;
        lastSlow = now;
        await processWeather(); if (!dia1) { await processWorldEvents(); await processHordes(); } await cleanupCorpses(); await processScheduledEvents();
        if (!dia1) await processLurkingZombies();
        await processSeasonChange(); await processSpoilage(); if (!dia1) await processDogs();
        if (hours) { await processBaseProduction(hours); await respawnZombies(hours); await processProjects(hours); }
      }
      if (now - lastClockBroadcast > 30000) { lastClockBroadcast = now; emitAll('world:clock', clock()); }
    } finally { await client.query('SELECT pg_advisory_unlock($1)', [LEADER_LOCK]); }
  } catch (e) { console.error('worldTick', e); }
  finally { client.release(); running = false; }
}

let prologueTimer: NodeJS.Timeout | null = null;
export async function startScheduler() {
  await recoverJobs();
  timer = setInterval(worldTick, env.worldTickMs);
  // Dia 1: ritmo de segundo em segundo (mensagens, enquetes) e início automático na hora da abertura
  prologueTimer = setInterval(() => { void maybeAutoStartPrologue().then(prologueTick).catch((e) => console.error('[dia 1]', e)); }, 1000);
}
export function stopScheduler() { if (timer) clearInterval(timer); timer = null; if (prologueTimer) clearInterval(prologueTimer); prologueTimer = null; }
