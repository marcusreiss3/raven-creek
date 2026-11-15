/**
 * Controle do jogo pela administração: pausa, abertura agendada e aprovação de fichas.
 *
 *  • Pausado: ninguém joga (nem a equipe), o tick do mundo para e o relógio do jogo congela. Ao retomar, todos os
 *    horários salvos (fome, viagens, combates, fogueiras, tarefas…) são empurrados pelo tempo parado: nada é cobrado
 *    pela pausa.
 *  • Fechado até X (opensAt): jogadores podem criar ficha, mas só jogam a partir do horário. A equipe pode entrar antes
 *    para preparar o mundo.
 *  • Exigir aprovação: fichas novas nascem pendentes até alguém da equipe aprovar.
 *
 * O estado fica em game_config (chave "server") e em memória.
 */
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';

export type ServerStatus = {
  paused: boolean;
  pausedAt: number | null;
  pauseMessage: string;
  /** Horário (ms) a partir do qual jogadores podem jogar. null = aberto. */
  opensAt: number | null;
  openMessage: string;
  requireApproval: boolean;
  /** Dia 1: começa sozinho na hora da abertura com quem estiver na sala de espera. */
  prologueEnabled: boolean;
  /** Velocidade do Dia 1 (1 = sessão de ~2h30; 4 = ensaio acelerado). */
  prologueSpeed: number;
  /** Abertura (opensAt) para a qual o Dia 1 já foi disparado — evita repetir. */
  prologueDoneFor: number | null;
};

const DEFAULTS: ServerStatus = { paused: false, pausedAt: null, pauseMessage: '', opensAt: null, openMessage: '', requireApproval: false, prologueEnabled: false, prologueSpeed: 1, prologueDoneFor: null };
/** Minutos antes da abertura em que a sala de espera do Dia 1 abre. */
export const LOBBY_MINUTES = 15;

/** Sonda do Dia 1, instalada pelo módulo do prólogo (evita importação circular). */
let probe: { running: () => boolean; isMember: (characterId: number) => boolean; endsAt: () => number | null } = { running: () => false, isMember: () => false, endsAt: () => null };
export function setPrologueProbe(p: typeof probe) { probe = p; }
let status: ServerStatus = { ...DEFAULTS };

export const STAFF_ROLES = ['gm', 'moderator', 'admin'];
export const isStaffRole = (role: string | null | undefined) => !!role && STAFF_ROLES.includes(role);

export async function loadServerStatus() {
  const [r] = await db.select().from(schema.gameConfig).where(eq(schema.gameConfig.key, 'server'));
  status = { ...DEFAULTS, ...((r?.value as Partial<ServerStatus>) ?? {}) };
}
async function save() {
  await db.insert(schema.gameConfig).values({ key: 'server', value: status })
    .onConflictDoUpdate({ target: schema.gameConfig.key, set: { value: status, updatedAt: new Date() } });
}

export const serverStatus = (): Readonly<ServerStatus> => status;
export const isPaused = () => status.paused;
/** "Agora" do ponto de vista do mundo: enquanto pausado, o tempo para no instante da pausa. */
export const worldNow = (now = Date.now()) => (status.paused && status.pausedAt ? Math.min(now, status.pausedAt) : now);

/** Informação pública (vai para jogadores na tela de espera). */
export function publicStatus() {
  return { paused: status.paused, pauseMessage: status.pauseMessage, opensAt: status.opensAt && status.opensAt > Date.now() ? status.opensAt : null, openMessage: status.openMessage, requireApproval: status.requireApproval,
    prologue: { enabled: status.prologueEnabled, running: probe.running(), endsAt: probe.endsAt() } };
}

export type PlayBlock = { reason: 'paused' | 'closed' | 'pending' | 'lobby' | 'prologue'; message: string; opensAt: number | null };
/** Por que esta pessoa não pode jogar agora (null = pode). */
export function playBlock(role: string | null | undefined, character: { id: number; approved: boolean } | null): PlayBlock | null {
  if (status.paused) return { reason: 'paused', message: status.pauseMessage, opensAt: null };
  // Dia 1 acontecendo: quem está na sessão joga; quem chegou depois espera o fim (a equipe pode circular)
  if (probe.running()) {
    if (character && probe.isMember(character.id)) return null;
    if (!isStaffRole(role)) return { reason: 'prologue', message: status.openMessage, opensAt: probe.endsAt() };
  }
  if (!isStaffRole(role) && status.opensAt && Date.now() < status.opensAt) {
    const lobby = status.prologueEnabled && character?.approved && Date.now() >= status.opensAt - LOBBY_MINUTES * 60_000;
    return { reason: lobby ? 'lobby' : 'closed', message: status.openMessage, opensAt: status.opensAt };
  }
  if (character && !character.approved) return { reason: 'pending', message: '', opensAt: status.opensAt && status.opensAt > Date.now() ? status.opensAt : null };
  return null;
}

// ───────────────────────────── Pausa

/**
 * Horários que representam "quando algo acontece" ou "desde quando conta". Ao retomar, todos andam o tempo da pausa.
 * Sanções (ban/silêncio) e registros históricos (created_at de mensagens, logs) ficam como estão.
 */
