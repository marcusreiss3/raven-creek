import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { GameIcon, itemIcon } from '../components/GameIcon';
import { api } from '../lib/api';
import { useGame } from '../lib/store';
import { Img, Modal } from '../components/ui';
import { useIsMobile, buzz } from '../lib/mobile';
import type { Content } from '../lib/types';

/**
 * Criação de personagem como o preenchimento de uma ficha de sobrevivente:
 * de um lado a ficha de papel (que vai se preenchendo ao vivo), do outro uma pergunta por vez.
 */
const STEPS = [
  { short: 'Quem', title: 'Quem era você antes do fim?', sub: 'Nome, idade e o que os outros veem quando olham para você.' },
  { short: 'Ofício', title: 'O que você fazia da vida?', sub: 'O ofício define o que você já sabe fazer e o que ainda tem na mochila.' },
  { short: 'Corpo', title: 'Do que seu corpo dá conta?', sub: '' },
  { short: 'Jeito', title: 'Que tipo de pessoa você é?', sub: 'Qualidades custam pontos. Defeitos dão pontos para gastar em qualidades.' },
  { short: 'Foto', title: 'Uma foto para a ficha', sub: 'Opcional. Sem foto, você aparece na cena como uma silhueta.' },
];
const ATTR_ICON: Record<string, string> = { strength: 'attr-strength', agility: 'attr-agility', endurance: 'attr-endurance', perception: 'attr-perception', intellect: 'attr-intellect' };

