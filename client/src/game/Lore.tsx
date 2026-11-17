/**
 * Capítulo 1 da história: a queda do helicóptero Corvo 2-1 (servidor: services/heli.ts).
 *  - RadioPanel: a conversa da tripulação, ao vivo, no meio da tela (pelo próprio rádio ou pelo de quem está junto).
 *  - OverflightCard: quem não tem rádio vê o helicóptero passar.
 *  - HeliTest: o teste de 1d6 (3+) para deduzir onde ele caiu, no meio da tela.
 *  - HeliHotspot: os destroços na cena do local (enfrentar os infectados / vasculhar).
 *  - HeliArenaArt: a arte do tabuleiro exclusivo dos destroços.
 */
import { useEffect, useRef, useState } from 'react';
import { GameIcon } from '../components/GameIcon';
import { useGame } from '../lib/store';
import { action } from '../lib/socket';
import { audio } from '../lib/audio';

const goTo = (id: string, name: string) => { useGame.getState().set({ route: { targetId: id, targetName: name }, panel: null }); useGame.getState().toast(`Rota marcada até ${name}. Siga pelo aviso na tela.`, 'success'); };

/** Conversa no rádio militar: aparece sozinha no meio da tela na primeira fala. Dá para minimizar. */
export function RadioPanel() {
  const r = useGame((s) => s.loreRadio);
  const heli = useGame((s) => s.self?.lore?.heli);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' }); }, [r?.lines.length, r?.open]);
  if (!r) return null;
  const set = (p: Partial<NonNullable<typeof r>>) => useGame.getState().set({ loreRadio: { ...r, ...p } });
  if (!r.open) return (
    <button className="fixed top-20 left-1/2 -translate-x-1/2 z-[57] btn btn-moss shadow-[0_8px_24px_rgba(0,0,0,.7)] pulse-red" onClick={() => set({ open: true })}>
      <GameIcon name="radio" size={17} />Rádio militar ({r.lines.length}/{r.total}){r.done ? ', terminou' : ', ao vivo'}
    </button>
  );
  const knows = heli && heli.phase !== 'flying' && heli.knows && heli.locationId ? heli : null;
  return (
    <section role="log" aria-live="polite" aria-label="Rádio militar" className="fixed z-[57] left-1/2 -translate-x-1/2 top-[12%] w-[min(560px,calc(100vw-24px))] anim-fade">
      <div className="bg-[#0d0f0a] border-2 border-[#3a4a2a] shadow-[0_20px_60px_rgba(0,0,0,.85)]">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#1a2214] border-b border-[#3a4a2a]">
          <span className={`w-2.5 h-2.5 rounded-full ${r.done ? 'bg-ink-500' : 'bg-blood-400 pulse-red'}`} aria-hidden />
          <GameIcon name="radio" size={18} className="text-moss-400" />
          <div className="flex-1 min-w-0">
            <div className="font-display font-extrabold text-[20px] leading-none text-moss-400">{r.done ? 'RÁDIO: SINAL PERDIDO' : 'RÁDIO: FREQUÊNCIA MILITAR, AO VIVO'}</div>
            <div className="text-[12.5px] text-ink-300 mt-0.5">{r.via ? <>Você está ouvindo pelo rádio de <b className="text-ink-100">{r.via}</b>, que está com você.</> : 'Você está ouvindo pelo seu próprio rádio.'}</div>
          </div>
          <button className="btn btn-ghost !px-2 !min-h-[30px] !text-[13px]" onClick={() => set({ open: false })}>Minimizar</button>
        </div>
        <div ref={box} className="max-h-[46vh] overflow-y-auto px-4 py-3 space-y-2.5 font-mono text-[14px]">
          {r.lines.map((l, i) => (
            <div key={i} className={`anim-fade ${l.who === '—' ? 'text-ink-400 italic text-center py-1' : ''}`}>
              {l.who !== '—' && <div className={`text-[11.5px] uppercase tracking-wider font-bold ${l.who.startsWith('Torre') ? 'text-amber-450' : 'text-moss-400'}`}>{l.who}</div>}
              <div className={`${l.text.startsWith('MAYDAY') ? 'text-blood-400 font-bold' : 'text-ink-100'}`}>{l.text}</div>
            </div>
          ))}
          {!r.done && <div className="text-ink-500 animate-pulse">…chiado…</div>}
        </div>
        {(r.done || knows) && (
          <div className="px-4 py-3 border-t border-[#3a4a2a] flex items-center gap-2 flex-wrap">
            {knows ? <span className="text-[14px] text-ink-100 flex-1 min-w-[200px]">Pelo MAYDAY, você sabe onde ele caiu: <b className="text-amber-450">{knows.locationName}</b>.</span>
              : <span className="text-[14px] text-ink-300 flex-1">O helicóptero caiu.</span>}
            {knows && <button className="btn btn-moss" onClick={() => { goTo(knows.locationId!, knows.locationName!); useGame.getState().set({ loreRadio: null }); }}><GameIcon name="route" size={16} />Marcar rota até lá</button>}
            {r.done && <button className="btn" onClick={() => useGame.getState().set({ loreRadio: null })}>Fechar</button>}
          </div>
        )}
      </div>
    </section>
  );
}

