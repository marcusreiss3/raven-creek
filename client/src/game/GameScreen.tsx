import { useEffect, useState } from 'react';
import { Ban, Flag } from 'lucide-react';
import { GameIcon, itemIcon } from '../components/GameIcon';
import { useGame } from '../lib/store';
import { action } from '../lib/socket';
import { portraitUrl } from '../lib/api';
import type { Item, SceneChar } from '../lib/types';
import { ActionBar, SceneStage, TopBar } from './Scene';
import { ChatPanel } from './Chat';
import { CombatScreen } from './Combat';
import { TravelScreen } from './Travel';
import { ProjectsPanel } from './Projects';
import { InventoryPanel } from './Inventory';
import { BodyPanel } from './Body';
import { BasePanel, CharacterPanel, CraftingPanel, FactionPanel, JournalPanel, SettingsPanel, SkillsPanel } from './Panels';
import { MapPanel } from './WorldMap';
import { Bar, Confirm, Img, Modal, Toasts } from '../components/ui';
import { Tutorial } from './Tutorial';
import { isMobile } from '../lib/mobile';
import { audio } from '../lib/audio';

const KEYS: Record<string, string> = { g: 'projects', i: 'inventory', b: 'body', k: 'skills', c: 'crafting', h: 'base', f: 'faction', m: 'map', j: 'journal', p: 'character', o: 'settings' };

export function GameScreen() {
  const { self, combat, panel, set, toasts } = useGame();
  const [menu, setMenu] = useState<SceneChar | null>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (KEYS[key]) { const p = KEYS[key] as any; set({ panel: useGame.getState().panel === p ? null : p }); }
      if (key === 'e' && useGame.getState().self?.state === 'idle') action('explore');
      if (e.key === 'Escape') { set({ panel: null }); setMenu(null); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);
  if (!self) return <div className="h-full flex items-center justify-center label">Conectando ao mundo…</div>;
  const close = () => set({ panel: null });
  const inCombatView = !!combat;
  const traveling = !!self.travel && self.state === 'traveling' && !combat;
  return (
    <div className="h-full flex flex-col">
      <TopBar />
      <div className="flex-1 flex min-h-0 relative">
        <div className="flex-1 flex flex-col min-w-0 relative">
          {inCombatView ? <CombatScreen /> : traveling ? <TravelScreen onCharacterClick={(c) => setMenu(c)} /> : <SceneStage onCharacterClick={(c) => setMenu(c)} />}
          {!inCombatView && !traveling && <ActionBar />}
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
          {menu && <CharacterMenu c={menu} onClose={() => setMenu(null)} />}
          <Tutorial />
        </div>
        <ChatPanel />
      </div>
      <Toasts toasts={toasts} className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50" />
      <GameModals />
    </div>
  );
}

/** Janelas que podem abrir em qualquer tela do jogo (baú, veículo, socorro, amputação, morte). */
export function GameModals() {
  const { modal, set, death } = useGame();
  return (
    <>
      {modal?.kind === 'container' && <ContainerModal ct={modal.data} onClose={() => set({ modal: null })} />}
      {modal?.kind === 'vehicle' && <VehicleModal v={modal.data} onClose={() => set({ modal: null })} />}
      {modal?.kind === 'combat_aid' && <AidModal targetId={modal.data.targetId} onClose={() => set({ modal: null })} />}
      {modal?.kind === 'amputation_consent' && (
        <Confirm title="Pedido de procedimento" confirmLabel="Consentir" onCancel={() => set({ modal: null })}
          onConfirm={() => { action('amputation_consent', { actorId: modal.data.actorId, region: modal.data.region }); set({ modal: null }); }}
          text={<><b>{modal.data.actorName}</b> quer amputar seu membro ({modal.data.region}). É permanente e pode não impedir uma infecção. Consentir?</>} />
      )}
      {modal?.kind === 'amputation_ready' && (
        <Confirm title="Realizar amputação" confirmLabel="Realizar agora" onCancel={() => set({ modal: null })}
          onConfirm={() => { action('amputate', modal.data); set({ modal: null }); }} text="Confirme apenas depois que o paciente consentir. O resultado depende da sua habilidade em Medicina." />
      )}
      {death && <DeathScreen />}
    </>
  );
}

