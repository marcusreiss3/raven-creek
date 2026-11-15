import { useHud, ADVANCED_PANELS } from '../lib/hud';
import { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, LogOut, Wrench } from 'lucide-react';
import { useGame, type Panel } from '../lib/store';
import { api } from '../lib/api';
import type { SceneChar } from '../lib/types';
import { GameIcon } from '../components/GameIcon';
import { Bar, Gauge, Modal, Toasts, pad, PHASE, WEATHER } from '../components/ui';
import { useKeyboardOpen, useIsLandscapePhone, buzz } from '../lib/mobile';
import { buildNeeds, ExitsPanel, MobileActions, SceneHotspots, SceneStage } from './Scene';
import { ChatPanel, RichText } from './Chat';
import { CombatScreen } from './Combat';
import { TravelScreen } from './Travel';
import { ProjectsPanel } from './Projects';
import { InventoryPanel } from './Inventory';
import { BodyPanel } from './Body';
import { BasePanel, CharacterPanel, CraftingPanel, FactionPanel, JournalPanel, SettingsPanel, SkillsPanel } from './Panels';
import { MapPanel } from './WorldMap';
import { CharacterMenu, GameModals } from './GameScreen';
import { Tutorial } from './Tutorial';
import { SEASON_LABEL } from './Nature';

const THREAT: Record<string, { text: string; tone: string }> = {
  nenhuma: { text: 'Sem infectados à vista', tone: 'text-moss-400' }, baixa: { text: 'Poucos infectados', tone: 'text-ink-300' },
  média: { text: 'Infectados por perto', tone: 'text-amber-450' }, alta: { text: 'Muitos infectados', tone: 'text-blood-400' }, horda: { text: 'Horda no local', tone: 'text-blood-400' },
};
const CHAT_KINDS = new Set(['chat', 'me', 'roll', 'narration']);

/**
 * Jogo no celular. Em vez de tudo ao mesmo tempo como no PC, uma coisa por vez:
 * barra de estado em cima, a área do jogo no meio e abas embaixo, ao alcance do polegar.
 * Cena · Conversa · Mochila · Mapa · Mais.
 */
export function MobileGame() {
  const { self, combat, panel, set, toasts, messages, user, scene } = useGame();
  const tab = useGame((s) => s.mobileTab);
  const [more, setMore] = useState(false);
  const [needs, setNeeds] = useState(false);
  const [menu, setMenu] = useState<SceneChar | null>(null);
  const [seen, setSeen] = useState(() => messages.at(-1)?.id ?? 0);
  const keyboard = useKeyboardOpen();
  const land = useIsLandscapePhone();

  // conversa: o que chegou desde a última vez que a aba esteve aberta
  const relevant = useMemo(() => messages.filter((m) => CHAT_KINDS.has(m.kind) && m.userId !== user?.id
    && (m.channel !== 'local' || self?.state === 'traveling' || m.locationId === self?.locationId)), [messages, user?.id, self?.locationId, self?.state]);
  const unread = relevant.filter((m) => m.id > seen).length;
  const chatOpen = tab === 'chat' && !panel;
  useEffect(() => { if (chatOpen) setSeen(messages.at(-1)?.id ?? 0); }, [chatOpen, messages.length]);
  // começou um confronto: volta para a aba da cena, onde fica o tabuleiro
  useEffect(() => { if (combat?.id) { set({ mobileTab: 'scene', panel: null }); setMore(false); buzz(40); } }, [combat?.id]);

  if (!self) return <div className="h-full flex items-center justify-center label">Conectando ao mundo…</div>;
  const close = () => set({ panel: null });
  const traveling = !!self.travel && self.state === 'traveling' && !combat;
  const go = (t: 'scene' | 'chat') => { set({ panel: null, mobileTab: t }); setMore(false); };
  const togglePanel = (p: Panel) => { set({ panel: panel === p ? null : p }); setMore(false); };

  return (
    <div className="flex flex-col w-full overflow-hidden" style={{ height: 'var(--app-h, 100dvh)' }}>
      <MobileTopBar onNeeds={() => setNeeds(true)} />
      <div className="flex-1 relative min-h-0 flex flex-col">
        {tab === 'chat' ? <ChatPanel mobile />
          : combat ? <CombatScreen />
          : traveling ? <TravelScreen onCharacterClick={(c) => setMenu(c)} />
          : <MobileScene onCharacterClick={(c) => setMenu(c)} onOpenChat={() => go('chat')} />}
        {panel === 'inventory' && <InventoryPanel onClose={close} />}
        {panel === 'body' && <BodyPanel onClose={close} />}
        {panel === 'skills' && <SkillsPanel onClose={close} />}
        {panel === 'crafting' && <CraftingPanel onClose={close} />}
        {panel === 'base' && <BasePanel onClose={close} />}
        {panel === 'faction' && <FactionPanel onClose={close} />}
        {panel === 'map' && <MapPanel onClose={close} />}
        {panel === 'journal' && <JournalPanel onClose={close} />}
        {panel === 'character' && <CharacterPanel onClose={close} />}
        {panel === 'settings' && <SettingsPanel onClose={close} />}
        {panel === 'projects' && <ProjectsPanel onClose={close} />}
        {tab === 'scene' && !panel && <Tutorial />}
      </div>
      {!keyboard && (
        <nav className="shrink-0 panel-plate !shadow-none border-t border-black safe-b z-30" aria-label="Navegação">
          <div className={`grid grid-cols-5 ${land ? 'h-[44px] [&_span.font-semibold]:hidden' : 'h-[58px]'}`}>
            <TabButton active={tab === 'scene' && !panel && !more} onClick={() => go('scene')}
              icon={combat ? 'combat' : traveling ? 'travel' : 'observe'} label={combat ? 'Combate' : traveling ? 'Estrada' : 'Cena'} alert={!!combat || (!!scene?.combats.length && tab !== 'scene')} />
            <TabButton active={chatOpen && !more} onClick={() => go('chat')} icon="chat" label="Conversa" badge={chatOpen ? 0 : unread} />
            <TabButton active={panel === 'inventory'} onClick={() => togglePanel('inventory')} icon="inventory" label="Mochila" />
            <TabButton active={panel === 'map'} onClick={() => togglePanel('map')} icon="map" label="Mapa" />
            <TabButton active={more || (!!panel && panel !== 'inventory' && panel !== 'map')} onClick={() => setMore(true)} lucide={<LayoutGrid size={22} />} label="Mais" />
          </div>
        </nav>
      )}
      <Toasts toasts={toasts} className={`fixed inset-x-3 z-50 ${land ? 'top-[56px]' : 'top-[96px]'}`} />
      {menu && <CharacterMenu c={menu} onClose={() => setMenu(null)} />}
      {more && <MoreSheet onClose={() => setMore(false)} onPick={(p) => { set({ panel: p }); setMore(false); }} />}
      {needs && <NeedsSheet onClose={() => setNeeds(false)} />}
      <GameModals />
    </div>
  );
}

