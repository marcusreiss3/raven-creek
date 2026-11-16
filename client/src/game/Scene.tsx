import { useHud, ADVANCED_PANELS } from '../lib/hud';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, Wrench } from 'lucide-react';
import { useGame, type Panel } from '../lib/store';
import { action } from '../lib/socket';
import { api, portraitUrl, sceneUrl } from '../lib/api';
import type { SceneChar } from '../lib/types';
import { Bar, Gauge, Img, Tip, Confirm, fmtDuration, pad, WEATHER, PHASE, ROAD } from '../components/ui';
import { GameIcon, FactionEmblem, itemIcon } from '../components/GameIcon';
import { audio } from '../lib/audio';
import { RisenFigures, StoryHotspots } from './Stories';
import { HordeAlert, StopHidingButton } from './Hordes';
import { RouteBanner } from './WorldMap';
import { CampfireGlow, DogBadge, NatureActions, NatureHotspots, OwnerDog, SEASON_LABEL, StrayDogs } from './Nature';

const THREAT: Record<string, { text: string; tone: string }> = {
  nenhuma: { text: 'Sem infectados à vista', tone: 'text-moss-400' }, baixa: { text: 'Poucos infectados', tone: 'text-ink-300' },
  média: { text: 'Infectados por perto', tone: 'text-amber-450' }, alta: { text: 'Muitos infectados', tone: 'text-blood-400' }, horda: { text: 'Horda no local', tone: 'text-blood-400' },
};

// ───────────────────────── Barra superior ─────────────────────────
type Need = { key: string; icon: string; v: number; color: string; name: string; tip: string; critical?: boolean };
/** Necessidades do personagem, na ordem da barra (show: se vale mostrar agora). */
export function buildNeeds(self: NonNullable<ReturnType<typeof useGame.getState>['self']>) {
  const n = self.needs;
  const bleeding = self.wounds.some((w) => w.bleeding > 0.03 && !w.bandaged);
  const needs: (Need & { show: boolean })[] = [
    { key: 'health', show: true, icon: 'health', v: n.health, color: n.health < 40 ? '#e0554a' : '#9ab567', name: 'Saúde', tip: `Saúde geral: ${n.health}%`, critical: n.health < 30 },
    { key: 'blood', show: n.blood < 97, icon: bleeding ? 'bleeding' : 'blood', v: n.blood, color: '#c73a2e', name: 'Sangue', tip: `Sangue: ${Math.round(n.blood)}%${bleeding ? '\nVocê está sangrando: faça um curativo (Corpo).' : ''}`, critical: bleeding || n.blood < 60 },
    { key: 'hunger', show: true, icon: 'hunger', v: 100 - n.hunger, color: '#e09a3a', name: 'Fome', tip: `Fome: ${Math.round(n.hunger)}%`, critical: n.hunger > 80 },
    { key: 'thirst', show: true, icon: 'thirst', v: 100 - n.thirst, color: '#7fa9bf', name: 'Sede', tip: `Sede: ${Math.round(n.thirst)}%`, critical: n.thirst > 80 },
    { key: 'energy', show: true, icon: 'energy', v: n.energy, color: '#e6c24a', name: 'Energia', tip: `Energia de exploração: ${Math.round(n.energy)}\nUsada para vasculhar e construir. Recupera descansando e dormindo.`, critical: n.energy < 14 },
    { key: 'stamina', show: true, icon: 'stamina', v: (n.stamina / Math.max(1, n.staminaMax)) * 100, color: '#9ab567', name: 'Fôlego', tip: `Estamina: ${Math.round(n.stamina)}/${n.staminaMax}` },
    { key: 'sleep', show: n.sleepiness > 40, icon: 'sleep', v: 100 - n.sleepiness, color: '#a497cf', name: 'Sono', tip: `Sono: ${Math.round(n.sleepiness)}%`, critical: n.sleepiness > 85 },
    { key: 'pain', show: n.pain > 15, icon: 'pain', v: 100 - n.pain, color: '#e0554a', name: 'Dor', tip: `Dor: ${n.pain}`, critical: n.pain > 60 },
    { key: 'stress', show: n.stress > 50, icon: 'stress', v: 100 - n.stress, color: '#c48ad0', name: 'Estresse', tip: `Estresse: ${Math.round(n.stress)}`, critical: n.stress > 85 },
    { key: 'nicotine', show: (n.nicotine ?? 0) > 40, icon: 'nicotine', v: 100 - (n.nicotine ?? 0), color: '#c7a06a', name: 'Nicotina', tip: `Abstinência de nicotina: ${Math.round(n.nicotine ?? 0)}%\nEstresse sobe e a mira piora. Um cigarro (com isqueiro) resolve.`, critical: (n.nicotine ?? 0) > 80 },
    { key: 'alcohol', show: (n.alcohol ?? 0) > 40, icon: 'alcohol', v: 100 - (n.alcohol ?? 0), color: '#c46a74', name: 'Álcool', tip: `Abstinência de álcool: ${Math.round(n.alcohol ?? 0)}%\nTremores: mira bem pior, estresse alto.`, critical: (n.alcohol ?? 0) > 80 },
    { key: 'drunk', show: (n.drunk ?? 0) > 15, icon: 'drunk', v: 100 - (n.drunk ?? 0), color: '#e6c24a', name: 'Bêbado', tip: `Embriaguez: ${Math.round(n.drunk ?? 0)}%\nMenos dor, menos medo — e mira e passos piores.`, critical: (n.drunk ?? 0) > 70 },
    { key: 'temp', show: n.bodyTemp > 37.8 || n.bodyTemp < 36, icon: 'temperature', v: 50, color: n.bodyTemp > 37.8 ? '#e0554a' : '#7fa9bf', name: n.bodyTemp > 37.8 ? 'Febre' : 'Frio', tip: `Temperatura corporal: ${n.bodyTemp.toFixed(1)}°C`, critical: true },
  ];
  return needs;
}

