import { useHud } from '../lib/hud';
import { Fragment, useEffect, useState } from 'react';
import { GameIcon, FactionEmblem, EMBLEMS, itemIcon } from '../components/GameIcon';
import { useGame } from '../lib/store';
import { action } from '../lib/socket';
import { api } from '../lib/api';
import { audio } from '../lib/audio';
import { Bar, Confirm, Drawer, Empty, Section } from '../components/ui';
import { CompanionSection, TOOL_LABEL } from './Nature';
import { MysteriesTab } from './Stories';

export function SkillsPanel({ onClose }: { onClose: () => void }) {
  const self = useGame((s) => s.self)!;
  const cats = [...new Set(self.skills.map((s) => s.category))];
  return (
    <Drawer title="Habilidades" onClose={onClose} width={480} icon={<GameIcon name="skills" size={22} />}>
      <p className="text-[13.5px] text-ink-300 mb-5">Habilidades evoluem com a prática real. Repetir a mesma ação no mesmo alvo rende cada vez menos; livros ensinam até um limite.</p>
      {cats.map((c) => (
        <Section key={c} title={c}>
          <div className="space-y-2.5">{self.skills.filter((s) => s.category === c).map((s) => (
            <div key={s.id}>
              <div className="flex justify-between text-[14.5px] mb-1"><span>{s.name}</span><span className="font-[family-name:var(--font-plate)] font-bold text-[17px] text-amber-450 tabular-nums" aria-label={`nível ${s.level}`}>{s.level}</span></div>
              <div className="flex gap-[3px]" aria-hidden>{Array.from({ length: 10 }, (_, i) => <div key={i} className="flex-1 h-[7px] bg-[#0d0e09] shadow-[inset_0_1px_1px_rgba(0,0,0,.7)]"><div className="h-full bg-amber-450" style={{ width: i < s.level ? '100%' : i === s.level ? `${s.progress * 100}%` : '0%' }} /></div>)}</div>
            </div>
          ))}</div>
        </Section>
      ))}
    </Drawer>
  );
}

export function CraftingPanel({ onClose }: { onClose: () => void }) {
  const { self, content } = useGame();
  if (!self || !content) return null;
  const count = (id: string) => self.inventory.filter((i) => i.defId === id && !i.slot).reduce((s, i) => s + i.quantity, 0);
  const nameOf = (id: string) => content.itemNames?.[id] ?? self.inventory.find((i) => i.defId === id)?.name ?? id.replace(/_/g, ' ');
  return (
    <Drawer title="Bancada" onClose={onClose} width={580} icon={<GameIcon name="crafting" size={22} />}>
      <div className="space-y-2">{content.recipes.map((r) => {
        const known = !r.requiresKnowledge || self.knownRecipes.includes(r.id);
        const lvl = self.skills.find((s) => s.id === r.skill)?.level ?? 0;
        const hasAll = r.inputs.every((i) => count(i.itemId) >= i.qty);
        return (
          <div key={r.id} className={`flex gap-3 p-3 bg-[#101109] border border-black shadow-[inset_0_2px_5px_rgba(0,0,0,.55)] ${known ? '' : 'opacity-50'}`}>
            <div className="w-12 h-12 shrink-0 flex items-center justify-center border border-ink-700 bg-[#14150f]"><GameIcon name={itemIcon(r.output.itemId)} size={30} className={hasAll && known ? 'text-ink-100' : 'text-ink-500'} /></div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between gap-2"><b className="text-[15px]">{r.name}</b><span className="text-[12.5px] text-ink-400">{content.skills[r.skill]?.name}{r.minLevel > 0 ? `, nível ${r.minLevel}` : ''}</span></div>
              <div className="flex flex-wrap gap-1 mt-1.5">{r.inputs.map((i) => <span key={i.itemId} className={`chip ${count(i.itemId) >= i.qty ? 'text-moss-400' : 'text-blood-400'}`}><GameIcon name={itemIcon(i.itemId)} size={12} />{i.qty}× {nameOf(i.itemId)}</span>)}{r.tools.map((t) => <span key={t} className="chip text-ink-300">precisa de {TOOL_LABEL[t] ?? t}</span>)}</div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-[13px] text-ink-300">Rende {r.output.qty}</span>
                {known ? <button className="btn btn-moss !min-h-8 !py-1" disabled={!hasAll || lvl < r.minLevel} onClick={() => action('craft', { recipeId: r.id })}>Fabricar</button> : <span className="text-[12.5px] text-ink-400">Precisa aprender (livro ou profissão)</span>}
              </div>
            </div>
          </div>
        );
      })}</div>
    </Drawer>
  );
}

