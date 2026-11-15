import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, X } from 'lucide-react';
import { GameIcon } from './GameIcon';
import { useIsMobile } from '../lib/mobile';

export function Bar({ value, max = 100, color = '#f0a73a', label, invert, small }: { value: number; max?: number; color?: string; label?: string; invert?: boolean; small?: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const shown = invert ? 100 - pct : pct;
  return (
    <div className="w-full">
      {label && <div className="flex justify-between label mb-1"><span>{label}</span><span className="text-ink-200 tabular-nums">{Math.round(invert ? max - value : value)}</span></div>}
      <div className={`w-full ${small ? 'h-[5px]' : 'h-2'} bg-[#0d0e09] shadow-[inset_0_1px_2px_rgba(0,0,0,.8)]`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)} aria-label={label}>
        <div className="h-full transition-[width] duration-700" style={{ width: `${shown}%`, background: `linear-gradient(180deg, ${color}, ${color}cc)`, boxShadow: `0 0 8px -1px ${color}` }} />
      </div>
    </div>
  );
}

/** Medidor em gomos para necessidades: 10 gomos, cor + ícone + texto (nunca só cor). */
export function Gauge({ value, color }: { value: number; color: string }) {
  const on = Math.round(Math.max(0, Math.min(100, value)) / 10);
  return <div className="gauge w-full" style={{ ['--g' as any]: color }}>{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < on ? 'on' : ''} />)}</div>;
}

/** Prende o foco dentro de um elemento (modais) e devolve ao fechar. */
export function useFocusTrap<T extends HTMLElement>(active = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    const prev = document.activeElement as HTMLElement | null;
    const q = () => [...ref.current!.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')];
    const first = q().find((el) => el.dataset.autofocus !== undefined) ?? q().find((el) => !el.closest('[data-close]')) ?? q()[0];
    first?.focus();
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const els = q(); if (!els.length) return;
      const a = els[0], z = els[els.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    const el = ref.current; el.addEventListener('keydown', h);
    return () => { el.removeEventListener('keydown', h); prev?.focus?.(); };
  }, [active]);
  return ref;
}

export function Drawer({ title, onClose, children, width = 560, side = 'left', icon }: { title: string; onClose: () => void; children: ReactNode; width?: number; side?: 'left' | 'right'; icon?: ReactNode }) {
  const mobile = useIsMobile();
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  if (mobile) return (
    // No celular o painel ocupa a área do jogo inteira (as abas de baixo continuam à mão) e fecha com "voltar".
    <section aria-label={title} className="absolute inset-0 z-30 panel !outline-none flex flex-col anim-panel" style={{ backgroundColor: '#1b1d16' }}>
      <header className="panel-plate !shadow-none flex items-center gap-1 pl-1 pr-3 h-[52px] shrink-0 border-b border-black">
        <button className="h-11 w-11 flex items-center justify-center text-ink-200 active:text-amber-450" onClick={onClose} aria-label="Voltar"><ChevronLeft size={24} /></button>
        <h2 className="flex items-center gap-2 font-display font-extrabold text-[25px] leading-none truncate text-ink-100">{icon && <span className="text-amber-450 shrink-0">{icon}</span>}<span className="truncate">{title}</span></h2>
      </header>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-8">{children}</div>
    </section>
  );
  return (
    <section aria-label={title} className={`absolute top-0 bottom-0 ${side === 'left' ? 'left-0 border-r' : 'right-0 border-l'} border-black z-30 panel flex flex-col anim-clipboard max-w-[100vw]`} style={{ width }}>
      <header className="panel-plate !shadow-none flex items-center justify-between pl-5 pr-3 py-3">
        <h2 className="flex items-center gap-2.5 panel-title text-ink-100">{icon && <span className="text-amber-450">{icon}</span>}{title}</h2>
        <button className="btn btn-ghost !px-2 !min-h-8" onClick={onClose} aria-label="Fechar painel (Esc)" title="Fechar (Esc)"><X size={18} /></button>
      </header>
      <div className="flex-1 overflow-y-auto p-5">{children}</div>
    </section>
  );
}

