import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Plus, Minus, LocateFixed, Maximize2, Search } from 'lucide-react';
import { GameIcon, FactionEmblem } from '../components/GameIcon';
import { useIsMobile } from '../lib/mobile';
import { GAME_ICONS, ICON_PATHS } from '../components/gameIcons';
import { useGame } from '../lib/store';
import { action } from '../lib/socket';
import { api } from '../lib/api';
import { fmtDuration } from '../components/ui';
import type { MapLocation, WorldMap } from '../lib/types';
import { hordeSizeLabel, useHordes, type HordeIntel } from './Hordes';

// ───────────────────────── Dados ─────────────────────────
type Cat = { label: string; color: string; icon?: boolean };
// Cores pensadas para tinta sobre papel (o mapa é uma carta topográfica impressa e rabiscada).
const CATS: Record<string, Cat> = {
  street: { label: 'Rua', color: '#5a5246' }, commercial: { label: 'Comércio', color: '#8a6a14', icon: true }, alley: { label: 'Beco', color: '#5a5246' },
  police: { label: 'Polícia', color: '#2f4f6b', icon: true }, store: { label: 'Loja', color: '#8a6a14', icon: true }, supermarket: { label: 'Supermercado', color: '#8a6a14', icon: true },
  pharmacy: { label: 'Farmácia', color: '#2f6b55', icon: true }, hospital: { label: 'Hospital', color: '#a52e25', icon: true }, clinic: { label: 'Clínica', color: '#a52e25', icon: true },
  school: { label: 'Escola', color: '#5a4a7a', icon: true }, gas_station: { label: 'Posto', color: '#a0581a', icon: true }, restaurant: { label: 'Restaurante', color: '#a0581a', icon: true },
  workshop: { label: 'Oficina', color: '#4a4237', icon: true }, office: { label: 'Escritório', color: '#4a4237', icon: true }, church: { label: 'Igreja', color: '#4a4237', icon: true },
  parking: { label: 'Estacionamento', color: '#5a5246', icon: true }, sewer: { label: 'Esgoto', color: '#4f5a3a' }, apartment: { label: 'Apartamentos', color: '#6b4a2a', icon: true },
  house: { label: 'Casa', color: '#6b4a2a', icon: true }, yard: { label: 'Quintal/praça', color: '#4f6b2c' }, garage: { label: 'Garagem', color: '#5a5246' }, basement: { label: 'Porão', color: '#5a5246' }, shed: { label: 'Galpão', color: '#5a5246' },
  road: { label: 'Estrada', color: '#5a5246' }, bridge: { label: 'Ponte', color: '#5a5246' }, tunnel: { label: 'Túnel', color: '#3a342c' },
  prison: { label: 'Prisão', color: '#7a3a22', icon: true }, prison_inside: { label: 'Prisão (interior)', color: '#7a3a22' },
  farm: { label: 'Fazenda', color: '#7a6a1f', icon: true }, barn: { label: 'Celeiro', color: '#7a6a1f', icon: true }, field: { label: 'Campo', color: '#7a6a1f', icon: true },
  forest: { label: 'Floresta', color: '#33562c', icon: true }, camp: { label: 'Acampamento', color: '#4f6b2c', icon: true }, cabin: { label: 'Cabana', color: '#6b4a2a', icon: true }, lake: { label: 'Água', color: '#2f5f7a', icon: true },
  industrial: { label: 'Indústria', color: '#4f4a42', icon: true }, warehouse: { label: 'Armazém', color: '#4f4a42', icon: true }, military: { label: 'Militar', color: '#4f5a2a', icon: true },
};
const cat = (c: string): Cat => CATS[c] ?? { label: c, color: '#5a5246' };
const PAPER = '#e6dbbd'; const INK = '#2a251d';
const PAPER_BG = 'radial-gradient(ellipse at 40% 35%, rgba(255,250,235,.6), transparent 70%), radial-gradient(ellipse at 85% 90%, rgba(120,85,35,.22), transparent 55%), linear-gradient(180deg, #ece2c6, #dccfaa)';
/** Desenha um ícone do game-icons dentro do SVG do mapa (coordenadas do mundo). */
function Glyph({ name, x, y, size, color }: { name: string; x: number; y: number; size: number; color: string }) {
  const d = ICON_PATHS[GAME_ICONS[name] ?? GAME_ICONS['cat-misc']];
  return <svg x={x} y={y} width={size} height={size} viewBox="0 0 512 512" aria-hidden><path d={d} fill={color} /></svg>;
}
const REGION_COLORS: Record<string, string> = { raven_creek: '#7a5a14', willow: '#6b4a2a', prison: '#7a3a22', farmland: '#6b5f1a', blackpine: '#2f5228', industrial: '#4f4a42', fort_ashby: '#4f5a2a', route9: '#5a5246' };
const ROADS: Record<string, { label: string; color: string; w: number; dash?: string }> = {
  asphalt: { label: 'Asfalto', color: '#2a251d', w: 2.8 }, dirt: { label: 'Estrada de terra', color: '#7a5a2a', w: 2.2 }, trail: { label: 'Trilha', color: '#33562c', w: 1.8, dash: '5 4' }, indoor: { label: 'Passagem interna', color: '#6b6355', w: 1.2, dash: '2 3' },
};
export const dangerInfo = (d: number) => d >= 0.75 ? { label: 'Extremo', color: '#e0453a' } : d >= 0.55 ? { label: 'Alto', color: '#d1382f' } : d >= 0.35 ? { label: 'Médio', color: '#d98c1a' } : { label: 'Baixo', color: '#7a8c4e' };
const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

export function useWorldMap() {
  const map = useGame((s) => s.worldMap);
  useEffect(() => { if (!map) api('/world/map').then((m) => useGame.getState().set({ worldMap: m })).catch(() => undefined); }, [map]);
  return map;
}