/** Sem rádio: o helicóptero passando no céu (o teste vem depois, na queda). */
export function OverflightCard() {
  const text = useGame((s) => s.overflight);
  if (!text) return null;
  return (
    <div className="fixed inset-0 z-[57] bg-black/75 flex items-center justify-center p-4 anim-fade" role="dialog" aria-modal="true" aria-labelledby="overflight-title">
      <div className="panel panel-plate max-w-md w-full p-5 border border-black">
        <div className="text-[13px] uppercase tracking-[.16em] text-amber-450 font-bold flex items-center gap-1.5"><GameIcon name="observe" size={15} />No céu</div>
        <h2 id="overflight-title" className="font-display font-extrabold text-[34px] leading-none mt-1.5">Um helicóptero</h2>
        <p className="text-[15.5px] text-ink-200 mt-3 leading-relaxed">{text}</p>
        <p className="text-[13.5px] text-ink-400 mt-3">Você não tem rádio para saber o que está acontecendo. Fique atento.</p>
        <button className="btn btn-moss w-full mt-4" autoFocus onClick={() => useGame.getState().set({ overflight: null })}>Continuar</button>
      </div>
    </div>
  );
}

/** Teste de 1d6 no meio da tela: 3 ou mais e você deduz onde o helicóptero caiu. Aparece ao entrar, se estiver pendente. */
export function HeliTest() {
  const heli = useGame((s) => s.self?.lore?.heli);
  const busy = useGame((s) => !!s.self?.combatId || !!s.self?.needs.unconscious);
  const [rolling, setRolling] = useState(false); const [face, setFace] = useState(1);
  const [result, setResult] = useState<null | { roll: number; success: boolean; locationId: string | null; locationName: string | null }>(null);
  useEffect(() => { if (!rolling) return; const t = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 80); return () => clearInterval(t); }, [rolling]);
  const pending = heli && heli.phase !== 'flying' && heli.testPending;
  if ((!pending && !result) || busy) return null;
  const roll = async () => {
    setRolling(true); audio.sfx('ui_click', 0.6);
    const [r] = await Promise.all([action<{ roll: number; success: boolean; locationId: string | null; locationName: string | null }>('heli_roll'), new Promise((ok) => setTimeout(ok, 1300))]);
    setRolling(false);
    if (r.ok) { setFace(r.roll); setResult(r); audio.sfx(r.success ? 'notification' : 'ui_error', 0.6); }
  };
  return (
    <div className="fixed inset-0 z-[58] bg-black/85 flex items-center justify-center p-4 anim-fade" role="dialog" aria-modal="true" aria-labelledby="heli-test-title">
      <div className="panel panel-plate max-w-md w-full p-6 border-2 border-amber-450/60 text-center shadow-[0_20px_60px_rgba(0,0,0,.85)]">
        <div className="text-[13px] uppercase tracking-[.16em] text-amber-450 font-bold">Teste de percepção</div>
        <h2 id="heli-test-title" className="font-display font-extrabold text-[34px] leading-none mt-1.5">Onde ele caiu?</h2>
        <p className="text-[15px] text-ink-200 mt-3 leading-relaxed">Mais cedo, um helicóptero militar passou soltando fumaça. Depois veio um estrondo e uma coluna de fumaça preta, longe daqui.</p>
        <p className="text-[15px] text-ink-100 mt-2 font-semibold">Role 1 dado de 6 lados. Com <span className="text-amber-450">3 ou mais</span>, você deduz onde ele caiu.</p>
        <div className={`mx-auto mt-5 w-24 h-24 flex items-center justify-center bg-[#e9e2cc] text-[#1d1912] border-4 border-black rounded-xl font-display font-extrabold text-[60px] leading-none shadow-[0_6px_0_#000] ${rolling ? 'animate-bounce' : ''}`} aria-live="polite" aria-label={result ? `Você tirou ${result.roll}` : 'Dado'}>
          {rolling || result ? face : '?'}
        </div>
        {!result && <button className="btn btn-moss w-full mt-5 !text-[17px] !min-h-[48px]" disabled={rolling} autoFocus onClick={roll}>{rolling ? 'Rolando…' : 'Rolar o dado (1d6)'}</button>}
        {result && (
          <div className="mt-5 anim-fade">
            {result.success ? (
              <>
                <div className="font-display font-extrabold text-[26px] text-moss-400">Sucesso! ({result.roll})</div>
                <p className="text-[15px] text-ink-200 mt-1">Pela direção da fumaça e do barulho, ele caiu em <b className="text-amber-450">{result.locationName}</b>.</p>
                <div className="flex gap-2 mt-4">
                  <button className="btn btn-moss flex-1" onClick={() => { goTo(result.locationId!, result.locationName!); setResult(null); }}><GameIcon name="route" size={16} />Marcar rota até lá</button>
                  <button className="btn" onClick={() => setResult(null)}>Fechar</button>
                </div>
              </>
            ) : (
              <>
                <div className="font-display font-extrabold text-[26px] text-blood-400">Falhou ({result.roll})</div>
                <p className="text-[15px] text-ink-200 mt-1">O vento espalhou a fumaça. Você não consegue dizer onde ele caiu. Talvez alguém com rádio saiba.</p>
                <button className="btn w-full mt-4" onClick={() => setResult(null)}>Fechar</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Destroços na cena: enfrentar os infectados (vasculhar só depois) ou recolher o que sobrou. */
export function HeliHotspot() {
  const heli = useGame((s) => s.scene?.heli);
  const self = useGame((s) => s.self);
  const combats = useGame((s) => s.scene?.combats ?? []);
  if (!heli || !self) return null;
  const fighting = heli.combatId && combats.some((c) => c.id === heli.combatId);
  return (
    <div className="bg-[#1c0d0bea] border border-black shadow-[0_4px_14px_rgba(0,0,0,.7)] px-3 py-2.5 max-w-md" style={{ borderLeft: '4px solid #f0a73a' }} role="region" aria-label="Destroços do helicóptero">
      <div className="text-amber-450 font-semibold flex items-center gap-1.5"><GameIcon name="danger" size={17} />Destroços do helicóptero Corvo 2-1</div>
      {heli.zombies > 0 ? (
        <>
          <div className="text-[13.5px] text-ink-200 my-1.5"><b className="text-blood-400">{heli.zombies} infectado(s)</b> rondam os destroços, ainda de costas para você. Vasculhar só depois de eliminar todos.</div>
          {fighting ? <div className="text-[13px] text-ink-300">Já tem gente lutando lá: use "Entrar para ajudar" no confronto.</div>
            : <button className="btn btn-danger !min-h-8 !py-1" disabled={self.state !== 'idle'} onClick={() => action('heli_fight')}><GameIcon name="combat" size={15} />Enfrentar os infectados</button>}
        </>
      ) : (
        <div className="text-[13.5px] text-ink-200 mt-1.5">Os infectados caíram. Use <b>Vasculhar</b> para recolher o que sobrou ({heli.searchesLeft} busca{heli.searchesLeft === 1 ? '' : 's'} até não restar nada).</div>
      )}
    </div>
  );
}

// ───────────────────────── Tabuleiro exclusivo ─────────────────────────
/** Mesma geometria de heli_crash em server/src/game/combat/maps.ts. */
export const HELI_ROWS = [
  'TT.~~~~~~~~~~ZTT',
  'E....~~~c~~~..Z.',
  '.P...~~~~~..cZ..',
  '.....~~ooo~....Z',
  '.P.c...ooooB..Z.',
  'E.....ooooo.c.Z.',
  '.P.c...oooB...Z.',
  '.....~~~oo~....Z',
  '.P...~~~~~~.cZ..',
  'E....~~c~~~~..Z.',
  'TT.~~~~~~~~~~.TT',
].map((r) => r.replace(/[PZ]/g, '.'));

/** Plantação com os destroços do helicóptero, desenhada a partir da geometria (sem imagem externa). */
export function HeliArenaArt() {
  const S = 64; const rows = HELI_ROWS; const W = rows[0].length * S, H = rows.length * S;
  const cells = rows.flatMap((r, y) => [...r].map((t, x) => ({ t, x: x * S, y: y * S })));
  const wreck = cells.filter((c) => c.t === 'o');
  const cx = wreck.reduce((a, c) => a + c.x + S / 2, 0) / wreck.length, cy = wreck.reduce((a, c) => a + c.y + S / 2, 0) / wreck.length;
  return (
    <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="hc-ground" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4b4a2c" /><stop offset="1" stopColor="#3b3a24" /></linearGradient>
        <pattern id="hc-crop" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#3d4a24" /><path d="M0 8 H16" stroke="#56662f" strokeWidth="5" /><path d="M2 3 l3 5 M10 1 l2 6" stroke="#6b7c3a" strokeWidth="1.5" /></pattern>
        <radialGradient id="hc-scorch"><stop offset="0" stopColor="#0b0907" stopOpacity=".95" /><stop offset=".7" stopColor="#1b1510" stopOpacity=".6" /><stop offset="1" stopColor="#1b1510" stopOpacity="0" /></radialGradient>
        <radialGradient id="hc-smoke"><stop offset="0" stopColor="#2a2a28" stopOpacity=".55" /><stop offset="1" stopColor="#2a2a28" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width={W} height={H} fill="url(#hc-ground)" />
      {cells.filter((c) => c.t === '~').map((c, i) => <rect key={`k${i}`} x={c.x} y={c.y} width={S} height={S} fill="url(#hc-crop)" />)}
      {/* sulco aberto pela queda */}
      <path d={`M ${cx + 260} ${cy - 120} Q ${cx + 120} ${cy - 40} ${cx} ${cy}`} stroke="#241d14" strokeWidth="46" strokeLinecap="round" fill="none" opacity=".75" />
      <ellipse cx={cx} cy={cy} rx={S * 3.2} ry={S * 2.6} fill="url(#hc-scorch)" />
      {/* fuselagem, cauda e pás do rotor */}
      <g transform={`rotate(-18 ${cx} ${cy})`}>
        <path d={`M ${cx + 40} ${cy - 18} L ${cx + 230} ${cy - 10} L ${cx + 240} ${cy - 46} L ${cx + 252} ${cy - 46} L ${cx + 250} ${cy + 6} L ${cx + 40} ${cy + 16} Z`} fill="#3e4636" stroke="#151810" strokeWidth="4" />
        <ellipse cx={cx - 20} cy={cy} rx={120} ry={68} fill="#4a5440" stroke="#151810" strokeWidth="5" />
        <ellipse cx={cx - 95} cy={cy - 8} rx={40} ry={34} fill="#8fa3a8" opacity=".35" stroke="#151810" strokeWidth="3" />
        <path d={`M ${cx - 60} ${cy - 40} L ${cx + 30} ${cy + 35}`} stroke="#151810" strokeWidth="6" />
        <circle cx={cx - 10} cy={cy - 6} r={12} fill="#20241b" />
        <path d={`M ${cx - 10} ${cy - 6} L ${cx - 190} ${cy - 120}`} stroke="#22261d" strokeWidth="11" strokeLinecap="round" />
        <path d={`M ${cx - 10} ${cy - 6} L ${cx + 120} ${cy + 150} L ${cx + 150} ${cy + 175}`} stroke="#22261d" strokeWidth="11" strokeLinecap="round" fill="none" />
        <text x={cx + 120} y={cy + 8} fontSize="20" fontWeight="800" fill="#c9c7a8" opacity=".55" fontFamily="var(--font-plate)">CORVO 2-1</text>
      </g>
      {/* pedaços de metal, tanque vazando, árvores */}
      {cells.filter((c) => c.t === 'c').map((c, i) => <g key={`c${i}`}><rect x={c.x + 12} y={c.y + 22} width={40} height={14} rx={2} fill="#4b5145" stroke="#151810" strokeWidth="3" transform={`rotate(${i * 37 % 60 - 30} ${c.x + 32} ${c.y + 29})`} /><rect x={c.x + 20} y={c.y + 36} width={22} height={10} fill="#33382d" stroke="#151810" strokeWidth="2" /></g>)}
      {cells.filter((c) => c.t === 'B').map((c, i) => <g key={`b${i}`}><ellipse cx={c.x + 34} cy={c.y + 46} rx={30} ry={12} fill="#120f0a" opacity=".7" /><rect x={c.x + 14} y={c.y + 14} width={36} height={34} rx={6} fill="#7a3a1c" stroke="#151810" strokeWidth="4" /><rect x={c.x + 14} y={c.y + 24} width={36} height={6} fill="#b4572c" /></g>)}
      {cells.filter((c) => c.t === 'T').map((c, i) => <g key={`t${i}`}><circle cx={c.x + 32} cy={c.y + 32} r={30} fill="#1f3a1d" stroke="#132611" strokeWidth="4" /><circle cx={c.x + 24} cy={c.y + 24} r={12} fill="#2d4f2a" /></g>)}
      <circle cx={cx + 40} cy={cy - 50} r={S * 1.6} fill="url(#hc-smoke)" />
      <circle cx={cx - 30} cy={cy - 90} r={S * 1.2} fill="url(#hc-smoke)" />
      {/* brasas */}
      {[[-40, 20], [10, -30], [60, 10], [-90, -20]].map(([dx, dy], i) => <circle key={`f${i}`} cx={cx + dx} cy={cy + dy} r={7} fill="#f0a73a" opacity=".85" className="pulse-red" />)}
    </svg>
  );
}
