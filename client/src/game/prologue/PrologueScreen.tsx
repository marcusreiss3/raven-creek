/**
 * Tela do Dia 1. No computador: a cena com a narração à esquerda, o celular no meio e o chat do local à direita.
 * No celular de verdade: abas Celular · Cena · Chat. Confrontos ocupam a área da cena.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Smartphone, Clapperboard, MessagesSquare } from 'lucide-react';
import { useGame } from '../../lib/store';
import { useIsMobile } from '../../lib/mobile';
import { usePhone, loadPhone, leaveWork, type PEvent } from '../../lib/prologue';
import { GameIcon } from '../../components/GameIcon';
import { action } from '../../lib/socket';
import { audio } from '../../lib/audio';
import { Bar, Confirm, Toasts } from '../../components/ui';
import { ExitsPanel, SceneStage } from '../Scene';
import { TravelScreen } from '../Travel';
import { MapPanel } from '../WorldMap';
import { ChatPanel } from '../Chat';
import { CombatScreen } from '../Combat';
import { InventoryPanel } from '../Inventory';
import { BodyPanel } from '../Body';
import { CharacterMenu, GameModals } from '../GameScreen';
import type { SceneChar } from '../../lib/types';
import { Phone, onPhone } from './Phone';
import { AskCard, useNow } from './AskCard';

export const ACT_NAMES: Record<number, string> = { 1: 'Segunda-feira comum', 2: 'Primeiros casos', 3: 'A cidade cai', 4: 'O bloqueio', 5: 'A primeira noite' };

function TopStrip({ compact }: { compact?: boolean }) {
  const { self, set, user } = useGame();
  const { session, group, me } = usePhone();
  const now = useNow(1000);
  const endsAt = session ? session.startedAt + (session.minutes * 60_000) / session.speed : null;
  const left = endsAt ? Math.max(0, Math.floor((endsAt - now) / 60_000)) : null;
  return (
    <header className={`flex items-center gap-3 border-b border-black bg-[#0e0f0a] ${compact ? 'px-3 py-1.5' : 'px-4 py-2'}`}>
      <span className="tape !text-[13px] shrink-0">Dia 1</span>
      <div className="min-w-0">
        <div className={`font-display font-extrabold text-ink-100 leading-none truncate ${compact ? 'text-[17px]' : 'text-[21px]'}`}>Ato {session?.act ?? 1} · {ACT_NAMES[session?.act ?? 1]}{me?.free && <span className="ml-2 align-middle text-[12px] font-sans font-bold text-moss-400 border border-moss-400/60 px-1.5 py-0.5">LIVRE</span>}</div>
        {!compact && <div className="text-[12.5px] text-ink-300 truncate">{group?.location}{group && group.members.length > 1 ? ` · com ${group.members.filter((m) => m.id !== self?.id).map((m) => m.name.split(' ')[0]).join(', ')}` : ' · sozinho'}</div>}
      </div>
      {self && !compact && (
        <div className="ml-auto flex items-center gap-4 w-[340px] max-w-[40%]">
          <div className="flex-1"><Bar value={self.needs.blood} color="#b3261e" label="Sangue" small /></div>
          <div className="flex-1"><Bar value={self.needs.stress} color="#c98a2b" label="Estresse" small /></div>
        </div>
      )}
      <div className={`${compact ? 'ml-auto' : ''} flex items-center gap-1.5`}>
        {me?.status === 'active' && !me.free && <LeaveWorkButton compact={compact} />}
        {me?.free && <button className="btn !px-2.5 !min-h-[36px]" onClick={() => set({ panel: 'map' })} aria-label="Mapa"><GameIcon name="map" size={17} />{!compact && 'Mapa'}</button>}
        <button className="btn !px-2.5 !min-h-[36px]" onClick={() => set({ panel: 'inventory' })} aria-label="Inventário"><GameIcon name="inventory" size={17} />{!compact && 'Inventário'}</button>
        <button className="btn !px-2.5 !min-h-[36px]" onClick={() => set({ panel: 'body' })} aria-label="Corpo"><GameIcon name="body" size={17} />{!compact && 'Corpo'}</button>
        {user && user.role !== 'player' && <a href="#/admin" className="btn !px-2.5 !min-h-[36px] text-amber-450" aria-label="Painel administrativo" title="Painel administrativo"><GameIcon name="admin" size={17} />{!compact && 'Admin'}</a>}
      </div>
      {left !== null && !compact && <div className="text-[12.5px] text-ink-300 tabular-nums shrink-0" title="Tempo até o fim do Dia 1"><GameIcon name="clock" size={14} className="inline -mt-0.5 mr-1" />{Math.floor(left / 60)}h{String(left % 60).padStart(2, '0')}</div>}
      {me?.status === 'dead' && <span className="chip text-blood-400 shrink-0">morto</span>}
    </header>
  );
}

/** Sair do trabalho: deixa a história do grupo e fica livre pelo mapa (com confirmação; não tem volta). */
function LeaveWorkButton({ compact }: { compact?: boolean }) {
  const [ask, setAsk] = useState(false);
  return (
    <>
      <button className="btn !px-2.5 !min-h-[36px]" onClick={() => setAsk(true)} aria-label="Sair do trabalho"><GameIcon name="exit" size={17} />{!compact && 'Sair do trabalho'}</button>
      {ask && <Confirm title="Sair do trabalho?" confirmLabel="Largar o posto" onCancel={() => setAsk(false)} onConfirm={() => { setAsk(false); leaveWork(); }}
        text={<>Você abandona o seu posto e a história do seu grupo segue sem você. Fica <b>livre pelo condado</b>: anda pelo mapa, encontra o que está acontecendo em cada lugar importante e corre atrás de recursos, mas a cidade está ficando perigosa, e você vai estar por conta própria. <b>Não tem volta.</b></>} />}
    </>
  );
}