function TabButton({ active, onClick, icon, lucide, label, badge = 0, alert }: { active: boolean; onClick: () => void; icon?: string; lucide?: React.ReactNode; label: string; badge?: number; alert?: boolean }) {
  return (
    <button onClick={() => { buzz(8); onClick(); }} aria-current={active ? 'page' : undefined} aria-label={badge ? `${label}, ${badge} mensagens novas` : label}
      className={`relative flex flex-col items-center justify-center gap-0.5 ${active ? 'text-amber-450' : alert ? 'text-blood-400' : 'text-ink-300'} active:bg-black/30`}>
      {active && <span className="absolute top-0 left-3 right-3 h-[3px] bg-amber-450 shadow-[0_0_10px_#f0a73a]" aria-hidden />}
      <span className="relative">
        {icon ? <GameIcon name={icon} size={23} /> : lucide}
        {badge > 0 && <span className="absolute -top-1.5 -right-3 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-450 text-[#101109] text-[11px] font-bold leading-[18px] text-center" aria-hidden>{badge > 99 ? '99+' : badge}</span>}
        {alert && !badge && <span className="absolute -top-1 -right-2 w-2.5 h-2.5 rounded-full bg-blood-500 pulse-red" aria-hidden />}
      </span>
      <span className="font-[family-name:var(--font-plate)] font-semibold text-[13px] leading-none">{label}</span>
    </button>
  );
}

