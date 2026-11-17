import { create } from 'zustand';
import type { ChatMsg, Clock, CombatView, Content, Scene, SelfState, User, WorldMap } from './types';

export type Toast = { id: number; text: string; level: 'info' | 'warn' | 'danger' | 'success'; icon?: string };
export type Panel = null | 'inventory' | 'body' | 'skills' | 'crafting' | 'faction' | 'map' | 'journal' | 'character' | 'base' | 'settings' | 'projects';

type State = {
  user: User | null; characterId: number | null; content: Content | null;
  self: SelfState | null; scene: Scene | null; clock: Clock | null;
  messages: ChatMsg[]; combat: CombatView | null; combatEnd: { outcome: string; summary: string; you: string } | null;
  toasts: Toast[]; panel: Panel; connected: boolean; blocks: number[];
  modal: null | { kind: string; data?: any };
  /** Ao abrir a ficha médica para prestar socorro: de quem é a ficha. */
  bodyPatient?: number | null;
  death: null | { name: string; cause: string; reanimated: boolean };
  /** Capítulo da história anunciado pela administração (boletim em tela cheia). */
  bulletin: null | { key: string; kicker: string; title: string; text: string; at: string };
  /** Capítulo 1: conversa da tripulação ouvida pelo rádio (ao vivo) e o helicóptero visto passando. */
  loreRadio: null | { via: string | null; lines: { who: string; text: string }[]; total: number; done: boolean; open: boolean };
  overflight: null | string;
  set: (p: Partial<State>) => void;
  toast: (text: string, level?: Toast['level'], icon?: string) => void;
  addMessages: (m: ChatMsg[]) => void;
  /** Quem está digitando: characterId → instante em que o balão expira. */
  typing: Record<number, number>;
  /** Muda quando algum projeto da comunidade muda (o painel recarrega). */
  projectsTick: number;
  /** Muda quando alguma horda se move (mapa e alerta da cena buscam de novo). */
  hordesTick: number;
  /** Mapa do condado (carregado uma vez) e rota planejada pelo jogador. */
  worldMap: WorldMap | null; route: null | { targetId: string; targetName: string };
  setTyping: (characterId: number, typing: boolean) => void;
  /** Celular: aba aberta (cena ou chat) e para quem o próximo sussurro vai. */
  mobileTab: 'scene' | 'chat'; chatPmTo: number | null;
};

let toastId = 1;
export const useGame = create<State>((set, get) => ({
  user: null, characterId: null, content: null, self: null, scene: null, clock: null, messages: [], combat: null, combatEnd: null,
  toasts: [], panel: null, connected: false, blocks: [], modal: null, death: null, bulletin: null, loreRadio: null, overflight: null,
  typing: {}, projectsTick: 0, hordesTick: 0, mobileTab: 'scene', chatPmTo: null, worldMap: null, route: (() => { try { return JSON.parse(localStorage.getItem('rc_route') ?? 'null'); } catch { return null; } })(),
  setTyping: (characterId, typing) => {
    const next = { ...get().typing };
    if (typing) {
      const until = Date.now() + 6000; next[characterId] = until;
      // some sozinho se a pessoa parar de digitar sem avisar (fechou a aba, perdeu conexão…)
      setTimeout(() => { if (get().typing[characterId] === until) { const t = { ...get().typing }; delete t[characterId]; set({ typing: t }); } }, 6100);
    } else delete next[characterId];
    set({ typing: next });
  },
  set: (p) => set(p),
  toast: (text, level = 'info', icon) => {
    const id = toastId++;
    set({ toasts: [...get().toasts.slice(-4), { id, text, level, icon }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), level === 'danger' ? 7000 : 4500);
  },
  addMessages: (m) => {
    const byId = new Map(get().messages.map((x) => [x.id, x]));
    for (const x of m) byId.set(x.id, x);
    set({ messages: [...byId.values()].sort((a, b) => a.id - b.id).slice(-400) });
  },
}));

// A rota planejada sobrevive a recarregar a página.
useGame.subscribe((s, prev) => { if (s.route !== prev.route) { try { if (s.route) localStorage.setItem('rc_route', JSON.stringify(s.route)); else localStorage.removeItem('rc_route'); } catch { /* sem armazenamento */ } } });

// Só no modo de desenvolvimento: atalho para testes automáticos abrirem painéis.
if (import.meta.env.DEV && typeof window !== 'undefined') (window as any).__rc = { set: (p: any) => useGame.getState().set(p) };