/** Para onde ir (só para quem saiu do trabalho e não está no meio de um evento). */
function FreeExits() {
  const me = usePhone((s) => s.me);
  const following = useGame((s) => !!s.self?.followingId);
  if (!me?.free) return null;
  const stop = following && (
    <div className="px-5 py-2 flex items-center gap-3 text-[13px] text-ink-200 bg-black/30 border-b border-black">
      Você está acompanhando alguém: vai junto quando a pessoa sair daqui.
      <button className="btn !min-h-8 !py-1" onClick={() => action('follow', { targetId: null })}><GameIcon name="follow" size={16} />Parar de seguir</button>
    </div>
  );
  if (!me.freeIdle) return <>{stop}<div className="px-5 py-2 text-[13px] text-amber-450 bg-black/30 border-b border-black">Algo está acontecendo aqui. Resolva antes de seguir viagem.</div></>;
  return <>{stop}<div className="border-b border-black bg-[#0e0f0a] max-h-[34%] overflow-y-auto"><ExitsPanel /></div></>;
}

function FeedItem({ e }: { e: PEvent }) {
  const p = e.payload;
  if (e.kind === 'ask') return <div className="my-3"><AskCard e={e} tone="scene" /></div>;
  if (e.kind === 'answer') return null;
  if (e.kind === 'roll') return <div className={`my-1.5 text-[13.5px] flex items-center gap-1.5 ${p.ok ? 'text-moss-400' : 'text-blood-400'}`}><GameIcon name="dice" size={15} />{p.label}{p.by ? ` (${p.by})` : ''} · {p.chance}% · <b>{p.ok ? 'conseguiu' : 'falhou'}</b></div>;
  if (e.kind === 'mark') return <div className="my-2 border-l-4 border-tape bg-black/30 px-3 py-1.5"><div className="text-[12px] uppercase tracking-wider text-tape font-bold">Marca do Dia 1 · {p.name}</div><div className="text-[13.5px] text-ink-200 italic">{p.text}</div></div>;
  if (e.kind === 'death') return <div className="my-3 border border-blood-500/70 bg-blood-500/10 px-3 py-2 text-[15px] text-blood-400 font-semibold"><GameIcon name="skull" size={16} className="inline -mt-1 mr-1.5" />{p.name} morreu. <span className="font-normal text-ink-200">{p.cause}</span></div>;
  if (e.kind === 'system') return <div className={`my-2 text-[13.5px] ${p.merge ? 'text-moss-400 font-semibold' : p.end ? 'text-amber-450 font-semibold' : 'text-ink-300'}`}>{p.text}</div>;
  return <p className="my-2.5 text-[16px] leading-relaxed text-ink-100 anim-fade">{p.text}</p>;
}