export function CharacterMenu({ c, onClose }: { c: SceneChar; onClose: () => void }) {
  const { self } = useGame();
  const [profile, setProfile] = useState<any>(null);
  const [confirmAtk, setConfirmAtk] = useState(false);
  const [loot, setLoot] = useState<Item[] | null>(null);
  useEffect(() => { action('look', { characterId: c.id }, { silent: true }).then((r) => r.ok && setProfile(r.profile)); }, [c.id]);
  const isSelf = c.id === self?.id;
  return (
    <Modal title={c.name} onClose={onClose} width={560}>
      <div className="grid grid-cols-[150px_1fr] max-sm:grid-cols-[96px_1fr] gap-4">
        <div className="h-52 max-sm:h-36 bg-[#101109] border border-black shadow-[inset_0_2px_6px_rgba(0,0,0,.7)] overflow-hidden flex items-end justify-center"><Img src={portraitUrl(c.portrait)} fallback="/assets/portraits/default.png" className="max-h-full object-contain" /></div>
        <div>
          <p className="text-[15px] text-ink-200 italic">{profile?.appearance || c.appearance || 'Nenhuma descrição.'}</p>
          {profile && <div className="flex flex-wrap gap-1.5 mt-3"><span className="chip text-ink-200">{profile.age} anos</span><span className={`chip ${profile.online ? 'text-moss-400' : 'text-ink-400'}`}>{profile.online ? 'acordado e presente' : 'ausente'}</span>{profile.protected && <span className="chip text-moss-400"><GameIcon name="protection" size={12} />proteção de novato</span>}</div>}
          {profile?.visibleGear?.length > 0 && <div className="text-[13.5px] text-ink-300 mt-2">Veste e carrega: {profile.visibleGear.join(', ')}</div>}
          {profile?.amputations?.length > 0 && <div className="text-[13.5px] text-blood-400 mt-1">Perdeu: {profile.amputations.join(', ')}</div>}
          {!profile?.impressions && c.visibleCondition !== 'normal' && <div className="text-[13.5px] text-blood-400 mt-1 flex items-center gap-1"><GameIcon name="bleeding" size={14} />Aparenta estar {c.visibleCondition}.</div>}
          {profile?.impressions?.length > 0 && (
            <div className="mt-3 border-l-2 border-ink-600 pl-3">
              <div className="label mb-1">{isSelf ? 'Como os outros te veem' : 'O que se nota'}</div>
              <ul className="space-y-1">{profile.impressions.map((t: string, k: number) => <li key={k} className="text-[13.5px] text-ink-200 italic leading-snug">{t}</li>)}</ul>
            </div>
          )}
        </div>
      </div>
      {!isSelf && (
        <div className="flex flex-wrap gap-1.5 mt-4 max-sm:grid max-sm:grid-cols-2 max-sm:[&>button]:justify-start">
          <button className="btn" onClick={() => { action(self?.followingId === c.id ? 'follow' : 'follow', { targetId: self?.followingId === c.id ? null : c.id }); onClose(); }}><GameIcon name="follow" size={16} />{self?.followingId === c.id ? 'Parar de seguir' : 'Acompanhar (viajar junto)'}</button>
          <button className="btn" onClick={() => { useGame.getState().set({ chatPmTo: c.id, mobileTab: 'chat' }); if (!isMobile()) useGame.getState().toast('Use a aba "Sussurro" do chat: só quem está aqui ouve.', 'info'); onClose(); }}><GameIcon name="whisper" size={16} />Sussurrar</button>
          <button className="btn" onClick={() => { useGame.getState().set({ panel: 'body', bodyPatient: c.id }); onClose(); }}><GameIcon name="aid" size={16} />Prestar socorro</button>
          <button className="btn" onClick={() => { useGame.getState().set({ panel: 'inventory' }); onClose(); }}><GameIcon name="inventory" size={16} />Entregar item</button>
          {self?.faction && ['leader', 'officer'].includes(self.faction.rank) && <button className="btn" onClick={() => action('faction_invite', { targetId: c.id })}><GameIcon name="faction" size={16} />Convidar à facção</button>}
          {c.visibleCondition === 'inconsciente' && <button className="btn" onClick={() => action('search_body', { targetId: c.id }).then((r) => r.ok && setLoot(r.items))}><GameIcon name="search" size={16} />Revistar</button>}
          <button className="btn btn-danger" onClick={() => setConfirmAtk(true)}><GameIcon name="duel" size={16} />Atacar</button>
          <button className="btn btn-ghost" onClick={() => action('block_user', { userId: c.userId }).then((r) => r.ok && useGame.getState().set({ blocks: r.blocked }))}><Ban size={15} />Bloquear</button>
          <button className="btn btn-ghost" onClick={() => { const reason = prompt('Motivo da denúncia:'); if (reason) action('report', { userId: c.userId, reason }); }}><Flag size={15} />Denunciar</button>
        </div>
      )}
      {loot && <div className="mt-3 border-t border-ink-700 pt-3"><div className="label mb-1.5">Pertences (o roubo fica registrado)</div><div className="flex flex-wrap gap-1">{loot.map((i) => <button key={i.id} className="chip text-ink-100 hover:text-blood-400" onClick={() => action('steal', { targetId: c.id, itemId: i.id }).then((r) => r.ok && setLoot(loot.filter((x) => x.id !== i.id)))}>{i.name}</button>)}</div></div>}
      {isSelf && <div className="mt-4 text-[13.5px] text-ink-300">Este é você. Edite aparência e retrato no painel Personagem.</div>}
      {confirmAtk && <Confirm title="Iniciar confronto?" confirmLabel="Atacar" onCancel={() => setConfirmAtk(false)} onConfirm={() => { action('attack_character', { targetId: c.id }); setConfirmAtk(false); onClose(); }}
        text={<>Você vai atacar <b>{c.name}</b>. O resultado será decidido no tabuleiro tático. O ataque fica registrado, remove sua proteção de novato e tem tempo de recarga. Outros presentes podem intervir.</>} />}
    </Modal>
  );
}

