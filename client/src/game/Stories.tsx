import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { GameIcon } from '../components/GameIcon';
import { Hotspot } from './Scene';
import { useGame } from '../lib/store';
import { action } from '../lib/socket';
import { portraitUrl } from '../lib/api';
import { Confirm, Img, Modal, Tip } from '../components/ui';
import type { MuralPost, MysteryView } from '../lib/types';

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'agora'; if (m < 60) return `há ${m} min`; const h = Math.round(m / 60); if (h < 24) return `há ${h} h`; return `há ${Math.round(h / 24)} d`;
};

/** Botões na cena: mural, cofres, corpos que vão levantar e mortos que levantaram. */
export function StoryHotspots() {
  const scene = useGame((s) => s.scene);
  const [mural, setMural] = useState(false);
  const [safe, setSafe] = useState<null | { mysteryId: string; name: string; digits: number }>(null);
  const [corpse, setCorpse] = useState<null | { containerId: number; name: string }>(null);
  const [fight, setFight] = useState<null | { id: number; name: string }>(null);
  if (!scene) return null;
  return (
    <>
      <Hotspot icon="mural" onClick={() => setMural(true)}>Mural de recados{scene.muralCount ? `, ${scene.muralCount} ${scene.muralCount === 1 ? 'recado' : 'recados'}` : ''}</Hotspot>
      {scene.safes?.map((sf) => <Hotspot key={sf.mysteryId} icon="safe" tone="warm" onClick={() => setSafe(sf)}>{sf.name}</Hotspot>)}
      {scene.pendingCorpses?.map((c) => (
        <Tip key={c.containerId} text="O corpo vai se levantar como infectado. Dá para impedir — e é pesado.">
          <Hotspot icon="corpse" tone="danger" onClick={() => setCorpse(c)}>Impedir que {c.name.split(' ')[0]} se levante</Hotspot>
        </Tip>
      ))}
      {scene.risen?.map((r) => (
        <Hotspot key={r.id} icon="risen" tone="danger" disabled={r.inCombat} onClick={() => setFight(r)}>{r.name}, infectado{r.inCombat ? ' (em confronto)' : ''}</Hotspot>
      ))}
      {mural && <MuralModal onClose={() => setMural(false)} />}
      {safe && <SafeModal safe={safe} onClose={() => setSafe(null)} />}
      {corpse && <Confirm title="Fazer o que precisa ser feito" confirmLabel="Destruir o cérebro" onCancel={() => setCorpse(null)}
        onConfirm={() => { action('corpse_destroy', { containerId: corpse.containerId }); setCorpse(null); }}
        text={<p>O corpo de <b>{corpse.name}</b> ainda vai se levantar. Garantir que isso não aconteça pesa na consciência (estresse), mas os pertences continuam no corpo e ninguém vai precisar enfrentá-lo depois.</p>} />}
      {fight && <Confirm title={`Enfrentar ${fight.name}?`} confirmLabel="Enfrentar" onCancel={() => setFight(null)}
        onConfirm={() => { action('risen_fight', { risenId: fight.id }); setFight(null); }}
        text={<p>{fight.name} não é mais quem era. Está mais resistente que um infectado comum e ainda carrega o que tinha quando morreu — derrube-o para recuperar os pertences. Outros infectados por perto podem vir junto.</p>} />}
    </>
  );
}

/** Os mortos que levantaram aparecem no cenário, desfocados e sem cor. */
export function RisenFigures() {
  const scene = useGame((s) => s.scene);
  const [fight, setFight] = useState<null | { id: number; name: string }>(null);
  const list = scene?.risen ?? [];
  if (!list.length) return null;
  return (
    <>
      {list.slice(0, 2).map((r, i) => (
        <div key={r.id} className="absolute bottom-0 h-[78%] pointer-events-auto cursor-pointer group risen-sway" style={{ right: `${3 + i * 13}%`, zIndex: 2 }} title={`${r.name} (infectado)`} role="button" tabIndex={0} aria-label={`${r.name}, infectado. Enfrentar`} onClick={() => !r.inCombat && setFight(r)} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !r.inCombat) { e.preventDefault(); setFight(r); } }}>
          <Img src={portraitUrl(r.portrait)} fallback="/assets/portraits/default.png" className="h-full w-auto max-w-none object-contain object-bottom risen-filter group-hover:brightness-90" />
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 text-[13px] font-[family-name:var(--font-hand)] font-bold bg-blood-500 text-[#f6e9e2] -rotate-1 shadow">{r.name}, infectado</div>
        </div>
      ))}
      {fight && <Confirm title={`Enfrentar ${fight.name}?`} confirmLabel="Enfrentar" onCancel={() => setFight(null)}
        onConfirm={() => { action('risen_fight', { risenId: fight.id }); setFight(null); }}
        text={<p>{fight.name} está mais resistente que um infectado comum e carrega o que tinha quando morreu.</p>} />}
    </>
  );
}