export function Modal({ title, onClose, children, width = 480, danger }: { title: string; onClose?: () => void; children: ReactNode; width?: number; danger?: boolean }) {
  const ref = useFocusTrap<HTMLDivElement>();
  const mobile = useIsMobile();
  useEffect(() => { if (!onClose) return; const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  // Portal: a janela vai direto para o <body>. Assim ela não herda pointer-events-none, recorte (overflow) nem
  // empilhamento da camada onde foi aberta (ex.: o infectado e os cachorros, que ficam numa camada da cena que ignora cliques).
  if (mobile) return createPortal((
    // No celular: folha que sobe de baixo, ao alcance do polegar.
    <div className="fixed inset-0 z-50 flex items-end bg-[#070804b3] anim-fade pointer-events-auto" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="panel-plate anim-sheet relative w-full max-h-[88dvh] overflow-y-auto overscroll-contain safe-b">
        {danger && <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: 'repeating-linear-gradient(-45deg, #c9a227 0 10px, #15170f 10px 20px)' }} />}
        <div className="mx-auto mt-2.5 h-1 w-12 bg-ink-600" aria-hidden />
        <div className="flex items-center justify-between gap-2 px-4 pt-2 pb-1">
          <h2 className={`font-display font-extrabold text-[24px] leading-tight ${danger ? 'text-blood-400' : 'text-ink-100'}`}>{title}</h2>
          {onClose && <button data-close className="h-11 w-11 -mr-2 flex items-center justify-center text-ink-300" onClick={onClose} aria-label="Fechar"><X size={20} /></button>}
        </div>
        <div className="px-4 pb-5 pt-1">{children}</div>
      </div>
    </div>
  ), document.body);
  return createPortal((
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07080499] backdrop-blur-[2px] anim-fade pointer-events-auto" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="panel-plate anim-rise relative" style={{ width, maxWidth: '94vw', maxHeight: '90vh', overflow: 'auto' }}>
        {danger && <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: 'repeating-linear-gradient(-45deg, #c9a227 0 10px, #15170f 10px 20px)' }} />}
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <h2 className={`panel-title ${danger ? 'text-blood-400' : 'text-ink-100'}`}>{title}</h2>
          {onClose && <button data-close className="btn btn-ghost !px-2 !min-h-8" onClick={onClose} aria-label="Fechar (Esc)"><X size={18} /></button>}
        </div>
        <div className="px-6 pb-6 pt-2">{children}</div>
      </div>
    </div>
  ), document.body);
}

/** Confirmação para ações irreversíveis. */
export function Confirm({ title, text, confirmLabel = 'Confirmar', onConfirm, onCancel, danger = true }: { title: string; text: ReactNode; confirmLabel?: string; onConfirm: () => void; onCancel: () => void; danger?: boolean }) {
  return (
    <Modal title={title} onClose={onCancel} danger={danger}>
      <div className="text-sm text-ink-200 leading-relaxed">{text}</div>
      <div className="flex justify-end gap-2 mt-5 max-sm:flex-col-reverse max-sm:[&>button]:w-full">
        <button className="btn" onClick={onCancel}>Cancelar</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-moss'}`} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}

/** Imagem com fallback para placeholder quando o arquivo não existir. */
export function Img({ src, fallback, className, style, alt = '' }: { src: string; fallback: string; className?: string; style?: React.CSSProperties; alt?: string }) {
  const [s, setS] = useState(src);
  useEffect(() => setS(src), [src]);
  return <img src={s} alt={alt} className={className} style={style} draggable={false} onError={() => s !== fallback && setS(fallback)} />;
}

export function Tip({ text, children }: { text: ReactNode; children: ReactNode }) {
  return (
    <span className="relative group inline-flex">
      {children}
      <span role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-pre-line w-max max-w-72 bg-[#101109f2] border border-ink-600 shadow-[0_8px_20px_rgba(0,0,0,.7)] px-3 py-2 text-[13px] leading-snug text-ink-200 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">{text}</span>
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) { return <div className="text-[14px] text-ink-400 py-6 text-center">{children}</div>; }
export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return <section className="mb-6"><div className="flex items-end justify-between mb-2.5 border-b border-ink-700 pb-1"><h3 className="font-[family-name:var(--font-plate)] font-bold text-[17px] tracking-[.02em] text-tape">{title}</h3>{right}</div>{children}</section>;
}

export function fmtDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}min ${s % 60 ? `${s % 60}s` : ''}`.trim();
  return `${Math.floor(m / 60)}h ${m % 60}min`;
}
export const pad = (n: number) => String(n).padStart(2, '0');
export const WEATHER: Record<string, string> = { clear: 'Céu limpo', cloudy: 'Nublado', rain: 'Chuva', storm: 'Tempestade', fog: 'Neblina', snow: 'Neve' };
export const PHASE: Record<string, string> = { dawn: 'Amanhecer', day: 'Dia', dusk: 'Entardecer', night: 'Noite' };
export const ROAD: Record<string, string> = { indoor: 'interior', trail: 'trilha', dirt: 'estrada de terra', asphalt: 'asfalto' };

/** Avisos: plaquetas que aparecem embaixo, com ícone e cor por gravidade. */
export function Toasts({ toasts, className = '' }: { toasts: { id: number; text: string; level: string; icon?: string }[]; className?: string }) {
  const tone = (l: string) => (l === 'danger' ? { bar: '#e0554a', text: 'text-blood-400', icon: 'danger' } : l === 'warn' ? { bar: '#f0a73a', text: 'text-amber-200', icon: 'danger' } : l === 'success' ? { bar: '#9ab567', text: 'text-moss-400', icon: 'note' } : { bar: '#d8c79a', text: 'text-ink-100', icon: 'radio' });
  return (
    <div className={`flex flex-col gap-1.5 items-center pointer-events-none ${className}`} role="status" aria-live="polite">
      {toasts.map((t) => { const c = tone(t.level); return (
        <div key={t.id} className="flex items-start gap-2.5 max-w-xl pl-3 pr-4 py-2.5 text-[14.5px] bg-[#14150ff2] border border-black shadow-[0_8px_22px_rgba(0,0,0,.7)] anim-rise" style={{ borderLeft: `4px solid ${c.bar}` }}>
          <GameIcon name={t.icon ?? c.icon} size={18} className={`${c.text} mt-0.5`} />
          <span className="text-ink-100">{t.text}</span>
        </div>
      ); })}
    </div>
  );
}