export function BasePanel({ onClose }: { onClose: () => void }) {
  const { self, scene, content } = useGame();
  const [name, setName] = useState(''); const [confirm, setConfirm] = useState(false);
  if (!self || !scene || !content) return null;
  const base = scene.base;
  const count = (id: string) => self.inventory.filter((i) => i.defId === id && !i.slot).reduce((s, i) => s + i.quantity, 0);
  return (
    <Drawer title={base ? `Base: ${base.name}` : 'Bases'} onClose={onClose} width={600} icon={<GameIcon name="base" size={22} />}>
      {!scene.location.buildable && <Empty>Este local não pode ser fortificado. Procure casas, fazendas, armazéns, galpões e oficinas.</Empty>}
      {scene.location.buildable && !base && (
        <div className="space-y-3">
          <p className="text-[14.5px] text-ink-200">Reivindicar <b>{scene.location.name}</b> como base. Ela terá um estoque compartilhado e poderá receber construções. Se você estiver em uma facção, a base pertencerá a ela.</p>
          <input aria-label="Nome da base" className="input" placeholder="Nome da base" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          <button className="btn btn-moss" onClick={() => setConfirm(true)}>Reivindicar</button>
          {confirm && <Confirm danger={false} title="Reivindicar base?" text="Outros sobreviventes verão que este lugar é seu. Bases atraem hordas e invasores." onCancel={() => setConfirm(false)} onConfirm={() => { action('claim_base', { name }); setConfirm(false); }} />}
        </div>
      )}
      {base && (
        <>
          <Section title="Estruturas">
            {base.structures.length ? <div className="space-y-1.5">{base.structures.map((s) => {
              const def = content.structures.find((d) => d.id === s.kind);
              return (
                <div key={s.id} className="flex items-center gap-3 bg-[#101109] border border-black px-3 py-2">
                  <div className="flex-1"><div className="text-[14.5px] mb-1">{def?.name ?? s.kind} {s.building && <span className="chip text-amber-450 ml-1"><GameIcon name="crafting" size={12} />em construção</span>}</div><Bar value={s.hp} max={s.maxHp} color={s.hp / s.maxHp < 0.4 ? '#e0554a' : '#9ab567'} small /></div>
                  {s.hp < s.maxHp && !s.building && <button className="btn !py-1" onClick={() => action('repair', { structureId: s.id })}>Reparar</button>}
                  {s.kind === 'generator' && self.inventory.find((i) => i.defId === 'gas_can') && <button className="btn !py-1" onClick={() => action('fuel_generator', { structureId: s.id, itemId: self.inventory.find((i) => i.defId === 'gas_can')!.id })}>Abastecer</button>}
                </div>
              );
            })}</div> : <Empty>Nada construído ainda.</Empty>}
          </Section>
          <Section title="Construir">
            <div className="grid grid-cols-2 gap-2">{content.structures.map((d) => {
              const ok = d.materials.every((m) => count(m.itemId) >= m.qty);
              return (
                <div key={d.id} className="bg-[#101109] border border-black p-3">
                  <div className="flex justify-between gap-2"><b className="text-[14.5px]">{d.name}</b><span className="text-[12px] text-ink-400 shrink-0">{d.seconds}s, {d.energy} de energia</span></div>
                  <div className="text-[13px] text-ink-300 mt-0.5">{d.description}</div>
                  <div className="flex flex-wrap gap-1 mt-1.5">{d.materials.map((m) => <span key={m.itemId} className={`chip ${count(m.itemId) >= m.qty ? 'text-moss-400' : 'text-blood-400'}`}><GameIcon name={itemIcon(m.itemId)} size={12} />{m.qty}× {m.itemId.replace(/_/g, ' ')}</span>)}</div>
                  {d.tools.length > 0 && <div className="text-[12px] text-ink-400 mt-1">Ferramentas: {d.tools.join(', ')}</div>}
                  <button className="btn !py-1 mt-2 w-full" disabled={!ok || self.state !== 'idle'} onClick={() => action('build', { kind: d.id })}>Construir</button>
                </div>
              );
            })}</div>
          </Section>
          {base.ownerCharacterId === self.id && self.faction && !base.factionId && <button className="btn" onClick={() => action('base_to_faction', { baseId: base.id })}>Ceder base à facção {self.faction.name}</button>}
        </>
      )}
    </Drawer>
  );
}