export function TopBar() {
  const { self, scene, clock, set, user, connected } = useGame();
  const panel = useGame((s) => s.panel);
  useEffect(() => { if (panel) audio.sfx('ui_open', 0.4); }, [panel]);
  const simpleHud = useHud((h) => h.simple);
  // quantos indicadores cabem na barra (o resto vira um "+N" com a lista no balão)
  const needsRef = useRef<HTMLUListElement>(null); const [needCap, setNeedCap] = useState(20);
  useEffect(() => {
    const el = needsRef.current; if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => { const wide = window.innerWidth >= 1536; const item = wide ? 46 : 36; const gap = wide ? 14 : 8; const pad = wide ? 40 : 24; setNeedCap(Math.max(2, Math.floor((el.clientWidth - pad + gap) / (item + gap)))); };
    const ro = new ResizeObserver(measure); ro.observe(el); measure();
    return () => ro.disconnect();
  }, [!!self]);
  if (!self) return null;
  const c = clock ?? self.clock;
  const shown = buildNeeds(self).filter((x) => x.show);
  const slots = needCap - (self.protectedUntil ? 1 : 0);
  // críticos têm prioridade para aparecer; mantém a ordem original entre os visíveis
  const keep = shown.length <= slots ? shown : (() => { const pri = [...shown].sort((a, b) => Number(!!b.critical) - Number(!!a.critical)).slice(0, Math.max(1, slots - 1)); return shown.filter((x) => pri.includes(x)); })();
  const hidden = shown.filter((x) => !keep.includes(x));
  const btn = (p: Panel, icon: string, label: string, key: string) => {
    if (simpleHud && ADVANCED_PANELS.has(p)) return null;
    const on = panel === p;
    return (
      <Tip key={p} text={`${label} (${key})`}>
        <button aria-label={`${label} (tecla ${key})`} aria-pressed={on} className={`relative h-11 w-9 2xl:w-10 flex items-center justify-center transition-colors ${on ? 'text-amber-450' : 'text-ink-300 hover:text-ink-100'}`} onClick={() => set({ panel: on ? null : p })}>
          <GameIcon name={icon} size={21} />
          {on && <span className="absolute bottom-0 left-2 right-2 h-[3px] bg-amber-450 shadow-[0_0_10px_#f0a73a]" />}
        </button>
      </Tip>
    );
  };
  const travelName = self.travel ? `A caminho de ${self.travel.toName}` : null;
  const threat = THREAT[scene?.threat ?? ''];
  return (
    <header className="h-[64px] shrink-0 flex items-stretch relative z-20 panel !outline-none border-b border-black" style={{ boxShadow: '0 6px 18px -6px rgba(0,0,0,.9)' }}>
      {/* letreiro do local */}
      <div className="min-w-[120px] max-w-[22%] 2xl:max-w-[26%] flex flex-col justify-center pl-4 pr-4 2xl:pl-5 2xl:pr-6 border-r border-black/70">
        <h1 key={scene?.location.id ?? travelName} className="font-display font-extrabold text-[23px] 2xl:text-[28px] leading-[0.95] tracking-[.01em] truncate text-ink-100 anim-stencil">{travelName ?? scene?.location.name ?? self.locationName}</h1>
        <div className="flex items-center gap-3 text-[12.5px] mt-0.5 whitespace-nowrap overflow-hidden">
          {self.travel ? <span className="text-ink-400 flex items-center gap-1"><GameIcon name={self.travel.mode === 'vehicle' ? 'vehicle' : 'travel'} size={13} />{self.travel.mode === 'vehicle' ? 'De veículo' : 'A pé'}</span> : <>
            {threat && <span className={`flex items-center gap-1 ${threat.tone}`}><GameIcon name="zombie" size={13} />{threat.text}</span>}
            {scene && <span className="text-ink-400">{scene.location.indoor ? 'Interior' : 'Ao ar livre'}, {scene.looted}</span>}
          </>}
        </div>
      </div>
      {/* rádio: hora, estação e clima */}
      <div className="shrink-0 flex items-center gap-3 2xl:gap-4 px-3 2xl:px-5 border-r border-black/70">
        <Tip text={`${PHASE[c.phase]}, dia ${c.day}`}>
          <div className="flex flex-col items-center leading-none" aria-label={`${pad(c.hour)}:${pad(c.minute)}, ${PHASE[c.phase]}, dia ${c.day}`}>
            <span className="font-[family-name:var(--font-plate)] font-bold text-[25px] text-amber-450 tabular-nums" style={{ textShadow: '0 0 12px rgba(240,167,58,.55)' }}>{pad(c.hour)}:{pad(c.minute)}</span>
            <span className="text-[11.5px] text-ink-400 mt-1">Dia {c.day}</span>
          </div>
        </Tip>
        {c.season && <Tip text={`${SEASON_LABEL[c.season].name}, dia ${c.seasonDay ?? '?'} de ${c.daysPerSeason ?? '?'}\n${SEASON_LABEL[c.season].hint}`}>
          <span className="flex flex-col items-center gap-0.5 text-tape" aria-label={SEASON_LABEL[c.season].name}><GameIcon name={c.season} size={20} /><span className="text-[11.5px] text-ink-400 max-2xl:hidden">{SEASON_LABEL[c.season].name}</span></span>
        </Tip>}
        <Tip text={`${WEATHER[c.weather]}, ${c.temperature}°C`}>
          <span className="flex flex-col items-center gap-0.5 text-ink-200" aria-label={`${WEATHER[c.weather]}, ${c.temperature} graus`}><GameIcon name={c.weather} size={20} /><span className="text-[11.5px] text-ink-400 tabular-nums">{c.temperature}°C</span></span>
        </Tip>
      </div>
      {/* necessidades */}
      <ul ref={needsRef} className="flex-1 flex items-center gap-2 2xl:gap-3.5 px-3 2xl:px-5 min-w-0" aria-label="Necessidades">
        {keep.map((x) => (
          <li key={x.key} className="shrink-0">
            <Tip text={x.tip}>
              <div className="w-[36px] 2xl:w-[46px] flex flex-col items-center gap-1" aria-label={`${x.name}: ${Math.round(x.v)}%${x.critical ? ', crítico' : ''}`}>
                <span className="relative" style={{ color: x.critical ? '#e0554a' : '#cfc9b2' }}>
                  <GameIcon name={x.icon} size={20} />
                  {x.critical && <span className="absolute -top-1 -right-2 w-[13px] h-[13px] rounded-full bg-blood-500 text-white text-[10px] font-bold leading-[13px] text-center pulse-red" aria-hidden>!</span>}
                </span>
                <Gauge value={x.v} color={x.color} />
              </div>
            </Tip>
          </li>
        ))}
        {hidden.length > 0 && (
          <li className="shrink-0">
            <Tip text={hidden.map((x) => x.tip.split('\n')[0]).join('\n')}>
              <span className={`h-9 min-w-[30px] px-1 flex items-center justify-center border text-[13px] tabular-nums ${hidden.some((x) => x.critical) ? 'border-blood-500 text-blood-400' : 'border-ink-600 text-ink-300'}`} aria-label={`Mais ${hidden.length} indicadores: ${hidden.map((x) => x.name).join(', ')}`} tabIndex={0}>+{hidden.length}</span>
            </Tip>
          </li>
        )}
        {self.protectedUntil && <li className="shrink-0"><Tip text="Proteção de novato: você não pode ser atacado por outros jogadores."><span className="text-moss-400 flex" aria-label="Proteção de novato ativa"><GameIcon name="protection" size={20} /></span></Tip></li>}
      </ul>
      {/* painéis */}
      <nav className="ml-auto shrink-0 flex items-center pr-2" aria-label="Painéis">
        {!connected && <span className="chip text-blood-400 mr-2 pulse-red">Reconectando…</span>}
        {btn('inventory', 'inventory', 'Inventário', 'I')}{btn('body', 'body', 'Corpo', 'B')}{btn('skills', 'skills', 'Habilidades', 'K')}
        {btn('crafting', 'crafting', 'Fabricação', 'C')}{btn('base', 'base', 'Base', 'H')}{btn('projects', 'projects', 'Projetos da comunidade', 'G')}{btn('faction', 'faction', 'Facção', 'F')}{btn('map', 'map', 'Mapa', 'M')}
        {btn('journal', 'journal', 'Diário', 'J')}{btn('character', 'character', 'Personagem', 'P')}{btn('settings', 'settings', 'Som e opções', 'O')}
        <span className="w-px h-7 bg-black/70 mx-1.5" />
        {user && user.role !== 'player' && <Tip text="Painel administrativo"><a className="h-11 w-9 2xl:w-10 flex items-center justify-center text-amber-450 hover:brightness-125" href="#/admin" aria-label="Painel administrativo"><Wrench size={18} /></a></Tip>}
        <Tip text="Sair"><button className="h-11 w-9 2xl:w-10 flex items-center justify-center text-ink-400 hover:text-blood-400" aria-label="Sair da conta" onClick={async () => { await api('/auth/logout', { method: 'POST' }); location.reload(); }}><LogOut size={18} /></button></Tip>
      </nav>
    </header>
  );
}