/** Caminho mais curto (Dijkstra) pelas estradas não bloqueadas. */
export function shortestPath(map: WorldMap, from: string, to: string) {
  if (from === to) return { ids: [from], distance: 0 };
  const adj = new Map<string, { to: string; d: number }[]>();
  for (const c of map.connections) {
    if (c.blocked) continue;
    (adj.get(c.fromId) ?? adj.set(c.fromId, []).get(c.fromId)!).push({ to: c.toId, d: c.distance });
    (adj.get(c.toId) ?? adj.set(c.toId, []).get(c.toId)!).push({ to: c.fromId, d: c.distance });
  }
  const dist = new Map<string, number>([[from, 0]]); const prev = new Map<string, string>(); const done = new Set<string>();
  while (true) {
    let cur: string | null = null; let best = Infinity;
    for (const [k, v] of dist) if (!done.has(k) && v < best) { best = v; cur = k; }
    if (!cur) return null;
    if (cur === to) break;
    done.add(cur);
    for (const e of adj.get(cur) ?? []) { const nd = best + e.d; if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, cur); } }
  }
  const ids = [to]; while (ids[0] !== from) ids.unshift(prev.get(ids[0])!);
  return { ids, distance: dist.get(to)! };
}

// ───────────────────────── Painel do mapa ─────────────────────────
type View = { x: number; y: number; w: number };