const FIRST = ['Alice', 'Bruno', 'Clara', 'Diego', 'Elena', 'Felipe', 'Gabriela', 'Hugo', 'Iara', 'Joel', 'Lúcia', 'Marcos', 'Nina', 'Otávio', 'Paula', 'Rafael', 'Sara', 'Tomás', 'Vera', 'Wesley', 'Yara', 'Caio', 'Dora', 'Ellie', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack', 'Maya', 'Noah', 'Ruth', 'Sam', 'Tess', 'Walt'];
const LAST = ['Moreau', 'Kessler', 'Duarte', 'Hale', 'Ferraz', 'Novak', 'Brandt', 'Pires', 'Mercer', 'Lacerda', 'Ward', 'Okafor', 'Bastos', 'Reyes', 'Lindqvist', 'Teixeira', 'Callahan', 'Vidal', 'Rourke', 'Sauer', 'Monteiro', 'Fischer', 'Quinn', 'Albuquerque', 'Barlow', 'Castelo', 'Doyle', 'Esteves', 'Garrett', 'Holt'];
const LOOKS = ['cicatriz no queixo', 'jaqueta de couro gasta', 'óculos remendados com fita', 'cabelo raspado', 'mãos calejadas', 'tatuagem no antebraço', 'olheiras fundas', 'barba por fazer', 'botas enlameadas', 'boné desbotado', 'voz rouca', 'manca de leve'];
const STORY = ['Quando tudo começou, eu estava ', 'Perdi ', 'Ainda carrego comigo ', 'Prometi a mim mesmo que ', 'O que mais sinto falta é '];

export function CharacterCreator({ onDone }: { onDone: () => void }) {
  const content = useGame((s) => s.content)!;
  const mobile = useIsMobile();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ firstName: '', lastName: '', age: 30, appearance: '', backstory: '' });
  const [profession, setProfession] = useState('unemployed');
  const [attrs, setAttrs] = useState<Record<string, number>>(() => Object.fromEntries(Object.keys(content.attributes).map((k) => [k, 4])));
  const [traits, setTraits] = useState<string[]>([]);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const [portrait, setPortrait] = useState<string | null>(null); const [adjust, setAdjust] = useState({ scale: 1, x: 0, y: 0 });
  const [warning, setWarning] = useState(''); const fileRef = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [step]);

  const prof = content.professions.find((p) => p.id === profession)!;
  const attrUsed = Object.values(attrs).reduce((a, b) => a + b, 0);
  const attrLeft = content.attributePoints - attrUsed;
  const traitBudget = content.traitBasePoints + (prof?.traitPoints ?? 0);
  const traitSpent = traits.reduce((s, t) => s + (content.traits.find((x) => x.id === t)?.cost ?? 0), 0);
  const traitPoints = traitBudget - traitSpent;
  const valid = [
    form.firstName.trim().length >= 2 && form.lastName.trim().length >= 2 && form.age >= 18 && form.age <= 85,
    true, attrLeft === 0, traitPoints >= 0, true,
  ];
  const canNext = valid[step];
  const reachable = (i: number) => !created && i <= step || (!created && valid.slice(0, i).every(Boolean));

  const toggleTrait = (id: string) => {
    const t = content.traits.find((x) => x.id === id)!;
    if (traits.includes(id)) { setError(''); return setTraits(traits.filter((x) => x !== id)); }
    if (t.exclusive?.some((e) => traits.includes(e))) return setError(`${t.name} não combina com uma característica que você já escolheu.`);
    setError(''); buzz(10); setTraits([...traits, id]);
  };
  const create = async () => {
    setBusy(true); setError('');
    try { await api('/characters', { body: { ...form, profession, traits, attributes: attrs } }); setCreated(true); setStep(4); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const upload = async (f: File) => {
    const fd = new FormData(); fd.append('portrait', f); setError(''); setWarning('');
    try { const r = await api('/characters/me/portrait', { form: fd }); setPortrait(r.portrait + `?t=${Date.now()}`); if (r.warning) setWarning(r.warning); }
    catch (e: any) { setError(e.message); }
  };
  const finish = async () => { await api('/characters/me/portrait-adjust', { method: 'PUT', body: adjust }).catch(() => undefined); onDone(); };
  const go = (i: number) => { setError(''); setStep(i); };

  // ── navegação de baixo (no celular fica presa ao pé da tela)
  const nav = (
    <div className={`flex items-center gap-2 ${mobile ? 'panel-plate !shadow-none border-t border-black px-3 py-2.5 safe-b' : 'pt-5 mt-6 border-t border-ink-700'}`}>
      {step > 0 && !created && <button className="btn btn-ghost" onClick={() => go(step - 1)}><ChevronLeft size={16} />Voltar</button>}
      {error && !mobile && <p role="alert" className="text-[14px] text-blood-400 flex items-center gap-1.5 min-w-0"><GameIcon name="danger" size={16} className="shrink-0" />{error}</p>}
      <div className="ml-auto" />
      {step < 3 && <button className={`btn btn-moss ${mobile ? 'flex-1 justify-center !min-h-[48px]' : '!min-h-[44px] !px-5'}`} disabled={!canNext} onClick={() => go(step + 1)}>
        {step === 2 && attrLeft !== 0 ? (attrLeft > 0 ? `Faltam ${attrLeft} ponto${attrLeft > 1 ? 's' : ''}` : `${-attrLeft} ponto${attrLeft < -1 ? 's' : ''} a mais`) : <>Continuar: {STEPS[step + 1].short}<ChevronRight size={16} /></>}
      </button>}
      {step === 3 && <button className={`btn btn-moss ${mobile ? 'flex-1 justify-center !min-h-[48px]' : '!min-h-[44px] !px-5'}`} disabled={!canNext || busy} aria-busy={busy} onClick={create}>
        {busy ? 'Registrando…' : traitPoints < 0 ? `Faltam ${-traitPoints} pontos` : <><GameIcon name="check" size={17} />Registrar sobrevivente</>}
      </button>}
      {step === 4 && <button className={`btn btn-moss ${mobile ? 'flex-1 justify-center !min-h-[48px]' : '!min-h-[44px] !px-5'}`} disabled={!created} onClick={finish}><GameIcon name="travel" size={17} />Entrar no mundo</button>}
    </div>
  );

  const body = (
    <section aria-labelledby="cc-title" className="anim-clipboard" key={step}>
      <div className="flex items-start gap-4">
        <span aria-hidden className={`font-display font-extrabold leading-none text-amber-450/25 select-none ${mobile ? 'text-[56px] -mt-1' : 'text-[88px] -mt-2'}`}>{step + 1}</span>
        <div className="min-w-0">
          <h1 id="cc-title" className={`anim-stencil font-display font-extrabold leading-[0.95] text-ink-100 ${mobile ? 'text-[30px]' : 'text-[44px]'}`}>{STEPS[step].title}</h1>
          <p className="text-[15px] text-ink-300 mt-2 max-w-[56ch]">{step === 2 ? `Distribua ${content.attributePoints} pontos entre os cinco. Cada um vai de ${content.attributeMin} a ${content.attributeMax}.` : STEPS[step].sub}</p>
        </div>
      </div>
      <div className="mt-6">
        {step === 0 && <IdentityStep form={form} setForm={setForm} ageStages={content.ageStages ?? []} />}
        {step === 1 && <ProfessionStep content={content} value={profession} onPick={(id) => { setProfession(id); buzz(15); }} />}
        {step === 2 && <AttributesStep content={content} attrs={attrs} setAttrs={setAttrs} left={attrLeft} prof={prof} />}
        {step === 3 && <TraitsStep content={content} traits={traits} toggle={toggleTrait} points={traitPoints} budget={traitBudget} fromProf={prof?.traitPoints ?? 0} />}
        {step === 4 && <PhotoStep created={created} portrait={portrait} adjust={adjust} setAdjust={setAdjust} warning={warning} fileRef={fileRef} upload={upload} />}
      </div>
      {error && mobile && <p role="alert" className="mt-4 text-[14px] text-blood-400 flex items-center gap-1.5"><GameIcon name="danger" size={16} className="shrink-0" />{error}</p>}
    </section>
  );

  const dossier = <Dossier content={content} form={form} profession={profession} attrs={attrs} traits={traits} portrait={portrait} />;
  const rail = (
    <ol className={`flex ${mobile ? 'gap-1' : 'gap-1.5'}`} aria-label="Etapas da ficha">
      {STEPS.map((s, i) => {
        const done = i < step || created && i < 4; const cur = i === step; const can = !cur && reachable(i);
        return (
          <li key={s.short} className={mobile ? (cur ? 'flex-[2.2]' : 'flex-1') : 'shrink-0'}>
            <button disabled={!can} onClick={() => go(i)} aria-current={cur ? 'step' : undefined}
              className={`flex items-center gap-2 min-h-[40px] pl-2 pr-3 border-b-[3px] ${mobile ? 'w-full justify-center !px-1' : ''} transition-colors ${cur ? 'border-amber-450 text-amber-450' : done ? 'border-moss-500 text-ink-200 hover:text-ink-100' : 'border-ink-700 text-ink-500'}`}>
              <span className={`font-display font-extrabold text-[22px] leading-none ${cur ? '' : 'opacity-80'}`}>{i + 1}</span>
              <span className={`font-[family-name:var(--font-plate)] font-semibold text-[16px] ${mobile && !cur ? 'sr-only' : ''}`}>{s.short}</span>
              {done && !cur && <GameIcon name="check" size={13} className="text-moss-400" label="feito" />}
            </button>
          </li>
        );
      })}
    </ol>
  );

  if (mobile) return (
    <main className="relative flex flex-col overflow-hidden noise" style={{ height: 'var(--app-h, 100dvh)' }}>
      <Img src="/assets/scenes/main_menu.png" fallback="/assets/scenes/suburb_street_01.png" className="absolute inset-0 w-full h-full object-cover opacity-20" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b0c07]/70 to-[#0b0c07]/95" />
      <header className="relative shrink-0 safe-t px-3 pt-3">
        <div className="flex items-center justify-between gap-2"><span className="tape !text-[14px]">Registro de sobrevivente</span><span className="text-[13px] text-ink-400">Etapa {step + 1} de 5</span></div>
        <div className="mt-2 -mx-3 px-3">{rail}</div>
        {/* ficha em miniatura: o que já foi preenchido, sempre à vista */}
        <button onClick={() => setSheet(true)} className="mt-2 w-full flex items-center gap-3 panel-paper !shadow-[0_4px_10px_rgba(0,0,0,.5)] px-2.5 py-2 text-left text-[#2a2318]" aria-label="Ver a ficha completa">
          <span className="w-11 h-12 shrink-0 bg-[#cfc3a0] border border-[#8a7a55] overflow-hidden flex items-end justify-center"><Img src={portrait ?? '/assets/portraits/default.png'} fallback="/assets/portraits/default.png" className="h-full w-auto object-contain object-bottom" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-[family-name:var(--font-hand)] font-bold text-[20px] leading-tight truncate">{`${form.firstName} ${form.lastName}`.trim() || 'Sem nome ainda'}</span>
            <span className="block text-[12.5px] text-[#5a4a2a] truncate">{form.age} anos, {prof?.name.toLowerCase()}{traits.length ? `, ${traits.length} característica${traits.length > 1 ? 's' : ''}` : ''}</span>
          </span>
          <span className="text-[12.5px] text-[#6b4a1a] shrink-0 underline decoration-dotted underline-offset-2">Ver ficha</span>
        </button>
      </header>
      <div ref={scroller} className="relative flex-1 overflow-y-auto overscroll-contain px-3 pt-5 pb-6">{body}</div>
      <div className="relative shrink-0">{nav}</div>
      {sheet && <Modal title="Sua ficha" onClose={() => setSheet(false)}><div className="py-3 px-1">{dossier}</div></Modal>}
    </main>
  );

  return (
    <main className="relative h-full overflow-hidden noise">
      <Img src="/assets/scenes/main_menu.png" fallback="/assets/scenes/suburb_street_01.png" className="absolute inset-0 w-full h-full object-cover opacity-25" />
      <div className="absolute inset-0 vignette" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b0c07]/40 via-[#0b0c07]/70 to-[#0b0c07]/90" />
      <div className="relative h-full flex flex-col max-w-[1240px] mx-auto px-8 py-6">
        <header className="flex items-end justify-between gap-6">
          <span className="tape !text-[16px]">Registro de sobrevivente</span>
          {rail}
        </header>
        <div className="flex-1 grid grid-cols-[400px_1fr] gap-10 mt-6 min-h-0">
          <div className="overflow-y-auto overflow-x-visible py-4 pr-2 no-scrollbar">{dossier}</div>
          <div className="panel flex flex-col min-h-0">
            <div ref={scroller} className="flex-1 overflow-y-auto overscroll-contain px-8 pt-7 pb-2">{body}</div>
            <div className="px-8 pb-6">{nav}</div>
          </div>
        </div>
      </div>
    </main>
  );
}

// ───────────────────────── A ficha de papel ─────────────────────────
function Dossier({ content, form, profession, attrs, traits, portrait }: { content: Content; form: { firstName: string; lastName: string; age: number; appearance: string; backstory: string }; profession: string; attrs: Record<string, number>; traits: string[]; portrait: string | null }) {
  const prof = content.professions.find((p) => p.id === profession);
  const name = `${form.firstName} ${form.lastName}`.trim();
  const reg = useMemo(() => String(1000 + ([...(name || 'x')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9000, 7))).padStart(4, '0'), [name]);
  const hand = 'font-[family-name:var(--font-hand)] text-[#1f1a12]';
  const blank = <span className="text-[#9a8a6a]">em branco</span>;
  const lbl = 'text-[12.5px] text-[#5e4d2e]';
  return (
    <article aria-label="Ficha do sobrevivente" className="relative panel-paper px-5 pt-8 pb-6 rotate-[-.7deg] text-[#2a2318] max-w-[400px] mx-auto">
      <GameIcon name="clip" size={54} className="absolute -top-6 left-1/2 -translate-x-1/2 rotate-[8deg] text-[#7f868b] drop-shadow-[0_2px_2px_rgba(0,0,0,.4)]" />
      <div className="flex justify-between items-baseline text-[12px] text-[#6b5a3a]"><span>Abrigo de Raven Creek</span><span>Registro nº {reg}</span></div>
      <div className="mt-3 grid grid-cols-[104px_1fr] gap-4">
        <div className="relative h-[128px] bg-[#cfc3a0] border border-[#8a7a55] shadow-[inset_0_0_14px_rgba(80,60,20,.35)] overflow-hidden flex items-end justify-center rotate-[1.5deg]">
          <Img src={portrait ?? '/assets/portraits/default.png'} fallback="/assets/portraits/default.png" className="h-full w-auto object-contain object-bottom" />
          <span aria-hidden className="absolute -top-1 -left-3 w-12 h-4 rotate-[-30deg] bg-[#d8c79a]/85 shadow-sm" />
        </div>
        <dl className="min-w-0 space-y-2">
          <div><dt className={lbl}>Nome</dt><dd className={`${hand} font-bold text-[24px] leading-tight break-words`}>{name || blank}</dd></div>
          <div><dt className={lbl}>Idade</dt><dd className={`${hand} text-[20px] leading-tight`}>{form.age} anos</dd></div>
          <div><dt className={lbl}>Ofício</dt>
            {/* carimbo do ofício: bate de novo a cada troca */}
            <dd key={profession} className="anim-stamp inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 border-[3px] border-double border-[#a52e25] text-[#a52e25] font-[family-name:var(--font-plate)] font-bold text-[17px] mix-blend-multiply"><GameIcon name={`prof-${profession}`} size={16} />{prof?.name}</dd>
          </div>
        </dl>
      </div>
      <div className="border-t border-dashed border-[#8a7a55] mt-5 pt-3">
        <div className="text-[12.5px] text-[#5e4d2e] mb-1.5">Corpo</div>
        <ul className="space-y-1">
          {Object.keys(content.attributes).map((k) => (
            <li key={k} className="flex items-center gap-2">
              <GameIcon name={ATTR_ICON[k]} size={15} className="text-[#5a4a2a] shrink-0" />
              <span className="w-[86px] text-[13px]">{content.attributes[k].name}</span>
              <span className="flex gap-[3px]" aria-label={`${attrs[k]} de ${content.attributeMax}`}>{Array.from({ length: content.attributeMax }, (_, i) => <i key={i} className={`block w-[13px] h-[13px] border border-[#5a4a2a] ${i < attrs[k] ? 'bg-[#2a2318]' : ''}`} style={i < attrs[k] ? { clipPath: 'polygon(6% 10%, 94% 0, 100% 92%, 0 100%)' } : undefined} />)}</span>
              <span className={`${hand} text-[17px] leading-none ml-1`}>{attrs[k]}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-dashed border-[#8a7a55] mt-3 pt-3">
        <div className="text-[12.5px] text-[#5e4d2e] mb-1.5">Jeito</div>
        {traits.length ? (
          <div className="flex flex-wrap gap-1.5">{traits.map((t, i) => { const tr = content.traits.find((x) => x.id === t)!; return (
            <span key={t} className={`${hand} text-[15px] px-2 py-0.5 shadow-sm`} style={{ background: tr.cost > 0 ? '#c9d3a2' : '#e2b3a3', rotate: `${((i * 37) % 5) - 2}deg` }}>{tr.name}</span>
          ); })}</div>
        ) : <p className={`${hand} text-[16px]`}>{blank}</p>}
      </div>
      <div className="border-t border-dashed border-[#8a7a55] mt-3 pt-3">
        <div className="text-[12.5px] text-[#5e4d2e] mb-1">Antes do fim</div>
        <p className={`${hand} text-[16px] leading-snug line-clamp-4 whitespace-pre-line`}>{form.backstory.trim() || form.appearance.trim() || blank}</p>
      </div>
    </article>
  );
}

// ───────────────────────── Etapas ─────────────────────────
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return <label className="block"><span className="text-[13.5px] text-tape">{label}</span><div className="mt-1.5">{children}</div>{hint}</label>;
}

function IdentityStep({ form, setForm, ageStages }: { form: { firstName: string; lastName: string; age: number; appearance: string; backstory: string }; setForm: (f: any) => void; ageStages: NonNullable<Content['ageStages']> }) {
  const roll = () => { buzz(10); setForm({ ...form, firstName: FIRST[Math.floor(Math.random() * FIRST.length)], lastName: LAST[Math.floor(Math.random() * LAST.length)] }); };
  const addLook = (l: string) => setForm({ ...form, appearance: form.appearance.trim() ? `${form.appearance.trim().replace(/[.,]$/, '')}, ${l}` : l.charAt(0).toUpperCase() + l.slice(1) });
  const addStory = (s: string) => setForm({ ...form, backstory: (form.backstory.trim() ? `${form.backstory.trimEnd()}\n` : '') + s });
  const big = '!text-[22px] !py-2.5 font-[family-name:var(--font-plate)] font-semibold';
  const stage = [...ageStages].reverse().find((s) => form.age >= s.minAge);
  const firstOld = ageStages[0]?.minAge;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[1fr_1fr_auto] max-sm:grid-cols-2 gap-3 items-end">
        <Field label="Nome"><input className={`input ${big}`} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} maxLength={24} autoComplete="off" /></Field>
        <Field label="Sobrenome"><input className={`input ${big}`} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} maxLength={24} autoComplete="off" /></Field>
        <button type="button" className="btn max-sm:col-span-2 max-sm:justify-center !min-h-[52px]" onClick={roll}><GameIcon name="random" size={20} />Sortear nome</button>
      </div>
      <div>
        <span className="text-[13.5px] text-tape" id="age-l">Idade</span>
        <div className="mt-1.5 flex items-center gap-3">
          <button type="button" className="btn !px-3 !text-[20px] !min-h-[48px] !min-w-[48px] justify-center" aria-label="Diminuir idade" disabled={form.age <= 18} onClick={() => setForm({ ...form, age: form.age - 1 })}>−</button>
          <span className="font-display font-extrabold text-[44px] leading-none w-[74px] text-center text-amber-450 tabular-nums" aria-live="polite">{form.age}</span>
          <button type="button" className="btn !px-3 !text-[20px] !min-h-[48px] !min-w-[48px] justify-center" aria-label="Aumentar idade" disabled={form.age >= 85} onClick={() => setForm({ ...form, age: form.age + 1 })}>+</button>
          <input type="range" min={18} max={85} value={form.age} aria-labelledby="age-l" className="flex-1 accent-[#f0a73a] min-h-[32px]" onChange={(e) => setForm({ ...form, age: Number(e.target.value) })} />
        </div>
        <p role="status" className={`mt-2 text-[13.5px] leading-snug ${stage ? 'text-amber-450' : 'text-ink-400'}`}>
          {stage ? <><b>{stage.name}.</b> <span className="text-ink-200">{stage.description}</span></> : firstOld ? `A idade começa a pesar aos ${firstOld} anos. Seu personagem também envelhece: um ano a cada quatro estações.` : null}
        </p>
      </div>
      <Field label="Como você é" hint={<Ideas items={LOOKS} onPick={addLook} label="Ideias para a aparência" />}>
        <textarea className="notebook" rows={3} value={form.appearance} onChange={(e) => setForm({ ...form, appearance: e.target.value })} maxLength={600} placeholder="Altura, cicatrizes, roupas, jeito de andar…" />
      </Field>
      <Field label="Sua história" hint={<Ideas items={STORY} onPick={addStory} label="Começos de frase" more />}>
        <textarea className="notebook" rows={5} value={form.backstory} onChange={(e) => setForm({ ...form, backstory: e.target.value })} maxLength={2000} placeholder="Onde você estava quando tudo começou? Quem você perdeu?" />
      </Field>
    </div>
  );
}

function Ideas({ items, onPick, label, more }: { items: string[]; onPick: (s: string) => void; label: string; more?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2" aria-label={label}>
      {items.map((s) => <button key={s} type="button" onClick={(e) => { e.preventDefault(); onPick(s); }} className="chip !py-1 text-ink-200 hover:text-amber-450 min-h-[30px]"><GameIcon name="pencil" size={12} />{more ? s.replace(/ $/, '…') : s}</button>)}
    </div>
  );
}

function ProfessionStep({ content, value, onPick }: { content: Content; value: string; onPick: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3" role="radiogroup" aria-label="Ofício">
      {content.professions.map((p) => {
        const on = value === p.id;
        return (
          <button key={p.id} role="radio" aria-checked={on} onClick={() => onPick(p.id)}
            className={`relative text-left flex gap-3 p-3.5 border-2 transition-[border-color,background-color,transform] duration-150 active:scale-[.99] ${on ? 'border-amber-450 bg-amber-450/[.08]' : 'border-black bg-[#101109]/70 hover:border-ink-600'}`}>
            <span className={`w-14 h-14 shrink-0 flex items-center justify-center border ${on ? 'border-amber-450/60 text-amber-450 bg-black/30' : 'border-ink-700 text-tape bg-black/20'}`}><GameIcon name={`prof-${p.id}`} size={34} /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2"><span className="font-display font-extrabold text-[24px] leading-none text-ink-100">{p.name}</span>{on && <GameIcon name="check" size={18} className="text-amber-450" label="escolhido" />}</span>
              <span className="block text-[13.5px] text-ink-300 mt-1 leading-snug">{p.description}</span>
              {Object.keys(p.skills).length > 0 && <span className="flex flex-wrap gap-1 mt-2">{Object.entries(p.skills).map(([sk, lv]) => <span key={sk} className="chip text-moss-400 !py-0">{content.skills[sk]?.name ?? sk} {lv}</span>)}</span>}
              {p.traitPoints > 0 && <span className="block text-[13px] text-amber-450 mt-2">Mais {p.traitPoints} pontos para características</span>}
              {p.items && p.items.length > 0 && (
                <span className="flex items-center gap-1.5 mt-2 text-[12.5px] text-ink-400">Leva:
                  {p.items.map((it) => <span key={it.itemId} className="flex items-center gap-1 text-ink-200"><GameIcon name={itemIcon(it.itemId)} size={15} className="text-tape" />{content.itemNames?.[it.itemId] ?? it.itemId}{it.qty > 1 ? ` ×${it.qty}` : ''}</span>)}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function AttributesStep({ content, attrs, setAttrs, left, prof }: { content: Content; attrs: Record<string, number>; setAttrs: (a: Record<string, number>) => void; left: number; prof?: Content['professions'][number] }) {
  const keys = Object.keys(content.attributes);
  const set = (k: string, v: number) => { const nv = Math.max(content.attributeMin, Math.min(content.attributeMax, v)); if (nv - attrs[k] > left) return; buzz(6); setAttrs({ ...attrs, [k]: nv }); };
  // sugestão: o que o ofício usa ganha mais pontos
  const suggest = () => {
    const w: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
    for (const [sk, lv] of Object.entries(prof?.skills ?? {})) { const a = content.skills[sk]?.attribute; if (a) w[a] += lv; }
    const base = Math.max(content.attributeMin, Math.min(3, Math.floor(content.attributePoints / keys.length)));
    const out: Record<string, number> = Object.fromEntries(keys.map((k) => [k, base]));
    // cada ponto vai para quem mais "pede": peso do ofício dividido pelo que já recebeu
    for (let pts = content.attributePoints - base * keys.length; pts > 0; pts--) {
      const open = keys.filter((k) => out[k] < content.attributeMax);
      if (!open.length) break;
      const score = (c: string) => (w[c] + 0.6) / Math.pow(out[c] - base + 1, 1.5);
      const k = open.reduce((best, c) => (score(c) > score(best) ? c : best));
      out[k]++;
    }
    buzz(15); setAttrs(out);
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 mb-5">
        <div role="status" className="flex items-center gap-3">
          <span className={`font-display font-extrabold text-[44px] leading-none ${left === 0 ? 'text-moss-400' : left < 0 ? 'text-blood-400' : 'text-amber-450'}`}>{left}</span>
          <span className="text-[14.5px] text-ink-200 leading-tight">{left === 0 ? 'Tudo distribuído.' : left > 0 ? <>ponto{left > 1 ? 's' : ''} para<br />distribuir</> : <>ponto{left < -1 ? 's' : ''} a mais<br />do que o permitido</>}</span>
        </div>
        <span className="flex gap-[3px] flex-wrap max-w-[260px]" aria-hidden>{Array.from({ length: content.attributePoints }, (_, i) => <i key={i} className={`block w-[7px] h-[18px] rounded-t-full ${i < content.attributePoints - Math.max(0, left) ? 'bg-ink-700' : 'bg-gradient-to-b from-[#f4c060] to-[#a8701f] shadow-[0_0_6px_rgba(240,167,58,.5)]'}`} />)}</span>
        <button className="btn btn-ghost ml-auto max-sm:ml-0" onClick={suggest}><GameIcon name="random" size={17} />Sugerir para {prof?.name.toLowerCase() ?? 'o ofício'}</button>
      </div>
      <ul className="space-y-3">
        {keys.map((k) => {
          const a = content.attributes[k];
          return (
            <li key={k} className="bg-[#101109]/70 border border-black px-3 py-3">
              <div className="flex items-center gap-3">
                <GameIcon name={ATTR_ICON[k]} size={30} className="text-tape shrink-0" />
                <div className="min-w-0 flex-1"><div className="font-[family-name:var(--font-plate)] font-bold text-[19px] leading-tight">{a.name}</div><div className="text-[13px] text-ink-300 leading-snug">{a.desc}</div></div>
                <span className="font-display font-extrabold text-[34px] leading-none text-amber-450 w-8 text-center">{attrs[k]}</span>
              </div>
              <div className="flex items-center gap-2 mt-2.5">
                <button className="btn !px-0 !min-w-[40px] !min-h-[40px] justify-center !text-[18px]" aria-label={`Diminuir ${a.name}`} disabled={attrs[k] <= content.attributeMin} onClick={() => set(k, attrs[k] - 1)}>−</button>
                {/* gomos clicáveis: tocar no 6º gomo deixa o atributo em 6 */}
                <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${content.attributeMax}, 1fr)` }} role="radiogroup" aria-label={a.name}>
                  {Array.from({ length: content.attributeMax }, (_, i) => {
                    const v = i + 1; const on = v <= attrs[k]; const afford = v - attrs[k] <= left && v >= content.attributeMin;
                    return <button key={i} role="radio" aria-checked={attrs[k] === v} aria-label={`${a.name} ${v}`} disabled={!afford && !on} onClick={() => set(k, v)}
                      className={`h-9 border transition-colors ${on ? 'bg-amber-450 border-black shadow-[inset_0_-3px_0_rgba(0,0,0,.25),0_0_8px_rgba(240,167,58,.35)]' : afford ? 'bg-[#0b0c07] border-ink-700 hover:border-amber-450/60' : 'bg-[#0b0c07] border-ink-800 opacity-50'}`} />;
                  })}
                </div>
                <button className="btn !px-0 !min-w-[40px] !min-h-[40px] justify-center !text-[18px]" aria-label={`Aumentar ${a.name}`} disabled={attrs[k] >= content.attributeMax || left <= 0} onClick={() => set(k, attrs[k] + 1)}>+</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TraitsStep({ content, traits, toggle, points, budget, fromProf }: { content: Content; traits: string[]; toggle: (id: string) => void; points: number; budget: number; fromProf: number }) {
  const blockedBy = (id: string) => { const t = content.traits.find((x) => x.id === id)!; const b = t.exclusive?.find((e) => traits.includes(e)); return b ? content.traits.find((x) => x.id === b)?.name : null; };
  const col = (title: string, good: boolean) => (
    <section>
      <h2 className="font-[family-name:var(--font-plate)] font-bold text-[19px] text-tape mb-1">{title}</h2>
      <p className="text-[13px] text-ink-400 mb-2.5">{good ? 'Cada uma custa os pontos indicados.' : 'Cada um devolve os pontos indicados.'}</p>
      <ul className="space-y-2">
        {content.traits.filter((t) => (good ? t.cost > 0 : t.cost < 0)).map((t, i) => {
          const on = traits.includes(t.id); const blocked = !on && blockedBy(t.id);
          return (
            <li key={t.id}>
              <button aria-pressed={on} disabled={!!blocked} onClick={() => toggle(t.id)}
                className={`w-full text-left flex items-start gap-3 px-3 py-2.5 transition-[transform,background-color,border-color] duration-150 ${on ? `text-[#1f1a12] shadow-[0_3px_8px_rgba(0,0,0,.5)] border border-black/20` : 'bg-[#101109]/70 border border-dashed border-ink-600 hover:border-ink-400'} ${blocked ? 'opacity-45' : ''}`}
                style={on ? { background: good ? 'linear-gradient(180deg,#d3dcae,#b8c48a)' : 'linear-gradient(180deg,#ebc2b2,#d39a86)', rotate: `${((i * 41) % 5 - 2) * 0.35}deg` } : undefined}>
                <span className={`min-w-[44px] h-[44px] shrink-0 rounded-full flex items-center justify-center font-display font-extrabold text-[20px] border-2 ${on ? 'border-[#1f1a12]/50' : good ? 'border-moss-500 text-moss-400' : 'border-blood-500 text-blood-400'}`}>{good ? `−${t.cost}` : `+${-t.cost}`}</span>
                <span className="min-w-0">
                  <span className={`block text-[18px] leading-tight ${on ? 'font-[family-name:var(--font-hand)] font-bold' : 'font-[family-name:var(--font-plate)] font-bold text-ink-100'}`}>{t.name}{on && <span className="sr-only">, escolhida</span>}</span>
                  <span className={`block text-[13px] leading-snug mt-0.5 ${on ? 'text-[#3b2f1f]' : 'text-ink-300'}`}>{blocked ? `Não combina com ${blocked}.` : t.description}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
  return (
    <div>
      <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-5">
        <span className={`font-display font-extrabold text-[44px] leading-none ${points < 0 ? 'text-blood-400' : points === 0 ? 'text-moss-400' : 'text-amber-450'}`}>{points}</span>
        <span className="text-[14.5px] text-ink-200 leading-tight">{points < 0 ? <>pontos em falta:<br />escolha um defeito ou tire uma qualidade</> : <>ponto{points === 1 ? '' : 's'} para gastar</>}</span>
        <span className="text-[13px] text-ink-400 sm:ml-auto">Você começa com {budget - fromProf}{fromProf ? `, mais ${fromProf} do ofício` : ''}.</span>
      </div>
      <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-6">{col('Qualidades', true)}{col('Defeitos', false)}</div>
    </div>
  );
}

function PhotoStep({ created, portrait, adjust, setAdjust, warning, fileRef, upload }: { created: boolean; portrait: string | null; adjust: { scale: number; x: number; y: number }; setAdjust: (a: any) => void; warning: string; fileRef: React.RefObject<HTMLInputElement | null>; upload: (f: File) => void }) {
  return (
    <div className="grid grid-cols-[1fr_1fr] max-sm:grid-cols-1 gap-6">
      <div>
        {!created ? <p className="text-[15px] text-amber-450">Registre o sobrevivente na etapa anterior para poder enviar a foto.</p> : (
          <>
            <p className="text-[15px] text-ink-200 leading-relaxed">Use um PNG com <b>fundo transparente</b>, do peito ou da cintura para cima. Mínimo de 200 por 250 px, até 5 MB. O ideal é 800 por 1200 px.</p>
            <input ref={fileRef} type="file" accept="image/png" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <button className="btn mt-4 !min-h-[48px]" onClick={() => fileRef.current?.click()}><GameIcon name="photo" size={19} />{portrait ? 'Trocar foto' : 'Escolher foto'}</button>
            {warning && <p role="status" className="text-[13.5px] text-amber-450 mt-2">{warning}</p>}
            {portrait && (
              <div className="mt-6 space-y-3">
                <p className="text-[13.5px] text-tape">Ajuste como você aparece na cena</p>
                {([['scale', 'Tamanho', 0.5, 1.8, 0.01], ['x', 'Para os lados', -40, 40, 1], ['y', 'Para cima e para baixo', -40, 40, 1]] as const).map(([k, l, min, max, st]) => (
                  <label key={k} className="block"><span className="text-[13.5px] text-ink-300">{l}</span><input type="range" className="w-full accent-[#f0a73a] min-h-[32px]" min={min} max={max} step={st} value={adjust[k]} onChange={(e) => setAdjust({ ...adjust, [k]: Number(e.target.value) })} /></label>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <figure className="relative h-[420px] max-sm:h-[280px] max-sm:order-first max-sm:mx-6 border-[10px] border-b-[38px] border-[#e9e2cf] shadow-[0_10px_30px_rgba(0,0,0,.7)] overflow-hidden bg-ink-900 rotate-[1deg]">
        <Img src="/assets/scenes/street_city_01.png" fallback="/assets/scenes/street_city_01.png" className="absolute inset-0 w-full h-full object-cover opacity-60" />
        <div className="absolute inset-x-0 bottom-0 h-[88%] flex justify-center" style={{ transform: `translateX(${adjust.x}%) translateY(${-adjust.y}%) scale(${adjust.scale})`, transformOrigin: 'bottom center' }}>
          <Img src={portrait ?? '/assets/portraits/default.png'} fallback="/assets/portraits/default.png" className="h-full w-auto max-w-none object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,.8)]" />
        </div>
        <figcaption className="absolute -bottom-[32px] inset-x-0 text-center font-[family-name:var(--font-hand)] text-[17px] text-[#3b2f1f]">Como você vai aparecer na cena</figcaption>
      </figure>
    </div>
  );
}