const SHIFTED: { table: string; column: string; where?: string }[] = [
  { table: 'characters', column: 'busy_until' }, { table: 'characters', column: 'protected_until' },
  { table: 'characters', column: 'last_tick_at' }, { table: 'characters', column: 'last_pvp_at' },
  { table: 'travels', column: 'last_progress_at' }, { table: 'travels', column: 'started_at' },
  { table: 'combats', column: 'phase_deadline', where: `status = 'active'` },
  { table: 'jobs', column: 'run_at', where: `status IN ('pending', 'running')` },
  { table: 'campfires', column: 'fuel_until' }, { table: 'containers', column: 'expires_at' },
  { table: 'base_structures', column: 'complete_at' }, { table: 'hordes', column: 'next_move_at' },
  { table: 'scheduled_events', column: 'run_at', where: 'done = false' },
  { table: 'risen', column: 'rises_at', where: `status = 'pending'` },
  { table: 'location_loot', column: 'last_regen_at' }, { table: 'companions', column: 'last_tick_at' },
  { table: 'conditions', column: 'started_at', where: 'resolved_at IS NULL' },
  { table: 'wounds', column: 'created_at', where: 'healed_at IS NULL' },
  // Dia 1: o roteiro e o relógio da sessão também param
  { table: 'prologue_sessions', column: 'started_at', where: `status = 'running'` },
  { table: 'prologue_groups', column: 'next_at', where: `status = 'active'` },
];

/** Empurra todos os horários do mundo em `ms` milissegundos (usado ao retomar). Exportado para testes. */
export async function shiftWorldTime(ms: number) {
  if (ms <= 0) return;
  const iv = `${Math.round(ms)} milliseconds`;
  await db.transaction(async (tx) => {
    for (const s of SHIFTED) {
      await tx.execute(sql.raw(`UPDATE ${s.table} SET ${s.column} = ${s.column} + interval '${iv}' WHERE ${s.column} IS NOT NULL${s.where ? ` AND ${s.where}` : ''}`));
    }
    // Carimbos guardados em milissegundos dentro de JSON: remédios fazendo efeito e barra de progresso de tarefas.
    for (const key of ['painkillerUntil', 'antibioticUntil']) {
      await tx.execute(sql.raw(`UPDATE characters SET needs = jsonb_set(needs, '{${key}}', to_jsonb((needs->>'${key}')::bigint + ${Math.round(ms)})) WHERE needs ? '${key}' AND jsonb_typeof(needs->'${key}') = 'number'`));
    }
    await tx.execute(sql.raw(`UPDATE prologue_groups SET ask = jsonb_set(ask, '{deadline}', to_jsonb((ask->>'deadline')::bigint + ${Math.round(ms)})) WHERE ask IS NOT NULL AND jsonb_typeof(ask->'deadline') = 'number'`));
    await tx.execute(sql.raw(`UPDATE characters SET busy_action = jsonb_set(busy_action, '{startedAt}', to_jsonb((busy_action->>'startedAt')::bigint + ${Math.round(ms)})) WHERE busy_action IS NOT NULL AND jsonb_typeof(busy_action->'startedAt') = 'number'`));
  });
}

type Hooks = {
  /** Chamado ao pausar: desconectar todo mundo. */
  onPause?: () => void;
  /** Chamado ao retomar, depois de empurrar os horários: relógio do mundo, caches em memória e agendador. */
  onResume?: (pausedMs: number) => Promise<void>;
};
let hooks: Hooks = {};
export function registerServerHooks(h: Hooks) { hooks = { ...hooks, ...h }; }

export async function pauseGame(message: string) {
  if (status.paused) { status = { ...status, pauseMessage: message }; await save(); return status; }
  status = { ...status, paused: true, pausedAt: Date.now(), pauseMessage: message };
  await save();
  hooks.onPause?.();
  return status;
}

export async function resumeGame() {
  if (!status.paused) return { status, pausedMs: 0 };
  const pausedMs = Math.max(0, Date.now() - (status.pausedAt ?? Date.now()));
  await shiftWorldTime(pausedMs);
  // O relógio do jogo continua de onde parou (o hook ajusta a base enquanto worldNow ainda devolve o instante da pausa).
  await hooks.onResume?.(pausedMs);
  status = { ...status, paused: false, pausedAt: null };
  await save();
  return { status, pausedMs };
}

/** Define a abertura (null = aberto agora) e se fichas novas precisam de aprovação. */
export async function setOpening(o: { opensAt?: number | null; requireApproval?: boolean; openMessage?: string; prologueEnabled?: boolean; prologueSpeed?: number; prologueDoneFor?: number | null }) {
  status = {
    ...status,
    ...(o.prologueEnabled !== undefined ? { prologueEnabled: o.prologueEnabled } : {}),
    ...(o.prologueSpeed !== undefined ? { prologueSpeed: o.prologueSpeed } : {}),
    ...(o.prologueDoneFor !== undefined ? { prologueDoneFor: o.prologueDoneFor } : {}),
    ...(o.opensAt !== undefined ? { opensAt: o.opensAt } : {}),
    ...(o.requireApproval !== undefined ? { requireApproval: o.requireApproval } : {}),
    ...(o.openMessage !== undefined ? { openMessage: o.openMessage } : {}),
  };
  await save();
  return status;
}

/** Só para testes: volta ao estado padrão. */
export async function resetServerStatusForTests() { status = { ...DEFAULTS }; await save(); }
