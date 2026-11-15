/**
 * Estado do celular no Dia 1: tudo que chegou (mensagens, notícias, enquetes), bateria, sinal e o grupo.
 * Carrega por inteiro com `prologue_state` e depois recebe cada evento pelo socket.
 */
import { create } from 'zustand';
import type { Socket } from 'socket.io-client';
import { action } from './socket';
import { audio } from './audio';

export type PEvent = { id: number; kind: string; thread: string; payload: Record<string, any>; createdAt: string };
export type AskOption = { id: string; label: string; check?: { label: string; chance: number } };
export type Chronicle = { name: string; status: string; marks: { id: string; name: string; text: string }[]; lines: string[]; location: string };
export type SocialData = { likedBy: number[]; comments: { id: number; by: number; name: string; text: string; at: number }[] };
export type PhoneSession = { id: number; startedAt: number; speed: number; signal: number; powerOut: boolean; act: number; minutes: number };

type PState = {
  loaded: boolean;
  session: PhoneSession | null;
  me: { status: string; battery: number; light: boolean; marks: string[]; deathCause: string | null; free?: boolean; freeIdle?: boolean } | null;
  group: { id: number; location: string; members: { id: number; name: string; status: string }[] } | null;
  contacts: { id: number; name: string; profession: string }[];
  events: PEvent[];
  /** askId → contagem de votos por opção (enquetes do grupo). */
  tallies: Record<string, { tally: Record<string, number>; voters: number }>;
  /** askId → opção que eu escolhi. */
  myVotes: Record<string, string>;
  /** Último evento importante que acende a tela (notificação, alerta, ligação). */
  pop: PEvent | null;
  end: null | { chronicle: Chronicle; dead: boolean };
  /** Raven Rede: curtidas e comentários dos jogadores por postagem. */
  social: Record<string, SocialData>;
  set: (p: Partial<PState>) => void;
};

export const usePhone = create<PState>((set) => ({
  loaded: false, session: null, me: null, group: null, contacts: [], events: [], tallies: {}, myVotes: {}, pop: null, end: null, social: {},
  set: (p) => set(p),
}));

export async function loadPhone() {
  const r = await action<{ phone: any }>('prologue_state', {}, { silent: true });
  if (!r.ok || !r.phone) return;
  const p = r.phone;
  const myVotes: Record<string, string> = {};
  for (const e of p.events as PEvent[]) if (e.kind === 'answer' && e.payload.mine) myVotes[e.payload.askId] = e.payload.option;
  if (p.openAsk?.myVote) myVotes[p.openAsk.askId] = p.openAsk.myVote;
  const tallies = p.openAsk ? { [p.openAsk.askId]: { tally: p.openAsk.tally, voters: Object.values(p.openAsk.tally as Record<string, number>).reduce((a, b) => a + b, 0) } } : {};
  const events: PEvent[] = [];
  for (const e of p.events as PEvent[]) if (!events.some((x) => isCopy(x, e))) events.push(e);
  usePhone.getState().set({ loaded: true, session: p.session, me: p.me, group: p.group, contacts: p.contacts, events, myVotes, tallies, social: p.social ?? {} });
}

/** Mesma mensagem de NPC/narração na mesma conversa (cópia que não deveria existir). Mensagens de jogadores nunca contam. */
const COPYABLE = new Set(['msg', 'news', 'social', 'scene', 'alert']);
function isCopy(a: PEvent, b: PEvent) {
  if (!COPYABLE.has(b.kind) || a.kind !== b.kind || a.thread !== b.thread) return false;
  if (b.payload.player || b.payload.mine || a.payload.player || a.payload.mine) return false;
  return !!b.payload.text && a.payload.text === b.payload.text && a.payload.from === b.payload.from;
}

/** Sons do celular por tipo de evento. */
function ring(e: PEvent) {
  if (e.kind === 'alert' || e.thread === 'alerta') return audio.sfx('emergency_alert', 0.8);
  if (e.kind === 'ask' && e.payload.kind === 'call') return audio.sfx('phone_ring', 0.8);
  if (e.kind === 'death') return audio.sfx('heartbeat', 0.8);
  if (e.thread === 'cena' || e.kind === 'roll' || e.kind === 'answer') return;
  audio.sfx(e.kind === 'ask' ? 'phone_vibrate' : 'phone_notify', 0.55);
}

export function bindPrologue(socket: Socket) {
  const g = usePhone.getState;
  socket.on('prologue:start', () => { g().set({ end: null }); loadPhone(); });
  socket.on('prologue:event', (e: PEvent) => {
    if (g().events.some((x) => x.id === e.id || isCopy(x, e))) return;
    const events = [...g().events, e];
    const patch: Partial<PState> = { events };
    if (e.kind === 'answer' && e.payload.mine) patch.myVotes = { ...g().myVotes, [e.payload.askId]: e.payload.option };
    if (e.kind === 'system' && (e.payload.merge || e.payload.split)) setTimeout(loadPhone, 800);
    if (['ask', 'alert', 'death'].includes(e.kind) || (e.thread !== 'cena' && e.kind !== 'roll' && e.kind !== 'answer' && e.kind !== 'system')) patch.pop = e;
    g().set(patch);
    ring(e);
  });
  socket.on('prologue:votes', (v: { askId: string; tally: Record<string, number>; voters: number }) => g().set({ tallies: { ...g().tallies, [v.askId]: { tally: v.tally, voters: v.voters } } }));
  socket.on('prologue:me', (m: Partial<NonNullable<PState['me']>>) => { const me = g().me; if (me) g().set({ me: { ...me, ...m } }); });
  socket.on('prologue:session', (s: Partial<PhoneSession>) => { const cur = g().session; if (cur) g().set({ session: { ...cur, ...s } }); });
  socket.on('prologue:social', (d: SocialData & { postKey: string }) => { const { postKey, ...rest } = d; g().set({ social: { ...g().social, [postKey]: rest } }); });
  socket.on('prologue:end', (p: { chronicle: Chronicle; dead: boolean }) => { g().set({ end: p }); audio.music(p.dead ? 'death' : 'explore_calm'); });
}

export const vote = (askId: string, optionId: string) => {
  usePhone.getState().set({ myVotes: { ...usePhone.getState().myVotes, [askId]: optionId } });
  return action('prologue_vote', { askId, optionId });
};
export const setLight = (on: boolean) => action('prologue_light', { on }).then((r) => { if (r.ok) { const me = usePhone.getState().me; if (me) usePhone.getState().set({ me: { ...me, light: on } }); } });
export const phoneSend = (to: number | 'grupo', text: string) => action('prologue_send', { to, text });
export const phoneReply = (eventId: number, idx: number) => action('prologue_reply', { eventId, idx });

/** Relógio do jogo no celular: começa 07:00 e chega perto das 22:00 no fim da sessão. */
export function phoneClock(s: PhoneSession | null, now = Date.now()) {
  if (!s) return '07:00';
  const min = Math.max(0, ((now - s.startedAt) * s.speed) / 60_000);
  const total = 7 * 60 + min * (15 * 60 / (s.minutes || 120));
  const h = Math.floor(total / 60) % 24, m = Math.floor(total % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export const socialLike = (postKey: string) => action('prologue_like', { postKey });
export const socialComment = (postKey: string, text: string) => action('prologue_comment', { postKey, text });
export const leaveWork = () => action('prologue_leave', {}).then((r) => { if (r.ok) loadPhone(); return r; });