export function FactionPanel({ onClose }: { onClose: () => void }) {
  const { self, scene } = useGame();
  const [info, setInfo] = useState<any>(null);
  const [form, setForm] = useState({ name: '', emblem: 'wolf', color: '#b45309' });
  const [leave, setLeave] = useState(false);
  useEffect(() => { if (self?.faction) action('faction_info').then((r) => r.ok && setInfo(r.faction)); }, [self?.faction?.id]);
  if (!self) return null;
  const leader = self.faction?.rank === 'leader'; const officer = leader || self.faction?.rank === 'officer';
  return (
    <Drawer title="Facção" onClose={onClose} width={560} icon={<GameIcon name="faction" size={22} />}>
      {self.factionInvites.length > 0 && <Section title="Convites">{self.factionInvites.map((i) => <div key={i.factionId} className="flex items-center gap-2 mb-1"><span className="flex-1">{i.name}</span><button className="btn btn-moss !py-1" onClick={() => action('faction_answer', { factionId: i.factionId, accept: true })}>Aceitar</button><button className="btn !py-1" onClick={() => action('faction_answer', { factionId: i.factionId, accept: false })}>Recusar</button></div>)}</Section>}
      {!self.faction ? (
        <Section title="Fundar uma facção">
          <div className="grid grid-cols-[1fr_70px] gap-2">
            <input aria-label="Nome da facção" className="input" placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input aria-label="Cor da facção" type="color" className="input !p-1 h-10" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          </div>
          <div className="text-[13px] text-ink-300 mt-3 mb-1.5">Emblema pintado nas bases</div>
          <div className="grid grid-cols-8 gap-1.5" role="radiogroup" aria-label="Emblema">
            {EMBLEMS.map((e) => <button key={e} role="radio" aria-checked={form.emblem === e} aria-label={e} onClick={() => setForm({ ...form, emblem: e })} className={`h-11 flex items-center justify-center bg-[#101109] border ${form.emblem === e ? 'border-amber-450' : 'border-black hover:border-ink-500'}`}><FactionEmblem emblem={e} color={form.emblem === e ? form.color : '#a3a38d'} size={24} /></button>)}
          </div>
          <button className="btn btn-moss mt-3" disabled={form.name.length < 3} onClick={() => action('faction_create', form)}>Fundar</button>
        </Section>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-5"><div className="w-14 h-14 flex items-center justify-center bg-[#101109] border-2" style={{ borderColor: self.faction.color }}><FactionEmblem emblem={self.faction.emblem} color={self.faction.color} size={32} /></div><div><div className="font-display font-extrabold text-[28px] leading-none">{self.faction.name}</div><div className="text-[13px] text-ink-300 mt-1">Sua patente: {self.faction.rank}</div></div></div>
          <Section title="Membros">{info?.members.map((m: any) => (
            <div key={m.characterId} className="flex items-center gap-2 text-sm py-1 border-b border-ink-800">
              <span className="flex-1">{m.name} <span className="text-ink-400 text-[12.5px]">em {m.locationName}</span></span><span className="chip text-ink-200">{m.rank}</span>
              {leader && m.characterId !== self.id && <select className="input !py-0.5 !w-auto text-xs" value="" onChange={(e) => action('faction_rank', { targetId: m.characterId, rank: e.target.value }).then(() => action('faction_info').then((r) => setInfo(r.faction)))}><option value="">alterar…</option><option value="recruit">recruta</option><option value="member">membro</option><option value="officer">oficial</option><option value="leader">líder</option><option value="kick">expulsar</option></select>}
            </div>
          ))}</Section>
          {officer && <Section title="Convidar alguém presente">{scene?.characters.filter((c) => c.id !== self.id).map((c) => <button key={c.id} className="btn !py-1 mr-1 mb-1" onClick={() => action('faction_invite', { targetId: c.id })}>{c.name}</button>)}</Section>}
          <Section title="Bases">{info?.bases.length ? info.bases.map((b: any) => <div key={b.id} className="text-[14px]">{b.name}, em {b.locationName}</div>) : <Empty>Nenhuma base.</Empty>}</Section>
          <Section title="Registro de atividades">{info?.logs.map((l: any) => <div key={l.id} className="text-[13px] text-ink-300 py-0.5"><span className="text-ink-500">{new Date(l.createdAt).toLocaleString('pt-BR')}</span> {l.message}</div>)}</Section>
          <button className="btn btn-danger" onClick={() => setLeave(true)}>Sair da facção</button>
          {leave && <Confirm title="Sair da facção?" text="Você perderá acesso aos estoques e bases da facção." onCancel={() => setLeave(false)} onConfirm={() => { action('faction_leave'); setLeave(false); }} />}
        </>
      )}
    </Drawer>
  );
}

const LOG_KIND: Record<string, string> = {"explore": "Exploração", "combat": "Combate", "event": "Eventos", "death": "Morte", "travel": "Viagens", "trade": "Trocas", "theft": "Furtos", "base": "Base", "craft": "Fabricação", "wound": "Ferimentos", "pvp": "Duelos", "system": "Sistema", "build": "Obras", "body": "Corpo", "medical": "Tratamentos", "disease": "Doenças", "faction": "Facção"};

export function JournalPanel({ onClose }: { onClose: () => void }) {
  const self = useGame((s) => s.self)!;
  const [k, setK] = useState('all');
  const kinds = ['all', ...new Set(self.logs.map((l) => l.kind))];
  const [tab, setTab] = useState<'log' | 'mysteries'>('log');
  return (
    <Drawer title="Diário" onClose={onClose} width={580} icon={<GameIcon name="journal" size={22} />}>
      <div className="flex gap-1 mb-4 border-b border-ink-700" role="tablist">
        {([['log', 'Registro', 'journal'], ['mysteries', 'Mistérios', 'note']] as const).map(([t, l, ic]) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`flex items-center gap-1.5 px-3 py-2 font-[family-name:var(--font-plate)] font-bold text-[16px] border-b-[3px] -mb-px ${tab === t ? 'border-amber-450 text-amber-450' : 'border-transparent text-ink-300 hover:text-ink-100'}`}><GameIcon name={ic} size={16} />{l}</button>)}
      </div>
      {tab === 'mysteries' ? <MysteriesTab /> : <>
      <div className="flex flex-wrap gap-1 mb-4">{kinds.map((x) => <button key={x} aria-pressed={k === x} onClick={() => setK(x)} className={`chip !py-1 ${k === x ? 'text-amber-450 !bg-amber-450/10' : 'text-ink-300'}`}>{x === 'all' ? 'Tudo' : LOG_KIND[x] ?? x}</button>)}</div>
      <ol className="space-y-2">{self.logs.filter((l) => k === 'all' || l.kind === k).map((l) => (
        <li key={l.id} className="text-[14.5px] border-l-2 border-ink-600 pl-3 py-0.5"><div className="text-[12px] text-ink-400">{new Date(l.at).toLocaleString('pt-BR')}{k === 'all' ? `, ${(LOG_KIND[l.kind] ?? l.kind).toLowerCase()}` : ''}</div>{l.message}</li>
      ))}</ol></>}
    </Drawer>
  );
}