export function MapPanel({ onClose }: { onClose: () => void }) {
  // Assina só o que o mapa usa (antes re-renderizava o SVG inteiro a cada mensagem de chat ou tique do relógio).
  const self = useGame((s) => s.self);
  const scene = useGame((s) => s.scene);
  const route = useGame((s) => s.route);
  const map = useWorldMap();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1000, h: 700 });
  const [view, setViewState] = useState<View | null>(null);
  // Arrastar/pinçar gera dezenas de eventos por quadro: guarda a vista mais recente e desenha uma vez por quadro.
  const viewRef = useRef<View | null>(null); const raf = useRef(0);
  const setView = (nv: View | null) => {
    viewRef.current = nv;
    if (!raf.current) raf.current = requestAnimationFrame(() => { raf.current = 0; setViewState(viewRef.current); });
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const drag = useRef<null | { sx: number; sy: number; vx: number; vy: number; moved: boolean }>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>()); const pinch = useRef<number | null>(null);
  const mobile = useIsMobile(); const [details, setDetails] = useState(false);
  const reducedMotion = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);

  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(box.current); return () => ro.disconnect();
  }, []);

  const byId = useMemo(() => new Map((map?.locations ?? []).map((l) => [l.id, l])), [map]);
  const here = self?.travel ? self.travel.fromId : self?.locationId ?? '';
  const exitsKey = scene?.exits.filter((e) => !e.blocked).map((e) => e.toId).join('|') ?? '';
  const adjacent = useMemo(() => new Set(exitsKey ? exitsKey.split('|') : []), [exitsKey]);
  const bounds = useMemo(() => {
    if (!map) return null;
    const xs = map.locations.map((l) => l.x), ys = map.locations.map((l) => l.y);
    return { minX: Math.min(...xs) - 500, maxX: Math.max(...xs) + 500, minY: Math.min(...ys) - 500, maxY: Math.max(...ys) + 500 };
  }, [map]);
  const fitAll = () => { if (bounds) setView((() => {
    const bw = bounds.maxX - bounds.minX, bh = bounds.maxY - bounds.minY;
    const w = Math.max(bw, bh * (size.w / size.h));
    return { x: (bounds.minX + bounds.maxX) / 2 - w / 2, y: (bounds.minY + bounds.maxY) / 2 - (w * size.h / size.w) / 2, w };
  })()); };
  const centerOn = (id: string, w?: number) => { const l = byId.get(id); if (!l) return; const ww = w ?? Math.min(viewRef.current?.w ?? 2500, 2500); setView({ x: l.x - ww / 2, y: l.y - (ww * size.h / size.w) / 2, w: ww }); };
  useEffect(() => { if (map && !view && size.w > 0) { if (byId.get(here)) centerOn(here, 1700); else fitAll(); } }, [map, size.w]);

  const v = view ?? { x: 0, y: 0, w: 1000 };
  const vh = v.w * size.h / size.w;
  const u = v.w / size.w; // metros por pixel
  const zoomAt = (factor: number, px = size.w / 2, py = size.h / 2) => {
    const cur = viewRef.current ?? v; const cu = cur.w / size.w;
    const p = { x: cur.x + px * cu, y: cur.y + py * cu }; const w = Math.min(Math.max(cur.w * factor, 250), 24000);
    setView({ x: p.x - (px / size.w) * w, y: p.y - (py / size.h) * w * size.h / size.w, w });
  };

  const sel = selected ? byId.get(selected) ?? null : null;
  const routeTargetId = route ? route.targetId : null;
  // rotas (Dijkstra) só são recalculadas quando o destino ou a origem mudam, não a cada quadro de arrasto
  const { path, pathEdges, onPath } = useMemo(() => {
    const path = map && selected && here && byId.get(selected) ? shortestPath(map, here, selected) : null;
    const routePath = map && routeTargetId && byId.get(routeTargetId) && !path ? shortestPath(map, here, routeTargetId) : null;
    const shownPath = path ?? routePath;
    const pathEdges = new Set<string>();
    if (shownPath) for (let i = 0; i < shownPath.ids.length - 1; i++) { pathEdges.add(`${shownPath.ids[i]}|${shownPath.ids[i + 1]}`); pathEdges.add(`${shownPath.ids[i + 1]}|${shownPath.ids[i]}`); }
    return { path, pathEdges, onPath: new Set(shownPath?.ids ?? []) };
  }, [map, byId, here, selected, routeTargetId]);

  // ── Regiões: círculo em volta dos locais de cada região
  const regionShapes = useMemo(() => (map?.regions ?? []).map((r) => {
    const ls = map!.locations.filter((l) => l.regionId === r.id && !l.indoor);
    if (!ls.length || r.id === 'route9') return null; // a rodovia corta o mapa todo: as próprias estradas já mostram
    const cx = ls.reduce((s, l) => s + l.x, 0) / ls.length, cy = ls.reduce((s, l) => s + l.y, 0) / ls.length;
    const rad = Math.max(350, ...ls.map((l) => Math.hypot(l.x - cx, l.y - cy))) + 220;
    return { ...r, cx, cy, rad, color: REGION_COLORS[r.id] ?? '#8a8378' };
  }).filter(Boolean) as { id: string; name: string; cx: number; cy: number; rad: number; color: string }[], [map]);

  // ── Locais visíveis neste zoom
  const showIndoor = u < 1.6;
  const visible = useMemo(() => (map?.locations ?? []).filter((l) => !l.indoor || showIndoor || l.id === here || l.id === selected || onPath.has(l.id) || adjacent.has(l.id)), [map, showIndoor, here, selected, onPath, adjacent]);
  const baseAt = useMemo(() => new Map((map?.bases ?? []).map((b) => [b.locationId, b])), [map]);
  const projAt = useMemo(() => new Map((map?.projects ?? []).map((p) => [p.locationId, p])), [map]);

  // ── Rótulos sem sobreposição (prioridade + colisão em pixels)
  const labels: { id: string; x: number; y: number; text: string; strong: boolean }[] = [];
  {
    const placed: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const prio = (l: MapLocation) => (l.id === here ? 100 : l.id === selected ? 95 : l.id === hover ? 90 : onPath.has(l.id) ? 80 : adjacent.has(l.id) ? 70 : baseAt.has(l.id) || projAt.has(l.id) ? 60 : l.indoor ? 20 : ['road', 'bridge', 'tunnel'].includes(l.category) ? 30 : 45);
    const minPrio = u > 9 ? 69 : u > 5 ? 44 : u > 1.6 ? 29 : 0;
    for (const l of [...visible].sort((a, b) => prio(b) - prio(a))) {
      if (prio(l) < minPrio) continue;
      const sx = (l.x - v.x) / u, sy = (l.y - v.y) / u;
      if (sx < -80 || sy < -30 || sx > size.w + 80 || sy > size.h + 30) continue;
      const strong = prio(l) >= 70; const fs = strong ? 12.5 : 11;
      const tw = l.name.length * fs * 0.56 + 6; const th = fs + 4;
      const r = l.id === here ? 14 : 10;
      let ok = false; let ly = 0;
      for (const cand of [sy - r - th, sy + r]) {
        const bb = { x1: sx - tw / 2, y1: cand, x2: sx + tw / 2, y2: cand + th };
        if (!placed.some((p) => bb.x1 < p.x2 && bb.x2 > p.x1 && bb.y1 < p.y2 && bb.y2 > p.y1)) { placed.push(bb); ok = true; ly = cand; break; }
      }
      if (ok || prio(l) >= 95) labels.push({ id: l.id, x: sx, y: (ok ? ly : sy - r - th) + th - 4, text: l.name, strong });
    }
  }

  // posição de quem está viajando
  const tr = self?.travel;
  const travelPos = tr && byId.get(tr.fromId) && byId.get(tr.toId) ? (() => {
    const a = byId.get(tr.fromId)!, b = byId.get(tr.toId)!; const t = Math.min(1, tr.elapsedMs / Math.max(1, tr.durationMs));
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  })() : null;

  const herePt = travelPos ?? byId.get(here) ?? null;
  const { hordes } = useHordes();
  const matches = query.trim().length >= 2 ? (map?.locations ?? []).filter((l) => l.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8) : [];
  const pick = (id: string) => { setSelected(id); const l = byId.get(id); const cv = viewRef.current; if (l && cv) { const cu = cv.w / size.w; const sx = (l.x - cv.x) / cu, sy = (l.y - cv.y) / cu; if (sx < 40 || sy < 40 || sx > size.w - 40 || sy > size.h - 40) centerOn(id, l.indoor ? Math.min(cv.w, 900) : undefined); } };
  const pickRef = useRef(pick); pickRef.current = pick;
  const sizeRef = useRef(size); sizeRef.current = size;

  // ── Camadas do SVG memorizadas: ao só arrastar (mesmo zoom), o React reaproveita tudo e só troca o viewBox.
  const layers = useMemo(() => {
    if (!map) return null;
    const shown = (l: MapLocation) => !l.indoor || showIndoor || onPath.has(l.id) || adjacent.has(l.id) || l.id === here || l.id === selected;
    return (
      <>
        {regionShapes.map((r) => (
          <g key={r.id} className="cursor-pointer" onClick={() => { const sz = sizeRef.current; if (!drag.current?.moved) setView({ x: r.cx - r.rad * 1.15, y: r.cy - r.rad * 1.15 * sz.h / sz.w, w: r.rad * 2.3 }); }}>
            <circle cx={r.cx} cy={r.cy} r={r.rad} fill={r.color} fillOpacity={0.07} stroke={r.color} strokeOpacity={0.55} strokeWidth={1.4 * u} strokeDasharray={`${9 * u} ${4 * u} ${2 * u} ${4 * u}`} />
            <text x={r.cx} y={r.cy - r.rad + 26 * u} fill={r.color} fillOpacity={0.85} fontSize={19 * u} fontWeight={800} textAnchor="middle" fontFamily="var(--font-display)" letterSpacing={1.5 * u} stroke={PAPER} strokeWidth={4 * u} paintOrder="stroke">{r.name}</text>
          </g>
        ))}
        {map.connections.map((c) => {
          const a = byId.get(c.fromId), b = byId.get(c.toId); if (!a || !b) return null;
          if (!shown(a) || !shown(b)) return null;
          const st = ROADS[c.roadType] ?? ROADS.asphalt; const hot = pathEdges.has(`${a.id}|${b.id}`);
          return (
            <g key={c.id}>
              {hot && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#f0a73a" strokeOpacity={0.7} strokeWidth={11 * u} strokeLinecap="round" />}
              {c.roadType === 'asphalt' && !c.blocked && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={INK} strokeWidth={5 * u} strokeLinecap="round" />}
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={c.blocked ? '#a52e25' : c.roadType === 'asphalt' ? '#d8c79a' : st.color} strokeWidth={(c.roadType === 'asphalt' && !c.blocked ? 2.4 : st.w) * u} strokeDasharray={c.blocked ? `${3 * u} ${3 * u}` : st.dash ? st.dash.split(' ').map((n) => Number(n) * u).join(' ') : undefined} strokeLinecap="round" />
            </g>
          );
        })}
        {visible.map((l) => {
          const c = cat(l.category); const isHere = l.id === here && !travelPos; const isSel = l.id === selected; const adj = adjacent.has(l.id);
          const zoomed = u < 2.4 && !l.indoor && c.icon;
          const r = (isHere ? 9 : zoomed ? 9 : adj ? 6 : l.indoor ? 3.5 : 4.5) * u;
          const Icon = c.icon; const base = baseAt.get(l.id); const proj = projAt.get(l.id);
          return (
            <g key={l.id} className="cursor-pointer" onPointerEnter={() => setHover(l.id)} onPointerLeave={() => setHover((h) => (h === l.id ? null : h))}
              onClick={(e) => { e.stopPropagation(); if (!drag.current?.moved) pickRef.current(l.id); }}>
              <circle cx={l.x} cy={l.y} r={r + (mobile ? 16 : 7) * u} fill="transparent" />
              {l.danger >= 0.55 && <circle cx={l.x} cy={l.y} r={r + 3.5 * u} fill="none" stroke="#a52e25" strokeOpacity={l.danger >= 0.75 ? 0.9 : 0.6} strokeWidth={1.6 * u} strokeDasharray={l.danger >= 0.75 ? undefined : `${3 * u} ${2 * u}`} />}
              {isSel && <rect x={l.x - r - 7 * u} y={l.y - r - 7 * u} width={(r + 7 * u) * 2} height={(r + 7 * u) * 2} fill="none" stroke={INK} strokeWidth={1.8 * u} />}
              {adj && !isHere && <circle cx={l.x} cy={l.y} r={r + 5 * u} fill="none" stroke="#33562c" strokeWidth={1.8 * u} strokeDasharray={`${2.5 * u} ${2 * u}`} />}
              <circle cx={l.x} cy={l.y} r={r} fill={isHere ? '#f0a73a' : zoomed ? PAPER : c.color} stroke={isHere ? INK : zoomed ? c.color : PAPER} strokeWidth={(zoomed ? 1.8 : isHere ? 2 : 1.2) * u} />
              {zoomed && !isHere && Icon && <Glyph name={`loc-${l.category}`} x={l.x - 6.5 * u} y={l.y - 6.5 * u} size={13 * u} color={c.color} />}
              {base && <g transform={`translate(${l.x + 8 * u} ${l.y - 18 * u})`}><rect width={15 * u} height={15 * u} fill={base.faction?.color ?? '#5f7340'} stroke={INK} strokeWidth={1 * u} /><Glyph name={base.faction ? `emblem:${base.faction.emblem}` : 'base'} x={2 * u} y={2 * u} size={11 * u} color="#101109" /></g>}
              {proj && <g transform={`translate(${l.x - 23 * u} ${l.y - 18 * u})`}><rect width={15 * u} height={15 * u} fill="#f0a73a" stroke={INK} strokeWidth={1 * u} /><Glyph name="projects" x={2 * u} y={2 * u} size={11 * u} color="#101109" /></g>}
              <title>{l.name}, {c.label.toLowerCase()}, perigo {dangerInfo(l.danger).label.toLowerCase()}</title>
            </g>
          );
        })}
      </>
    );
  }, [map, byId, regionShapes, visible, pathEdges, onPath, adjacent, here, selected, showIndoor, baseAt, projAt, mobile, !!travelPos, u]);

  if (!self) return null;

  return (
    <section aria-label="Mapa do condado" className={mobile ? 'absolute inset-0 z-30 panel panel-plate flex flex-col anim-panel' : 'fixed inset-x-3 top-[60px] bottom-3 z-30 panel panel-plate flex flex-col anim-clipboard shadow-[0_20px_60px_rgba(0,0,0,.7)]'}>
      <div className={`flex items-center border-b border-black/60 ${mobile ? 'flex-wrap gap-x-2 gap-y-1.5 px-3 py-2' : 'gap-3 px-4 py-2.5'}`}>
        <h2 className={`font-display font-extrabold leading-none flex items-center gap-2 ${mobile ? 'text-[24px]' : 'text-[30px]'}`}><GameIcon name="map" size={mobile ? 22 : 26} className="text-amber-450" />Mapa do condado</h2>
        <div className={mobile ? 'relative order-3 w-full' : 'relative ml-4 w-72'}>
          <Search size={14} aria-hidden className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input className="input !py-1.5 !pl-8 text-[14px]" aria-label="Buscar lugar no mapa" placeholder="Buscar lugar (hospital, fazenda…)" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) { pick(matches[0].id); centerOn(matches[0].id, matches[0].indoor ? 900 : 2200); setQuery(''); } }} />
          {matches.length > 0 && (
            <ul className="absolute top-full left-0 right-0 mt-1 panel z-10 max-h-72 overflow-y-auto" role="listbox" aria-label="Lugares encontrados">
              {matches.map((l) => <li key={l.id}><button className="flex items-center gap-2 w-full text-left px-3 py-2 text-[14px] hover:bg-ink-800 focus-visible:bg-ink-800" onClick={() => { pick(l.id); centerOn(l.id, l.indoor ? 900 : 2200); setQuery(''); }}><GameIcon name={`loc-${l.category}`} fallback="pin" size={15} className="text-ink-300 shrink-0" />{l.name} <span className="text-ink-400 text-[12.5px] ml-auto">{map!.regions.find((r) => r.id === l.regionId)?.name}</span></button></li>)}
            </ul>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1" role="toolbar" aria-label="Controles do mapa">
          {!mobile && <><button className="btn btn-ghost !px-2" aria-label="Aproximar" title="Aproximar" onClick={() => zoomAt(0.7)}><Plus size={16} /></button>
          <button className="btn btn-ghost !px-2" aria-label="Afastar" title="Afastar" onClick={() => zoomAt(1.4)}><Minus size={16} /></button></>}
          <button className="btn btn-ghost !px-2" aria-label="Centralizar em mim" title="Centralizar em mim" onClick={() => centerOn(here, 2600)}><LocateFixed size={16} /></button>
          <button className="btn btn-ghost !px-2" aria-label="Ver o condado inteiro" title="Ver o condado inteiro" onClick={fitAll}><Maximize2 size={16} /></button>
          <button className={`btn btn-ghost !px-2 ${mobile ? '' : 'ml-2'}`} aria-label="Fechar mapa" title="Fechar (M ou Esc)" onClick={onClose}><X size={17} /></button>
        </div>
      </div>
      <div className={`flex-1 flex min-h-0 ${mobile ? 'flex-col' : ''}`}>
        <div ref={box} role="application" aria-label="Carta do condado. Arraste para mover e use a roda do mouse para aproximar." className={`relative flex-1 overflow-hidden select-none cursor-grab active:cursor-grabbing border border-black shadow-[inset_0_0_40px_rgba(70,50,20,.45)] ${mobile ? 'min-h-[200px]' : 'm-2 mr-0'}`} style={{ background: PAPER_BG, touchAction: 'none' }}
          onWheel={(e) => { const r = box.current!.getBoundingClientRect(); zoomAt(e.deltaY > 0 ? 1.18 : 1 / 1.18, e.clientX - r.left, e.clientY - r.top); }}
          onPointerDown={(e) => {
            touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); (e.target as Element).setPointerCapture?.(e.pointerId);
            if (touches.current.size === 2) { const [a, b] = [...touches.current.values()]; pinch.current = Math.hypot(a.x - b.x, a.y - b.y); if (drag.current) drag.current.moved = true; return; }
            drag.current = { sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, moved: false };
          }}
          onPointerMove={(e) => {
            if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (touches.current.size === 2 && pinch.current) { // pinça com dois dedos: aproxima ou afasta em volta do meio dos dedos
              const [a, b] = [...touches.current.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const r = box.current!.getBoundingClientRect();
              if (d > 10) zoomAt(pinch.current / d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); pinch.current = d; return;
            }
            const dd = drag.current; if (!dd) return; const dx = e.clientX - dd.sx, dy = e.clientY - dd.sy; if (Math.abs(dx) + Math.abs(dy) > (mobile ? 8 : 4)) dd.moved = true; if (dd.moved) setView({ x: dd.vx - dx * u, y: dd.vy - dy * u, w: v.w });
          }}
          onPointerUp={(e) => {
            touches.current.delete(e.pointerId);
            if (touches.current.size === 1) { const [rest] = [...touches.current.values()]; pinch.current = null; drag.current = { sx: rest.x, sy: rest.y, vx: v.x, vy: v.y, moved: true }; return; }
            if (!touches.current.size) { pinch.current = null; setTimeout(() => { drag.current = null; }, 0); }
          }}
          onPointerCancel={(e) => { touches.current.delete(e.pointerId); if (!touches.current.size) { pinch.current = null; drag.current = null; } }}>
          {!mobile && <div aria-hidden className="absolute inset-0 pointer-events-none opacity-30 mix-blend-multiply" style={{ backgroundImage: 'var(--grain)' }} />}
          {!map || !view ? <div className="absolute inset-0 flex items-center justify-center font-[family-name:var(--font-hand)] text-[18px] text-[#4a4237]" role="status">Desenhando o mapa…</div> : (
            <svg width={size.w} height={size.h} viewBox={`${v.x} ${v.y} ${v.w} ${vh}`} className="absolute inset-0">
              <defs>
                <pattern id="mapgrid" width={1000} height={1000} patternUnits="userSpaceOnUse"><path d="M 1000 0 L 0 0 0 1000" fill="none" stroke="#3f6e8a" strokeOpacity={0.28} strokeWidth={u} /></pattern>
                <pattern id="topo" width={2400} height={1800} patternUnits="userSpaceOnUse">
                  {[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M -100 ${220 + i * 260} C 400 ${100 + i * 260}, 800 ${420 + i * 260}, 1200 ${260 + i * 260} S 2000 ${120 + i * 260}, 2500 ${300 + i * 260}`} fill="none" stroke="#8a6a3a" strokeOpacity={i % 3 === 0 ? 0.32 : 0.16} strokeWidth={(i % 3 === 0 ? 1.4 : 0.9) * u} />)}
                  <ellipse cx={1700} cy={600} rx={260} ry={170} fill="none" stroke="#8a6a3a" strokeOpacity={0.2} strokeWidth={0.9 * u} />
                  <ellipse cx={1700} cy={600} rx={150} ry={90} fill="none" stroke="#8a6a3a" strokeOpacity={0.25} strokeWidth={0.9 * u} />
                  <ellipse cx={500} cy={1350} rx={300} ry={190} fill="none" stroke="#8a6a3a" strokeOpacity={0.18} strokeWidth={0.9 * u} />
                </pattern>
              </defs>
              <rect x={v.x} y={v.y} width={v.w} height={vh} fill="url(#topo)" />
              <rect x={v.x} y={v.y} width={v.w} height={vh} fill="url(#mapgrid)" />
              {layers}
              {hordes.map((h) => <HordeMark key={h.id} h={h} byId={byId} u={u} />)}
              {travelPos && (
                <g><circle cx={travelPos.x} cy={travelPos.y} r={10 * u} fill="#f0a73a" stroke={INK} strokeWidth={2 * u} />
                  <Glyph name="travel" x={travelPos.x - 6 * u} y={travelPos.y - 6 * u} size={12 * u} color="#101109" /></g>
              )}
            </svg>
          )}
          {/* "você está aqui" pulsando: anel em HTML animado só com transform/opacity (não repinta o mapa inteiro) */}
          {map && view && herePt && !reducedMotion && <span aria-hidden className="map-pulse absolute pointer-events-none" style={{ left: (herePt.x - v.x) / u, top: (herePt.y - v.y) / u }} />}
          {/* rótulos em pixels (nítidos e sem sobreposição) */}
          {map && view && labels.map((lb) => (
            <div key={lb.id} aria-hidden className={`absolute pointer-events-none whitespace-nowrap -translate-x-1/2 ${lb.id === here ? 'tape !text-[13px] !py-0' : lb.strong ? 'font-[family-name:var(--font-plate)] font-bold text-[#1d1912]' : 'text-[#4a4237]'}`}
              style={{ left: lb.x, top: lb.y - 12, fontSize: lb.id === here ? undefined : lb.strong ? 13.5 : 11.5, textShadow: lb.id === here ? undefined : `0 0 3px ${PAPER}, 0 0 3px ${PAPER}, 0 0 2px ${PAPER}` }}>{lb.id === here ? `Você: ${lb.text}` : lb.text}</div>
          ))}
          <div className="absolute bottom-2 left-2 font-[family-name:var(--font-hand)] text-[14px] text-[#4a4237] bg-[#e6dbbd]/85 px-2 py-0.5 pointer-events-none">{mobile ? 'Arraste com um dedo, aproxime com dois e toque num lugar.' : 'Arraste para mover, use a roda do mouse para aproximar e clique num lugar para ver a rota.'}{showIndoor || mobile ? '' : ' Aproxime para ver os interiores.'}</div>
          <svg aria-hidden className="absolute top-3 right-3 pointer-events-none" width="54" height="54" viewBox="0 0 54 54"><circle cx="27" cy="27" r="22" fill="none" stroke="#4a4237" strokeWidth="1" /><path d="M27 6 L32 27 L27 48 L22 27 Z" fill="#4a4237" /><path d="M27 6 L32 27 L22 27 Z" fill="#a52e25" /><text x="27" y="5" textAnchor="middle" fontSize="9" fontWeight="800" fill="#1d1912" fontFamily="var(--font-plate)">N</text></svg>
        </div>
        {mobile ? (
          // No celular os detalhes ficam numa gaveta embaixo do mapa: aberta quando há um lugar escolhido.
          <aside aria-label="Detalhes do mapa" className={`shrink-0 border-t border-black overflow-y-auto overscroll-contain text-[14px] ${sel || details ? 'max-h-[52%]' : ''}`}>
            {sel ? (
              <div className="p-3">
                <button className="float-right h-10 w-10 -mt-1 -mr-1 flex items-center justify-center text-ink-300" aria-label="Fechar detalhes do lugar" onClick={() => setSelected(null)}><X size={20} /></button>
                <PlaceInfo map={map!} place={sel} here={here} adjacent={adjacent.has(sel.id)} path={path} onPick={pick} />
              </div>
            ) : (
              <>
                <button className="w-full flex items-center justify-between px-3 min-h-[48px] text-left" aria-expanded={details} onClick={() => setDetails(!details)}>
                  <span className="min-w-0"><span className="text-[12px] text-ink-400 block leading-none">Você está em</span><span className="font-[family-name:var(--font-plate)] font-bold text-[17px] truncate block">{self.travel ? `Estrada para ${self.travel.toName}` : byId.get(here)?.name}</span></span>
                  <span className="text-[13px] text-tape shrink-0">{details ? 'Esconder' : 'Destinos e legenda'}</span>
                </button>
                {details && <div className="px-3 pb-4"><Overview map={map} here={here} onPick={pick} /></div>}
              </>
            )}
          </aside>
        ) : (
          <aside aria-label="Detalhes do mapa" className="w-[340px] shrink-0 overflow-y-auto p-4 text-[14px]">
            {sel ? <PlaceInfo map={map!} place={sel} here={here} adjacent={adjacent.has(sel.id)} path={path} onPick={pick} /> : <Overview map={map} here={here} onPick={pick} />}
          </aside>
        )}
      </div>
    </section>
  );
}

function PlaceInfo({ map, place, here, adjacent, path, onPick }: { map: WorldMap; place: MapLocation; here: string; adjacent: boolean; path: { ids: string[]; distance: number } | null; onPick: (id: string) => void }) {
  const self = useGame((s) => s.self)!;
  const route = useGame((s) => s.route);
  const [eta, setEta] = useState<number | null>(null);
  const c = cat(place.category); const d = dangerInfo(place.danger);
  const region = map.regions.find((r) => r.id === place.regionId);
  const base = map.bases.find((b) => b.locationId === place.id); const proj = map.projects.find((p) => p.locationId === place.id);
  const isHere = place.id === here && !self.travel;
  const idle = self.state === 'idle';
  useEffect(() => { setEta(null); if (adjacent) action('travel_preview', { toId: place.id }, { silent: true }).then((r) => r.ok && setEta(r.durationMs)); }, [place.id, adjacent]);
  const nextHop = path && path.ids.length > 1 ? map.locations.find((l) => l.id === path.ids[1]) : null;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[13px] text-ink-300"><GameIcon name={`loc-${place.category}`} fallback="pin" size={16} />{c.label}{place.indoor ? ', interior' : ''}</div>
      <h3 className="font-display font-extrabold text-[28px] leading-none mt-1 anim-stencil" key={place.id}>{place.name}</h3>
      <div className="text-[13px] text-ink-400 mt-1">{region?.name}</div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        <span className="chip" style={{ color: d.color }}><GameIcon name="danger" size={13} />Perigo {d.label.toLowerCase()}</span>
        {place.buildable && <span className="chip text-moss-400"><GameIcon name="base" size={13} />Pode virar base</span>}
        {base && <span className="chip" style={{ color: base.faction?.color }}>{base.faction ? <FactionEmblem emblem={base.faction.emblem} size={14} /> : <GameIcon name="base" size={13} />}Base: {base.name}</span>}
        {proj && <span className="chip text-amber-450"><GameIcon name="projects" size={13} />Obra: {proj.name}</span>}
      </div>
      {place.description && <p className="paper-note mt-4 text-[15px] leading-snug">{place.description}</p>}
      <div className="border-t border-ink-700 mt-4 pt-3">
        {isHere ? <div className="text-amber-450 flex items-center gap-1.5"><GameIcon name="pin" size={16} />Você está aqui.</div>
          : adjacent ? (
            <>
              <div className="text-moss-400 text-[14px]">Ligado direto a onde você está{eta ? `, cerca de ${fmtDuration(eta)} a pé` : ''}.</div>
              <div className="flex gap-2 mt-2">
                <button className="btn btn-moss flex-1" disabled={!idle} onClick={() => { action('travel', { toId: place.id }); useGame.getState().set({ panel: null, route: null }); }}><GameIcon name="travel" size={16} />Ir para cá</button>
                <button className="btn" disabled={!idle || self.needs.stamina < 25} title="Metade do tempo, −20 de fôlego e o dobro de chance de encontros" onClick={() => { action('travel', { toId: place.id, run: true }); useGame.getState().set({ panel: null, route: null }); }}>Correndo</button>
              </div>
            </>
          ) : path ? (
            <>
              <div className="text-[14px] text-ink-100 flex items-center gap-1.5"><GameIcon name="route" size={16} className="text-amber-450" />Rota de {path.ids.length - 1} trechos, {fmtDist(path.distance)}</div>
              <ol className="mt-2 space-y-0.5 text-[13.5px]" aria-label="Trechos da rota">
                {path.ids.map((id, i) => { const l = map.locations.find((x) => x.id === id)!; return (
                  <li key={id} className={`flex gap-2 ${i === 0 ? 'text-ink-500' : i === path.ids.length - 1 ? 'text-ink-100 font-semibold' : 'text-ink-300'}`}>
                    <span className="w-5 text-right text-ink-400 font-[family-name:var(--font-plate)] font-bold">{i === 0 ? <GameIcon name="pin" size={13} label="Ponto de partida" /> : i}</span><button className="text-left min-h-[26px] hover:text-amber-450" onClick={() => onPick(id)}>{l.name}</button>
                  </li>
                ); })}
              </ol>
              <p className="text-[12.5px] text-ink-400 mt-2">Viagens são feitas trecho a trecho. Com a rota marcada, o próximo passo aparece na tela do jogo.</p>
              <button className="btn btn-moss w-full mt-2" disabled={!idle || !nextHop} onClick={() => {
                useGame.getState().set({ route: { targetId: place.id, targetName: place.name }, panel: null });
                if (nextHop) action('travel', { toId: nextHop.id });
              }}><GameIcon name="route" size={16} />Seguir rota, primeiro até {nextHop?.name}</button>
              {route?.targetId !== place.id && <button className="btn w-full mt-1.5" onClick={() => useGame.getState().set({ route: { targetId: place.id, targetName: place.name } })}>Só marcar a rota</button>}
            </>
          ) : <div className="text-blood-400 text-[14px] flex gap-1.5"><GameIcon name="danger" size={16} className="shrink-0" />Não há caminho livre até aqui (estradas bloqueadas).</div>}
        {!idle && !isHere && <div className="text-[12.5px] text-ink-400 mt-2">Você precisa estar parado num local para partir.</div>}
      </div>
    </div>
  );
}

function HordeList({ onPick }: { onPick: (id: string) => void }) {
  const { hordes, gear } = useHordes();
  return (
    <div>
      <div className="label mb-1">Hordas</div>
      {hordes.length ? (
        <div className="space-y-0.5">{hordes.map((h) => (
          <button key={h.id} className="w-full text-left flex items-start gap-2 px-2 py-1 min-h-[32px] hover:bg-ink-800" onClick={() => onPick(h.locationId)}>
            <GameIcon name="horde" size={15} className="text-blood-400 shrink-0 mt-0.5" />
            <span className="text-[13.5px]">{hordeSizeLabel(h)} em <b>{h.locationName}</b>
              {h.headingHere ? <span className="text-blood-400"> — vindo para cá{h.etaMinutes != null ? `, ~${h.etaMinutes} min` : ''}</span> : h.targetName ? <span className="text-ink-300"> — rumo a {h.targetName}</span> : null}
            </span>
          </button>
        ))}</div>
      ) : <p className="text-[13px] text-ink-400">{gear.radio ? 'O rádio não fala de nenhuma horda agora.' : gear.binoculars ? 'Nenhuma horda à vista.' : 'Nenhum gemido por perto.'}</p>}
      {!gear.radio && <p className="text-[12.5px] text-ink-400 mt-1">{gear.binoculars ? 'O binóculo mostra hordas a até 2 trechos. Com um rádio, dá para saber de todas.' : 'Sem rádio ou binóculo, você só percebe hordas a 1 trecho, e não sabe para onde vão.'}</p>}
    </div>
  );
}

/** Horda no mapa: círculo vermelho com o tamanho e o caminho tracejado dos próximos trechos. */
function HordeMark({ h, byId, u }: { h: HordeIntel; byId: Map<string, MapLocation>; u: number }) {
  const at = byId.get(h.locationId); if (!at) return null;
  const pts = [at, ...h.path.map((id) => byId.get(id)).filter(Boolean) as MapLocation[]];
  const r = 11 * u;
  return (
    <g pointerEvents="none">
      {pts.length > 1 && <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#a52e25" strokeOpacity={0.85} strokeWidth={2.6 * u} strokeDasharray={`${7 * u} ${4 * u}`} strokeLinecap="round" />}
      {pts.length > 1 && (() => { const a = pts[pts.length - 2], b = pts[pts.length - 1]; const ang = Math.atan2(b.y - a.y, b.x - a.x); const s = 9 * u;
        return <path d={`M ${b.x} ${b.y} L ${b.x - s * Math.cos(ang - 0.5)} ${b.y - s * Math.sin(ang - 0.5)} M ${b.x} ${b.y} L ${b.x - s * Math.cos(ang + 0.5)} ${b.y - s * Math.sin(ang + 0.5)}`} stroke="#a52e25" strokeWidth={2.6 * u} strokeLinecap="round" />; })()}
      <circle cx={at.x} cy={at.y} r={r + 6 * u} fill="#a52e25" fillOpacity={0.18} />
      <circle cx={at.x} cy={at.y} r={r} fill="#a52e25" stroke="#1b1610" strokeWidth={1.6 * u} />
      <text x={at.x} y={at.y + 4 * u} fontSize={11 * u} fontWeight={800} fill="#f6e9e2" textAnchor="middle">{h.size ?? '?'}</text>
      <title>Horda: {hordeSizeLabel(h)}</title>
    </g>
  );
}

function Overview({ map, here, onPick }: { map: WorldMap | null; here: string; onPick: (id: string) => void }) {
  const self = useGame((s) => s.self); const scene = useGame((s) => s.scene);
  const route = useGame((s) => s.route);
  if (!map || !self) return null;
  const hereLoc = map.locations.find((l) => l.id === here);
  return (
    <div className="space-y-4">
      <div>
        <div className="label">Você está em</div>
        <div className="font-display font-extrabold text-[28px] leading-none mt-1">{self.travel ? `Estrada para ${self.travel.toName}` : hereLoc?.name}</div>
        <div className="text-[13px] text-ink-400 mt-1">{map.regions.find((r) => r.id === hereLoc?.regionId)?.name}</div>
      </div>
      <HordeList onPick={onPick} />
      {route && (
        <div className="border-l-4 border-amber-450 bg-[#101109] p-2.5">
          <div className="label text-amber-450 flex items-center gap-1"><GameIcon name="route" size={14} />Rota marcada</div>
          <div className="flex justify-between items-center"><span className="font-[family-name:var(--font-plate)] font-bold text-[16px]">{route.targetName}</span><button className="btn btn-ghost !min-h-[30px] !py-0.5 !text-[13px]" onClick={() => useGame.getState().set({ route: null })}>Cancelar rota</button></div>
        </div>
      )}
      {!self.travel && scene && (
        <div>
          <div className="label mb-1">Daqui dá para ir a</div>
          <div className="space-y-0.5">{scene.exits.map((e) => (
            <button key={e.toId} className={`w-full text-left flex items-center gap-2 px-2 min-h-[32px] hover:bg-ink-800 ${e.blocked ? 'line-through text-ink-500' : ''}`} onClick={() => onPick(e.toId)}>
              <GameIcon name={e.blocked ? 'lock' : 'route'} size={14} className="text-ink-400 shrink-0" /><span>{e.name}{e.blocked && <span className="sr-only"> (bloqueado)</span>}</span><span className="text-[12.5px] text-ink-400 ml-auto">{fmtDist(e.distance)}</span>
            </button>
          ))}</div>
        </div>
      )}
      <div>
        <div className="label mb-1.5">Legenda</div>
        <ul className="space-y-1.5 text-[13px] text-[#2a251d] p-3 border border-black" style={{ background: PAPER_BG }}>
          <li className="flex items-center gap-2"><svg width="22" height="16" aria-hidden><circle cx="11" cy="8" r="6" fill="#f0a73a" stroke={INK} strokeWidth="2" /></svg>Você</li>
          <li className="flex items-center gap-2"><svg width="22" height="16" aria-hidden><circle cx="11" cy="8" r="6" fill="none" stroke="#33562c" strokeWidth="1.8" strokeDasharray="2.5 2" /></svg>Ligado direto a você</li>
          <li className="flex items-center gap-2"><svg width="22" height="16" aria-hidden><circle cx="11" cy="8" r="6" fill="none" stroke="#a52e25" strokeWidth="1.6" strokeDasharray="3 2" /></svg>Perigo alto (contínuo: extremo)</li>
          <li className="flex items-center gap-2"><svg width="22" height="16" aria-hidden><rect x="4" y="1" width="14" height="14" fill="#5f7340" stroke={INK} /></svg>Base de sobreviventes</li>
          <li className="flex items-center gap-2"><svg width="22" height="16" aria-hidden><rect x="4" y="1" width="14" height="14" fill="#f0a73a" stroke={INK} /></svg>Obra da comunidade</li>
          {Object.entries(ROADS).map(([k, r]) => <li key={k} className="flex items-center gap-2"><svg width="22" height="8" aria-hidden>{k === 'asphalt' && <line x1="1" y1="4" x2="21" y2="4" stroke={INK} strokeWidth={5} />}<line x1="1" y1="4" x2="21" y2="4" stroke={k === 'asphalt' ? '#d8c79a' : r.color} strokeWidth={k === 'asphalt' ? 2.4 : r.w} strokeDasharray={r.dash} /></svg>{r.label}</li>)}
          <li className="flex items-center gap-2"><svg width="22" height="8" aria-hidden><line x1="1" y1="4" x2="21" y2="4" stroke="#a52e25" strokeWidth={2} strokeDasharray="3 3" /></svg>Bloqueada</li>
          <li className="flex items-center gap-2"><svg width="22" height="10" aria-hidden><line x1="1" y1="5" x2="21" y2="5" stroke="#f0a73a" strokeOpacity={0.8} strokeWidth={9} /></svg>Rota marcada</li>
          <li className="flex items-center gap-2"><svg width="22" height="16" aria-hidden><circle cx="8" cy="8" r="6" fill="#a52e25" stroke={INK} strokeWidth="1.5" /><line x1="14" y1="8" x2="22" y2="8" stroke="#a52e25" strokeWidth="2" strokeDasharray="3 2" /></svg>Horda e para onde vai (rádio ou binóculo)</li>
        </ul>
      </div>
      <div>
        <div className="label mb-1">Regiões</div>
        <div className="flex flex-wrap gap-1">{map.regions.map((r) => <span key={r.id} className="chip text-ink-200" title={r.description}>{r.name}</span>)}</div>
        <p className="text-[12.5px] text-ink-400 mt-1.5">Clique no nome de uma região no mapa para aproximar.</p>
      </div>
    </div>
  );
}

// ───────────────────────── Rota na tela do jogo ─────────────────────────
export function RouteBanner() {
  const self = useGame((s) => s.self); const scene = useGame((s) => s.scene);
  const route = useGame((s) => s.route);
  const map = useWorldMap();
  useEffect(() => {
    if (route && self && !self.travel && self.locationId === route.targetId) {
      useGame.getState().set({ route: null });
      useGame.getState().toast(`Você chegou: ${route.targetName}.`, 'success');
    }
  }, [route, self?.locationId, self?.travel]);
  if (!route || !map || !self || self.travel || !scene) return null;
  const path = shortestPath(map, self.locationId, route.targetId);
  const next = path && path.ids.length > 1 ? map.locations.find((l) => l.id === path.ids[1]) : null;
  return (
    <section aria-label="Rota marcada" className="relative bg-[#16180f]/92 border border-black shadow-[0_6px_18px_rgba(0,0,0,.5)] pl-4 pr-2 py-2 max-w-md">
      <span aria-hidden className="absolute left-0 inset-y-0 w-1.5 bg-amber-450" />
      <div className="text-[13px] text-amber-450 flex items-center gap-1.5"><GameIcon name="route" size={15} />Rota até <b>{route.targetName}</b></div>
      {next ? (
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[14.5px]">Próximo: <b className="font-[family-name:var(--font-plate)] text-[16px]">{next.name}</b> <span className="text-ink-400 text-[12.5px]">(faltam {path!.ids.length - 1} trecho(s), {fmtDist(path!.distance)})</span></span>
          <button className="btn btn-moss !py-1 ml-auto" disabled={self.state !== 'idle'} onClick={() => action('travel', { toId: next.id })}><GameIcon name="travel" size={15} />Seguir</button>
          <button className="btn btn-ghost !px-2" aria-label="Cancelar rota" title="Cancelar rota" onClick={() => useGame.getState().set({ route: null })}><X size={15} /></button>
        </div>
      ) : <div className="text-[13px] text-blood-400 mt-1 flex items-center gap-2">Sem caminho livre daqui. <button className="btn btn-ghost !min-h-[30px] !py-0.5" onClick={() => useGame.getState().set({ route: null })}>Cancelar rota</button></div>}
    </section>
  );
}
