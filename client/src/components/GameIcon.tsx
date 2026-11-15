import type { CSSProperties } from 'react';
import { GAME_ICONS, ICON_PATHS } from './gameIcons';

/**
 * Ícone do mundo do jogo (game-icons.net, CC BY 3.0). Use sempre por nome do jogo — necessidades, ações,
 * itens (pelo id do item), categorias (`cat-…`), locais (`loc-…`), estações, clima e emblemas (`emblem:…`).
 * Decorativo por padrão; passe `label` quando o ícone carregar significado sozinho.
 */
export function GameIcon({ name, size = 18, className, style, label, fallback = 'cat-misc' }: { name: string; size?: number; className?: string; style?: CSSProperties; label?: string; fallback?: string }) {
  const id = GAME_ICONS[name] ?? GAME_ICONS[fallback];
  const d = id ? ICON_PATHS[id] : undefined;
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={`shrink-0 ${className ?? ''}`} style={style}
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
      {label && <title>{label}</title>}
      {d && <path fill="currentColor" d={d} />}
    </svg>
  );
}

export const hasGameIcon = (name: string) => !!GAME_ICONS[name];

/** Ícone de um item: pelo id, senão pela categoria. */
export const itemIcon = (defId: string, category?: string) => (GAME_ICONS[defId] ? defId : defId === 'radio' ? 'radio_item' : `cat-${category ?? 'misc'}`);

/** Emblemas de facção (estêncil). Emblemas antigos (texto livre) caem no estandarte. */
export const EMBLEMS = ['wolf', 'raven', 'axes', 'anchor', 'skull', 'radiation', 'biohazard', 'fist', 'eagle', 'wire', 'crown', 'flame', 'pine', 'wheat', 'cross', 'banner'] as const;
export function FactionEmblem({ emblem, color, size = 18, className }: { emblem?: string | null; color?: string; size?: number; className?: string }) {
  const key = emblem && GAME_ICONS[`emblem:${emblem}`] ? `emblem:${emblem}` : 'emblem:banner';
  return <GameIcon name={key} size={size} className={className} style={{ color: color ?? 'currentColor' }} />;
}