export function CharacterPanel({ onClose }: { onClose: () => void }) {
  const self = useGame((s) => s.self)!;
  const [profile, setProfile] = useState({ appearance: self.appearance, backstory: self.backstory });
  const [adjust, setAdjust] = useState(self.portraitAdjust);
  return (
    <Drawer title={self.name} onClose={onClose} width={540} icon={<GameIcon name="character" size={22} />}>
      <div className="text-[15px] text-ink-200">{self.age} anos, {self.profession.name.toLowerCase()}</div>
      <div className="flex flex-wrap gap-1 mt-2">{self.traits.map((t) => <span key={t.id} title={t.description} className={`chip ${t.cost > 0 ? 'text-moss-400' : 'text-blood-400'}`}>{t.cost > 0 ? 'Qualidade' : 'Defeito'}: {t.name}</span>)}</div>
      {self.ageStage && <p className="mt-2 text-[13.5px] text-amber-450 leading-snug"><b>{self.ageStage.name}.</b> <span className="text-ink-300">{self.ageStage.description}</span></p>}
      <ul className="mt-3 space-y-0.5">{self.profession.perks.map((p) => <li key={p} className="text-[13.5px] text-moss-400">{p}</li>)}</ul>
      <Section title="Atributos"><div className="grid grid-cols-5 gap-2">{Object.entries(self.attributes).map(([k, v]) => <div key={k} className="bg-[#101109] border border-black shadow-[inset_0_2px_4px_rgba(0,0,0,.6)] text-center py-2"><div className="font-[family-name:var(--font-plate)] font-bold text-[26px] leading-none text-amber-450">{v}</div><div className="text-[12px] text-ink-300 mt-1">{({ strength: 'Força', agility: 'Agilidade', endurance: 'Resistência', perception: 'Percepção', intellect: 'Intelecto' } as Record<string, string>)[k]}</div></div>)}</div></Section>
      <CompanionSection />
      <Section title="Aparência"><textarea aria-label="Aparência" className="input h-20 text-[14.5px]" value={profile.appearance} onChange={(e) => setProfile({ ...profile, appearance: e.target.value })} /></Section>
      <Section title="História"><textarea aria-label="História" className="input h-32 text-[14.5px]" value={profile.backstory} onChange={(e) => setProfile({ ...profile, backstory: e.target.value })} /></Section>
      <button className="btn" onClick={() => api('/characters/me/profile', { method: 'PUT', body: profile }).then(() => useGame.getState().toast('Perfil salvo.', 'success'))}>Salvar perfil</button>
      <Section title="Retrato">
        <p className="text-[13px] text-ink-300 mb-1.5">PNG com fundo transparente fica melhor no cenário; JPG e WEBP também funcionam.</p>
        <input aria-label="Enviar retrato" type="file" accept="image/png,image/jpeg,image/webp" className="text-[13px] file:btn file:mr-3" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const fd = new FormData(); fd.append('portrait', f); try { const r = await api('/characters/me/portrait', { form: fd }); useGame.getState().toast(r.warning ?? 'Retrato atualizado.', r.warning ? 'warn' : 'success'); } catch (err: any) { useGame.getState().toast(err.message, 'warn'); } }} />
        {(['scale', 'x', 'y'] as const).map((k) => <label key={k} className="block mt-2"><span className="label">{k === 'scale' ? 'Escala' : k === 'x' ? 'Horizontal' : 'Vertical'}: {adjust[k]}</span><input type="range" className="w-full accent-amber-600" min={k === 'scale' ? 0.5 : -40} max={k === 'scale' ? 1.8 : 40} step={k === 'scale' ? 0.01 : 1} value={adjust[k]} onChange={(e) => setAdjust({ ...adjust, [k]: Number(e.target.value) })} onMouseUp={() => api('/characters/me/portrait-adjust', { method: 'PUT', body: adjust })} /></label>)}
      </Section>
    </Drawer>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState({ ...audio.settings });
  const save = (p: Partial<typeof s>) => { const n = { ...s, ...p }; setS(n); audio.update(n); api('/me/settings', { method: 'PUT', body: n }).catch(() => undefined); };
  return (
    <Drawer title="Som e opções" onClose={onClose} width={420} icon={<GameIcon name="settings" size={22} />} side="right">
      <Section title="Áudio">
        <label className="block mb-3"><span className="label">Música: {Math.round(s.musicVolume * 100)}%</span><input type="range" min={0} max={1} step={0.05} className="w-full accent-amber-600" value={s.musicVolume} onChange={(e) => save({ musicVolume: Number(e.target.value) })} /></label>
        <label className="block mb-3"><span className="label">Efeitos: {Math.round(s.sfxVolume * 100)}%</span><input type="range" min={0} max={1} step={0.05} className="w-full accent-amber-600" value={s.sfxVolume} onChange={(e) => save({ sfxVolume: Number(e.target.value) })} /></label>
        <button className="btn" aria-pressed={s.muted} onClick={() => save({ muted: !s.muted })}><GameIcon name={s.muted ? 'sound-off' : 'sound-on'} size={17} />{s.muted ? 'Ativar som' : 'Silenciar'}</button>
        <p className="text-[12.5px] text-ink-400 mt-2">O áudio só começa depois do seu primeiro clique (regra dos navegadores). Faixas que faltam ficam em silêncio; veja docs/AUDIO.md.</p>
      </Section>
      <div className="max-sm:hidden">
      <Section title="Atalhos de teclado">
        <dl className="text-[14px] text-ink-200 grid grid-cols-[64px_1fr] gap-y-1.5 items-center">{[['E', 'Vasculhar'], ['I', 'Mochila'], ['B', 'Ficha médica'], ['K', 'Habilidades'], ['C', 'Bancada'], ['G', 'Projetos'], ['H', 'Base'], ['F', 'Facção'], ['M', 'Mapa'], ['J', 'Diário'], ['P', 'Personagem'], ['O', 'Opções'], ['Enter', 'Escrever no chat'], ['Esc', 'Fechar painel']].map(([k, v]) => <Fragment key={k}><dt><kbd className="px-1.5 py-0.5 text-[12.5px] font-bold bg-[#101109] border border-ink-600 text-amber-450">{k}</kbd></dt><dd>{v}</dd></Fragment>)}</dl>
      </Section>
      </div>
      <HudSection />
      <BlockedSection />
      <Section title="Outros"><a className="btn" href="#/memorial">Memorial</a></Section>
    </Drawer>
  );
}

