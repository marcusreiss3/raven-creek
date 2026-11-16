import { io, type Socket } from 'socket.io-client';
import { useGame } from './store';
import { audio } from './audio';
import type { ChatMsg } from './types';
import { bindPrologue } from './prologue';

let socket: Socket | null = null;

export function connectSocket() {
  if (socket) return socket;
  socket = io({ withCredentials: true, transports: ['websocket', 'polling'] });
  const g = useGame.getState;
  let combatLoading = false;
  socket.on('connect', () => { g().set({ connected: true }); socket!.emit('scene:refresh'); });
  socket.on('disconnect', () => g().set({ connected: false }));
  // Controle do jogo: pausa, fechamento ou reset pela administração → recarrega e cai na tela de espera.
  let leaving = false;
  const toGate = () => { if (leaving) return; leaving = true; setTimeout(() => location.reload(), 400); };
  socket.on('connect_error', (e: Error) => { g().set({ connected: false }); if (e?.message?.startsWith('blocked:')) toGate(); });
  socket.on('server:status', toGate);
  socket.on('disconnect', (reason: string) => { if (reason === 'io server disconnect') toGate(); });
  socket.on('state:self', (self) => {
    const prev = g().self;
    g().set({ self, clock: self.clock });
    if (!self.combatId && g().combat && g().combat?.status !== 'ended') g().set({ combat: null });
    // Recarregou a página no meio de um confronto: busca o tabuleiro de novo (antes só chegava pelo evento combat:start).
    if (self.combatId && g().combat?.id !== self.combatId && !combatLoading) {
      combatLoading = true;
      action('combat_view', { combatId: self.combatId }, { silent: true }).then((r) => { if (r.ok) g().set({ combat: r.combat }); }).finally(() => { combatLoading = false; });
    }
    if (prev && self.wounds.length > prev.wounds.length) { audio.sfx('pain'); }
  });
  socket.on('scene:update', (scene) => { if (scene) g().set({ scene }); });
  socket.on('chat:history', ({ messages }: { messages: ChatMsg[] }) => g().addMessages(messages));
  socket.on('chat:message', (m: ChatMsg) => { g().addMessages([m]); if (m.kind !== 'emote' && m.userId !== g().user?.id) audio.sfx('chat_message', 0.3); });
  socket.on('chat:typing', ({ characterId, typing }: { characterId: number; typing: boolean }) => g().setTyping(characterId, typing));
  // ao receber uma mensagem de alguém, o balão dele some
  socket.on('chat:message', (m: ChatMsg) => { if (m.characterId) g().setTyping(m.characterId, false); });
  socket.on('projects:update', () => g().set({ projectsTick: Date.now() }));
  socket.on('hordes:update', () => g().set({ hordesTick: Date.now() }));
  socket.on('chat:deleted', ({ id }: { id: number }) => g().set({ messages: g().messages.map((m) => (m.id === id ? { ...m, deleted: true, content: '[mensagem removida pela moderação]' } : m)) }));
  socket.on('notify', (n: { text: string; level: any; icon?: string }) => { g().toast(n.text, n.level, n.icon); if (n.level === 'danger') audio.sfx('notification'); });
  socket.on('combat:start', ({ combatId }) => { g().set({ combatEnd: null }); action('combat_view', { combatId }).then((r) => r.ok && g().set({ combat: r.combat })); audio.music('combat'); });
  socket.on('combat:state', (c) => { if (c && (g().self?.combatId === c.id || g().combat?.id === c.id)) g().set({ combat: c }); });
  socket.on('combat:end', (e) => { g().set({ combatEnd: e }); });
  socket.on('travel:start', () => audio.sfx('footsteps', 0.4));
  // Sons do mundo: tiros ecoando de locais vizinhos (e de perto, para quem está no local mas fora do tabuleiro).
  socket.on('world:sound', (w: { key: string; gain?: number; near?: boolean }) => { if (w.near && g().self?.combatId) return; audio.sfx(w.key, w.gain ?? 0.7); });
  socket.on('travel:arrived', (a) => g().toast(`Você chegou: ${a.name}`, 'success'));
  socket.on('character:death', (d) => { g().set({ death: d }); audio.music('death'); });
  socket.on('world:clock', (clock) => g().set({ clock }));
  socket.on('world:weather', () => socket?.emit('scene:refresh'));
  socket.on('user:blocks', (b: number[]) => g().set({ blocks: b }));
  socket.on('amputation:request', (r) => g().set({ modal: { kind: 'amputation_consent', data: r } }));
  socket.on('force:logout', () => { window.location.reload(); });
  bindPrologue(socket);
  return socket;
}
let typingOn = false; let typingIdle: ReturnType<typeof setTimeout> | null = null; let lastTypingPing = 0;
/** Avisa que o jogador está digitando (com limite de frequência) e desliga sozinho após alguns segundos parado. */
export function setTyping(active: boolean) {
  const me = useGame.getState().self?.id;
  if (typingIdle) { clearTimeout(typingIdle); typingIdle = null; }
  if (active) {
    const now = Date.now();
    if (!typingOn || now - lastTypingPing > 2500) { socket?.emit('chat:typing', { typing: true }); lastTypingPing = now; }
    typingOn = true;
    if (me) useGame.getState().setTyping(me, true);
    typingIdle = setTimeout(() => setTyping(false), 4000);
  } else if (typingOn) {
    typingOn = false; socket?.emit('chat:typing', { typing: false });
    if (me) useGame.getState().setTyping(me, false);
  }
}
export function disconnectSocket() { socket?.close(); socket = null; }

/** Envia uma ação ao servidor (que decide o resultado) e retorna a resposta. Erros viram toasts. */
export function action<T = any>(type: string, payload: Record<string, unknown> = {}, opts: { silent?: boolean } = {}): Promise<T & { ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (!socket) return resolve({ ok: false, error: 'Sem conexão.' } as any);
    socket.timeout(15000).emit('action', { type, payload }, (err: unknown, res: any) => {
      const r = err ? { ok: false, error: 'O servidor não respondeu.' } : res;
      if (!r.ok && !opts.silent) { useGame.getState().toast(r.error ?? 'Falhou.', 'warn'); audio.sfx('ui_error', 0.5); }
      if (r.ok && type === 'treat') audio.sfx('bandage', 0.7);
      resolve(r);
    });
  });
}
export function sendChat(text: string, opts: { channel?: string; toCharacterId?: number; frequency?: number } = {}): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (!socket) return resolve({ ok: false, error: 'Sem conexão.' });
    socket.timeout(10000).emit('chat:send', { text, ...opts }, (err: unknown, r: any) => resolve(err ? { ok: false, error: 'Sem resposta.' } : r));
  });
}
export const refreshScene = () => socket?.emit('scene:refresh');