// ───────────────────────── Palco da visual novel (camadas) ─────────────────────────
/**
 * `musicKey` troca a trilha do local (Dia 1: música calma antes da queda) e `sceneVariant` usa outra versão da arte do
 * local, se existir (ex.: `hospital_lobby_antes.webp`, o hospital antes do apocalipse); senão, a arte normal.
 */
export function SceneStage({ onCharacterClick, compact, musicKey, sceneVariant }: { onCharacterClick: (c: SceneChar) => void; compact?: boolean; musicKey?: string; sceneVariant?: string }) {
  const { scene, self, clock } = useGame();
  const [title, setTitle] = useState<string | null>(null);
  useEffect(() => { if (scene?.location.id) { setTitle(scene.location.name); const t = setTimeout(() => setTitle(null), 2800); return () => clearTimeout(t); } }, [scene?.location.id]);
  // Trilha: a do local, ou a de "ferido" quando a pessoa está perdendo muito sangue.
  const critical = !!self && (self.needs.blood < 60 || !!self.needs.unconscious);
  useEffect(() => { if (scene?.location.id) audio.music(critical ? 'wounded' : musicKey ?? scene.location.musicKey); }, [scene?.location.id, scene?.location.musicKey, critical, musicKey]);
  // Ambiente: chuva (abafada dentro de casa) ou vento ao ar livre.
  const weatherNow = clock?.weather ?? scene?.time.weather;
  const indoorNow = !!scene?.location.indoor;
  useEffect(() => {
    if (!scene) return;
    if (weatherNow === 'rain' || weatherNow === 'storm') audio.ambient('rain', indoorNow ? 0.22 : weatherNow === 'storm' ? 0.75 : 0.5);
    else if (!indoorNow) audio.ambient('wind', weatherNow === 'fog' || weatherNow === 'snow' ? 0.38 : 0.2);
    else audio.ambient(null);
  }, [scene?.location.id, weatherNow, indoorNow]);
  // Porta: ao entrar num lugar fechado ou sair para a rua.
  const prevIndoor = useRef<boolean | null>(null);
  useEffect(() => {
    if (!scene) return;
    const before = prevIndoor.current; prevIndoor.current = indoorNow;
    if (before !== null && before !== indoorNow) audio.sfx(indoorNow ? 'door_open' : 'door_close', 0.6);
  }, [scene?.location.id]);
  // Coração disparado com estresse muito alto (quando não está tocando a trilha de ferido, que já tem batimento).
  const panic = !!self && self.needs.stress > 85 && !critical;
  useEffect(() => { if (!panic) return; audio.sfx('heartbeat', 0.45); const t = setInterval(() => audio.sfx('heartbeat', 0.45), 9000); return () => clearInterval(t); }, [panic]);
  if (!scene || !self) return <div className="flex-1 bg-ink-950" />;
  const present = scene.characters.filter((c) => c.online || c.id === self.id);
  const absent = scene.characters.filter((c) => !c.online && c.id !== self.id);
  const phase = clock?.phase ?? scene.time.phase; const weather = clock?.weather ?? scene.time.weather;
  return (
    <main className={`relative overflow-hidden bg-black select-none noise ${compact ? 'h-full compact-stage' : 'flex-1'}`} aria-label={`Cena: ${scene.location.name}`}>
      <Img key={scene.location.sceneKey + (sceneVariant ?? '')} src={sceneUrl(scene.location.sceneKey + (sceneVariant ?? ''))} fallback={sceneVariant ? sceneUrl(scene.location.sceneKey) : '/assets/scenes/street_city_01.webp'} className="absolute inset-0 w-full h-full object-cover anim-fade scale-[1.03]" />
      <div className="absolute inset-0 pointer-events-none transition-all duration-[3000ms]" style={{ background: phase === 'night' ? (scene.powered ? 'rgba(40,30,20,.32)' : 'rgba(6,10,26,.62)') : phase === 'dusk' ? 'rgba(80,35,10,.28)' : phase === 'dawn' ? 'rgba(60,50,80,.22)' : 'transparent', mixBlendMode: 'multiply' }} />
      {phase === 'night' && scene.powered && <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 20%, rgba(255,190,110,.16), transparent 60%)', mixBlendMode: 'screen' }} />}
      {!scene.location.indoor && (weather === 'rain' || weather === 'storm') && <div className={`absolute inset-0 pointer-events-none fx-rain ${weather === 'storm' ? 'fx-storm' : ''}`} />}
      {!scene.location.indoor && weather === 'fog' && <div className="absolute -inset-20 pointer-events-none fx-fog" />}
      {!scene.location.indoor && weather === 'snow' && <div className="absolute inset-0 pointer-events-none fx-snow" />}
      <CampfireGlow />
      <div className="absolute inset-0 vignette pointer-events-none" />
      <div className={`absolute inset-x-0 bottom-0 h-[86%] flex items-end justify-center gap-0 ${compact ? 'px-1' : 'px-6'}`}>
        {present.map((c, i) => <Portrait key={c.id} c={c} self={c.id === self.id} index={i} total={present.length} onClick={() => onCharacterClick(c)} />)}
      </div>
      <div className="absolute inset-0 pointer-events-none"><RisenFigures /><StrayDogs /></div>
      {self.needs.blood < 60 && <div className="absolute inset-0 pointer-events-none pulse-red" style={{ boxShadow: 'inset 0 0 160px 30px rgba(140,10,10,.55)' }} />}
      {self.needs.unconscious && <div className="absolute inset-0 bg-black/85 flex items-center justify-center z-10"><div className="text-center"><GameIcon name="skull" size={40} className="mx-auto text-blood-400" /><div className="font-display font-extrabold text-4xl mt-2">Inconsciente</div><div className="text-ink-300 mt-1">Outros podem tratar seus ferimentos. Você ainda vê o chat.</div></div></div>}
      {!compact && <div className="absolute top-3 left-3 right-3 flex flex-wrap gap-2.5 items-start z-10">
        <SceneHotspots />
      </div>}
      {absent.length > 0 && !compact && <div className="absolute bottom-3 left-3 z-10 text-[13px] text-ink-300 bg-[#101109cc] px-2.5 py-1 border border-ink-700">Dormindo por aqui (offline): {absent.map((a) => a.name).join(', ')}</div>}
      {title && (
        <div className="absolute inset-x-0 top-[17%] flex justify-center pointer-events-none z-10" aria-hidden>
          <div className={`relative bg-[#0e0f0acc] border-y border-tape/30 anim-fade ${compact ? 'px-5 py-2.5 max-w-[92%]' : 'px-10 py-4'}`}>
            <div className="text-center text-[14px] text-tape/90">{scene.time.day ? `Dia ${scene.time.day}, ${pad(scene.time.hour)}:${pad(scene.time.minute)}` : ''}</div>
            <div className={`font-display font-extrabold leading-none text-ink-100 anim-stencil ${compact ? 'text-[34px] text-center' : 'text-[54px]'}`} style={{ textShadow: '0 3px 0 rgba(0,0,0,.6)' }}>{title}</div>
          </div>
        </div>
      )}
    </main>
  );
}