/** Narração do que acontece em volta, mais as decisões (inclusive as do celular quando ele está apagado ou fora de vista). */
function Feed({ showPhoneAsks }: { showPhoneAsks: boolean }) {
  const { events, me } = usePhone();
  // as decisões do celular entram na narração na ordem em que chegaram (e ficam com o resultado depois)
  const withAsks = showPhoneAsks || (me?.battery ?? 100) <= 0;
  const list = useMemo(() => events.filter((e) => !onPhone(e) || (withAsks && e.kind === 'ask')).slice(-80), [events, withAsks]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' }); }, [list.length]);
  return (
    <div ref={box} className="flex-1 min-h-0 overflow-y-auto px-5 py-3 bg-[#0b0c07]">
      {list.length === 0 && <p className="text-ink-400 text-[14px] italic">Seu dia começa…</p>}
      {list.map((e) => <FeedItem key={e.id} e={e} />)}
      {me?.status === 'dead' && <div className="my-3 panel p-3 text-[14px] text-ink-200">Sua história no Dia 1 terminou{me.deathCause ? `: ${me.deathCause}` : ''}. Você pode continuar acompanhando o grupo até o fim da sessão.</div>}
    </div>
  );
}

/**
 * Antes da queda (atos 1 e 2) a cidade ainda está inteira: arte "_antes" dos locais, quando existir.
 * A música calma vale só no ato 1; com os primeiros casos (ato 2) volta a trilha sombria do lugar.
 */
function useBeforeLook() {
  const act = usePhone((s) => s.session?.act ?? 1);
  return { sceneVariant: act <= 2 ? '_antes' : undefined, musicKey: act <= 1 ? 'dia_normal' : undefined };
}
/** Depois de um confronto, a trilha volta para a da sessão (o confronto troca a música). */
function useMusicAfterCombat() {
  const combat = useGame((s) => !!s.combat);
  const scene = useGame((s) => s.scene);
  const { musicKey } = useBeforeLook();
  useEffect(() => { if (!combat && scene) audio.music(musicKey ?? scene.location.musicKey); }, [combat]);
}

function usePhoneSync() {
  const connected = useGame((s) => s.connected);
  useEffect(() => { if (connected) loadPhone(); }, [connected]);
}

export function PrologueScreen() {
  const mobile = useIsMobile();
  usePhoneSync();
  useMusicAfterCombat();
  return mobile ? <PrologueMobile /> : <PrologueDesktop />;
}

function Panels() {
  const { panel, set } = useGame();
  const close = () => set({ panel: null });
  return <>{panel === 'inventory' && <InventoryPanel onClose={close} />}{panel === 'body' && <BodyPanel onClose={close} />}{panel === 'map' && <MapPanel onClose={close} />}</>;
}

function PrologueDesktop() {
  const { combat, toasts } = useGame();
  const traveling = useGame((s) => !!s.self?.travel && s.self.state === 'traveling');
  const look = useBeforeLook();
  const light = usePhone((s) => s.me?.light);
  const [menu, setMenu] = useState<SceneChar | null>(null);
  return (
    <div className="h-full flex flex-col">
      <TopStrip />
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0 relative">
          {combat ? <CombatScreen /> : traveling ? <TravelScreen onCharacterClick={setMenu} /> : (
            <>
              <div className="relative h-[42%] min-h-[220px]"><SceneStage compact onCharacterClick={setMenu} {...look} />{light && <div className="absolute inset-0 phone-light" />}</div>
              <FreeExits />
              <Feed showPhoneAsks />
            </>
          )}
          <Panels />
          {menu && <CharacterMenu c={menu} onClose={() => setMenu(null)} />}
        </div>
        <div className={`shrink-0 flex items-center justify-center px-4 bg-[radial-gradient(ellipse_at_center,#1a1c14_0%,#0b0c07_70%)] ${combat ? 'hidden' : ''}`}><Phone /></div>
        <ChatPanel />
      </div>
      <Toasts toasts={toasts} className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50" />
      <GameModals />
    </div>
  );
}

function PrologueMobile() {
  const { combat, toasts } = useGame();
  const traveling = useGame((s) => !!s.self?.travel && s.self.state === 'traveling');
  const look = useBeforeLook();
  const { events, pop, me } = usePhone();
  const [tab, setTab] = useState<'phone' | 'scene' | 'chat'>('phone');
  const [seenFeed, setSeenFeed] = useState(0);
  const [phoneDot, setPhoneDot] = useState(false);
  const [menu, setMenu] = useState<SceneChar | null>(null);
  const lastFeed = events.filter((e) => !onPhone(e)).at(-1)?.id ?? 0;
  useEffect(() => { if (tab === 'scene') setSeenFeed(lastFeed); }, [tab, lastFeed]);
  useEffect(() => { if (tab === 'phone') setPhoneDot(false); else if (pop && onPhone(pop)) setPhoneDot(true); }, [pop?.id, tab]);
  const btn = (id: typeof tab, label: string, icon: React.ReactNode, dot: boolean) => (
    <button onClick={() => setTab(id)} className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 relative ${tab === id ? 'text-amber-450' : 'text-ink-300'}`} aria-pressed={tab === id}>
      {icon}<span className="text-[11.5px] font-semibold">{label}</span>
      {dot && <span className="absolute top-1 right-[30%] w-2.5 h-2.5 rounded-full bg-blood-500" />}
    </button>
  );
  return (
    <div className="h-full flex flex-col" style={{ height: 'var(--vh, 100dvh)' }}>
      <TopStrip compact />
      <div className="flex-1 min-h-0 relative flex flex-col">
        {combat ? <CombatScreen /> : (
          <>
            <div className={tab === 'phone' ? 'flex-1 min-h-0 flex' : 'hidden'}><Phone fill /></div>
            {tab === 'scene' && (traveling ? <TravelScreen onCharacterClick={setMenu} /> : <>
              <div className="relative h-[34%] min-h-[170px]"><SceneStage compact onCharacterClick={setMenu} {...look} />{me?.light && <div className="absolute inset-0 phone-light" />}</div>
              <FreeExits />
              <Feed showPhoneAsks />
            </>)}
            {tab === 'chat' && <div className="flex-1 min-h-0 flex flex-col"><ChatPanel mobile /></div>}
          </>
        )}
        <Panels />
        {menu && <CharacterMenu c={menu} onClose={() => setMenu(null)} />}
      </div>
      {!combat && <nav className="flex border-t border-black bg-[#0e0f0a] pb-[env(safe-area-inset-bottom)]">
        {btn('phone', 'Celular', <Smartphone size={20} />, phoneDot)}
        {btn('scene', 'Cena', <Clapperboard size={20} />, lastFeed > seenFeed && tab !== 'scene')}
        {btn('chat', 'Chat do local', <MessagesSquare size={20} />, false)}
      </nav>}
      <Toasts toasts={toasts} className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50" />
      <GameModals />
    </div>
  );
}
