import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { GameIcon } from '../components/GameIcon';
import { Modal } from '../components/ui';
import { useGame } from '../lib/store';
import { action } from '../lib/socket';

export type HordeIntel = {
  id: number; source: 'radio' | 'binoculars' | 'heard'; locationId: string; locationName: string; distance: number | null;
  size: number | null; path: string[]; targetName: string | null; nextMoveAt: string; headingHere: boolean; etaMinutes: number | null;
};
type HordeState = { hordes: HordeIntel[]; gear: { radio: boolean; binoculars: boolean }; loadedAt: number; refresh: () => void };

let inflight: Promise<unknown> | null = null;
/** O que o personagem sabe das hordas. Atualiza quando o servidor avisa que elas se moveram. */
export const useHordeStore = create<HordeState>((set) => ({
  hordes: [], gear: { radio: false, binoculars: false }, loadedAt: 0,
  refresh: () => {
    if (inflight) return;
    inflight = action('horde_intel', {}, { silent: true }).then((r: any) => { if (r.ok) set({ hordes: r.hordes, gear: r.gear, loadedAt: Date.now() }); }).finally(() => { inflight = null; });
  },
}));

/** Mantém as informações em dia: ao montar, ao mudar de lugar, quando o servidor avisa, e a cada minuto. */
export function useHordes() {
  const locationId = useGame((s) => s.self?.locationId);
  const tick = useGame((s) => s.hordesTick);
  const itemsKey = useGame((s) => s.self?.inventory.filter((i) => i.defId === 'radio' || i.defId === 'binoculars').length ?? 0);
  const refresh = useHordeStore((s) => s.refresh);
  useEffect(() => { refresh(); }, [locationId, tick, itemsKey, refresh]);
  useEffect(() => { const t = setInterval(refresh, 60000); return () => clearInterval(t); }, [refresh]);
  return useHordeStore();
}

const SOURCE_LABEL: Record<HordeIntel['source'], string> = { radio: 'pelo rádio', binoculars: 'pelo binóculo', heard: 'pelos gemidos' };
export const hordeSizeLabel = (h: HordeIntel) => (h.size == null ? 'muitos infectados' : `${h.source === 'radio' ? '~' : ''}${h.size} infectados`);

/** Aviso na cena quando uma horda está perto ou vindo para cá, com o que dá para fazer. */
export function HordeAlert({ mobile }: { mobile?: boolean }) {
  const self = useGame((s) => s.self);
  const { hordes } = useHordes();
  const [lure, setLure] = useState(false);
  if (!self || self.state === 'traveling') return null;
  const near = hordes.filter((h) => (h.distance != null && h.distance <= 2) || h.headingHere);
  if (!near.length) return null;
  const h = near[0];
  const here = h.distance === 0;
  const canHide = (h.distance ?? 9) <= 1 && self.state === 'idle';
  const text = here ? `Uma horda (${hordeSizeLabel(h)}) está aqui.`
    : h.headingHere ? `Horda de ${hordeSizeLabel(h)} vindo para cá, ${h.etaMinutes != null ? (h.etaMinutes <= 1 ? 'chegando agora' : `chega em ~${h.etaMinutes} min`) : 'em breve'} (agora em ${h.locationName}).`
    : `Horda de ${hordeSizeLabel(h)} em ${h.locationName}, a ${h.distance} trecho${h.distance === 1 ? '' : 's'} daqui (${SOURCE_LABEL[h.source]}).`;
  return (
    <div role="alert" className={`border border-blood-500/70 bg-blood-500/15 px-3 py-2 ${mobile ? 'mb-3' : 'mb-2 max-w-2xl'}`}>
      <div className="flex items-start gap-2 text-[14px]"><GameIcon name="horde" size={20} className="text-blood-400 shrink-0 mt-0.5" /><span>{text}{near.length > 1 ? ` E mais ${near.length - 1} por perto.` : ''}</span></div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        <button className="btn !py-1" disabled={!canHide} title={canHide ? 'Fica escondido até a horda passar (dá para sair antes). Furtividade ajuda a não ser notado.' : 'Só dá para se esconder com a horda aqui ou a um trecho.'} onClick={() => action('horde_hide')}><GameIcon name="hide" size={16} />Esconder-se</button>
        <button className="btn !py-1" disabled={self.state !== 'idle'} onClick={() => setLure(true)}><GameIcon name="lure" size={16} />Atrair com barulho</button>
        <button className="btn !py-1" onClick={() => useGame.getState().set({ panel: 'map' })}><GameIcon name="map" size={16} />Ver no mapa</button>
        {!here && <span className="text-[12.5px] text-ink-300 self-center">Ou fuja: viaje para longe do caminho dela.</span>}
      </div>
      {lure && <LureModal onClose={() => setLure(false)} />}
    </div>
  );
}

/** Escolher como fazer barulho: cada jeito tem alcance e risco diferentes. */
function LureModal({ onClose }: { onClose: () => void }) {
  const self = useGame((s) => s.self);
  if (!self) return null;
  const has = (id: string) => self.inventory.some((i) => i.defId === id);
  const opts = [
    { method: 'alarm_clock', label: 'Deixar um despertador tocando', detail: 'Alcance de 2 trechos. Toca daqui a uns minutos: dá tempo de você ir embora antes de a horda chegar. Gasta o despertador.', ok: has('alarm_clock'), why: 'Você não tem despertador.' },
    { method: 'firecrackers', label: 'Estourar um rojão', detail: 'Alcance de 3 trechos, a horda vem rápido. Os infectados daqui também ouvem. Gasta 1 rojão.', ok: has('firecrackers'), why: 'Você não tem rojão.' },
    { method: 'horn', label: 'Buzinar o veículo', detail: 'Alcance de 2 trechos. Gasta um pouco de bateria.', ok: !!self.vehicleId, why: 'Você precisa estar num veículo.' },
    { method: 'shout', label: 'Gritar e bater em metal', detail: 'Só alcança hordas a 1 trecho, e é bem provável que os infectados daqui venham primeiro.', ok: true, why: '' },
  ] as const;
  return (
    <Modal title="Atrair a horda" onClose={onClose} width={520}>
      <p className="text-[13.5px] text-ink-300 mb-3">Hordas por perto mudam de rumo e vêm para <b>onde você está agora</b>. Use para tirar a horda do caminho de uma base, ou para levar ela para longe de alguém. Depois, saia daqui.</p>
      <div className="space-y-2">
        {opts.map((o) => (
          <button key={o.method} className="btn w-full !justify-start !text-left !items-start flex-col !gap-0.5 !py-2" disabled={!o.ok} onClick={async () => { const r = await action('horde_lure', { method: o.method }); if (r.ok) onClose(); }}>
            <span className="font-semibold">{o.label}</span>
            <span className="text-[12.5px] text-ink-300 font-normal">{o.ok ? o.detail : o.why}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** Botão para sair do esconderijo (aparece junto da barra de "ocupado"). */
export function StopHidingButton() {
  const type = useGame((s) => s.self?.busyAction?.type);
  if (type !== 'hide') return null;
  return <button className="btn !py-1 mt-1.5" onClick={() => action('horde_stop_hide')}><GameIcon name="hide" size={15} />Sair do esconderijo</button>;
}
