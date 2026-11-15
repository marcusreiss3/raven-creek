import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Celular (ou tablet pequeno na mão): tela estreita, ou toque com tela até 1100 px.
 * Nesses casos o jogo usa o layout de celular (abas embaixo, painéis em tela cheia).
 */
const QUERY = '(max-width: 820px), (pointer: coarse) and (max-width: 1100px)';
const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY) : null;

export const isMobile = () => !!mq?.matches;
export function useIsMobile() {
  return useSyncExternalStore(
    (cb) => { mq?.addEventListener('change', cb); return () => mq?.removeEventListener('change', cb); },
    isMobile,
    () => false,
  );
}

/** Celular deitado: pouca altura, então barra de cima e abas ficam mais baixas. */
const LAND = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(orientation: landscape) and (max-height: 520px)') : null;
export function useIsLandscapePhone() {
  return useSyncExternalStore((cb) => { LAND?.addEventListener('change', cb); return () => LAND?.removeEventListener('change', cb); }, () => !!LAND?.matches, () => false);
}

/**
 * Altura visível de verdade em --app-h. No iPhone o 100dvh não encolhe quando o teclado abre;
 * o visualViewport encolhe. Assim a caixa do chat fica sempre acima do teclado.
 */
export function installViewportVar() {
  const vv = window.visualViewport;
  const apply = () => {
    const h = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-h', `${Math.round(h)}px`);
    // o iOS rola a página para mostrar o campo; devolve para o topo para nada sair do lugar
    if (vv && isMobile() && window.scrollY) window.scrollTo(0, 0);
  };
  apply();
  vv?.addEventListener('resize', apply); vv?.addEventListener('scroll', apply);
  window.addEventListener('resize', apply);
}

/** Teclado virtual aberto: no celular, há um campo de texto em foco (mais confiável que medir a tela). */
export function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const typing = () => { const el = document.activeElement as HTMLElement | null; const tag = el?.tagName; return isMobile() && !!el && (tag === 'TEXTAREA' || (tag === 'INPUT' && !['checkbox', 'radio', 'range', 'button', 'file'].includes((el as HTMLInputElement).type)) || el.isContentEditable); };
    const f = () => setOpen(typing());
    const later = () => setTimeout(f, 50); // no focusout o novo foco ainda não chegou
    document.addEventListener('focusin', f); document.addEventListener('focusout', later);
    return () => { document.removeEventListener('focusin', f); document.removeEventListener('focusout', later); };
  }, []);
  return open;
}

/** Vibra de leve ao confirmar algo, quando o aparelho deixa. */
export const buzz = (ms = 12) => { try { if (isMobile()) navigator.vibrate?.(ms); } catch { /* sem vibração */ } };
