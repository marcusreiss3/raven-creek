import { useEffect, useMemo, useRef, useState } from 'react';
import { ARENA_LAYOUTS } from './arenaLayouts';
import { HELI_ROWS, HeliArenaArt } from './Lore';
import { useIsMobile, buzz } from '../lib/mobile';
import { GameIcon } from '../components/GameIcon';
import { useGame } from '../lib/store';
import { action } from '../lib/socket';
import { arenaUrl, portraitUrl } from '../lib/api';
import type { CombatUnit, CombatView } from '../lib/types';
import { Img } from '../components/ui';
import { audio } from '../lib/audio';

const BLOCK = new Set(['#', '+', 'o', 'T', 'c', 'w', 'S', 'A', 'B']);
const TILE_COLOR: Record<string, string> = { '#': '#2b2e22', '+': '#5b3a1e', '/': '#3b2a17', c: '#46493a', o: '#34372b', T: '#1e2f18', '~': '#2b301d', w: '#1a2a38', E: '#1f3a1a', '.': '#14150f', S: '#3a2c1c', A: '#26303a', B: '#3a1d18' };
const PROP_TIP: Record<string, string> = { S: 'Estante/armário — fique ao lado e clique para derrubar (2 PA): prensa e derruba infectados, deixa entulho.', A: 'Carro — fique ao lado e clique para disparar o alarme (1 PA): atrai os infectados por 2 rodadas. Também serve de cobertura.', B: 'Galão de combustível — com isqueiro, fique ao lado e clique para acender (2 PA). Explode na vez dos infectados: afaste-se!' };
const k = (x: number, y: number) => `${x},${y}`;
const TILE_TIP: Record<string, string> = {
  ...PROP_TIP, '#': 'Parede', c: 'Cobertura baixa: não dá para atravessar, mas dá para atirar por cima; quem está atrás se defende melhor.',
  o: 'Obstáculo alto: bloqueia a passagem e a visão.', T: 'Árvore: bloqueia a passagem e a visão.', w: 'Água: não dá para atravessar.',
  '~': 'Terreno difícil: andar aqui custa 2 PA.', '+': 'Porta FECHADA: fique ao lado e clique nela para abrir (1 PA).', '/': 'Porta ABERTA: dá para passar por ela. Para fechar, fique ao lado e use o botão "Fechar porta".',
};
const SPRITE = (n: string) => `/assets/arenas/sprites/${n}.png`;
const isVerticalDoor = (layout: string[], x: number, y: number) => !(layout[y]?.[x - 1] === '#' || layout[y]?.[x + 1] === '#');

/** Peças que mudam durante o combate, por cima da arte fixa da arena (portas, escombros, alarme, pavio aceso). */
function TileArt({ t, base, vertical, T, alarm, lit }: { t: string; base: string; vertical: boolean; T: number; alarm: boolean; lit: boolean }) {
  const img = (n: string, rot = false) => <img src={SPRITE(n)} alt="" draggable={false} className="absolute inset-0 w-full h-full pointer-events-none" style={rot ? { transform: 'rotate(90deg)' } : undefined} />;
  return (
    <>
      {t === '+' && img('door_closed', vertical)}
      {t === '/' && img('door_open', vertical)}
      {t === '~' && base !== '~' && img(base === 'B' ? 'scorch' : base === 'S' ? 'rubble' : 'debris')}
      {t === 'A' && alarm && <span className="absolute inset-[6%] rounded-md border-2 border-blood-400 pulse-red pointer-events-none" />}
      {t === 'B' && lit && <><span className="absolute inset-[18%] rounded-full border-2 border-amber-450 pulse-red pointer-events-none" /><GameIcon name="fire" size={T * 0.38} className="absolute -top-1 left-1/2 -translate-x-1/2 text-amber-450 drop-shadow-[0_0_6px_#f0a73a] pointer-events-none" /></>}
    </>
  );
}

/** Casas que cada infectado enxerga (cone de 120° para onde olha, até o alcance, sem atravessar parede/porta fechada). Espelho do servidor. */
const BLOCK_SIGHT = new Set(['#', '+', 'o', 'T', 'S']);
function visionTiles(c: CombatView) {
  const out = new Map<string, 'alert' | 'calm'>();
  const tile = (x: number, y: number) => (x < 0 || y < 0 || x >= c.width || y >= c.height ? '#' : c.tiles[y][x]);
  const los = (ax: number, ay: number, bx: number, by: number) => {
    let x0 = ax, y0 = ay; const dx = Math.abs(bx - x0), sx = x0 < bx ? 1 : -1, dy = -Math.abs(by - y0), sy = y0 < by ? 1 : -1; let err = dx + dy;
    while (!(x0 === bx && y0 === by)) { const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } if (x0 === bx && y0 === by) break; if (BLOCK_SIGHT.has(tile(x0, y0))) return false; }
    return true;
  };
  const cosHalf = Math.cos(Math.PI / 3);
  for (const z of c.units) {
    if (z.side !== 'zombie' || z.out || !z.face || !z.sight) continue;
    const kind = z.hunting ? 'alert' : 'calm';
    for (let y = z.y - z.sight; y <= z.y + z.sight; y++) for (let x = z.x - z.sight; x <= z.x + z.sight; x++) {
      const dx = x - z.x, dy = y - z.y; if (!dx && !dy) continue;
      if (x < 0 || y < 0 || x >= c.width || y >= c.height || BLOCK_SIGHT.has(tile(x, y))) continue;
      const near = Math.max(Math.abs(dx), Math.abs(dy)) <= 1;
      const dot = (dx * z.face[0] + dy * z.face[1]) / (Math.hypot(dx, dy) * Math.hypot(z.face[0], z.face[1]));
      if (!near && dot < cosHalf) continue;
      if (!los(z.x, z.y, x, y)) continue;
      const key = k(x, y); if (out.get(key) !== 'alert') out.set(key, kind);
    }
  }
  return out;
}

