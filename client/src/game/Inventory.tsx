import { NoteText } from './Stories';
import { useEffect, useMemo, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { GameIcon, itemIcon } from '../components/GameIcon';
import { useGame } from '../lib/store';
import { action } from '../lib/socket';
import type { Item } from '../lib/types';
import { Bar, Drawer, Empty, Modal, Section } from '../components/ui';
import { useIsMobile } from '../lib/mobile';
import { audio } from '../lib/audio';

const SLOTS: { id: string; label: string; icon: string }[] = [
  { id: 'head', label: 'Cabeça', icon: 'military_helmet' }, { id: 'face', label: 'Rosto', icon: 'gas_mask' }, { id: 'shirt', label: 'Camisa', icon: 'tshirt' }, { id: 'jacket', label: 'Casaco', icon: 'winter_coat' },
  { id: 'vest', label: 'Colete', icon: 'police_vest' }, { id: 'pants', label: 'Calça', icon: 'jeans' }, { id: 'boots', label: 'Botas', icon: 'combat_boots' }, { id: 'gloves', label: 'Luvas', icon: 'leather_gloves' },
  { id: 'back', label: 'Mochila', icon: 'hiking_bag' }, { id: 'primary', label: 'Na mão', icon: 'cat-weapon' }, { id: 'secondary', label: 'Coldre', icon: 'pistol_9mm' },
];
const CATS: Record<string, string> = { all: 'Tudo', food: 'Comida', water: 'Água', medical: 'Medicina', weapon: 'Armas', ammo: 'Munição', clothing: 'Roupas', tool: 'Ferramentas', building: 'Construção', vehicle: 'Veículo', book: 'Livros', misc: 'Outros', container: 'Mochilas' };
const RARITY: Record<string, string> = { common: 'text-ink-200', uncommon: 'text-moss-400', rare: 'text-steel-400', very_rare: 'text-amber-450' };
const RARITY_NAME: Record<string, string> = { common: 'comum', uncommon: 'incomum', rare: 'raro', very_rare: 'muito raro' };

export function InventoryPanel({ onClose }: { onClose: () => void }) {
  const { self, scene } = useGame();
  const [cat, setCat] = useState('all'); const [q, setQ] = useState(''); const [sel, setSel] = useState<number | null>(null);
  const mobile = useIsMobile();
  const [drag, setDrag] = useState<number | null>(null); const [over, setOver] = useState<string | null>(null);
  const items = self?.inventory ?? [];
  const loose = items.filter((i) => !i.slot);
  const filtered = useMemo(() => loose.filter((i) => (cat === 'all' || i.category === cat) && (!q || i.name.toLowerCase().includes(q.toLowerCase()))), [items, cat, q]);
  if (!self) return null;
  const selected = items.find((i) => i.id === sel) ?? null;
  const cats = ['all', ...new Set(loose.map((i) => i.category))];
  const dropOn = async (target: string) => {
    setOver(null); if (drag == null) return;
    const it = items.find((i) => i.id === drag); setDrag(null); if (!it) return;
    if (target === 'ground') await action('drop', { itemId: it.id });
    else if (target === 'bag') { if (it.slot) await action('unequip', { itemId: it.id }); }
    else await action('equip', { itemId: it.id, slot: target });
    audio.sfx('ui_click', 0.5);
  };
  const dz = (id: string) => ({ onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(id); }, onDragLeave: () => setOver(null), onDrop: (e: React.DragEvent) => { e.preventDefault(); dropOn(id); } });
  const carry = self.carry;
  return (
    <Drawer title="Mochila" onClose={onClose} width={780} icon={<GameIcon name="inventory" size={22} />}>
      <div className="mb-5">
        <div className="flex justify-between text-[13.5px] mb-1.5"><span className="text-ink-300">Peso carregado</span><span className={`tabular-nums ${carry.ratio > 1 ? 'text-blood-400 font-semibold' : 'text-ink-200'}`}>{carry.weight.toFixed(1)} de {carry.capacity.toFixed(1)} kg{carry.ratio > 1 ? ', sobrecarregado' : ''}</span></div>
        <Bar value={carry.weight} max={carry.capacity} color={carry.ratio > 1 ? '#e0554a' : carry.ratio > 0.8 ? '#f0a73a' : '#9ab567'} />
      </div>
      <div className="grid grid-cols-[214px_1fr] max-sm:grid-cols-1 gap-5">
        <div className="max-sm:order-2">
          <h3 className="text-[13.5px] text-tape mb-2">Vestindo e empunhando</h3>
          <div className="grid grid-cols-2 max-sm:grid-cols-3 gap-1.5">
            {SLOTS.map((s) => {
              const it = items.find((i) => i.slot === s.id);
              return (
                <button key={s.id} type="button" {...dz(s.id)} draggable={!!it} onDragStart={() => it && setDrag(it.id)} onClick={() => it && setSel(it.id)} aria-label={`${s.label}: ${it ? it.name : 'vazio'}`}
                  className={`relative h-[68px] p-1.5 text-left flex flex-col justify-between transition bg-[#101109] border shadow-[inset_0_2px_5px_rgba(0,0,0,.7)] ${over === s.id ? 'border-amber-450 bg-amber-450/10' : sel === it?.id && it ? 'border-amber-450' : 'border-black'}`}>
                  <span className="text-[11.5px] text-ink-400 leading-none">{s.label}</span>
                  <GameIcon name={it ? itemIcon(it.defId, it.category) : s.icon} size={26} className={`absolute right-1.5 top-1.5 ${it ? RARITY[it.rarity] : 'text-ink-700'}`} />
                  {it ? <span className={`text-[12.5px] leading-tight pr-1 ${RARITY[it.rarity]}`}>{it.name}{it.data.ammo !== undefined && it.props.magSize ? <span className="text-ink-400"> {it.data.ammo}/{it.props.magSize}</span> : null}</span> : <span className="text-[12px] text-ink-600">vazio</span>}
                </button>
              );
            })}
          </div>
          <div {...dz('ground')} className={`mt-3 h-14 max-sm:hidden border border-dashed flex items-center justify-center gap-2 text-[13px] ${over === 'ground' ? 'border-blood-400 text-blood-400 bg-blood-900/30' : 'border-ink-600 text-ink-400'}`}><Trash2 size={15} />Arraste aqui para largar no chão</div>
        </div>
        <div {...dz('bag')} className={`max-sm:order-1 ${over === 'bag' ? 'outline outline-1 outline-amber-450/50' : ''}`}>
          <div className="relative mb-2.5"><Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-500" /><label htmlFor="inv-q" className="sr-only">Buscar item</label><input id="inv-q" className="input !pl-8 !py-1.5" placeholder="Buscar item" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="flex flex-wrap gap-1 mb-3" role="tablist" aria-label="Categorias">
            {cats.map((c) => (
              <button key={c} role="tab" aria-selected={cat === c} onClick={() => setCat(c)} className={`chip !py-1 ${cat === c ? 'text-amber-450 !bg-amber-450/10' : 'text-ink-300 hover:text-ink-100'}`}>
                {c !== 'all' && <GameIcon name={`cat-${c}`} size={13} />}{CATS[c] ?? c}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1.5 max-h-[46vh] max-sm:max-h-none max-sm:overflow-visible overflow-y-auto pr-1 content-start">
            {filtered.map((i) => {
              const cond = i.durabilityMax && !i.props.doses ? i.durability / i.durabilityMax : null;
              return (
                <button key={i.id} type="button" draggable onDragStart={() => setDrag(i.id)} onDragEnd={() => setDrag(null)} onClick={() => setSel(i.id)} aria-pressed={sel === i.id}
                  aria-label={`${i.name}${i.quantity > 1 ? `, ${i.quantity} unidades` : ''}${i.freshness !== undefined && i.freshness < 20 ? ', quase estragando' : ''}`}
                  className={`relative h-[94px] p-2 flex flex-col items-center justify-between text-center cursor-grab active:cursor-grabbing bg-[#101109] border shadow-[inset_0_2px_5px_rgba(0,0,0,.7)] ${sel === i.id ? 'border-amber-450 bg-amber-450/[.06]' : 'border-black hover:border-ink-500'}`}>
                  <GameIcon name={itemIcon(i.defId, i.category)} size={34} className={`${RARITY[i.rarity]} mt-0.5`} />
                  <span className="text-[12.5px] leading-tight text-ink-100 line-clamp-2">{i.name}</span>
                  {i.quantity > 1 && <span className="absolute top-1 right-1 tape !text-[13px] !px-1.5 !py-0 rotate-[3deg]">{i.quantity}</span>}
                  {i.props.doses && <span className="absolute top-1 right-1 text-[11.5px] text-ink-300">{i.durability} dose{i.durability === 1 ? '' : 's'}</span>}
                  {i.freshness !== undefined && i.freshness < 50 && <span className={`absolute top-1 left-1 ${i.freshness < 20 ? 'text-blood-400' : 'text-amber-450'}`} title={i.freshness < 20 ? 'Quase estragando' : 'Passando do ponto'}><GameIcon name="spoiled_food" size={15} label={i.freshness < 20 ? 'Quase estragando' : 'Passando do ponto'} /></span>}
                  {cond !== null && <span className="absolute bottom-0 left-0 h-[3px]" style={{ width: `${cond * 100}%`, background: cond < .3 ? '#e0554a' : cond < .6 ? '#f0a73a' : '#9ab567' }} aria-hidden />}
                </button>
              );
            })}
            {!filtered.length && <div className="col-span-4"><Empty>{q ? 'Nada com esse nome.' : 'Mochila vazia. Vasculhe lugares para encontrar coisas.'}</Empty></div>}
          </div>
        </div>
      </div>
      {selected && (mobile ? <Modal title={selected.name} onClose={() => setSel(null)}><ItemDetail item={selected} sheet /></Modal> : <ItemDetail item={selected} />)}
      {scene && scene.ground.length > 0 && (
        <Section title="No chão deste lugar">
          <div className="flex flex-wrap gap-1">{scene.ground.map((g) => <button key={g.id} className="chip text-ink-100 hover:text-amber-450" onClick={() => action('pickup', { itemId: g.id })} aria-label={`Pegar ${g.name}`}><GameIcon name={itemIcon(g.defId, g.category)} size={13} />{g.name}{g.quantity > 1 ? ` ×${g.quantity}` : ''}</button>)}</div>
        </Section>
      )}
    </Drawer>
  );
}

function ItemDetail({ item: i, sheet }: { item: Item; sheet?: boolean }) {
  const { scene, self } = useGame();
  const [giveTo, setGiveTo] = useState('');
  const [qty, setQty] = useState(i.quantity);
  useEffect(() => { setQty(i.quantity); }, [i.id, i.quantity]);
  const n = Math.max(1, Math.min(i.quantity, Math.floor(qty) || 1));
  const traveling = self?.state === 'traveling' && !!self.travel;
  const others = (traveling ? self!.travel!.companions ?? [] : scene?.characters ?? []).filter((c) => c.id !== self?.id);
  const p = i.props;
  const consumable = ['food', 'water', 'book'].includes(i.category) || p.smokable;
  const verb = p.smokable ? 'Fumar' : p.doses ? 'Tomar uma dose' : i.category === 'food' ? 'Comer' : i.category === 'water' ? 'Beber' : i.category === 'book' ? 'Ler' : 'Usar';
  return (
    <div className={sheet ? '' : 'mt-5 panel-plate p-4 anim-fade'}>
      <div className="flex justify-between items-start gap-4 max-sm:flex-wrap max-sm:gap-3">
        <div className="flex items-start gap-3">
          <div className="w-14 h-14 shrink-0 flex items-center justify-center bg-[#101109] border border-black shadow-[inset_0_2px_5px_rgba(0,0,0,.7)]"><GameIcon name={itemIcon(i.defId, i.category)} size={36} className={RARITY[i.rarity]} /></div>
          <div>{!sheet && <h3 className="font-display font-extrabold text-[24px] leading-none text-ink-100">{i.name}</h3>}<div className="text-[13px] text-ink-300 mt-1">{CATS[i.category] ?? i.category}, {RARITY_NAME[i.rarity] ?? i.rarity}, {i.weight} kg{i.quantity > 1 ? `, ${i.quantity} unidades` : ''}</div>{i.description && <p className="text-[13.5px] text-ink-300 mt-1.5 max-w-md">{i.description}</p>}</div>
        </div>
        {i.durabilityMax > 0 && <div className="w-32"><Bar label={p.doses ? 'Doses' : 'Condição'} value={i.durability} max={i.durabilityMax} color="#9ab567" small /></div>}
        {i.freshness !== undefined && <div className="w-32"><Bar label="Frescor" value={i.freshness} color={i.freshness < 25 ? '#e0554a' : '#9ab567'} small /></div>}
      </div>
      <div className="grid grid-cols-3 max-sm:grid-cols-2 gap-2 text-[13.5px] text-ink-300 mt-3">
        {p.damage && <div>Dano: <b>{p.damage}</b></div>}{p.range && <div>Alcance: <b>{p.range}</b></div>}{p.apCost && <div>Custo: <b>{p.apCost} PA</b></div>}
        {p.twoHanded && <div className="text-amber-450">Duas mãos</div>}{p.ammoType && <div>Munição: {p.ammoType.replace('ammo_', '')} ({i.data.ammo ?? 0}/{p.magSize})</div>}
        {p.hunger && <div>Fome {p.hunger}</div>}{p.thirst && <div>Sede {p.thirst}</div>}{p.capacity && <div>+{p.capacity} kg de carga</div>}
        {p.protection && Object.keys(p.protection).length > 0 && <div className="col-span-3 max-sm:col-span-2">Proteção: {Object.entries(p.protection as Record<string, number>).map(([r, v]) => `${r} ${Math.round(v * 100)}%`).join(', ')}</div>}
        {p.use && <div className="col-span-3 max-sm:col-span-2 text-moss-400">Uso médico: aplique pelo painel do Corpo, escolhendo o ferimento.</div>}
      </div>
      {i.note && <NoteText note={i.note} />}
      <div className="flex flex-wrap gap-1.5 mt-3 max-sm:[&>button]:flex-1">
        {consumable && <button className="btn btn-moss" onClick={() => { action('use', { itemId: i.id }); audio.sfx(i.category === 'water' ? 'drink' : 'eat'); }}>{verb}</button>}
        {i.equipSlot && !i.slot && <button className="btn" onClick={() => action('equip', { itemId: i.id })}>Equipar</button>}
        {(p.weaponType || i.category === 'tool') && !i.slot && !i.equipSlot && null}
        {i.slot && <button className="btn" onClick={() => action('unequip', { itemId: i.id })}>Desequipar</button>}
        {p.ammoType && i.slot === 'primary' && <button className="btn" onClick={() => action('reload')}>Recarregar</button>}
        {p.ammoType && (i.data.ammo ?? 0) > 0 && <button className="btn" onClick={() => action('unload', { itemId: i.id })}>Descarregar</button>}
        {i.durabilityMax > 0 && !p.doses && i.durability < i.durabilityMax && <button className="btn" title="Armas brancas: sucata + pregos + martelo · armas de fogo: sucata + componentes + chave de fenda · roupas: 2 trapos" onClick={() => action('repair_item', { itemId: i.id })}>Reparar</button>}
        {i.rippable && !i.slot && <button className="btn" title="Vira trapos para curativos e reparos (mais trapos se a peça estiver inteira)" onClick={() => action('tear', { itemId: i.id })}>Rasgar em trapos</button>}
        {i.canDismantle && !i.rippable && <button className="btn" title="Destrói o item e devolve parte dos materiais" onClick={() => action('dismantle', { itemId: i.id })}>Desmontar</button>}
      </div>
      {i.quantity > 1 && (
        <div className="flex items-center gap-2 mt-3 text-[13.5px] text-ink-300">
          <label htmlFor={`qty-${i.id}`}>Quantidade para largar, entregar ou guardar</label>
          <button type="button" className="btn !px-2 !py-0.5" aria-label="Menos um" onClick={() => setQty(Math.max(1, n - 1))}>−</button>
          <input id={`qty-${i.id}`} type="number" inputMode="numeric" min={1} max={i.quantity} className="input !py-1 !w-16 text-center tabular-nums" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          <button type="button" className="btn !px-2 !py-0.5" aria-label="Mais um" onClick={() => setQty(Math.min(i.quantity, n + 1))}>+</button>
          <button type="button" className="text-[12.5px] underline text-ink-400 hover:text-ink-100" onClick={() => setQty(i.quantity)}>tudo ({i.quantity})</button>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 mt-2 max-sm:[&>button]:flex-1">
        {!traveling && <button className="btn btn-danger" onClick={() => action('drop', { itemId: i.id, qty: n })}>Largar{i.quantity > 1 ? ` ${n}` : ''}</button>}
        {others.length > 0 && (
          <span className="flex gap-1">
            <select aria-label="Entregar para quem" className="input !py-1 !w-auto text-[13.5px]" value={giveTo} onChange={(e) => setGiveTo(e.target.value)}><option value="">Entregar para…</option>{others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <button className="btn" disabled={!giveTo} onClick={() => action('give', { targetId: Number(giveTo), itemId: i.id, qty: n })}>Entregar{i.quantity > 1 ? ` ${n}` : ''}</button>
          </span>
        )}
        {!traveling && scene?.containers.filter((c) => c.kind !== 'corpse').map((c) => <button key={c.id} className="btn" onClick={() => action('store', { itemId: i.id, containerId: c.id, qty: n })}>Guardar em {c.name}</button>)}
      </div>
    </div>
  );
}