export function Portrait({ c, self, index, total, onClick, walking, note, dim }: { c: SceneChar; self: boolean; index: number; total: number; onClick: () => void; walking?: boolean; note?: string; dim?: boolean }) {
  const a = c.portraitAdjust ?? { scale: 1, x: 0, y: 0 };
  const width = Math.min(34, 92 / Math.max(1, total));
  const sleeping = c.activity === 'sleeping'; const down = c.visibleCondition === 'inconsciente';
  const typing = useGame((st) => (st.typing[c.id] ?? 0) > Date.now());
  return (
    <div role="button" tabIndex={0} aria-label={`${c.name}${self ? ' (você)' : ''}`} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
      className={`relative h-full portrait portrait-enter cursor-pointer group ${dim ? 'opacity-80' : ''}`} style={{ width: `${width}%`, zIndex: self ? 5 : 4 - Math.abs(index - total / 2), animationDelay: `${index * 60}ms`, ...(dim ? { height: '88%', filter: 'brightness(.8) saturate(.85)' } : {}) }} onClick={onClick}>
      <div className={`absolute inset-x-0 bottom-0 h-full flex items-end justify-center ${walking ? 'walk-bob' : ''}`} style={{ transform: `translateX(${a.x}%) translateY(${-a.y}%) scale(${a.scale})`, transformOrigin: 'bottom center', animationDelay: `${-index * 0.37}s` }}>
        <Img src={portraitUrl(c.portrait)} fallback="/assets/portraits/default.png" className={`h-full w-auto max-w-none object-contain object-bottom transition duration-300 drop-shadow-[0_12px_24px_rgba(0,0,0,.9)] group-hover:brightness-110 ${down ? 'grayscale brightness-50' : sleeping ? 'brightness-75' : ''}`} />
        {typing && <TypingBubble />}
      </div>
      <OwnerDog ownerId={c.id} isSelf={self} walking={walking} />
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap flex flex-col items-center z-[8]">
        <span className="tape !text-[17px]" style={self ? { background: 'linear-gradient(180deg,#f4c060,#e3a33f)', rotate: '1deg' } : undefined}>{c.name}</span>
        <div className="flex justify-center gap-1 mt-1.5">
          {note && <span className="chip text-amber-200">{note}</span>}
          <DogBadge ownerId={c.id} />
          {sleeping && <span className="chip text-[#b9addf]"><GameIcon name="sleep" size={12} />dormindo</span>}
          {c.activity === 'resting' && <span className="chip text-ink-200"><GameIcon name="rest" size={12} />descansando</span>}
          {c.state === 'busy' && <span className="chip text-amber-450"><GameIcon name="crafting" size={12} />ocupado</span>}
          {c.inCombat && <span className="chip text-blood-400"><GameIcon name="combat" size={12} />em combate</span>}
          {c.visibleCondition !== 'normal' && !sleeping && <span className="chip text-blood-400"><GameIcon name="bleeding" size={12} />{c.visibleCondition}</span>}
        </div>
      </div>
    </div>
  );
}