function ContainerModal({ ct, onClose }: { ct: { id: number; name: string; kind: string }; onClose: () => void }) {
  const self = useGame((s) => s.self);
  const [items, setItems] = useState<Item[] | null>(null);
  const load = () => action('container_open', { containerId: ct.id }).then((r) => r.ok && setItems(r.items));
  useEffect(() => { load(); }, [ct.id]);
  return (
    <Modal title={ct.name} onClose={onClose} width={620}>
      {ct.kind === 'corpse' && <div className="text-[13.5px] text-blood-400 mb-3 flex items-center gap-1.5"><GameIcon name="corpse" size={15} />Os pertences de quem morreu ficam aqui por tempo limitado.</div>}
      <div className="grid grid-cols-2 gap-4">
        <div><h3 className="text-[13.5px] text-tape mb-1.5">Dentro, clique para pegar</h3><div className="space-y-1 max-h-72 overflow-y-auto">{items?.map((i) => <ItemRow key={i.id} i={i} onClick={() => action('take', { itemId: i.id, containerId: ct.id }).then(load)} hint="pegar" />)}{items && !items.length && <div className="text-[14px] text-ink-400 py-2">Vazio.</div>}</div></div>
        {ct.kind !== 'corpse' && <div><h3 className="text-[13.5px] text-tape mb-1.5">Sua mochila, clique para guardar</h3><div className="space-y-1 max-h-72 overflow-y-auto">{self?.inventory.filter((i) => !i.slot).map((i) => <ItemRow key={i.id} i={i} onClick={() => action('store', { itemId: i.id, containerId: ct.id }).then(load)} hint="guardar" />)}</div></div>}
      </div>
    </Modal>
  );
}