/** Prévia local de alcance (o servidor revalida tudo). Mesmas regras do motor: 8 direções, sem cortar quinas, terreno difícil custa 2. */
function reachable(c: CombatView, from: CombatUnit, ap: number) {
  const tile = (x: number, y: number) => (x < 0 || y < 0 || x >= c.width || y >= c.height ? '#' : c.tiles[y][x]);
  const occupied = new Set(c.units.filter((u) => !u.out && u.id !== from.id).map((u) => k(u.x, u.y)));
  const dist = new Map<string, number>([[k(from.x, from.y), 0]]); const q = [{ x: from.x, y: from.y, d: 0 }];
  while (q.length) {
    q.sort((a, b) => a.d - b.d); const cur = q.shift()!;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue; const nx = cur.x + dx, ny = cur.y + dy;
      if (BLOCK.has(tile(nx, ny)) || occupied.has(k(nx, ny))) continue;
      if (dx && dy && (BLOCK.has(tile(cur.x + dx, cur.y)) || BLOCK.has(tile(cur.x, cur.y + dy)))) continue;
      const nd = cur.d + (tile(nx, ny) === '~' ? 2 : 1);
      if (nd > ap || nd >= (dist.get(k(nx, ny)) ?? Infinity)) continue;
      dist.set(k(nx, ny), nd); q.push({ x: nx, y: ny, d: nd });
    }
  }
  return dist;
}

