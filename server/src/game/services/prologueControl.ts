/**
 * Quem entra no Dia 1 e quando. Liga o motor do prólogo ao controle do jogo:
 *  • sala de espera nos 15 min antes da abertura (só fichas aprovadas, com o Dia 1 ligado);
 *  • na hora da abertura, começa sozinho com quem está na sala de espera ou conectado;
 *  • quem chega depois espera o fim da sessão (tela de "o Dia 1 está acontecendo").
 */
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { isPrologueMember, lobbyPresent, prologueEndsAt, prologueRunning, startPrologue } from './prologue.js';
import { onlineUserIds } from './realtime.js';
import { isPaused, serverStatus, setOpening, setPrologueProbe } from './serverStatus.js';

setPrologueProbe({ running: prologueRunning, isMember: isPrologueMember, endsAt: prologueEndsAt });

/** Personagens prontos para o Dia 1: vivos, aprovados, e com a pessoa na sala de espera ou conectada. */
export async function prologueCandidates() {
  const lobby = lobbyPresent();
  const online = onlineUserIds();
  const rows = await db.select({ id: schema.characters.id, userId: schema.characters.userId }).from(schema.characters)
    .where(and(eq(schema.characters.alive, true), eq(schema.characters.approved, true)));
  return rows.filter((r) => lobby.includes(r.id) || online.includes(r.userId)).map((r) => r.id);
}

let starting = false;
/** Chamado a cada segundo: na hora da abertura, dispara o Dia 1 (uma vez por abertura). */
export async function maybeAutoStartPrologue() {
  const st = serverStatus();
  if (starting || isPaused() || prologueRunning() || !st.prologueEnabled || !st.opensAt || Date.now() < st.opensAt || st.prologueDoneFor === st.opensAt) return;
  starting = true;
  try {
    const ids = await prologueCandidates();
    const opensAt = st.opensAt;
    await setOpening({ prologueDoneFor: opensAt, opensAt: null });
    if (ids.length) await startPrologue({ characterIds: ids, speed: st.prologueSpeed || 1 });
  } catch (e) { console.error('[dia 1] início automático', e); }
  finally { starting = false; }
}

/** Início manual (painel): com quem estiver na sala de espera ou conectado. */
export async function startPrologueNow(speed?: number) {
  const ids = await prologueCandidates();
  return startPrologue({ characterIds: ids, speed: speed ?? (serverStatus().prologueSpeed || 1) });
}

