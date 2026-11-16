import { useEffect, useState } from 'react';
import { Stethoscope, Scissors } from 'lucide-react';
import { GameIcon } from '../components/GameIcon';
import { useGame } from '../lib/store';
import { action } from '../lib/socket';
import type { Wound } from '../lib/types';
import { Bar, Confirm, Drawer, Empty, Section } from '../components/ui';

/** Silhueta: cada região é um polígono clicável. */
const REGIONS: { id: string; d: string }[] = [
  { id: 'head', d: 'M100 12c16 0 27 12 27 29s-11 31-27 31-27-14-27-31 11-29 27-29z' },
  { id: 'neck', d: 'M89 72h22v14H89z' },
  { id: 'torso', d: 'M64 88h72l6 64H58z' },
  { id: 'abdomen', d: 'M60 154h80l-4 50H64z' },
  { id: 'left_arm', d: 'M138 90l18 6 12 92-16 4-16-80z' },
  { id: 'right_arm', d: 'M62 90l-18 6-12 92 16 4 16-80z' },
  { id: 'left_hand', d: 'M152 194l17-3 5 28-17 4z' },
  { id: 'right_hand', d: 'M48 194l-17-3-5 28 17 4z' },
  { id: 'left_leg', d: 'M101 206h35l-6 140h-22z' },
  { id: 'right_leg', d: 'M64 206h35l-7 140H70z' },
  { id: 'left_foot', d: 'M108 348h22l6 22h-30z' },
  { id: 'right_foot', d: 'M70 348h22l2 22H64z' },
];
const NAMES: Record<string, string> = { head: 'Cabeça', neck: 'Pescoço', torso: 'Tórax', abdomen: 'Abdômen', left_arm: 'Braço esquerdo', right_arm: 'Braço direito', left_hand: 'Mão esquerda', right_hand: 'Mão direita', left_leg: 'Perna esquerda', right_leg: 'Perna direita', left_foot: 'Pé esquerdo', right_foot: 'Pé direito' };
const AMPUTABLE = ['left_arm', 'right_arm', 'left_hand', 'right_hand', 'left_leg', 'right_leg', 'left_foot', 'right_foot'];
const lost = (amps: string[]) => { const s = new Set(amps); for (const a of amps) { if (a.endsWith('_arm')) s.add(a.replace('arm', 'hand')); if (a.endsWith('_leg')) s.add(a.replace('leg', 'foot')); } return s; };

/** Estado de cada região na ficha: cor + padrão (a informação nunca depende só da cor). */
const STATES = {
  bleeding: { fill: '#b8372d', pattern: 'url(#p-hatch)', label: 'Sangrando' },
  infected: { fill: '#6f8a2a', pattern: 'url(#p-dots)', label: 'Infeccionado' },
  fracture: { fill: '#6f539b', pattern: 'url(#p-cross)', label: 'Fratura' },
  hurt: { fill: '#d4862a', pattern: '', label: 'Ferido' },
  treated: { fill: '#9c9071', pattern: 'url(#p-band)', label: 'Tratado' },
} as const;
function regionState(ws: Wound[]): keyof typeof STATES | null {
  if (!ws.length) return null;
  if (ws.some((w) => w.infected)) return 'infected';
  if (ws.some((w) => w.bleeding > 0.03 && !w.bandaged)) return 'bleeding';
  if (ws.some((w) => w.type === 'fracture')) return 'fracture';
  if (ws.every((w) => w.bandaged || !['scratch', 'cut_shallow', 'cut_deep', 'laceration', 'puncture', 'bite', 'gunshot', 'amputation', 'burn'].includes(w.type))) return 'treated';
  return 'hurt';
}
function Patterns() {
  return (
    <defs>
      <pattern id="p-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#b8372d" /><line x1="0" y1="0" x2="0" y2="6" stroke="#5a1410" strokeWidth="2.4" /></pattern>
      <pattern id="p-dots" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#6f8a2a" /><circle cx="3" cy="3" r="1.4" fill="#25300c" /></pattern>
      <pattern id="p-cross" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#6f539b" /><path d="M0 0L7 7M7 0L0 7" stroke="#2c1f44" strokeWidth="1.2" /></pattern>
      <pattern id="p-band" width="8" height="5" patternUnits="userSpaceOnUse"><rect width="8" height="5" fill="#cfc4a3" /><line x1="0" y1="4.5" x2="8" y2="4.5" stroke="#8a7d5c" strokeWidth="1" /></pattern>
    </defs>
  );
}