// ───────────────────────── Barra de estado ─────────────────────────
function MobileTopBar({ onNeeds }: { onNeeds: () => void }) {
  const { self, scene, clock, connected } = useGame();
  const land = useIsLandscapePhone();
  if (!self) return null;
  const c = clock ?? self.clock;
  const needs = buildNeeds(self).filter((x) => x.show);
  const critical = needs.filter((x) => x.critical).length;
  const threat = THREAT[scene?.threat ?? ''];
  const name = self.travel ? `A caminho de ${self.travel.toName}` : scene?.location.name ?? self.locationName;
  return (
    <header className="shrink-0 panel-plate !shadow-none border-b border-black safe-t relative z-20" style={{ boxShadow: '0 6px 14px -6px rgba(0,0,0,.9)' }}>
      <div className={`flex items-center gap-3 pl-3 pr-3 ${land ? 'h-[48px]' : 'h-[50px]'}`}>
        <div className={`min-w-0 ${land ? 'w-[30%] shrink-0' : 'flex-1'}`}>
          <h1 key={name} className="font-display font-extrabold text-[23px] leading-none truncate text-ink-100 anim-stencil">{name}</h1>
          <div className="text-[12px] mt-0.5 truncate">
            {self.travel ? <span className="text-ink-400">{self.travel.mode === 'vehicle' ? 'De veículo' : 'A pé'}</span>
              : threat ? <span className={threat.tone}>{threat.text}</span> : null}
          </div>
        </div>
        {land && <NeedsStrip needs={needs} onNeeds={onNeeds} critical={critical} protectedUntil={!!self.protectedUntil} inline />}
        {!connected && <span className="chip text-blood-400 pulse-red shrink-0">Sem conexão</span>}
        <div className="flex items-center gap-2.5 shrink-0" aria-label={`${pad(c.hour)}:${pad(c.minute)}, ${PHASE[c.phase]}, dia ${c.day}, ${WEATHER[c.weather]}, ${c.temperature} graus`}>
          <div className="flex flex-col items-end leading-none">
            <span className="font-[family-name:var(--font-plate)] font-bold text-[21px] text-amber-450 tabular-nums" style={{ textShadow: '0 0 10px rgba(240,167,58,.5)' }}>{pad(c.hour)}:{pad(c.minute)}</span>
            <span className="text-[11px] text-ink-400 mt-0.5">Dia {c.day}{c.season ? `, ${SEASON_LABEL[c.season].name.toLowerCase()}` : ''}</span>
          </div>
          <span className="flex flex-col items-center text-ink-200 leading-none"><GameIcon name={c.weather} size={19} /><span className="text-[11px] text-ink-400 mt-0.5">{c.temperature}°</span></span>
        </div>
      </div>
      {!land && <NeedsStrip needs={needs} onNeeds={onNeeds} critical={critical} protectedUntil={!!self.protectedUntil} />}
    </header>
  );
}