/** Jogadores bloqueados no chat, com botão para desbloquear. */
function BlockedSection() {
  const blocks = useGame((s) => s.blocks);
  const [list, setList] = useState<{ userId: number; name: string }[] | null>(null);
  useEffect(() => { action('blocked_list', {}, { silent: true }).then((r: any) => r.ok && setList(r.list)); }, [blocks.length]);
  const unblock = async (userId: number) => {
    const r: any = await action('unblock_user', { userId });
    if (r.ok) { useGame.getState().set({ blocks: r.blocked }); setList((l) => (l ?? []).filter((x) => x.userId !== userId)); }
  };
  return (
    <Section title="Jogadores bloqueados">
      {list === null ? <p className="text-[13px] text-ink-400">Carregando…</p>
        : list.length ? (
          <ul className="space-y-1.5">{list.map((b) => (
            <li key={b.userId} className="flex items-center justify-between gap-2 text-[14px]">
              <span className="truncate">{b.name}</span>
              <button className="btn !py-1 shrink-0" onClick={() => unblock(b.userId)}>Desbloquear</button>
            </li>
          ))}</ul>
        ) : <p className="text-[13px] text-ink-400">Você não bloqueou ninguém. Mensagens de quem você bloqueia no chat somem só para você.</p>}
    </Section>
  );
}

function HudSection() {
  const { simple, setSimple } = useHud();
  return (
    <Section title="Interface">
      <label className="flex items-start gap-2.5 text-[14.5px] text-ink-100 cursor-pointer">
        <input type="checkbox" className="mt-1" checked={simple} onChange={(e) => setSimple(e.target.checked)} />
        <span>Interface simples<span className="block text-[12.5px] text-ink-400">Esconde os botões avançados (habilidades, bancada, base, projetos, facção e diário). Os atalhos de teclado continuam funcionando, e dá para voltar aqui quando quiser.</span></span>
      </label>
    </Section>
  );
}