type PatientSheet = { id: number; name: string; firstName: string; amputations: any; wounds: Wound[]; conditions: any[]; needs: { blood: number; health: number; pain: number; vitality: number; bodyTemp: number; painkillerUntil?: number; antibioticUntil?: number; [k: string]: any } };

export function BodyPanel({ onClose }: { onClose: () => void }) {
  const { self, scene } = useGame();
  const [region, setRegion] = useState<string | null>(null);
  // "Prestar socorro" abre a ficha de outra pessoa; o menu normal abre a sua
  const [patient, setPatient] = useState<number | null>(() => useGame.getState().bodyPatient ?? null);
  useEffect(() => { if (useGame.getState().bodyPatient) useGame.getState().set({ bodyPatient: null }); }, []);
  const [sheet, setSheet] = useState<PatientSheet | null>(null);
  const loadSheet = () => { if (patient) action<{ patient: PatientSheet }>('patient_sheet', { targetId: patient }, { silent: true }).then((r) => { if (r.ok) setSheet(r.patient); }); };
  useEffect(() => { setSheet(null); setRegion(null); if (!patient) return; loadSheet(); const t = setInterval(loadSheet, 4000); return () => clearInterval(t); }, [patient]);
  const [amp, setAmp] = useState<null | { region: string; targetId: number }>(null);
  if (!self) return null;
  const view: PatientSheet = patient && sheet ? sheet : { id: self.id, name: self.name, firstName: self.firstName, amputations: self.amputations, wounds: self.wounds, conditions: self.conditions, needs: self.needs };
  const other = !!patient && !!sheet;
  const amps = lost(view.amputations);
  const byRegion = (r: string) => view.wounds.filter((w) => w.region === r);
  const meds = self.inventory.filter((i) => i.category === 'medical');
  const others = scene?.characters.filter((c) => c.id !== self.id) ?? [];
  const sel = region ? byRegion(region) : view.wounds;
  const n = view.needs;
  return (
    <Drawer title={other ? `Socorro: ${view.name}` : 'Ficha médica'} onClose={onClose} width={740} icon={<GameIcon name={other ? 'aid' : 'body'} size={22} />}>
      {patient && (
        <div className="mb-4 flex flex-wrap items-center gap-3 border-l-4 border-moss-400 bg-black/25 px-3 py-2 text-[14px]">
          <span>{other ? <>Você está vendo a ficha de <b>{view.name}</b>. Os remédios usados aqui vão nele(a).</> : 'Carregando a ficha do paciente…'}</span>
          <button className="btn !py-1 !text-[13px]" onClick={() => setPatient(null)}>Ver a minha ficha</button>
        </div>
      )}
      <div className="grid grid-cols-[236px_1fr] max-sm:grid-cols-1 gap-5">
        <div className="panel-paper px-3 pt-3 pb-4 self-start rotate-[-.6deg] max-sm:w-full max-sm:max-w-[260px] max-sm:mx-auto">
          <div className="flex justify-between items-baseline font-[family-name:var(--font-hand)] text-[#3b2f1f] px-1">
            <span className="text-[17px] font-bold">Triagem</span><span className="text-[14px]">{view.firstName}</span>
          </div>
          <svg viewBox="0 0 200 380" className="w-full mt-1" role="group" aria-label="Regiões do corpo: clique para filtrar ferimentos">
            <Patterns />
            {REGIONS.map((r) => {
              if (amps.has(r.id)) return <path key={r.id} d={r.d} fill="none" stroke="#6b5a3d" strokeWidth={1.4} strokeDasharray="4 4"><title>{NAMES[r.id]}: amputado</title></path>;
              const st = regionState(byRegion(r.id)); const def = st ? STATES[st] : null;
              return (
                <path key={r.id} d={r.d} fill={def ? (def.pattern || def.fill) : 'rgba(80,60,30,.06)'} stroke={region === r.id ? '#000' : '#3b2f1f'} strokeWidth={region === r.id ? 2.8 : 1.4}
                  tabIndex={0} role="button" aria-pressed={region === r.id} aria-label={`${NAMES[r.id]}${def ? `: ${def.label.toLowerCase()}` : ''}`}
                  className="cursor-pointer hover:opacity-80 transition focus:outline-none" onClick={() => setRegion(region === r.id ? null : r.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setRegion(region === r.id ? null : r.id)}>
                  <title>{NAMES[r.id]}{def ? `: ${def.label.toLowerCase()}` : ''}</title>
                </path>
              );
            })}
          </svg>
          <ul className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2 text-[12.5px] text-[#3b2f1f]">
            {Object.entries(STATES).map(([k, v]) => <li key={k} className="flex items-center gap-1.5"><svg width="14" height="14" aria-hidden><Patterns /><rect width="14" height="14" fill={v.pattern || v.fill} stroke="#3b2f1f" /></svg>{v.label}</li>)}
            <li className="flex items-center gap-1.5"><svg width="14" height="14" aria-hidden><rect x=".5" y=".5" width="13" height="13" fill="none" stroke="#6b5a3d" strokeDasharray="3 2" /></svg>Amputado</li>
          </ul>
        </div>
        <div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Bar label="Sangue" value={n.blood} color="#c73a2e" />
            <Bar label="Saúde geral" value={n.health} color="#9ab567" />
            <Bar label="Dor" value={n.pain} color="#e0554a" />
            <Bar label="Vitalidade" value={n.vitality} color="#f0a73a" />
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3 text-[13px]">
            <span className="chip text-ink-200"><GameIcon name="temperature" size={13} />{n.bodyTemp.toFixed(1)}°C</span>
            {n.painkillerUntil && n.painkillerUntil > Date.now() ? <span className="chip text-steel-400"><GameIcon name="painkillers" size={13} />Sob analgésicos</span> : null}
            {n.antibioticUntil && n.antibioticUntil > Date.now() ? <span className="chip text-moss-400"><GameIcon name="antibiotics" size={13} />Antibióticos ativos</span> : null}
          </div>
          {!other && self.mods.notes.length > 0 && <ul className="mb-5 space-y-1 border-l-2 border-amber-450/60 pl-3">{self.mods.notes.map((x) => <li key={x} className="text-[13.5px] text-amber-200 flex items-start gap-1.5"><GameIcon name="danger" size={14} className="mt-0.5 text-amber-450" />{x}</li>)}</ul>}
          <Section title={region ? `Ferimentos: ${NAMES[region].toLowerCase()}` : 'Ferimentos'} right={region && <button className="text-[13px] text-ink-300 hover:text-ink-100 underline underline-offset-2" onClick={() => setRegion(null)}>ver todos</button>}>
            {sel.length ? <div className="space-y-2">{sel.map((w) => <WoundCard key={w.id} w={w} meds={meds} targetId={view.id} onDone={loadSheet} />)}</div> : <Empty>Nenhum ferimento{region ? ' nesta região' : ''}.</Empty>}
          </Section>
          <Section title="Doenças e condições">
            {view.conditions.length ? view.conditions.map((c) => (
              <div key={c.id} className={`border-l-4 bg-[#101109] px-3 py-2 mb-1.5 text-[14px] ${c.hidden ? 'border-ink-500' : 'border-blood-500'}`}>
                <div className="flex justify-between items-center"><b className="flex items-center gap-1.5"><GameIcon name={c.kind === 'zombie_infection' ? 'infection' : c.hidden ? 'danger' : 'infection'} size={15} className={c.hidden ? 'text-ink-400' : 'text-blood-400'} />{c.name}</b><span className="text-[12.5px] text-ink-400">estágio {c.stage}{c.progress !== undefined ? `, ${Math.round(c.progress * 100)}%` : ''}</span></div>
                {c.symptoms && <div className="text-[13px] text-ink-300 mt-0.5">{c.symptoms}</div>}
                {c.hidden && <div className="text-[12.5px] text-ink-400 mt-1">A causa é desconhecida. Um médico poderia identificar.</div>}
              </div>
            )) : <Empty>Nada diagnosticado.</Empty>}
          </Section>
          {!other && <Addictions />}
          <Section title="Tratar e procedimentos">
            <div className="flex gap-2 flex-wrap items-center">
              <select aria-label="Paciente" className="input !py-1.5 !w-auto text-[14px]" value={patient ?? ''} onChange={(e) => setPatient(Number(e.target.value) || null)}>
                <option value="">Você mesmo</option>{others.map((c) => <option key={c.id} value={c.id}>{c.name}{c.visibleCondition !== 'normal' ? ` (${c.visibleCondition})` : ''}</option>)}
              </select>
              <button className="btn" onClick={() => action('diagnose', { targetId: patient ?? self.id })}><Stethoscope size={14} />Examinar</button>
              {patient && meds.map((m) => <button key={m.id} className="btn !py-1" onClick={() => action('treat', { targetId: patient, itemId: m.id }).then(loadSheet)}>{m.name}</button>)}
            </div>
            <div className="flex gap-2 flex-wrap items-center mt-3">
              <span className="label">Amputação de emergência:</span>
              {AMPUTABLE.filter((r) => !amps.has(r)).map((r) => <button key={r} className="chip text-ink-200 hover:text-blood-400" onClick={() => setAmp({ region: r, targetId: patient ?? self.id })}>{NAMES[r]}</button>)}
            </div>
            <p className="text-[12.5px] text-ink-400 mt-1.5">Exige serrote ou machado e 2 bandagens. Irreversível. Só contém a infecção se feita a tempo, e nunca é garantido.</p>
          </Section>
        </div>
      </div>
      {amp && (
        <Confirm title="Amputação: não tem volta" confirmLabel={amp.targetId === self.id ? 'Amputar' : 'Pedir consentimento e amputar'} onCancel={() => setAmp(null)}
          onConfirm={async () => {
            const a = amp; setAmp(null);
            if (a.targetId !== self.id) { await action('amputation_request', { targetId: a.targetId, region: a.region }); useGame.getState().toast('Pedido enviado. Quando o paciente consentir, confirme novamente o procedimento.', 'info'); useGame.getState().set({ modal: { kind: 'amputation_ready', data: a } }); }
            else await action('amputate', { targetId: a.targetId, region: a.region });
          }}
          text={<>Remover permanentemente: <b>{NAMES[amp.region]}</b>{amp.targetId !== self.id ? ' do paciente' : ' (em si mesmo, com grande risco)'}. O membro nunca volta. Equipamentos e ações ficarão limitados.</>} />
      )}
    </Drawer>
  );
}

function WoundCard({ w, meds, targetId, onDone }: { w: Wound; meds: { id: number; name: string; props: Record<string, any>; quantity: number }[]; targetId: number; onDone?: () => void }) {
  const applicable = meds.filter((m) => {
    const u = m.props.use;
    if (u === 'splint') return w.type === 'fracture' && !w.splinted;
    if (u === 'bandage' || u === 'medkit') return w.type !== 'fracture';
    if (u === 'disinfect') return !w.disinfected && w.type !== 'bruise' && w.type !== 'fracture';
    if (u === 'suture') return !w.sutured && ['cut_deep', 'laceration', 'puncture', 'gunshot', 'bite', 'amputation', 'cut_shallow'].includes(w.type);
    return u === 'painkiller' || u === 'antibiotic';
  });
  return (
    <div className={`border-l-4 p-3 bg-[#101109] shadow-[inset_0_2px_5px_rgba(0,0,0,.6)] ${w.type === 'bite' || w.infected ? 'border-blood-500' : w.bleeding > 0.03 && !w.bandaged ? 'border-[#c73a2e]' : 'border-ink-500'}`}>
      <div className="flex justify-between items-baseline gap-2">
        <div className="flex items-center gap-1.5"><GameIcon name={w.type === 'fracture' ? 'fracture' : w.type === 'bite' ? 'zombie' : 'bleeding'} size={16} className={w.type === 'bite' || w.infected ? 'text-blood-400' : 'text-ink-300'} /><span><b className={w.type === 'bite' ? 'text-blood-400' : ''}>{w.typeName}</b><span className="text-[13px] text-ink-400">, {w.regionName.toLowerCase()}</span></span></div>
        <span className="text-[12px] text-ink-500">{w.source}</span>
      </div>
      <div className="grid grid-cols-3 max-sm:grid-cols-2 gap-2 mt-2 text-[12.5px] text-ink-300">
        <span>Gravidade: {w.severity > 0.7 ? 'grave' : w.severity > 0.4 ? 'moderada' : 'leve'}</span>
        <span className={w.bleeding > 0.03 && !w.bandaged ? 'text-blood-400' : ''}>Sangramento: {w.bleeding < 0.01 ? 'nenhum' : w.bleeding < 0.1 ? 'leve' : w.bleeding < 0.3 ? 'moderado' : 'intenso'}</span>
        <span>Dor: {w.pain}</span>
      </div>
      <div className="mt-2"><Bar value={w.healing * 100} color="#9ab567" small /><div className="text-[12px] text-ink-400 mt-1">Cicatrização {Math.round(w.healing * 100)}%</div></div>
      <div className="flex flex-wrap gap-1 mt-2">
        {w.bandaged && <span className={`chip ${w.bandageDirt > 0.6 ? 'text-amber-450' : 'text-ink-200'}`}>{w.bandageDirt > 0.6 ? 'bandagem suja' : 'enfaixado'}</span>}
        {w.disinfected && <span className="chip text-moss-400">desinfetado</span>}{w.sutured && <span className="chip">suturado</span>}{w.splinted && <span className="chip">imobilizado</span>}
        {w.contaminated && !w.infected && <span className="chip text-amber-450">sujo</span>}{w.infected && <span className="chip text-[#9bb34b]">infeccionado</span>}
      </div>
      {applicable.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{applicable.map((m) => <button key={m.id} className="btn !py-1 !text-[11px]" onClick={() => action('treat', { targetId, woundId: w.id, itemId: m.id }).then(() => onDone?.())}>{m.name} ({m.quantity})</button>)}</div>}
    </div>
  );
}
export { Scissors };

/** Vícios: dependência, fissura e embriaguez. */
function Addictions() {
  const n = useGame((s) => s.self?.needs);
  if (!n) return null;
  const rows = [
    { k: 'Nicotina', dep: n.nicotineDep ?? 0, crave: n.nicotine ?? 0, fix: 'um cigarro (precisa de isqueiro)' },
    { k: 'Álcool', dep: n.alcoholDep ?? 0, crave: n.alcohol ?? 0, fix: 'uma bebida' },
  ].filter((r) => r.dep >= 10 || r.crave > 0);
  if (!rows.length && !(n.drunk ?? 0)) return null;
  return (
    <Section title="Vícios">
      {rows.map((r) => (
        <div key={r.k} className="border border-ink-700 px-3 py-2 mb-1">
          <div className="flex justify-between text-sm"><b>{r.k}</b><span className={`text-xs ${r.dep >= 40 ? 'text-amber-450' : 'text-ink-400'}`}>{r.dep >= 40 ? 'viciado' : 'hábito'}</span></div>
          <div className="grid grid-cols-2 gap-3 mt-1.5">
            <Bar label="Dependência" value={r.dep} color="#8b7fb8" small />
            <Bar label="Fissura" value={r.crave} color={r.crave > 60 ? '#d1382f' : '#b08850'} small />
          </div>
          {r.crave > 40 && <div className="text-[11px] text-blood-400 mt-1">Em abstinência — alivia com {r.fix}. Ficar dias sem também vai desfazendo a dependência.</div>}
        </div>
      ))}
      {(n.drunk ?? 0) > 0 && <div className="mt-1"><Bar label="Embriaguez" value={n.drunk ?? 0} color="#d9a51a" small /></div>}
    </Section>
  );
}