export function CombatScreen() {
  const { combat, self, combatEnd, set } = useGame();
  const [aim, setAim] = useState(false); const [mode, setMode] = useState<'move' | 'shove' | 'aid' | 'distract' | 'throw' | 'barricade'>('move');
  const [throwItem, setThrowItem] = useState<number | null>(null);
  const [hover, setHover] = useState<string | null>(null); const [now, setNow] = useState(Date.now());
  const [shake, setShake] = useState(false);
  const mobile = useIsMobile(); const [fit, setFit] = useState(false); const boardBox = useRef<HTMLDivElement>(null);
  // o tabuleiro se ajusta ao espaço que a tela do confronto tem de verdade (no Dia 1, o celular ocupa parte da tela)
  const rootRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: window.innerWidth - 420, h: window.innerHeight });
  useEffect(() => {
    const el = rootRef.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el); return () => ro.disconnect();
  }, [!!combat]);
  const logRef = useRef<HTMLDivElement>(null); const lastLog = useRef(0);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!combat) return;
    const fresh = combat.log.slice(lastLog.current ? -Math.max(0, combat.log.length - lastLog.current) : -1);
    lastLog.current = combat.log.length;
    for (const l of fresh) {
      if (l.kind === 'shot_hit' || l.kind === 'shot_miss') { const sk = combat.units.find((u) => u.id === l.unit)?.weapon?.skill; audio.sfx(sk === 'rifle' ? 'gunshot_rifle' : sk === 'shotgun' ? 'gunshot_shotgun' : 'gunshot_pistol', 0.8); }
      else if (l.kind === 'hit' || l.kind === 'kill') audio.sfx('melee_hit');
      else if (l.kind === 'miss') audio.sfx('melee_miss');
      else if (l.kind === 'zmove' || l.kind === 'reveal') audio.sfx('zombie_groan', 0.4);
      else if (!combat.pvp && (l.kind === 'bite' || l.kind === 'wound' || l.kind === 'blocked')) audio.sfx('zombie_attack', l.kind === 'blocked' ? 0.5 : 0.85);
      if ((l.kind === 'wound' || l.kind === 'bite') && l.unit === `p${self?.id}`) { setShake(true); setTimeout(() => setShake(false), 600); buzz(120); }
    }
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [combat?.log.length]);
  const me = combat?.units.find((u) => u.characterId === self?.id && u.side === 'player');
  const canAct = !!me && !me.out && !me.endedTurn && combat?.phase === 'players' && combat.status === 'active';
  const reach = useMemo(() => (combat && me && canAct ? reachable(combat, me, me.ap) : new Map()), [combat, me?.x, me?.y, me?.ap, canAct]);
  const [showVision, setShowVision] = useState(() => { try { return localStorage.getItem('rc.combat.vision') !== '0'; } catch { return true; } });
  const toggleVision = () => setShowVision((v) => { try { localStorage.setItem('rc.combat.vision', v ? '0' : '1'); } catch { /* sem armazenamento */ } return !v; });
  const vision = useMemo(() => (combat && showVision ? visionTiles(combat) : new Map<string, 'alert' | 'calm'>()), [combat, showVision]);
  const layout = combat ? ARENA_LAYOUTS[combat.mapKey] ?? (combat.mapKey === 'heli_crash' ? HELI_ROWS : null) : null;
  const T = !combat ? 0 : mobile ? (fit ? Math.floor((box.w - 20) / combat.width) : 44) : Math.max(18, Math.floor(Math.min((box.w - 320 - 44) / combat.width, (box.h - 300) / combat.height, 64)));
  // celular: o tabuleiro não cabe inteiro com casas boas de tocar, então rola e acompanha o seu personagem
  useEffect(() => {
    const el = boardBox.current; if (!mobile || !el || !me) return;
    el.scrollTo({ left: me.x * T + T / 2 - el.clientWidth / 2, top: me.y * T + T / 2 - el.clientHeight / 2, behavior: 'smooth' });
  }, [mobile, me?.x, me?.y, T]);
  if (!combat) return null;
  const secs = Math.max(0, Math.round((new Date(combat.deadline).getTime() - now) / 1000));
  const unitAt = (x: number, y: number) => combat.units.find((u) => !u.out && u.x === x && u.y === y);
  const act = async (a: Record<string, unknown>) => { const r = await action('combat', { action: a }); if (r.ok) setMode('move'); return r; };
  const clickTile = (x: number, y: number) => {
    if (!canAct || !me) return;
    const u = unitAt(x, y); const t = combat.tiles[y][x];
    if (mode === 'distract') return act({ type: 'distract', x, y });
    if (mode === 'throw' && throwItem) { audio.sfx('melee_miss', 0.5); return act({ type: 'throw', itemId: throwItem, x, y }).then((r) => { if (r.ok) setThrowItem(null); }); }
    const adj = Math.max(Math.abs(x - me.x), Math.abs(y - me.y)) === 1;
    if (mode === 'barricade' && t === '+' && adj) return act({ type: 'barricade', x, y });
    if (adj && t === 'S') return act({ type: 'topple', x, y });
    if (adj && t === 'A') return act({ type: 'alarm', x, y });
    if (adj && t === 'B') return act({ type: 'ignite', x, y });
    if (u && u.id !== me.id) {
      if (mode === 'shove') return act({ type: 'shove', targetId: u.id });
      if (mode === 'aid' && u.side === 'player') return set({ modal: { kind: 'combat_aid', data: { targetId: u.id } } });
      if (u.side === 'zombie' || (combat.pvp && u.team !== me.team)) return act({ type: 'attack', targetId: u.id, aimHead: aim });
      return;
    }
    // porta fechada ao lado: abre. Porta aberta: é chão, dá para andar por ela (fechar é pelo botão "Fechar porta").
    if (t === '+' && adj) return act({ type: 'door', x, y });
    if (reach.has(k(x, y))) {
      if (mobile && hover !== k(x, y)) { setHover(k(x, y)); buzz(8); return; } // no toque: o primeiro toque mostra o custo, o segundo anda
      audio.sfx('footsteps', 0.4); setHover(null); return act({ type: 'move', x, y });
    }
  };
  const meds = self?.inventory.filter((i) => i.category === 'medical' && ['bandage', 'disinfect', 'medkit', 'painkiller'].includes(i.props.use)) ?? [];
  const weapons = self?.inventory.filter((i) => i.props.weaponType && i.slot !== 'primary') ?? [];
  const throwables = (self?.inventory.filter((i) => !i.slot) ?? []).sort((a, b) => b.weight - a.weight);
  const onExit = me && combat.exits.some((e) => e.x === me.x && e.y === me.y);
  const openDoorNear = me ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]].map(([dx, dy]) => ({ x: me.x + dx, y: me.y + dy }))
    .find((p) => combat.tiles[p.y]?.[p.x] === '/' && !unitAt(p.x, p.y)) : undefined;
  const readyCount = combat.units.filter((u) => u.side === 'player' && !u.out && u.endedTurn).length;
  const playersCount = combat.units.filter((u) => u.side === 'player' && !u.out).length;
  const ended = combat.status === 'ended' || !!combat.result;

  return (
    <div ref={rootRef} className={`flex-1 flex min-h-0 min-w-0 bg-ink-950 ${mobile ? 'flex-col overflow-y-auto overscroll-contain' : ''} ${shake ? 'anim-shake' : ''}`} style={{ backgroundImage: 'var(--grain)' }}>
      <section className={mobile ? 'flex flex-col relative px-2 pt-2' : 'flex-1 flex flex-col items-center justify-center p-4 relative min-h-0 overflow-y-auto'} aria-label="Confronto">
        <div className={`flex items-end w-full ${mobile ? 'gap-2 mb-2 px-1' : 'flex-wrap gap-x-5 gap-y-2 mb-3'}`} style={mobile ? undefined : { maxWidth: T * combat.width }}>
          <div className="min-w-0">
            <h1 className={`font-display font-extrabold leading-none text-blood-400 flex items-center gap-2 ${mobile ? 'text-[26px]' : 'text-[34px] gap-2.5'}`}><GameIcon name="combat" size={mobile ? 22 : 28} />Confronto</h1>
            <p className="text-[13.5px] text-ink-300 mt-1 truncate max-w-xl">{combat.reason}</p>
          </div>
          <div className={`ml-auto flex items-center ${mobile ? 'gap-2 shrink-0' : 'gap-3'}`}>
            {mobile && <button className="btn btn-ghost !min-h-9 !px-2 !text-[14px]" onClick={() => setFit(!fit)} aria-pressed={fit}>{fit ? 'Aproximar' : 'Ver tudo'}</button>}
            <button className={`btn btn-ghost !min-h-9 !px-2 !text-[13.5px] ${showVision ? 'text-amber-450' : ''}`} aria-pressed={showVision} onClick={toggleVision}
              title="Mostra para onde cada infectado está olhando e o que ele enxerga. Amarelo: não te viu ainda. Vermelho: está caçando alguém. Fora do cone dá para passar furtivo e pegar de surpresa (+20% de acerto)."><GameIcon name="observe" size={16} />{mobile ? 'Visão' : 'Visão dos infectados'}</button>
            {!mobile && <span className="tape !text-[16px]">Rodada {combat.round}</span>}
            <div role="timer" aria-live="off" className={`px-3 py-1 bg-[#0b0c07] border border-black shadow-[inset_0_2px_4px_rgba(0,0,0,.8)] font-[family-name:var(--font-plate)] font-bold text-[20px] tabular-nums flex items-center gap-2 ${combat.phase !== 'players' ? 'text-blood-400' : secs < 10 ? 'text-blood-400' : 'text-amber-450'}`}>
              <GameIcon name="end-turn" size={17} />{combat.phase === 'players' ? (me?.endedTurn && playersCount > 1 ? <>Esperando os outros ({readyCount}/{playersCount}) <span className="font-sans font-bold text-[18px]">{secs} s</span></> : <>Sua vez <span className="font-sans font-bold text-[18px]">{secs} s</span></>) : 'Infectados agindo'}
            </div>
          </div>
        </div>
        {mobile && combat.log.length > 0 && <p className="text-[13.5px] text-ink-200 px-1 mb-2 line-clamp-2" aria-live="polite"><span className="text-tape">Rodada {combat.round}.</span> {combat.log[combat.log.length - 1].text}</p>}
        <div ref={boardBox} className={mobile ? 'overflow-auto max-h-[58vh] -mx-2 px-2 overscroll-contain' : 'contents'}>
        <div className="relative shrink-0 border-[6px] border-[#23261c] outline outline-1 outline-black shadow-[0_0_60px_rgba(0,0,0,.9)]" style={{ width: T * combat.width + 12, height: T * combat.height + 12 }}>
          {combat.mapKey === 'heli_crash' ? <HeliArenaArt /> : <Img src={arenaUrl(combat.mapKey)} fallback={arenaUrl('street')} className={`absolute inset-0 w-full h-full object-cover ${layout ? '' : 'opacity-35'}`} />}
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${combat.width}, ${T}px)`, gridAutoRows: `${T}px` }}>
            {combat.tiles.flatMap((row, y) => [...row].map((t, x) => {
              const inReach = reach.has(k(x, y)) && !(me && me.x === x && me.y === y);
              const isHover = hover === k(x, y);
              return (
                <div key={k(x, y)} onMouseEnter={() => !mobile && setHover(k(x, y))} onClick={() => clickTile(x, y)}
                  {...(inReach ? { role: 'button', tabIndex: 0, 'aria-label': `Andar até a coluna ${x + 1}, linha ${y + 1}, custa ${reach.get(k(x, y))} PA`, onFocus: () => !mobile && setHover(k(x, y)), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clickTile(x, y); } } } : {})}
                  className={`relative ${layout ? 'border border-black/15' : 'border border-black/40'} ${inReach ? 'cursor-pointer' : ''}`}
                  style={layout ? undefined : { background: `${TILE_COLOR[t] ?? TILE_COLOR['.']}${t === '.' ? 'cc' : 'ee'}` }}
                  title={TILE_TIP[t] ?? (t === '~' && layout && layout[y]?.[x] !== '~' ? 'Escombros: terreno difícil (custa 2 PA)' : undefined)}>
                  {layout ? <TileArt t={t} base={layout[y]?.[x] ?? '.'} vertical={isVerticalDoor(layout, x, y)} T={T} alarm={!!(combat.alarm && combat.alarm.x === x && combat.alarm.y === y)} lit={!!combat.fuses?.some((f) => f.x === x && f.y === y)} /> : <>
                  {t === 'c' && <span className="absolute inset-1 border border-ink-500/60" />}
                  {(t === '+' || t === '/') && <span className={`absolute inset-x-1 top-1/2 -translate-y-1/2 h-1.5 ${t === '+' ? 'bg-amber-700' : 'bg-amber-900/50'}`} />}
                  {t === 'T' && <span className="absolute inset-1.5 rounded-full bg-[#1f3a1d] border border-[#2d4f2a]" />}
                  {t === 'S' && <span className="absolute inset-x-1 inset-y-[18%] bg-[#5a4128] border border-[#7a5a38]" />}
                  {t === 'A' && <span className={`absolute inset-x-[8%] inset-y-[22%] rounded-md bg-[#3d4b58] border border-[#5d7080] ${combat.alarm && combat.alarm.x === x && combat.alarm.y === y ? 'pulse-red' : ''}`} />}
                  {t === 'B' && <span className={`absolute inset-[22%] rounded-full bg-[#8a2b1d] border-2 border-[#b4472f] ${combat.fuses?.some((f) => f.x === x && f.y === y) ? 'pulse-red' : ''}`} />}
                  </>}
                  {vision.has(k(x, y)) && <span className={`absolute inset-0 pointer-events-none ${vision.get(k(x, y)) === 'alert' ? 'bg-blood-500/25' : 'bg-amber-300/15'}`} />}
                  {(t === '+' || t === '/') && <span className={`absolute inset-0 pointer-events-none ${t === '+' ? 'ring-2 ring-inset ring-blood-400/80' : 'ring-2 ring-inset ring-moss-400/70'}`}><span className={`absolute left-1/2 -translate-x-1/2 bottom-0.5 text-[10px] font-bold leading-none px-1 py-[1px] ${t === '+' ? 'bg-blood-500/90 text-white' : 'bg-moss-400/90 text-black'}`}>{t === '+' ? 'fechada' : 'aberta'}</span></span>}
                  {t === 'E' && <span className="absolute inset-0 flex flex-col items-center justify-end pb-0.5 text-moss-400 pointer-events-none" title="Saída: fique aqui e use Fugir"><GameIcon name="flee" size={Math.max(12, T * 0.32)} className="drop-shadow-[0_1px_2px_#000]" /><span className="text-[11px] leading-none mt-0.5 px-1 bg-black/60">saída</span></span>}
                  {inReach && <span className={`absolute inset-0 ${isHover ? 'bg-amber-450/35' : 'bg-amber-450/10'}`} />}
                  {inReach && isHover && <span className="absolute top-0.5 right-1 text-[12px] font-bold text-amber-200">{reach.get(k(x, y))} PA</span>}
                </div>
              );
            }))}
          </div>
          {combat.units.filter((u) => !u.out || u.out === 'down').map((u) => <Token key={u.id} u={u} T={T} me={u.id === me?.id} targetable={canAct && u.id !== me?.id && (u.side === 'zombie' || (combat.pvp && u.team !== me?.team))} onClick={() => clickTile(u.x, u.y)} />)}
          {ended && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center anim-fade">
              <div className={`text-center panel-plate ${mobile ? 'px-6 py-6 mx-3' : 'px-12 py-9'}`} role="status">
                <div className="text-[14px] text-tape">Fim do confronto</div>
                <div className="font-display font-extrabold text-[32px] leading-tight mt-1 max-w-lg">{combat.result?.summary ?? combatEnd?.summary}</div>
                <button className="btn btn-moss mt-5" onClick={() => { set({ combat: null, combatEnd: null }); audio.music(useGame.getState().scene?.location.musicKey ?? 'explore_calm'); }}>Voltar à cena</button>
              </div>
            </div>
          )}
        </div>
        </div>
        {me && !ended && (
          <div className={mobile ? 'mt-2 -mx-2 px-2 flex flex-nowrap gap-1.5 items-center overflow-x-auto no-scrollbar [&>*]:shrink-0' : 'mt-3 flex flex-wrap gap-1.5 justify-center items-center'} role="toolbar" aria-label="Ações de combate" style={mobile ? undefined : { maxWidth: Math.max(900, T * combat.width) }}>
            {!mobile && <div className="flex items-center gap-1.5 mr-3" aria-label={`${me.ap} de ${me.maxAp} pontos de ação`}>{Array.from({ length: me.maxAp }, (_, i) => <div key={i} className={`w-3.5 h-3.5 rotate-45 border ${i < me.ap ? 'bg-amber-450 border-amber-200 shadow-[0_0_8px_#f0a73a]' : 'border-ink-600 bg-[#0b0c07]'}`} />)}<span className="text-[13px] text-ink-300 ml-2">PA</span></div>}
            <button className={`btn ${aim ? '!bg-none !bg-blood-500' : ''}`} aria-pressed={aim} disabled={!canAct} onClick={() => setAim(!aim)} title="Mirar na cabeça: +1 PA, menor chance, maior letalidade"><GameIcon name="aim" size={17} />Na cabeça</button>
            <button className={`btn ${mode === 'shove' ? 'btn-moss' : ''}`} aria-pressed={mode === 'shove'} disabled={!canAct} onClick={() => setMode(mode === 'shove' ? 'move' : 'shove')}><GameIcon name="shove" size={17} />Empurrar</button>
            <button className="btn" disabled={!canAct || !me.weapon?.ranged} onClick={() => act({ type: 'reload' })}><GameIcon name="reload" size={17} />Recarregar{me.weapon?.ranged ? ` ${me.weapon.ammo}/${me.weapon.magSize}` : ''}</button>
            <label className="sr-only" htmlFor="cb-med">Tratar a si mesmo</label>
            <select id="cb-med" className="input !w-auto !py-1.5 text-[13.5px]" disabled={!canAct || !meds.length} value="" onChange={(e) => { const itemId = Number(e.target.value); if (itemId) act({ type: 'use_item', itemId }); }}>
              <option value="">{meds.length ? 'Tratar a si mesmo…' : 'Sem itens médicos'}</option>
              {meds.map((m) => <option key={m.id} value={m.id}>{m.name} ×{m.quantity}</option>)}
            </select>
            <button className={`btn ${mode === 'aid' ? 'btn-moss' : ''}`} aria-pressed={mode === 'aid'} disabled={!canAct || !meds.length} onClick={() => setMode(mode === 'aid' ? 'move' : 'aid')} title="Clique num aliado ao seu lado"><GameIcon name="aid" size={17} />Socorrer</button>
            <label className="sr-only" htmlFor="cb-weapon">Trocar arma</label>
            <select id="cb-weapon" className="input !w-auto !py-1.5 text-[13.5px]" disabled={!canAct} value="" onChange={(e) => act({ type: 'equip', itemId: e.target.value === 'none' ? null : Number(e.target.value) })}>
              <option value="">Trocar arma…</option>
              <option value="none">Guardar arma (mãos nuas)</option>
              {weapons.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <button className={`btn ${mode === 'distract' ? 'btn-moss' : ''}`} aria-pressed={mode === 'distract'} disabled={!canAct} onClick={() => setMode(mode === 'distract' ? 'move' : 'distract')} title="2 PA: clique numa casa visível (até 7) para fazer barulho e atrair infectados que não estão vendo ninguém"><GameIcon name="distract" size={17} />Distrair</button>
            <button className="btn" disabled={!canAct} onClick={() => act({ type: 'taunt' })} title="1 PA: grita e bate em tudo; os infectados próximos passam a perseguir você por 2 rodadas. Quem estava preso pode passar e fugir."><GameIcon name="taunt" size={17} />Provocar</button>
            <button className={`btn ${me.sneaking ? 'btn-moss' : ''}`} aria-pressed={!!me.sneaking} disabled={!canAct} onClick={() => act({ type: 'sneak' })} title="Andar agachado: movimento custa 50% mais PA, mas infectados quase não te percebem, não agarram quem não te viu e você pode fugir pelo lado de um infectado distraído. Atacar ou fazer barulho te revela."><GameIcon name="sneak" size={17} />{me.sneaking ? 'Agachado' : 'Furtivo'}</button>
            <label className="sr-only" htmlFor="cb-throw">Arremessar item</label>
            <select id="cb-throw" className={`input !w-auto !py-1.5 text-[13.5px] ${mode === 'throw' ? '!border-amber-450' : ''}`} disabled={!canAct || !throwables.length} value={throwItem ?? ''} onChange={(e) => { const v = Number(e.target.value) || null; setThrowItem(v); setMode(v ? 'throw' : 'move'); }}
              title="1 PA: escolha um item e clique numa casa. Acerta e derruba quem estiver lá, faz barulho que atrai infectados e alivia seu peso. O item cai no chão do local.">
              <option value="">{throwables.length ? 'Arremessar…' : 'Nada para arremessar'}</option>
              {throwables.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.weight} kg){i.quantity > 1 ? ` ×${i.quantity}` : ''}</option>)}
            </select>
            <button className={`btn ${mode === 'barricade' ? 'btn-moss' : ''}`} aria-pressed={mode === 'barricade'} disabled={!canAct} onClick={() => setMode(mode === 'barricade' ? 'move' : 'barricade')} title="2 PA: clique numa porta fechada ao seu lado para empilhar móveis; fica bem mais difícil de arrombar"><GameIcon name="base" size={17} />Barricar</button>
            {openDoorNear && <button className="btn" disabled={!canAct} onClick={() => act({ type: 'door', x: openDoorNear.x, y: openDoorNear.y })} title="1 PA: fecha a porta aberta ao seu lado (infectados precisam arrombar)"><GameIcon name="door" size={17} />Fechar porta</button>}
            <button className="btn" disabled={!canAct} onClick={() => act({ type: 'defend' })}><GameIcon name="defend" size={17} />Defender</button>
            {!mobile && <button className="btn btn-moss" disabled={!canAct || !onExit} onClick={() => act({ type: 'flee' })} title="Fique numa casa de saída"><GameIcon name="flee" size={17} />Fugir</button>}
            {!mobile && <button className="btn btn-danger" disabled={!canAct} onClick={() => act({ type: 'end_turn' })}><GameIcon name="end-turn" size={17} />Encerrar turno</button>}
          </div>
        )}
        {me && !ended && mobile && (
          <>
            {(mode !== 'move' || (hover && reach.has(hover))) && <p className="text-[13.5px] text-amber-450 mt-2 px-1">{mode === 'throw' ? 'Toque na casa onde quer arremessar.' : mode === 'shove' ? 'Toque no infectado ao seu lado para empurrar.' : mode === 'aid' ? 'Toque no aliado ao seu lado.' : mode === 'distract' ? 'Toque numa casa para fazer barulho lá.' : mode === 'barricade' ? 'Toque na porta fechada ao seu lado.' : `Toque de novo na casa marcada para andar (${reach.get(hover!)} PA).`}</p>}
            {/* barra fixa com o essencial: pontos de ação, fugir e encerrar a vez */}
            <div className="sticky bottom-0 z-10 -mx-2 mt-2 px-2 py-2 panel-plate !shadow-none border-t border-black flex items-center gap-2">
              <div className="flex items-center gap-1 mr-auto" aria-label={`${me.ap} de ${me.maxAp} pontos de ação`}>{Array.from({ length: me.maxAp }, (_, i) => <div key={i} className={`w-3 h-3 rotate-45 border ${i < me.ap ? 'bg-amber-450 border-amber-200 shadow-[0_0_8px_#f0a73a]' : 'border-ink-600 bg-[#0b0c07]'}`} />)}<span className="text-[12px] text-ink-300 ml-1">PA</span></div>
              <button className="btn btn-moss !min-h-[46px]" disabled={!canAct || !onExit} onClick={() => act({ type: 'flee' })}><GameIcon name="flee" size={18} />Fugir</button>
              <button className="btn btn-danger !min-h-[46px]" disabled={!canAct} onClick={() => act({ type: 'end_turn' })}><GameIcon name="end-turn" size={18} />Encerrar vez</button>
            </div>
          </>
        )}
        {!me && !ended && <div className="mt-3 text-[14px] text-ink-300">Você está assistindo. <button className="btn !min-h-8 !py-1 ml-2" onClick={() => set({ combat: null })}>Parar de assistir</button></div>}
        {me && !mobile && (
          <p className="mt-2.5 text-[12.5px] text-ink-300 text-center max-w-[980px] leading-relaxed">
            Clique numa casa clara para andar, num infectado para atacar com {me.weapon?.name ?? 'as mãos'} (alcance {me.weapon?.range ?? 1}), numa porta ao lado para abrir ou fechar.
            Ao lado de uma <span className="text-[#c49a6c]">estante</span>: derrubar. De um <span className="text-[#8aa0b4]">carro</span>: disparar o alarme. De um <span className="text-[#e07a62]">galão</span>: acender{me.hasLighter ? '' : ' (precisa de isqueiro)'}.
            {mode === 'throw' && <b className="text-amber-450"> Arremesso: clique na casa de destino.</b>}
            {me.overloaded && <span className="text-blood-400"> Sobrecarregado: menos 1 PA por rodada.</span>}
            {me.dog && <span className="text-tape"> {me.dog} avança sobre infectados perto de você.</span>}
          </p>
        )}
      </section>
      <aside className={mobile ? 'border-t border-black panel !outline-none flex flex-col mt-3' : 'w-80 border-l border-black panel !outline-none flex flex-col'} aria-label="Participantes e relato">
        <div className={`p-4 border-b border-black/70 overflow-y-auto ${mobile ? '' : 'max-h-[45%]'}`}>
          <h2 className="text-[13.5px] text-tape mb-2">Quem está no confronto</h2>
          <ul className="space-y-1.5">{combat.units.map((u) => (
            <li key={u.id} className={`flex items-center justify-between gap-2 text-[14px] ${u.out ? 'opacity-45' : ''}`}>
              <span className={`flex items-center gap-1.5 ${u.side === 'zombie' ? 'text-blood-400' : u.id === me?.id ? 'text-amber-450' : 'text-ink-200'}`}>{u.side === 'zombie' && u.zombieType && ZOMBIE_ART.has(u.zombieType) ? <img src={`/assets/zombies/${u.zombieType}.webp`} alt="" className="w-[22px] h-[22px] rounded-full object-cover border border-blood-500 shrink-0" /> : <GameIcon name={u.side === 'zombie' ? 'zombie' : 'character'} size={15} />}{u.name}</span>
              <span className="text-[12.5px] text-ink-400 shrink-0">{u.out === 'dead' ? 'morto' : u.out === 'fled' ? 'fugiu' : u.out === 'down' ? 'caído' : u.side === 'zombie' ? u.condition : u.endedTurn ? 'pronto' : `${u.ap} PA`}</span>
            </li>
          ))}</ul>
        </div>
        <div ref={logRef} className={`flex-1 overflow-y-auto p-4 ${mobile ? 'max-h-[40vh]' : ''}`} role="log" aria-label="Relato do confronto">
          {combat.log.map((l, i) => {
            const newRound = i === 0 || combat.log[i - 1].round !== l.round;
            return (
              <div key={i}>
                {newRound && <div className="text-[12px] text-tape/80 mt-3 mb-1 border-b border-ink-700 pb-0.5">Rodada {l.round}</div>}
                <p className={`text-[13.5px] leading-snug py-0.5 ${l.kind === 'bite' || l.kind === 'wound' ? 'text-blood-400 font-semibold' : l.kind === 'kill' ? 'text-moss-400' : l.kind === 'system' || l.kind === 'reinforce' ? 'text-amber-450' : l.kind === 'dog' ? 'text-tape' : 'text-ink-200'}`}>{l.text}</p>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

/** Retratos dos tipos de infectado (public/assets/zombies/<tipo>.webp). */
const ZOMBIE_ART = new Set(['walker', 'runner', 'brute', 'wanderer', 'decayed']);

function Token({ u, T, me, targetable, onClick }: { u: CombatUnit; T: number; me: boolean; targetable: boolean; onClick: () => void }) {
  const z = u.side === 'zombie';
  const color = z ? (u.behavior === 'runner' ? '#e0554a' : u.behavior === 'brute' ? '#a52e25' : u.behavior === 'lurker' ? '#6b705a' : '#b8372d') : me ? '#f0a73a' : u.team === 2 ? '#a497cf' : '#9ab567';
  return (
    <div onClick={onClick} className={`absolute transition-all duration-500 ease-out ${targetable ? 'cursor-crosshair' : ''}`} style={{ left: u.x * T, top: u.y * T, width: T, height: T }} title={`${u.name}${u.weapon ? `, com ${u.weapon.name}` : ''}`}
      {...(targetable ? { role: 'button', tabIndex: 0, 'aria-label': `Atacar ${u.name}`, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } } : { role: 'img', 'aria-label': `${u.name}${u.out === 'down' ? ', caído' : ''}` })}>
      <div className={`absolute inset-[10%] rounded-full border-2 overflow-hidden flex items-center justify-center ${u.out === 'down' ? 'grayscale opacity-60' : ''} ${targetable ? 'hover:ring-2 hover:ring-blood-400' : ''}`}
        style={{ borderColor: color, background: z ? 'radial-gradient(circle at 40% 35%, #4a2a22, #160d0b)' : '#101109', boxShadow: me ? `0 0 14px ${color}` : undefined, transform: u.prone ? 'scaleY(.6)' : undefined, opacity: u.sneaking ? 0.7 : undefined }}>
        {z ? (u.portrait ? <Img src={portraitUrl(u.portrait)} fallback="/assets/portraits/default.png" className="w-full h-full object-cover object-top risen-filter" /> : (u.zombieType && ZOMBIE_ART.has(u.zombieType) ? <Img src={`/assets/zombies/${u.zombieType}.webp`} fallback="/assets/portraits/default.png" className="w-full h-full object-cover" /> : <GameIcon name="zombie" size={T * 0.5} style={{ color: '#e8c9b8' }} />)) : <Img src={portraitUrl(u.portrait)} fallback="/assets/portraits/default.png" className="w-full h-full object-cover object-top" />}
      </div>
      {z && u.face && !u.out && (
        // seta para onde o infectado está olhando
        <span className="absolute inset-0 pointer-events-none" style={{ transform: `rotate(${Math.atan2(u.face[1], u.face[0]) * 180 / Math.PI}deg)` }} aria-hidden>
          <span className="absolute top-1/2 -translate-y-1/2 right-[-3px] w-0 h-0 border-y-[6px] border-y-transparent border-l-[9px]" style={{ borderLeftColor: u.hunting ? '#e0554a' : '#f0d070' }} />
        </span>
      )}
      {u.defending && <GameIcon name="defend" size={15} label="Defendendo" className="absolute -top-1 -right-1 text-steel-400" />}
      {u.sneaking && <GameIcon name="sneak" size={14} label="Furtivo" className="absolute -top-1 -left-1 text-moss-400" />}
      {u.tauntedBy && <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[11px] font-bold text-amber-400" title="Provocado: persegue quem fez barulho">!</span>}
      {u.crawling && <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[12px] text-ink-200 bg-black/80 px-1">rastejando</span>}
      {u.out === 'down' && <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[12px] text-blood-400 bg-black/80 px-1">caído</span>}
    </div>
  );
}
