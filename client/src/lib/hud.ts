/** Preferência local de interface: modo simples esconde os botões avançados do HUD (PC e celular). */
import { create } from 'zustand';

const KEY = 'rc.hud.simple';
const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

/** Painéis escondidos no modo simples (os atalhos de teclado continuam funcionando). */
export const ADVANCED_PANELS = new Set<string | null>(['skills', 'crafting', 'base', 'projects', 'faction', 'journal']);

export const useHud = create<{ simple: boolean; setSimple: (v: boolean) => void }>((set) => ({
  simple: read(),
  setSimple: (v) => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* navegador sem armazenamento */ } set({ simple: v }); },
}));