function NeedsStrip({ needs, onNeeds, critical, protectedUntil, inline }: { needs: ReturnType<typeof buildNeeds>; onNeeds: () => void; critical: number; protectedUntil: boolean; inline?: boolean }) {
  return (
  <button onClick={onNeeds} className={inline ? 'flex-1 min-w-0 flex items-center gap-3 h-full active:bg-black/30' : 'w-full flex items-center gap-3.5 pl-3 pr-2 h-[40px] border-t border-black/60 active:bg-black/30'} aria-label={`Ver como você está${critical ? `: ${critical} ${critical > 1 ? 'pontos críticos' : 'ponto crítico'}` : ''}`}>
      <span className="flex items-center gap-3.5 min-w-0 overflow-hidden">
        {needs.map((x) => (
          <span key={x.key} className="w-8 shrink-0 flex flex-col items-center gap-[3px]" aria-hidden>
            <span className="relative" style={{ color: x.critical ? '#e0554a' : '#cfc9b2' }}>
              <GameIcon name={x.icon} size={17} />
              {x.critical && <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-blood-500 pulse-red" />}
            </span>
            <Gauge value={x.v} color={x.color} />
          </span>
        ))}
        {protectedUntil && <span className="text-moss-400 shrink-0" aria-hidden><GameIcon name="protection" size={17} /></span>}
      </span>
      <span className="ml-auto text-ink-400 text-[20px] leading-none shrink-0" aria-hidden>›</span>
    </button>
  );
}

function NeedsSheet({ onClose }: { onClose: () => void }) {
  const self = useGame((s) => s.self);
  if (!self) return null;
  const all = buildNeeds(self).filter((x) => x.show || x.key !== 'temp');
  return (
    <Modal title="Como você está" onClose={onClose}>
      <ul className="space-y-3.5">
        {all.map((x) => {
          const [head, ...rest] = x.tip.split('\n');
          return (
            <li key={x.key} className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0" style={{ color: x.critical ? '#e0554a' : '#cfc9b2' }}><GameIcon name={x.icon} size={22} /></span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between text-[15px]"><span className={x.critical ? 'text-blood-400 font-semibold' : 'text-ink-100'}>{x.name}{x.critical ? ', crítico' : ''}</span><span className="text-ink-300 tabular-nums">{head.split(':').slice(1).join(':').trim()}</span></div>
                <div className="mt-1"><Bar value={x.v} color={x.color} small /></div>
                {rest.length > 0 && <p className="text-[13px] text-ink-300 mt-1 leading-snug">{rest.join(' ')}</p>}
              </div>
            </li>
          );
        })}
      </ul>
      {self.protectedUntil && <p className="text-[13.5px] text-moss-400 mt-4 flex gap-2"><GameIcon name="protection" size={17} className="shrink-0" />Proteção de novato: outros jogadores não podem atacar você.</p>}
      <button className="btn w-full mt-5 justify-center" onClick={() => { useGame.getState().set({ panel: 'body' }); onClose(); }}><GameIcon name="body" size={18} />Abrir ficha médica</button>
    </Modal>
  );
}

// ───────────────────────── Cena ─────────────────────────
function MobileScene({ onCharacterClick, onOpenChat }: { onCharacterClick: (c: SceneChar) => void; onOpenChat: () => void }) {
  const { scene, self } = useGame();
  if (!scene || !self) return <div className="flex-1 bg-ink-950" />;
  const absent = scene.characters.filter((c) => !c.online && c.id !== self.id);
  return (
    <div className="flex-1 overflow-y-auto overscroll-contain">
      <div className="relative h-[44vh] min-h-[220px] max-h-[460px] border-b border-black">
        <SceneStage compact onCharacterClick={onCharacterClick} />
      </div>
      <div className="p-3 space-y-5">
        <div className="flex flex-col gap-2 empty:hidden [&>button]:min-h-[48px] [&>button]:text-[15.5px]"><SceneHotspots /></div>
        <MobileActions />
        <ChatPeek onOpen={onOpenChat} />
        <ExitsPanel mobile />
        {absent.length > 0 && <p className="text-[13px] text-ink-400">Dormindo por aqui (offline): {absent.map((a) => a.name).join(', ')}</p>}
      </div>
    </div>
  );
}

/** As últimas falas do lugar, para acompanhar a conversa sem sair da cena. */
function ChatPeek({ onOpen }: { onOpen: () => void }) {
  const { messages, self } = useGame();
  const last = messages.filter((m) => (m.channel === 'local' || m.channel === 'travel') && (m.locationId === self?.locationId || self?.state === 'traveling') && m.kind !== 'system').slice(-3);
  return (
    <button onClick={onOpen} className="w-full text-left bg-[#101109]/80 border border-black px-3 py-2.5 active:bg-black/50" aria-label="Abrir a conversa">
      <div className="flex items-center justify-between text-[13px] text-tape mb-1"><span className="flex items-center gap-1.5"><GameIcon name="chat" size={15} />Conversa aqui</span><span className="text-ink-400">Abrir ›</span></div>
      {last.length ? last.map((m) => (
        <p key={m.id} className="text-[14px] leading-snug text-ink-200 line-clamp-2">
          {m.kind === 'emote' || m.kind === 'narration' ? <i className="text-ink-300"><RichText text={m.content} /></i>
            : m.kind === 'me' ? <i className="text-amber-200"><b className="not-italic">{m.authorName}</b> <RichText text={m.content} /></i>
            : <><b className="text-tape">{m.authorName?.split(' ')[0]}:</b> <RichText text={m.content} /></>}
        </p>
      )) : <p className="text-[14px] text-ink-400">Ninguém disse nada aqui ainda. Toque para falar.</p>}
    </button>
  );
}

// ───────────────────────── Mais ─────────────────────────
const MORE: { p: Panel; icon: string; label: string }[] = [
  { p: 'body', icon: 'body', label: 'Ficha médica' }, { p: 'crafting', icon: 'crafting', label: 'Bancada' }, { p: 'skills', icon: 'skills', label: 'Habilidades' },
  { p: 'projects', icon: 'projects', label: 'Projetos' }, { p: 'base', icon: 'base', label: 'Base' }, { p: 'faction', icon: 'faction', label: 'Facção' },
  { p: 'journal', icon: 'journal', label: 'Diário' }, { p: 'character', icon: 'character', label: 'Personagem' }, { p: 'settings', icon: 'settings', label: 'Som e opções' },
];
function MoreSheet({ onClose, onPick }: { onClose: () => void; onPick: (p: Panel) => void }) {
  const { user, panel } = useGame();
  const simpleHud = useHud((h) => h.simple);
  return (
    <Modal title="Mais" onClose={onClose}>
      <div className="grid grid-cols-3 gap-2">
        {MORE.filter((m) => !simpleHud || !ADVANCED_PANELS.has(m.p)).map((m) => (
          <button key={m.p} onClick={() => onPick(m.p)} aria-current={panel === m.p ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-1.5 min-h-[84px] border border-black bg-[#101109]/70 active:bg-black/50 ${panel === m.p ? 'text-amber-450 !border-amber-450/60' : 'text-ink-100'}`}>
            <GameIcon name={m.icon} size={28} className={panel === m.p ? '' : 'text-tape'} />
            <span className="font-[family-name:var(--font-plate)] font-semibold text-[15px] leading-tight text-center">{m.label}</span>
          </button>
        ))}
      </div>
      <div className="flex gap-2 mt-4">
        {user && user.role !== 'player' && <a href="#/admin" className="btn flex-1 justify-center"><Wrench size={17} />Administração</a>}
        <button className="btn btn-ghost flex-1 justify-center" onClick={async () => { await api('/auth/logout', { method: 'POST' }); location.reload(); }}><LogOut size={17} />Sair da conta</button>
      </div>
    </Modal>
  );
}
