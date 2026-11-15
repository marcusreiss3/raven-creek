/**
 * Liga o controle do jogo (serverStatus) ao resto do servidor: quem é desconectado ao pausar/fechar e o que precisa
 * ser ajustado em memória ao retomar. Instalado pelo servidor de sockets (também nos testes).
 */
import type { Server } from 'socket.io';
import { shiftWorldClock } from './config.js';
import { shiftSchedulerClock } from './scheduler.js';
import { loadFires } from './nature.js';
import { loadProjects } from './projects.js';
import { isStaffRole, publicStatus, registerServerHooks } from './serverStatus.js';

let io: Server | null = null;

/** Avisa e desconecta. `onlyPlayers`: mantém a equipe conectada (ex.: mundo fechado até a abertura). */
export function kickEveryone(reason: 'paused' | 'closed' | 'reset', onlyPlayers = false) {
  if (!io) return;
  for (const s of io.sockets.sockets.values()) {
    const role = (s.data?.user as { role?: string } | undefined)?.role;
    if (onlyPlayers && isStaffRole(role)) continue;
    s.emit('server:status', { reason, ...publicStatus() });
    s.disconnect();
  }
}

export function installServerControl(server: Server) {
  io = server;
  registerServerHooks({
    onPause: () => kickEveryone('paused'),
    onResume: async (ms) => {
      await shiftWorldClock(ms);
      shiftSchedulerClock(ms);
      await loadFires();
      await loadProjects();
      const { loadPrologue } = await import('./prologue.js'); await loadPrologue(); // relê o início (empurrado) da sessão do Dia 1
    },
  });
}
