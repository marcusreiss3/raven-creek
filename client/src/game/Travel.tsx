import { useEffect, useState } from 'react';
import { GameIcon } from '../components/GameIcon';
import { useGame } from '../lib/store';
import type { NearbyTraveler, SceneChar } from '../lib/types';
import { Portrait } from './Scene';
import { action } from '../lib/socket';
import { sceneUrl } from '../lib/api';
import { Bar, Img, fmtDuration, useFocusTrap } from '../components/ui';
import { audio } from '../lib/audio';

const DECISIONS: Record<string, { choice: string; label: string; desc: string; danger?: boolean }[]> = {
  combat: [
    { choice: 'fight', label: 'Enfrentar', desc: 'Abrir caminho à força. Inicia um confronto tático.', danger: true },
    { choice: 'sneak', label: 'Passar em silêncio', desc: 'Teste de furtividade do grupo. Se falhar, vocês serão emboscados.' },
    { choice: 'detour', label: 'Desviar', desc: 'Contornar por outro caminho. Viagem bem mais longa.' },
    { choice: 'retreat', label: 'Voltar', desc: 'Retornar à origem pelo mesmo caminho.' },
  ],
  roadblock: [
    { choice: 'detour', label: 'Procurar desvio', desc: 'Aumenta o tempo de viagem.' },
    { choice: 'retreat', label: 'Voltar', desc: 'Retornar à origem.' },
  ],
};