/** Balão "..." sobre a cabeça de quem está digitando: um pedaço de papel. */
function TypingBubble() {
  return (
    <div className="absolute top-[3%] left-1/2 translate-x-[18%] z-10 pointer-events-none typing-pop" aria-hidden>
      <div className="relative panel-paper px-3.5 py-2 rotate-[-2deg]">
        <div className="flex gap-1 items-center h-2.5"><span className="typing-dot" /><span className="typing-dot" style={{ animationDelay: '.18s' }} /><span className="typing-dot" style={{ animationDelay: '.36s' }} /></div>
        <div className="absolute -bottom-1.5 left-3 w-3 h-3 rotate-45" style={{ background: '#d9cca8' }} />
      </div>
    </div>
  );
}

/** Coisas da cena: pregadas como etiquetas/placas sobre o cenário. */
export function Hotspot({ icon, children, onClick, tone = 'default', title, disabled }: { icon: string; children: React.ReactNode; onClick?: () => void; tone?: 'default' | 'danger' | 'go' | 'warm'; title?: string; disabled?: boolean }) {
  const color = { default: 'text-ink-100', danger: 'text-blood-400', go: 'text-moss-400', warm: 'text-amber-450' }[tone];
  const bar = { default: '#6b705a', danger: '#bf3a2f', go: '#8aa45e', warm: '#f0a73a' }[tone];
  return (
    <button disabled={disabled} title={title} onClick={onClick}
      className={`group flex items-center gap-2 pl-2 pr-3 min-h-9 text-[14px] font-semibold bg-[#14150fe6] border border-black shadow-[0_4px_10px_rgba(0,0,0,.6)] hover:bg-[#1f2117f0] disabled:opacity-50 ${color}`}
      style={{ borderLeft: `4px solid ${bar}` }}>
      <GameIcon name={icon} size={18} />
      <span className="text-ink-100 group-hover:text-white text-left">{children}</span>
    </button>
  );
}