function MuralModal({ onClose }: { onClose: () => void }) {
  const self = useGame((s) => s.self);
  const user = useGame((s) => s.user);
  const muralCount = useGame((s) => s.scene?.muralCount);
  const [data, setData] = useState<{ locationName: string; posts: MuralPost[] } | null>(null);
  const [text, setText] = useState('');
  const load = async () => { const r = await action('mural_list', {}, { silent: true }); if (r.ok) setData(r as any); };
  useEffect(() => { load(); }, [muralCount]);
  const staff = user && user.role !== 'player';
  return (
    <Modal title={`Mural — ${data?.locationName ?? ''}`} onClose={onClose} width={560}>
      <p className="text-xs text-ink-400 mb-3">Recados ficam aqui para quem passar depois, mesmo que você esteja offline.</p>
      <div className="flex gap-2 items-start">
        <textarea className="input h-16 text-sm flex-1" maxLength={280} placeholder="Ex.: Fui pra fazenda Miller. Não entrem no hospital — horda no 2º andar." value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-moss" disabled={text.trim().length < 2} onClick={async () => { const r = await action('mural_post', { content: text }); if (r.ok) { setText(''); load(); } }}>Pregar</button>
      </div>
      <div className="text-[12px] text-ink-400 text-right" aria-live="polite">{text.length} de 280</div>
      <div className="mt-3 max-h-[46vh] overflow-y-auto space-y-2 pr-1">
        {!data ? <div className="text-sm text-ink-400">Lendo…</div> : !data.posts.length ? <div className="text-sm text-ink-400 italic text-center py-6">O mural está vazio. Só restos de fita adesiva.</div>
          : data.posts.map((p, i) => (
            <div key={p.id} className="paper-note px-3 py-2" style={{ rotate: `${(((p.id * 37) % 5) - 2) * 0.4}deg`, marginLeft: `${(i % 3) * 4}px` }}>
              <div className="whitespace-pre-wrap text-[13.5px] leading-snug">{p.content}</div>
              <div className="flex justify-between items-center mt-1.5 text-[12.5px] opacity-80">
                <span>{p.authorName}, {ago(p.createdAt)}</span>
                {(p.characterId === self?.id || staff) && <button title="Arrancar" onClick={async () => { await action('mural_delete', { postId: p.id }); load(); }}><Trash2 size={12} /></button>}
              </div>
            </div>
          ))}
      </div>
    </Modal>
  );
}

function SafeModal({ safe, onClose }: { safe: { mysteryId: string; name: string; digits: number }; onClose: () => void }) {
  const [code, setCode] = useState(''); const [msg, setMsg] = useState<string | null>(null);
  return (
    <Modal title={safe.name} onClose={onClose}>
      <p className="text-sm text-ink-300">Um cofre de disco, pesado demais para arrombar. Os números devem estar em algum lugar — bilhetes, diários, recados.</p>
      <div className="flex gap-2 justify-center my-5">
        {Array.from({ length: safe.digits }).map((_, i) => (
          <input key={i} className="input !w-14 text-center font-mono text-2xl" maxLength={1} inputMode="numeric" value={code[i] ?? ''}
            onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(-1); const arr = code.padEnd(safe.digits, ' ').split(''); arr[i] = d || ' '; setCode(arr.join('').trimEnd()); if (d) (e.target.nextElementSibling as HTMLInputElement | null)?.focus(); }} />
        ))}
      </div>
      {msg && <div className="text-center text-sm text-blood-400 mb-2">{msg}</div>}
      <div className="flex justify-end gap-2">
        <button className="btn" onClick={onClose}>Fechar</button>
        <button className="btn btn-moss" disabled={code.replace(/\D/g, '').length < safe.digits} onClick={async () => {
          const r = await action('safe_open', { mysteryId: safe.mysteryId, code });
          if (r.ok && r.opened) onClose(); else if (r.ok) setMsg(`Nada. ${r.left > 0 ? `Mais ${r.left} tentativa(s) nesta hora.` : 'Seus dedos precisam descansar.'}`);
        }}>Girar o disco</button>
      </div>
    </Modal>
  );
}

/** Aba de mistérios no diário. */
export function MysteriesTab() {
  const [list, setList] = useState<MysteryView[] | null>(null);
  useEffect(() => { action('mysteries_list', {}, { silent: true }).then((r) => r.ok && setList(r.mysteries)); }, []);
  if (!list) return <div className="text-sm text-ink-400">Carregando…</div>;
  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-400">Bilhetes aparecem ao vasculhar certos lugares. Cada um existe uma vez só: quem acha leva o papel, mas o texto fica aqui para todos. Juntem as peças.</p>
      {list.map((m) => (
        <div key={m.id} className={`border p-3 ${m.status === 'claimed' ? 'border-moss-500/50' : m.found ? 'border-amber-450/40' : 'border-ink-700 opacity-70'}`}>
          <div className="flex justify-between items-baseline gap-2">
            <b className="font-display uppercase tracking-wide">{m.title}</b>
            <span className="label shrink-0">{m.status === 'claimed' ? `resolvido por ${m.claimedBy}` : `${m.found}/${m.total} bilhetes`}</span>
          </div>
          <div className="text-xs text-ink-400 italic mt-0.5">{m.teaser}</div>
          <div className="mt-2 space-y-2">{m.fragments.map((f) => f.found ? (
            <div key={f.id} className="paper-note px-3 py-2">
              <div className="text-[13px] font-bold opacity-85 flex items-center gap-1"><GameIcon name="note" size={14} />{f.title}</div>
              <div className="text-[13px] leading-snug mt-0.5">{f.text}</div>
              <div className="text-[12px] opacity-75 mt-1">Achado por {f.foundBy}</div>
            </div>
          ) : <div key={f.id} className="text-xs text-ink-500 border border-dashed border-ink-700 px-3 py-1.5">{f.hint}</div>)}</div>
        </div>
      ))}
    </div>
  );
}

/** Texto do bilhete no inventário. */
export function NoteText({ note }: { note: { mystery: string; title: string; text: string } }) {
  return (
    <div className="paper-note px-4 py-3 mt-3">
      <div className="text-[13px] font-bold opacity-85">{note.title} <span className="font-normal opacity-75">({note.mystery})</span></div>
      <div className="text-[14px] leading-relaxed mt-1">{note.text}</div>
    </div>
  );
}