export function TravelScreen({ onCharacterClick }: { onCharacterClick?: (c: SceneChar) => void }) {
  const { self, clock } = useGame();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<NearbyTraveler | null>(null);
  const pickRef = useFocusTrap<HTMLDivElement>(!!pick);
  const [base, setBase] = useState(() => ({ at: Date.now(), elapsed: self?.travel?.elapsedMs ?? 0 }));
  useEffect(() => { setBase({ at: Date.now(), elapsed: self?.travel?.elapsedMs ?? 0 }); }, [self?.travel?.id, self?.travel?.status, self?.travel?.durationMs, self?.travel?.elapsedMs]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, []);
  useEffect(() => { audio.music('road'); audio.ambient('wind', 0.25); }, []);
  const t = self?.travel; if (!t || !self) return null;
  const moving = t.status === 'active';
  const paused = t.status === 'paused';
  const elapsed = moving ? Math.min(t.durationMs, base.elapsed + (now - base.at)) : t.elapsedMs;
  const pct = (elapsed / t.durationMs) * 100;
  // Sempre mostra o próprio personagem, mesmo que a lista do grupo ainda não tenha chegado.
  const companions: SceneChar[] = t.companions?.length ? t.companions : [{
    id: self.id, name: self.name, portrait: self.portrait, portraitAdjust: self.portraitAdjust, state: self.state, activity: self.activity, appearance: self.appearance,
    online: true, userId: 0, followingId: self.followingId, inCombat: false, visibleCondition: 'normal',
  }];
  const ordered = [...companions].sort((a, b) => (a.id === self.id ? -1 : b.id === self.id ? 1 : 0));
  const phase = clock?.phase ?? self.clock?.phase; const weather = clock?.weather ?? self.clock?.weather;
  const canPause = moving || paused;
  const leader = t.isLeader !== false;
  const leaderName = companions.find((c) => c.id === t.leaderId)?.name.split(' ')[0];
  const togglePause = async () => { setBusy(true); await action('travel_pause', { pause: !paused }); setBusy(false); };
  const turnBack = async () => { setBusy(true); await action('travel_back', {}); setBusy(false); };
  const nearby = (t.nearby ?? []).filter((n) => !companions.some((c) => c.id === n.id));
  const join = async (n: NearbyTraveler) => { setBusy(true); const r = await action('travel_join', { targetId: n.id }); setBusy(false); if (r.ok) setPick(null); };
  const nearbyNote = (n: NearbyTraveler) => n.travelStatus === 'paused' ? 'parado na estrada' : `indo para ${n.toName}`;
  const total = ordered.length + nearby.length;
  return (
    <div className="relative flex-1 overflow-hidden bg-black noise select-none">
      {/* fundo: desliza devagar enquanto o grupo anda, congela quando param */}
      <Img key={t.sceneKey} src={sceneUrl(t.sceneKey)} fallback="/assets/scenes/road_asphalt_01.webp" className="absolute inset-0 w-full h-full object-cover anim-fade"
        style={{ transform: `scale(1.06) translateX(${-pct / 40}%)`, transition: 'transform 1s linear' }} />
      <div className="absolute inset-0 pointer-events-none transition-all duration-[3000ms]" style={{ background: phase === 'night' ? 'rgba(6,10,26,.62)' : phase === 'dusk' ? 'rgba(80,35,10,.28)' : phase === 'dawn' ? 'rgba(60,50,80,.22)' : 'transparent', mixBlendMode: 'multiply' }} />
      {(weather === 'rain' || weather === 'storm') && <div className={`absolute inset-0 pointer-events-none fx-rain ${weather === 'storm' ? 'fx-storm' : ''}`} />}
      {weather === 'fog' && <div className="absolute -inset-20 pointer-events-none fx-fog" />}
      <div className="absolute inset-0 vignette pointer-events-none" />
      {/* personagens do grupo */}
      <div className="absolute inset-x-0 bottom-0 h-[78%] flex items-end justify-center px-6 z-[5]">
        {ordered.map((c, i) => <Portrait key={c.id} c={c} self={c.id === self.id} index={i} total={total} walking={moving && t.mode !== 'vehicle'} onClick={() => onCharacterClick?.(c)} />)}
        {nearby.map((n, i) => <Portrait key={`n${n.id}`} c={n} self={false} index={ordered.length + i} total={total} dim walking={n.travelStatus === 'active' && n.mode !== 'vehicle'} note={nearbyNote(n)} onClick={() => setPick(n)} />)}
      </div>
      <div className="absolute inset-x-0 top-0 h-[30%] bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
      {/* painel da viagem */}
      <section aria-label="Viagem em andamento" className="absolute top-4 max-sm:top-2 left-1/2 -translate-x-1/2 w-[min(720px,92%)] max-sm:w-[calc(100%-16px)] panel panel-plate p-4 pl-6 max-sm:p-3 max-sm:pl-4 anim-clipboard z-10">
        <div className="flex items-center gap-2 text-[13.5px] text-amber-450">
          <GameIcon name={t.mode === 'vehicle' ? 'vehicle' : 'travel'} size={17} />
          {paused ? (t.mode === 'vehicle' ? 'Veículo parado' : 'Parados no caminho') : t.mode === 'vehicle' ? 'Dirigindo' : 'Caminhando'}
          {ordered.length > 1 && <span className="text-ink-300">, grupo de {ordered.length}</span>}
        </div>
        <div className="flex items-center justify-between gap-3 mt-1 max-sm:flex-wrap max-sm:gap-2">
          <h2 className="font-display font-extrabold text-[30px] max-sm:text-[24px] leading-none truncate max-sm:whitespace-normal max-sm:w-full anim-stencil"><span className="text-ink-300">{t.fromName}</span> <span className="font-[family-name:var(--font-plate)] font-semibold text-[18px] text-ink-400 align-middle">até</span> {t.toName}</h2>
          <div className="flex items-center gap-3 shrink-0 max-sm:w-full max-sm:justify-between">
            <div className="font-[family-name:var(--font-plate)] font-semibold text-[17px] text-amber-450 bg-[#101109] border border-black px-2 py-0.5" role="timer" aria-live="off">{moving ? `${fmtDuration(t.durationMs - elapsed)} restantes` : paused ? `Parado, ${fmtDuration(t.durationMs - elapsed)} restantes` : t.status === 'combat' ? 'Em confronto' : 'Parado'}</div>
            {canPause && (
              <button className={`btn !py-1.5 ${paused ? 'btn-moss' : ''}`} disabled={busy} onClick={togglePause}
                title={paused ? 'Continuar a viagem' : leader ? 'Parar no caminho: o tempo da viagem congela para o grupo todo' : `Parar sozinho: ${leaderName ?? 'o grupo'} segue e chega antes; você continua indo para ${t.toName}`}>
                <GameIcon name={paused ? 'play' : 'pause'} size={16} />{paused ? 'Continuar' : leader ? 'Parar' : 'Ficar para trás'}
              </button>
            )}
            {canPause && (
              <button className="btn !py-1.5" disabled={busy} onClick={turnBack}
                title={leader ? `Voltar para ${t.fromName} pelo mesmo caminho (o grupo volta junto)` : `Deixar de acompanhar ${leaderName ?? 'o grupo'} e voltar sozinho para ${t.fromName}`}>
                <GameIcon name="route" size={16} />Dar meia-volta
              </button>
            )}
          </div>
        </div>
        <div className="mt-3"><Bar value={pct} color={t.status === 'awaiting_decision' ? '#d1382f' : paused ? '#6f8a96' : '#d98c1a'} /></div>
        <p className="text-[13.5px] text-ink-300 mt-2.5 max-w-[68ch]">
          {paused ? (ordered.length > 1 ? 'O tempo da viagem está congelado para o grupo todo. Conversem pelo chat e qualquer um pode retomar.' : 'Você está parado na estrada. Quem passar por perto vai te ver e pode conversar com você.')
            : !leader ? `Você está acompanhando ${leaderName ?? 'o grupo'}. Se parar, fica para trás, mas continua indo para ${t.toName}.`
            : 'A viagem continua no servidor mesmo se você fechar o navegador. Use Parar para interagir com quem viaja junto.'}
        </p>
        {nearby.length > 0 && (
          <div className="mt-3 pt-3 border-t border-ink-700">
            <div className="label flex items-center gap-1.5 mb-1.5"><GameIcon name="observe" size={14} />À vista na estrada (o chat Local chega até eles)</div>
            <div className="flex flex-wrap gap-1.5">
              {nearby.map((n) => (
                <button key={n.id} className="btn !py-1 !text-[11.5px]" disabled={busy || !canPause || n.mode === 'vehicle' || t.mode === 'vehicle'} onClick={() => setPick(n)}
                  title={n.mode === 'vehicle' ? 'Está de veículo' : `Acompanhar ${n.name}`}>
                  <GameIcon name="follow" size={15} />{n.name.split(' ')[0]} <span className="font-sans font-normal text-[12.5px] text-ink-300">{nearbyNote(n)}, {n.distance} m</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
      {pick && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20 anim-fade" onClick={() => setPick(null)} onKeyDown={(e) => e.key === 'Escape' && setPick(null)}>
          <div ref={pickRef} role="dialog" aria-modal="true" aria-label={`Acompanhar ${pick.name}`} className="panel panel-plate w-[min(460px,92%)] p-5 anim-clipboard" onClick={(e) => e.stopPropagation()}>
            <div className="label text-amber-450 flex items-center gap-1.5"><GameIcon name="follow" size={15} />Acompanhar na estrada</div>
            <div className="font-display font-extrabold text-[28px] leading-none mt-1">{pick.name}</div>
            <p className="text-[14.5px] text-ink-200 mt-2">{pick.travelStatus === 'paused' ? 'Está parado(a) na estrada' : `Está a caminho de ${pick.toName}`}, a uns {pick.distance} m de você.</p>
            <p className="text-[14px] text-ink-300 mt-3">
              Se acompanhar, você {leader && ordered.length > 1 ? 'e quem segue você passam' : 'passa'} a fazer o mesmo trajeto, no mesmo ritmo, e vai para <b className="text-ink-100">{pick.toName}</b> em vez de {t.toName}.
              {' '}Se depois você parar, {pick.name.split(' ')[0]} chega antes, mas você continua indo para o mesmo lugar.
            </p>
            {(pick.mode === 'vehicle' || t.mode === 'vehicle') && <p className="text-blood-400 text-[14px] mt-2 flex gap-1.5"><GameIcon name="danger" size={16} className="shrink-0" />Não dá para acompanhar a pé quem está de veículo (nem o contrário).</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn btn-ghost" autoFocus onClick={() => setPick(null)}>Cancelar</button>
              <button className="btn btn-moss" disabled={busy || !canPause || pick.mode === 'vehicle' || t.mode === 'vehicle'} onClick={() => join(pick)}><GameIcon name="follow" size={16} />Acompanhar</button>
            </div>
          </div>
        </div>
      )}
      {t.status === 'awaiting_decision' && <DecisionModal />}
    </div>
  );
}

function DecisionModal() {
  const { self } = useGame();
  const [busy, setBusy] = useState(false);
  const enc = self?.travel?.encounter;
  const kind = enc?.kind === 'roadblock' ? 'roadblock' : 'combat';
  return (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20 anim-fade">
      <div role="alertdialog" aria-modal="true" aria-labelledby="enc-title" className="panel panel-plate w-[min(560px,92%)] p-6 pt-8 relative anim-clipboard">
        <div aria-hidden className="absolute inset-x-0 top-0 h-2.5 bg-[repeating-linear-gradient(-45deg,#f0a73a_0_10px,#101109_10px_20px)]" />
        <h2 id="enc-title" className="flex items-center gap-2 font-display font-extrabold text-[30px] leading-none text-blood-400"><GameIcon name="danger" size={26} />Algo bloqueia o caminho</h2>
        <p className="mt-3 text-[17px] leading-snug text-ink-100">{enc?.text || 'Há perigo à frente.'}</p>
        <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-2 mt-5">
          {DECISIONS[kind].map((d) => (
            <button key={d.choice} disabled={busy} className={`btn !justify-start !items-start flex-col !gap-1 !py-3 text-left ${d.danger ? 'btn-danger' : ''}`}
              onClick={async () => { setBusy(true); await action('travel_decide', { choice: d.choice }); setBusy(false); }}>
              <span>{d.label}</span><span className="font-sans font-normal text-[12.5px] text-ink-300">{d.desc}</span>
            </button>
          ))}
        </div>
        <p className="text-[12.5px] text-ink-400 mt-3">A viagem fica parada até alguém do grupo decidir. Recarregar a página não ignora o perigo.</p>
      </div>
    </div>
  );
}