export function SceneHotspots() {
  const { scene, self, set } = useGame();
  if (!scene || !self) return null;
  return (
    <>
      <RouteBanner />
      {scene.combats.map((cb) => <CombatHotspot key={cb.id} id={cb.id} reason={cb.reason} />)}
      {scene.ground.length > 0 && (
        <div className="bg-[#14150fe6] border border-black shadow-[0_4px_10px_rgba(0,0,0,.6)] px-3 py-2 max-w-sm" style={{ borderLeft: '4px solid #d8c79a' }}>
          <div className="text-[13px] text-tape mb-1.5 flex items-center gap-1.5"><GameIcon name="ground" size={15} />No chão, clique para pegar</div>
          <div className="flex flex-wrap gap-1">
            {scene.ground.slice(0, 14).map((g) => (
              <button key={g.id} className="chip text-ink-100 hover:text-amber-450" onClick={() => action('pickup', { itemId: g.id })} aria-label={`Pegar ${g.name}`}>
                <GameIcon name={itemIcon(g.defId, g.category)} size={13} />{g.name}{g.quantity > 1 ? ` ×${g.quantity}` : ''}
              </button>
            ))}
            {scene.ground.length > 14 && <span className="chip text-ink-300">mais {scene.ground.length - 14}</span>}
          </div>
        </div>
      )}
      {scene.containers.map((ct) => <Hotspot key={ct.id} icon={ct.kind === 'corpse' ? 'corpse' : ct.kind === 'stash' ? 'safe' : 'container'} tone={ct.kind === 'corpse' ? 'danger' : 'default'} onClick={() => set({ modal: { kind: 'container', data: ct } })}>{ct.name}</Hotspot>)}
      {scene.vehicles.map((v) => <Hotspot key={v.id} icon="vehicle" onClick={() => set({ modal: { kind: 'vehicle', data: v } })}>{v.name}{v.running ? ', motor ligado' : ''}</Hotspot>)}
      {scene.base && (
        <button onClick={() => set({ panel: 'base' })} className="flex items-center gap-2 pl-2 pr-3 min-h-9 text-[14px] font-semibold bg-[#14150fe6] border border-black shadow-[0_4px_10px_rgba(0,0,0,.6)] hover:bg-[#1f2117f0]" style={{ borderLeft: `4px solid ${scene.base.faction?.color ?? '#8aa45e'}` }}>
          {scene.base.faction ? <FactionEmblem emblem={scene.base.faction.emblem} color={scene.base.faction.color} size={18} /> : <GameIcon name="base" size={18} className="text-moss-400" />}
          <span>{scene.base.name}</span>
        </button>
      )}
      {scene.project && <Hotspot icon="projects" tone="warm" onClick={() => set({ panel: 'projects' })}>Obra: {scene.project.name}</Hotspot>}
      <NatureHotspots />
      <StoryHotspots />
      {scene.powered && <span className="chip text-amber-200 self-center"><GameIcon name="power" size={13} />Luz elétrica</span>}
    </>
  );
}

function CombatHotspot({ id, reason }: { id: number; reason: string }) {
  const { scene, self } = useGame();
  const [side, setSide] = useState(false);
  const pvp = /atacou/.test(reason);
  return (
    <div className="bg-[#1c0d0bea] border border-black shadow-[0_4px_14px_rgba(0,0,0,.7)] px-3 py-2.5 max-w-md" style={{ borderLeft: '4px solid #bf3a2f' }} role="alert">
      <div className="text-blood-400 font-semibold flex items-center gap-1.5"><GameIcon name="combat" size={17} />Confronto acontecendo aqui</div>
      <div className="text-[13.5px] text-ink-200 my-1.5">{reason}</div>
      <div className="flex gap-1.5">
        <button className="btn !min-h-8 !py-1" onClick={async () => { const r = await action('combat_view', { combatId: id }); if (r.ok) useGame.getState().set({ combat: r.combat }); }}>Assistir</button>
        {!pvp && <button className="btn btn-danger !min-h-8 !py-1" onClick={() => action('combat_join', { combatId: id })}>Entrar para ajudar</button>}
        {pvp && !side && <button className="btn btn-danger !min-h-8 !py-1" onClick={() => setSide(true)}>Intervir</button>}
        {pvp && side && scene?.characters.filter((c) => c.inCombat && c.id !== self?.id).map((c) => <button key={c.id} className="btn !min-h-8 !py-1" onClick={() => action('combat_join', { combatId: id, sideCharacterId: c.id })}>Do lado de {c.name.split(' ')[0]}</button>)}
      </div>
    </div>
  );
}

// ───────────────────────── Barra de ações e saídas ─────────────────────────
export function ActionBar() {
  const { self, scene } = useGame();
  const [now, setNow] = useState(Date.now());
  const [observe, setObserve] = useState(false);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  if (!self || !scene) return null;
  const busy = self.state === 'busy' && self.busyUntil;
  const progress = busy ? Math.min(1, (now - (self.busyAction?.startedAt ?? now)) / Math.max(1, new Date(self.busyUntil!).getTime() - (self.busyAction?.startedAt ?? now))) : 0;
  const lowEnergy = self.needs.energy < 14;
  return (
    <div className="shrink-0 panel !outline-none border-t border-black px-4 py-3 flex gap-5 items-stretch relative z-20" style={{ boxShadow: '0 -6px 18px -6px rgba(0,0,0,.9)' }}>
      <div className="flex flex-col gap-2 min-w-0">
        <HordeAlert />
        <div className="flex gap-1.5 flex-wrap" role="toolbar" aria-label="Ações">
          <Tip text={lowEnergy ? 'Sem energia de exploração. Descanse ou durma; conversar, negociar e organizar continua liberado.' : 'Vasculhar o local. Gasta energia e estamina e faz barulho.'}>
            <button className="btn btn-moss" disabled={!!busy || self.state !== 'idle' || lowEnergy} onClick={() => { action('explore'); audio.sfx('footsteps', 0.5); }}>
              <GameIcon name="search" size={18} />Vasculhar<kbd className="ml-1 px-1.5 text-[12px] font-sans font-bold bg-black/30 border border-black/40 text-[#e8e0c4]">E</kbd>
            </button>
          </Tip>
          <button className="btn" onClick={() => setObserve(true)}><GameIcon name="observe" size={18} />Observar</button>
          {self.activity === 'idle' ? (
            <>
              <button className="btn" disabled={self.state !== 'idle'} onClick={() => action('rest')}><GameIcon name="rest" size={18} />Descansar</button>
              <button className="btn" disabled={self.state !== 'idle'} onClick={() => action('sleep')}><GameIcon name="sleep-bag" size={18} />Dormir</button>
            </>
          ) : <button className="btn" onClick={() => action('wake')}><GameIcon name="wake" size={18} />{self.activity === 'sleeping' ? 'Acordar' : 'Levantar'}</button>}
          <NatureActions busy={!!busy} />
          {self.followingId && <button className="btn" onClick={() => action('follow', { targetId: null })}><GameIcon name="follow" size={18} />Parar de seguir</button>}
        </div>
        {busy && (
          <div className="w-full max-w-md" role="status">
            <div className="flex justify-between text-[13px] mb-1"><span className="text-amber-450 font-semibold">{self.busyAction?.label ?? 'Ocupado'}…</span><span className="text-ink-300 tabular-nums">{fmtDuration(new Date(self.busyUntil!).getTime() - now)}</span></div>
            <Bar value={progress * 100} color="#f0a73a" />
            <StopHidingButton />
          </div>
        )}
      </div>
      <ExitsPanel />
      {observe && <ObserveModal onClose={() => setObserve(false)} />}
    </div>
  );
}