function VehicleModal({ v, onClose }: { v: { id: number; name: string }; onClose: () => void }) {
  const { self, scene } = useGame();
  const [info, setInfo] = useState<any>(null); const [mini, setMini] = useState<any>(null);
  const live = scene?.vehicles.find((x) => x.id === v.id);
  const load = () => action('vehicle_inspect', { vehicleId: v.id }, { silent: true }).then((r) => r.ok && setInfo(r.vehicle));
  useEffect(() => { load(); }, [v.id, live?.running, live?.driverId]);
  const driver = live?.driverId === self?.id;
  const parts = self?.inventory.filter((i) => i.category === 'vehicle') ?? [];
  const start = async (approach?: string) => { const r = await action('vehicle_start', approach ? { approach } : {}); if (r.ok) { setMini(r.minigame); if (r.started) { useGame.getState().toast('Motor ligado!', 'success'); audio.sfx('engine_start', 0.8); } else if (!r.minigame || r.minigame.lastSuccess === false) audio.sfx('engine_fail', 0.7); load(); } };
  return (
    <Modal title={v.name} onClose={onClose} width={560}>
      {info && <div className="grid grid-cols-3 gap-2 text-sm mb-4">{[['Combustível', `${info.fuel}${typeof info.fuel === 'number' ? ` / ${info.fuelMax} L` : ''}`], ['Motor', info.engine], ['Pneus', info.tires], ['Bateria', info.battery], ['Lataria', info.body], ['Lugares', info.seats]].map(([k, val]) => <div key={k} className="bg-[#101109] border border-black shadow-[inset_0_2px_4px_rgba(0,0,0,.6)] px-2.5 py-1.5"><div className="label">{k}</div>{String(val)}</div>)}</div>}
      <div className="text-[13.5px] text-ink-300 mb-3">{info?.hasKey ? 'A chave está no contato.' : 'Sem chave. Dar partida exige improviso, e faz barulho.'}</div>
      <div className="flex flex-wrap gap-1.5">
        {!driver ? <button className="btn btn-moss" onClick={() => action('vehicle_enter', { vehicleId: v.id })}><GameIcon name="vehicle" size={16} />Assumir o volante</button> : <>
          {!live?.running && <button className="btn btn-moss" onClick={() => start()}>Dar partida</button>}
          {live?.running && <button className="btn" onClick={() => action('vehicle_stop')}>Desligar</button>}
          <button className="btn" onClick={() => action('vehicle_exit')}>Sair do veículo</button>
        </>}
        {parts.map((p) => <button key={p.id} className="btn !py-1" onClick={() => action('vehicle_service', { vehicleId: v.id, itemId: p.id }).then(load)}>Usar {p.name}</button>)}
      </div>
      {mini && (
        <div className="mt-4 border border-amber-450/40 p-3">
          <div className="text-amber-450 font-semibold">Ligação direta: etapa {mini.step + 1} de {mini.stepsTotal}</div>
          <div className="grid grid-cols-2 gap-3 mt-2 text-[13px] text-ink-300"><div>Progresso<div className="mt-1"><Bar value={Math.min(3, mini.progress)} max={3} color="#9ab567" small /></div></div><div>Barulho<div className="mt-1"><Bar value={Math.min(5, mini.noise)} max={5} color="#e0554a" small /></div></div></div>
          {mini.lastSuccess !== undefined && <div className={`text-xs mt-1 ${mini.lastSuccess ? 'text-moss-400' : 'text-blood-400'}`}>{mini.lastSuccess ? 'Algo encaixa. O painel pisca.' : 'Faísca e um estalo alto. Nada.'}</div>}
          <div className="flex gap-1.5 mt-2">
            <button className="btn !py-1" onClick={() => start('careful')}>Com cuidado</button>
            <button className="btn !py-1" onClick={() => start('normal')}>Normal</button>
            <button className="btn btn-danger !py-1" onClick={() => start('risky')}>Arriscar</button>
          </div>
          <p className="text-[12.5px] text-ink-400 mt-2">Sua habilidade em Mecânica define as chances. Arriscar avança mais, mas faz mais barulho.</p>
        </div>
      )}
      {driver && live?.running && <div className="text-[13.5px] text-moss-400 mt-3">Escolha uma saída e clique em "Ir de veículo". Quem estiver seguindo você embarca como passageiro.</div>}
    </Modal>
  );
}

function ItemRow({ i, onClick, hint }: { i: Item; onClick: () => void; hint: string }) {
  return (
    <button className="w-full text-left px-2.5 py-1.5 bg-[#101109] border border-black hover:border-amber-450 text-[14px] flex items-center gap-2" onClick={onClick} aria-label={`${hint === 'pegar' ? 'Pegar' : 'Guardar'} ${i.name}`}>
      <GameIcon name={itemIcon(i.defId, i.category)} size={18} className="text-ink-300" /><span className="flex-1">{i.name}</span><span className="text-ink-400 text-[12.5px]">{i.quantity > 1 ? `×${i.quantity}` : ''} {hint}</span>
    </button>
  );
}

function AidModal({ targetId, onClose }: { targetId: string; onClose: () => void }) {
  const self = useGame((s) => s.self);
  const meds = self?.inventory.filter((i) => i.category === 'medical') ?? [];
  return (
    <Modal title="Socorrer aliado (2 PA)" onClose={onClose}>
      <div className="flex flex-wrap gap-1.5">{meds.map((m) => <button key={m.id} className="btn" onClick={() => { action('combat', { action: { type: 'use_item', itemId: m.id, targetId } }); onClose(); }}>{m.name} ×{m.quantity}</button>)}</div>
    </Modal>
  );
}

function DeathScreen() {
  const { death } = useGame();
  return (
    <div className="fixed inset-0 z-[60] bg-black flex items-center justify-center anim-fade">
      <div className="text-center max-w-lg px-6">
        <GameIcon name="memorial" size={52} className="mx-auto text-ink-400" />
        <div className="font-display font-extrabold text-[54px] leading-none mt-4 text-ink-100">{death!.name}</div>
        <div className="text-[15px] text-tape mt-3">Causa da morte: {death!.cause}</div>
        {death!.reanimated && <p className="text-blood-400 mt-4 italic">O corpo vai se levantar se ninguém impedir. Seus companheiros podem reencontrá-lo.</p>}
        <p className="text-ink-300 text-[15px] mt-6">Seus pertences ficaram com o corpo. A história continua, com outra pessoa.</p>
        <div className="flex justify-center gap-2 mt-6"><a className="btn" href="#/memorial">Memorial</a><button className="btn btn-moss" onClick={() => location.reload()}>Criar novo personagem</button></div>
      </div>
    </div>
  );
}