/** Celular: ações em grade de botões grandes, barra de "ocupado" e aviso de energia. */
export function MobileActions() {
  const { self, scene } = useGame();
  const [now, setNow] = useState(Date.now());
  const [observe, setObserve] = useState(false);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  if (!self || !scene) return null;
  const busy = self.state === 'busy' && self.busyUntil;
  const progress = busy ? Math.min(1, (now - (self.busyAction?.startedAt ?? now)) / Math.max(1, new Date(self.busyUntil!).getTime() - (self.busyAction?.startedAt ?? now))) : 0;
  const lowEnergy = self.needs.energy < 14;
  return (
    <section aria-label="Ações">
      <HordeAlert mobile />
      {busy && (
        <div className="mb-3" role="status">
          <div className="flex justify-between text-[14px] mb-1"><span className="text-amber-450 font-semibold">{self.busyAction?.label ?? 'Ocupado'}…</span><span className="text-ink-300 tabular-nums">{fmtDuration(new Date(self.busyUntil!).getTime() - now)}</span></div>
          <Bar value={progress * 100} color="#f0a73a" />
          <StopHidingButton />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 [&_.btn]:w-full [&_.btn]:justify-start [&_.btn]:min-h-[50px] [&_.btn]:text-[16.5px]" role="toolbar" aria-label="Ações">
        <button className="btn btn-moss col-span-2 !justify-center" disabled={!!busy || self.state !== 'idle' || lowEnergy} onClick={() => { action('explore'); audio.sfx('footsteps', 0.5); }}><GameIcon name="search" size={20} />Vasculhar o local</button>
        <button className="btn" onClick={() => setObserve(true)}><GameIcon name="observe" size={19} />Observar</button>
        {self.activity === 'idle' ? (
          <>
            <button className="btn" disabled={self.state !== 'idle'} onClick={() => action('rest')}><GameIcon name="rest" size={19} />Descansar</button>
            <button className="btn" disabled={self.state !== 'idle'} onClick={() => action('sleep')}><GameIcon name="sleep-bag" size={19} />Dormir</button>
          </>
        ) : <button className="btn" onClick={() => action('wake')}><GameIcon name="wake" size={19} />{self.activity === 'sleeping' ? 'Acordar' : 'Levantar'}</button>}
        <NatureActions busy={!!busy} />
        {self.followingId && <button className="btn" onClick={() => action('follow', { targetId: null })}><GameIcon name="follow" size={19} />Parar de seguir</button>}
      </div>
      {lowEnergy && <p className="text-[13px] text-amber-200 mt-2">Sem energia para vasculhar. Descanse ou durma; conversar, negociar e organizar continua liberado.</p>}
      {observe && <ObserveModal onClose={() => setObserve(false)} />}
    </section>
  );
}

export function ExitsPanel({ mobile }: { mobile?: boolean } = {}) {
  const { scene, self } = useGame();
  const [preview, setPreview] = useState<Record<string, { durationMs: number; factors: { label: string; mult: number }[] }>>({});
  const [confirm, setConfirm] = useState<null | { toId: string; name: string }>(null);
  if (!scene || !self) return null;
  const driving = !!self.vehicleId && scene.vehicles.some((v) => v.driverId === self.id && v.running);
  const load = async (toId: string) => { if (preview[toId]) return; const r = await action('travel_preview', { toId }, { silent: true }); if (r.ok) setPreview((p) => ({ ...p, [toId]: r as any })); };
  const dist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
  const confirmSheet = confirm && (
    <Confirm danger={false} title={`Partir para ${confirm.name}?`} confirmLabel="Partir a pé" onCancel={() => setConfirm(null)}
      onConfirm={() => { action('travel', { toId: confirm.toId }); setConfirm(null); }}
      text={<div>
        <p>A viagem leva tempo real e não pode ser cancelada recarregando a página; só voltando pelo caminho.</p>
        {preview[confirm.toId] && <p className="mt-2 text-ink-300">Tempo estimado a pé: {fmtDuration(preview[confirm.toId].durationMs)}</p>}
        {scene.characters.some((c) => c.followingId === self.id) && <p className="mt-2 text-moss-400">Quem está seguindo você vai junto.</p>}
        <div className="flex flex-wrap gap-2 mt-3">
          {driving && <button className="btn btn-moss" onClick={() => { action('travel', { toId: confirm.toId, vehicle: true }); setConfirm(null); }}><GameIcon name="vehicle" size={16} />Ir de veículo</button>}
          {!self.vehicleId && <button className="btn" disabled={self.needs.stamina < 25} onClick={() => { action('travel', { toId: confirm.toId, run: true }); setConfirm(null); }}
            title="Chega na metade do tempo, mas cansa (−20 de fôlego) e o barulho dobra a chance de dar de cara com zumbis"><GameIcon name="travel" size={16} />Ir correndo{preview[confirm.toId] ? ` (${fmtDuration(preview[confirm.toId].durationMs / 2)})` : ''}</button>}
        </div>
        {!self.vehicleId && <p className="mt-1.5 text-[12.5px] text-ink-400">Correndo: metade do tempo, gasta fôlego e dobra a chance de encontros.{self.needs.stamina < 25 ? ' Você está sem fôlego para correr agora.' : ''}</p>}
      </div>} />
  );
  if (mobile) return (
    <nav aria-label="Saídas">
      <h2 className="text-[14px] text-tape mb-2 flex items-center gap-1.5"><GameIcon name="route" size={16} />Daqui dá para ir a</h2>
      <ul className="border border-black bg-[#101109]/70 divide-y divide-black/70">
        {scene.exits.map((e) => (
          <li key={e.toId}>
            <button disabled={e.blocked || self.state !== 'idle'} onClick={() => { load(e.toId); setConfirm({ toId: e.toId, name: e.name }); }}
              className="w-full flex items-center gap-3 px-3 min-h-[52px] text-left active:bg-black/40 disabled:opacity-50">
              <GameIcon name={e.blocked ? 'lock' : e.regionChange ? 'travel' : 'route'} size={18} className={e.regionChange ? 'text-amber-450 shrink-0' : 'text-ink-400 shrink-0'} />
              <span className="flex-1 min-w-0">
                <span className={`block font-[family-name:var(--font-plate)] font-bold text-[17px] leading-tight truncate ${e.blocked ? 'line-through text-ink-400' : 'text-ink-100'}`}>{e.name}</span>
                <span className="block text-[12.5px] text-ink-400">{e.blocked ? `Bloqueado${e.blockedReason ? `: ${e.blockedReason}` : ''}` : `${dist(e.distance)} por ${ROAD[e.roadType]}${e.regionChange ? ', outra região' : ''}`}</span>
              </span>
              <span className="text-ink-500 text-[22px] leading-none" aria-hidden>›</span>
            </button>
          </li>
        ))}
      </ul>
      {confirmSheet}
    </nav>
  );
  return (
    <nav className="ml-auto min-w-0 flex-1 max-w-[52%]" aria-label="Saídas">
      <h2 className="text-[13px] text-tape mb-1.5 flex items-center gap-1.5"><GameIcon name="route" size={15} />Daqui dá para ir a</h2>
      <div className="flex flex-wrap gap-1.5 max-h-[118px] overflow-y-auto pr-1">
        {scene.exits.map((e) => (
          <Tip key={e.toId} text={e.blocked ? `Bloqueado: ${e.blockedReason ?? ''}` : `${dist(e.distance)} por ${ROAD[e.roadType]}\n${preview[e.toId] ? `Tempo estimado: ${fmtDuration(preview[e.toId].durationMs)}${preview[e.toId].factors.length ? '\n' + preview[e.toId].factors.map((f) => `${f.label} ×${f.mult.toFixed(2)}`).join('\n') : ''}` : 'Calculando…'}`}>
            <button onMouseEnter={() => load(e.toId)} onFocus={() => load(e.toId)} disabled={e.blocked || self.state !== 'idle'} onClick={() => setConfirm({ toId: e.toId, name: e.name })}
              className={`btn !min-h-8 !py-1 !text-[14.5px] ${e.blocked ? 'line-through' : ''}`} style={e.regionChange ? { boxShadow: 'inset 3px 0 0 #f0a73a, inset 0 1px 0 rgba(255,255,255,.12)' } : undefined}>
              {e.regionChange && <GameIcon name="travel" size={14} className="text-amber-450" label="Muda de região" />}{e.name}
            </button>
          </Tip>
        ))}
      </div>
      {confirmSheet}
    </nav>
  );
}

function ObserveModal({ onClose }: { onClose: () => void }) {
  const { scene } = useGame();
  if (!scene) return null;
  const threat = THREAT[scene.threat];
  return (
    <Confirm danger={false} title={scene.location.name} confirmLabel="Fechar" onCancel={onClose} onConfirm={onClose} text={
      <div className="space-y-4">
        <p className="italic text-ink-200 text-[15px]">{scene.location.description || 'Nada chama atenção à primeira vista.'}</p>
        <dl className="grid grid-cols-2 gap-3 text-[14px]">
          <div><dt className="label">Ameaça percebida</dt><dd className={`flex items-center gap-1.5 ${threat?.tone ?? ''}`}><GameIcon name="zombie" size={15} />{threat?.text ?? scene.threat}</dd></div>
          <div><dt className="label">Estado do local</dt><dd>{scene.looted}</dd></div>
          <div><dt className="label">Ambiente</dt><dd>{scene.location.indoor ? 'Interior' : 'Ao ar livre'}</dd></div>
          <div><dt className="label">Pode virar base</dt><dd>{scene.location.buildable ? (scene.base ? `Já é a base ${scene.base.name}` : 'Sim') : 'Não'}</dd></div>
        </dl>
        {(scene.location.data?.namedZombies as string[] | undefined)?.length ? <p className="text-blood-400 text-[14px]">Você reconhece rostos entre os mortos que vagam por aqui…</p> : null}
      </div>} />
  );
}

export { useMemo };
