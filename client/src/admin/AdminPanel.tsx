import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { GameIcon } from '../components/GameIcon';
import { useIsMobile } from '../lib/mobile';
import { api } from '../lib/api';
import { useGame } from '../lib/store';
import { Bar, Empty, Img, Section, pad, WEATHER } from '../components/ui';
import { ServerControl } from './ServerControl';

const TABS = [
  ['server', 'Controle do jogo', 'pause'], ['overview', 'Visão geral', 'observe'], ['players', 'Jogadores', 'team'], ['characters', 'Personagens', 'character'], ['world', 'Mundo', 'map'], ['loot', 'Loot', 'container'], ['events', 'Eventos', 'danger'],
  ['zombies', 'Zumbis', 'zombie'], ['items', 'Itens', 'inventory'], ['hordes', 'Hordas, veículos e bases', 'base'], ['config', 'Configurações', 'settings'], ['assets', 'Assets', 'cat-misc'], ['logs', 'Logs', 'journal'], ['reports', 'Denúncias', 'mural'],
] as const;

function useLoad<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null); const [err, setErr] = useState('');
  const reload = () => api<T>(path).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { reload(); }, deps);
  return { data, reload, err };
}
async function run(p: Promise<unknown>, ok = 'Salvo.') {
  try { await p; useGame.getState().toast(ok, 'success'); return true; } catch (e: any) { useGame.getState().toast(e.message, 'warn'); return false; }
}

export function AdminPanel() {
  const user = useGame((s) => s.user);
  const [tab, setTab] = useState<string>('server');
  const mobile = useIsMobile();
  if (!user || user.role === 'player') return <div className="h-full flex items-center justify-center"><div className="panel panel-plate p-8 text-center"><h1 className="panel-title text-blood-400">Acesso restrito</h1><p className="text-sm text-ink-400 mt-2">Esta área exige cargo de mestre, moderador ou administrador.</p><a className="btn mt-4" href="#/">Voltar</a></div></div>;
  return (
    <div className={`h-full flex ${mobile ? 'flex-col m-admin' : ''}`}>
      {mobile && (
        <nav aria-label="Seções da administração" className="shrink-0 panel-plate border-b border-black safe-t">
          <div className="flex items-center gap-2 px-3 pt-2">
            <a href="#/" className="btn btn-ghost !px-2" aria-label="Voltar ao jogo"><ArrowLeft size={18} /></a>
            <h1 className="font-display font-extrabold text-[24px] leading-none flex items-center gap-2"><GameIcon name="admin" size={20} className="text-amber-450" />Administração</h1>
          </div>
          <div className="flex overflow-x-auto no-scrollbar px-1 mt-1">{TABS.map(([id, label, icon]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)} className={`shrink-0 flex items-center gap-1.5 px-3 min-h-[44px] text-[14px] border-b-[3px] ${tab === id ? 'text-amber-450 border-amber-450' : 'border-transparent text-ink-200'}`}><GameIcon name={icon} size={15} />{label}</button>)}</div>
        </nav>
      )}
      {!mobile && <nav aria-label="Seções da administração" className="w-60 shrink-0 panel-plate border-r border-black flex flex-col">
        <div className="px-4 py-4 border-b border-black/60"><h1 className="font-display font-extrabold text-[30px] leading-none flex items-center gap-2"><GameIcon name="admin" size={24} className="text-amber-450" />Administração</h1><div className="text-[13px] text-ink-300 mt-1.5">{user.username}, cargo {user.role}</div></div>
        <div className="flex-1 overflow-y-auto py-2">{TABS.map(([id, label, icon]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)} className={`w-full flex items-center gap-2 text-left px-4 min-h-[36px] text-[14px] border-l-4 ${tab === id ? 'bg-amber-450/10 text-amber-450 border-amber-450' : 'border-transparent text-ink-200 hover:bg-black/30'}`}><GameIcon name={icon} size={16} />{label}</button>)}</div>
        <a href="#/" className="btn m-3"><ArrowLeft size={15} />Voltar ao jogo</a>
      </nav>}
      <main className={`flex-1 overflow-y-auto ${mobile ? 'p-3 m-scroll-table overscroll-contain' : 'p-6'}`} key={tab}>
        {tab === 'server' && <ServerControl />}{tab === 'overview' && <Overview />}{tab === 'players' && <Players />}{tab === 'characters' && <Characters />}{tab === 'world' && <World />}
        {tab === 'loot' && <Loot />}{tab === 'events' && <Events />}{tab === 'zombies' && <Zombies />}{tab === 'items' && <Items />}
        {tab === 'hordes' && <HordesVehiclesBases />}{tab === 'config' && <Config />}{tab === 'assets' && <Assets />}{tab === 'logs' && <Logs />}{tab === 'reports' && <Reports />}
      </main>
    </div>
  );
}

const H = ({ children }: { children: React.ReactNode }) => <h2 className="font-display font-extrabold text-[34px] leading-none mb-5 flex items-center">{children}</h2>;
const Th = ({ children }: { children?: React.ReactNode }) => <th className="text-left label px-2 py-1.5 border-b border-ink-700">{children}</th>;
const Td = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => <td className={`px-2 py-1.5 border-b border-ink-800 text-sm ${className}`}>{children}</td>;

function JsonEditor({ value, onSave, height = 260 }: { value: unknown; onSave: (v: any) => void; height?: number }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2)); const [err, setErr] = useState('');
  useEffect(() => setText(JSON.stringify(value, null, 2)), [value]);
  return (
    <div>
      <textarea className="input font-mono text-xs" style={{ height }} value={text} onChange={(e) => { setText(e.target.value); try { JSON.parse(e.target.value); setErr(''); } catch (x: any) { setErr(x.message); } }} />
      {err && <div className="text-xs text-blood-400">{err}</div>}
      <button className="btn btn-moss mt-2" disabled={!!err} onClick={() => onSave(JSON.parse(text))}>Salvar</button>
    </div>
  );
}

function Overview() {
  const { data, reload } = useLoad<any>('/admin/overview');
  const [narr, setNarr] = useState({ text: '', locationId: 'rc_main_street', global: false });
  const [hour, setHour] = useState(12);
  if (!data) return <Empty>Carregando…</Empty>;
  const c = data.clock;
  return (
    <div>
      <H>Visão geral <button className="btn btn-ghost !px-2 ml-3" aria-label="Recarregar" title="Recarregar" onClick={reload}><RefreshCw size={15} /></button></H>
      <div className="grid grid-cols-6 gap-3 mb-6">{[['Contas', data.users], ['Online', data.online], ['Vivos', data.alive], ['Mortos', data.dead], ['Combates ativos', data.combats], ['Denúncias abertas', data.reports]].map(([k, v]) => <div key={k} className="panel p-4"><div className="label">{k}</div><div className="font-[family-name:var(--font-plate)] font-bold text-[32px] leading-none mt-1.5 text-amber-450">{v}</div></div>)}</div>
      <div className="grid grid-cols-2 gap-5">
        <div className="panel p-4">
          <div className="label mb-2">Tempo e clima do mundo</div>
          <div className="text-[18px] font-[family-name:var(--font-plate)] font-semibold">Dia {c.day}, {pad(c.hour)}:{pad(c.minute)}, {WEATHER[c.weather]?.toLowerCase()}, {c.temperature}°C</div>
          <div className="flex gap-2 mt-3 items-center"><input type="number" className="input !w-20" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))} /><button className="btn" onClick={() => run(api('/admin/world/time', { body: { hour } })).then(reload)}>Definir hora</button></div>
          <div className="flex flex-wrap gap-1 mt-3">{Object.keys(WEATHER).map((w) => <button key={w} className="btn !py-1" onClick={() => run(api('/admin/world/weather', { body: { weather: w } })).then(reload)}>{WEATHER[w]}</button>)}</div>
        </div>
        <div className="panel p-4">
          <div className="label mb-2">Narração do mestre</div>
          <textarea className="input h-20" value={narr.text} onChange={(e) => setNarr({ ...narr, text: e.target.value })} placeholder="Ex.: Um helicóptero cruza o céu em direção ao norte…" />
          <div className="flex gap-2 mt-2 items-center">
            <input className="input !w-56" value={narr.locationId} onChange={(e) => setNarr({ ...narr, locationId: e.target.value })} placeholder="id do local" disabled={narr.global} />
            <label className="text-sm flex gap-1 items-center"><input type="checkbox" checked={narr.global} onChange={(e) => setNarr({ ...narr, global: e.target.checked })} />Global</label>
            <button className="btn btn-moss" disabled={!narr.text} onClick={() => run(api('/admin/narrate', { body: narr }), 'Narração enviada.')}>Narrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Players() {
  const { data, reload } = useLoad<any>('/admin/users');
  const me = useGame((s) => s.user)!;
  return (
    <div><H>Jogadores</H>
      <table className="w-full"><thead><tr><Th>ID</Th><Th>Usuário</Th><Th>Cargo</Th><Th>Status</Th><Th>Ações</Th></tr></thead>
        <tbody>{data?.users.map((u: any) => (
          <tr key={u.id}><Td>{u.id}</Td><Td>{u.username} {u.online && <span className="chip text-moss-400 ml-1">online</span>}</Td>
            <Td>{me.role === 'admin' ? <select className="input !py-1 !w-auto" value={u.role} onChange={(e) => run(api(`/admin/users/${u.id}`, { method: 'PATCH', body: { role: e.target.value } })).then(reload)}>{['player', 'gm', 'moderator', 'admin'].map((r) => <option key={r}>{r}</option>)}</select> : u.role}</Td>
            <Td className="text-xs">{u.bannedUntil && new Date(u.bannedUntil) > new Date() ? <span className="text-blood-400">banido até {new Date(u.bannedUntil).toLocaleString('pt-BR')}</span> : u.mutedUntil && new Date(u.mutedUntil) > new Date() ? <span className="text-amber-450">silenciado</span> : 'ok'}</Td>
            <Td><div className="flex gap-1">
              <button className="btn !py-0.5 !text-[10px]" onClick={() => { const h = Number(prompt('Silenciar por quantas horas? (0 remove)', '1')); if (!isNaN(h)) run(api(`/admin/users/${u.id}`, { method: 'PATCH', body: { muteHours: h } })).then(reload); }}>Silenciar</button>
              <button className="btn btn-danger !py-0.5 !text-[10px]" onClick={() => { const h = Number(prompt('Banir por quantas horas? (0 remove)', '24')); const reason = prompt('Motivo:') ?? ''; if (!isNaN(h)) run(api(`/admin/users/${u.id}`, { method: 'PATCH', body: { banHours: h, reason } })).then(reload); }}>Banir</button>
            </div></Td></tr>
        ))}</tbody></table>
    </div>
  );
}

function Characters() {
  const { data, reload } = useLoad<any>('/admin/characters');
  const [sel, setSel] = useState<number | null>(null);
  const detail = useLoad<any>(sel ? `/admin/characters/${sel}` : '/admin/overview', [sel]);
  const [give, setGive] = useState({ defId: 'bandage', qty: 1 }); const [move, setMove] = useState('rc_main_street');
  const ch = sel ? detail.data?.character : null;
  const refresh = () => { reload(); detail.reload(); };
  return (
    <div className="grid grid-cols-[1fr_1.1fr] gap-5"><div><H>Personagens</H>
      <table className="w-full"><thead><tr><Th>Nome</Th><Th>Conta</Th><Th>Local</Th><Th>Estado</Th></tr></thead>
        <tbody>{data?.characters.map((c: any) => <tr key={c.id} className={`cursor-pointer hover:bg-ink-800 ${sel === c.id ? 'bg-amber-450/10' : ''} ${!c.alive ? 'opacity-50' : ''}`} onClick={() => setSel(c.id)}><Td>{c.firstName} {c.lastName} {c.online && <span className="chip text-moss-400 ml-1">online</span>}</Td><Td>{c.username}</Td><Td className="text-xs">{c.locationName}</Td><Td className="text-xs">{c.alive ? c.state : 'morto'}</Td></tr>)}</tbody></table></div>
      <div>{ch && (
        <div className="panel p-4 sticky top-0">
          <div className="font-display font-extrabold text-[28px] leading-none">{ch.name}</div><div className="text-xs text-ink-400">{ch.profession.name} · {ch.locationName} · {ch.state}</div>
          <Section title="Necessidades (editar)">
            <div className="grid grid-cols-3 gap-2">{['hunger', 'thirst', 'sleepiness', 'stamina', 'energy', 'stress', 'blood', 'vitality', 'bodyTemp'].map((k) => (
              <label key={k} className="text-xs"><span className="label !text-[9px]">{k}</span><input type="number" step="any" className="input !py-1" defaultValue={Math.round(ch.needs[k] * 10) / 10} onBlur={(e) => Number(e.target.value) !== ch.needs[k] && run(api(`/admin/characters/${ch.id}/needs`, { method: 'PATCH', body: { [k]: Number(e.target.value) } })).then(refresh)} /></label>
            ))}</div>
          </Section>
          <Section title={`Ferimentos (${ch.wounds.length})`}>{ch.wounds.map((w: any) => <div key={w.id} className="text-xs">{w.typeName} — {w.regionName} · sangr. {w.bleeding} · cic. {Math.round(w.healing * 100)}%{w.infected ? ' · infeccionado' : ''}</div>)}</Section>
          <Section title="Condições (incluindo ocultas)">{detail.data?.allConditions.filter((c: any) => !c.resolvedAt).map((c: any) => <div key={c.id} className="text-xs">{c.kind} · estágio {c.stage} · {Math.round(c.progress * 100)}% {c.discovered ? '' : '(oculta ao jogador)'}</div>)}</Section>
          <div className="flex flex-wrap gap-1.5">
            <button className="btn btn-moss" onClick={() => run(api(`/admin/characters/${ch.id}/heal`, { body: { reason: prompt('Motivo (auditoria):') ?? '' } })).then(refresh)}>Curar tudo</button>
            {ch.alive ? <button className="btn btn-danger" onClick={() => confirm('Matar este personagem? (auditado)') && run(api(`/admin/characters/${ch.id}/kill`, { body: { reason: prompt('Motivo:') ?? '' } })).then(refresh)}>Matar</button>
              : <button className="btn" onClick={() => run(api(`/admin/characters/${ch.id}/revive`, { body: { reason: prompt('Motivo:') ?? '' } })).then(refresh)}>Reviver (exceção)</button>}
          </div>
          {ch.alive && <button className="btn btn-danger mt-2" onClick={() => run(api(`/admin/characters/${ch.id}/encounter`, { body: { count: Number(prompt('Quantos infectados?', '2') ?? 2) } }), 'Confronto iniciado.').then(refresh)}>Iniciar confronto (mestre)</button>}
          <div className="flex gap-1.5 mt-3"><input className="input !py-1" value={give.defId} onChange={(e) => setGive({ ...give, defId: e.target.value })} /><input type="number" className="input !py-1 !w-20" value={give.qty} onChange={(e) => setGive({ ...give, qty: Number(e.target.value) })} /><button className="btn" onClick={() => run(api(`/admin/characters/${ch.id}/items`, { body: give })).then(refresh)}>Dar item</button></div>
          <div className="flex gap-1.5 mt-2"><input className="input !py-1" value={move} onChange={(e) => setMove(e.target.value)} /><button className="btn" onClick={() => run(api(`/admin/characters/${ch.id}/move`, { body: { locationId: move, reason: prompt('Motivo:') ?? '' } })).then(refresh)}>Mover (narrativo)</button></div>
          <Section title="Inventário">{ch.inventory.map((i: any) => <div key={i.id} className="text-xs flex justify-between"><span>{i.name} ×{i.quantity}{i.slot ? ` [${i.slot}]` : ''}</span><button className="text-blood-400" onClick={() => run(api(`/admin/items/${i.id}`, { method: 'DELETE' })).then(refresh)}>remover</button></div>)}</Section>
        </div>
      )}</div>
    </div>
  );
}

function World() {
  const { data, reload } = useLoad<any>('/admin/locations');
  const assets = useLoad<any>('/admin/assets');
  const loot = useLoad<any>('/admin/loot-tables');
  const [q, setQ] = useState(''); const [sel, setSel] = useState<string | null>(null);
  const [newConn, setNewConn] = useState({ toId: '', distance: 100, roadType: 'asphalt' });
  const [newLoc, setNewLoc] = useState({ id: '', name: '', regionId: 'raven_creek', category: 'house', sceneKey: 'house_interior_01', x: 0, y: 0 });
  const loc = data?.locations.find((l: any) => l.id === sel);
  const conns = data?.connections.filter((c: any) => c.fromId === sel || c.toId === sel) ?? [];
  const list = data?.locations.filter((l: any) => !q || l.name.toLowerCase().includes(q.toLowerCase()) || l.id.includes(q)) ?? [];
  const save = (patch: any) => run(api(`/admin/locations/${sel}`, { method: 'PATCH', body: patch })).then(reload);
  return (
    <div className="grid grid-cols-[380px_1fr] gap-5">
      <div><H>Mundo ({data?.locations.length ?? 0} locais)</H>
        <input className="input mb-2" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-[70vh] overflow-y-auto">{list.map((l: any) => <button key={l.id} onClick={() => setSel(l.id)} className={`w-full text-left px-2 py-1.5 text-sm border-b border-ink-800 ${sel === l.id ? 'bg-amber-450/10 text-amber-450' : 'hover:bg-ink-800'}`}>{l.name}<span className="block text-[10px] text-ink-500">{l.id} · {l.category} · perigo {l.danger} · zumbis {l.loot?.zombies}</span></button>)}</div>
        <details className="mt-3"><summary className="label cursor-pointer min-h-[32px] flex items-center">Criar local</summary>
          <div className="grid grid-cols-2 gap-1 mt-2">{Object.keys(newLoc).map((k) => <input key={k} className="input !py-1 text-xs" placeholder={k} value={(newLoc as any)[k]} onChange={(e) => setNewLoc({ ...newLoc, [k]: ['x', 'y'].includes(k) ? Number(e.target.value) : e.target.value })} />)}</div>
          <button className="btn btn-moss mt-2" onClick={() => run(api('/admin/locations', { body: newLoc })).then(reload)}>Criar</button></details>
      </div>
      <div>{loc && (
        <div className="panel p-5">
          <div className="grid grid-cols-[1fr_300px] gap-4">
            <div className="space-y-2">
              <label className="block"><span className="label">Nome</span><input className="input" defaultValue={loc.name} onBlur={(e) => e.target.value !== loc.name && save({ name: e.target.value })} /></label>
              <label className="block"><span className="label">Descrição</span><textarea className="input h-20" defaultValue={loc.description} onBlur={(e) => e.target.value !== loc.description && save({ description: e.target.value })} /></label>
              <div className="grid grid-cols-3 gap-2">
                <label><span className="label">Cenário</span><select className="input" value={loc.sceneKey} onChange={(e) => save({ sceneKey: e.target.value })}>{assets.data?.assets.filter((a: any) => a.kind === 'scene').map((a: any) => <option key={a.key}>{a.key}</option>)}</select></label>
                <label><span className="label">Arena</span><select className="input" value={loc.arenaKey} onChange={(e) => save({ arenaKey: e.target.value })}>{data.arenas.map((a: string) => <option key={a}>{a}</option>)}</select></label>
                <label><span className="label">Tabela de loot</span><select className="input" value={loc.lootTableId ?? ''} onChange={(e) => save({ lootTableId: e.target.value || null })}><option value="">(nenhuma)</option>{loot.data?.tables.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
                <label><span className="label">Perigo (0–1)</span><input type="number" step="0.05" className="input" defaultValue={loc.danger} onBlur={(e) => save({ danger: Number(e.target.value) })} /></label>
                <label><span className="label">Música</span><input className="input" defaultValue={loc.musicKey} onBlur={(e) => save({ musicKey: e.target.value })} /></label>
                <div className="flex flex-col gap-1 pt-4"><label className="text-sm"><input type="checkbox" checked={loc.buildable} onChange={(e) => save({ buildable: e.target.checked })} /> Fortificável</label><label className="text-sm"><input type="checkbox" checked={loc.indoor} onChange={(e) => save({ indoor: e.target.checked })} /> Interior</label></div>
              </div>
            </div>
            <Img src={`/assets/scenes/${loc.sceneKey}.png`} fallback="/assets/scenes/street_city_01.png" className="w-full aspect-video object-cover border border-ink-700" />
          </div>
          {loc.loot && <Section title="Recursos e ameaça (persistentes)">
            <div className="grid grid-cols-4 gap-2">{['reserve', 'maxReserve', 'regenPerHour', 'zombies'].map((k) => <label key={k}><span className="label !text-[9px]">{k}</span><input type="number" step="any" className="input !py-1" defaultValue={Math.round(loc.loot[k] * 10) / 10} onBlur={(e) => run(api(`/admin/location-loot/${loc.id}`, { method: 'PATCH', body: { [k]: k === 'zombies' ? Math.round(Number(e.target.value)) : Number(e.target.value) } })).then(reload)} /></label>)}</div>
            <div className="mt-2"><Bar value={loc.loot.reserve} max={loc.loot.maxReserve} color="#7a8c4e" /><div className="text-[10px] text-ink-500 mt-1">Vasculhado {loc.loot.timesSearched}×</div></div>
          </Section>}
          <Section title="Conexões">
            {conns.map((c: any) => { const other = c.fromId === sel ? c.toId : c.fromId; return (
              <div key={c.id} className="flex items-center gap-2 text-sm py-1 border-b border-ink-800">
                <span className="flex-1">{data.locations.find((l: any) => l.id === other)?.name} <span className="text-xs text-ink-500">· {Math.round(c.distance)} m · {c.roadType}</span></span>
                <label className="text-xs"><input type="checkbox" checked={c.blocked} onChange={(e) => run(api(`/admin/connections/${c.id}`, { method: 'PATCH', body: { blocked: e.target.checked, blockedReason: e.target.checked ? prompt('Motivo do bloqueio:') ?? 'Bloqueado' : null } })).then(reload)} /> bloqueada</label>
                <button className="text-blood-400 text-xs" onClick={() => confirm('Remover conexão?') && run(api(`/admin/connections/${c.id}`, { method: 'DELETE' })).then(reload)}>remover</button>
              </div>); })}
            <div className="flex gap-1 mt-2"><select className="input !py-1" value={newConn.toId} onChange={(e) => setNewConn({ ...newConn, toId: e.target.value })}><option value="">Conectar a…</option>{data.locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
              <input type="number" className="input !py-1 !w-24" value={newConn.distance} onChange={(e) => setNewConn({ ...newConn, distance: Number(e.target.value) })} />
              <select className="input !py-1 !w-28" value={newConn.roadType} onChange={(e) => setNewConn({ ...newConn, roadType: e.target.value })}>{['indoor', 'trail', 'dirt', 'asphalt'].map((r) => <option key={r}>{r}</option>)}</select>
              <button className="btn" onClick={() => run(api('/admin/connections', { body: { fromId: sel, ...newConn } })).then(reload)}>Conectar</button></div>
          </Section>
        </div>
      )}</div>
    </div>
  );
}

function Loot() {
  const [night, setNight] = useState(false);
  const { data, reload } = useLoad<any>(`/admin/loot-tables${night ? '?night=1' : ''}`, [night]);
  const items = useLoad<any>('/admin/item-defs');
  const [sel, setSel] = useState('residential'); const [rows, setRows] = useState<any[]>([]);
  const table = data?.tables.find((t: any) => t.id === sel);
  useEffect(() => { if (table) setRows(table.entries.map((e: any) => ({ ...e }))); }, [table?.id, data]);
  const total = rows.reduce((s, r) => s + Number(r.weight || 0), 0) || 1;
  return (
    <div><H>Tabelas de loot</H>
      <p className="text-sm text-ink-400 mb-3">Pesos relativos. A chance mostrada é por sorteio de item. O número de achados por busca depende da reserva do local, da habilidade e da iluminação (ver Configurações, seção exploração). Itens raros consomem mais reserva: {JSON.stringify(data?.reserveCost)}.</p>
      <div className="flex gap-2 mb-3"><select className="input !w-72" value={sel} onChange={(e) => setSel(e.target.value)}>{data?.tables.map((t: any) => <option key={t.id} value={t.id}>{t.name} ({t.id})</option>)}</select><label className="text-sm flex items-center gap-1"><input type="checkbox" checked={night} onChange={(e) => setNight(e.target.checked)} />ver à noite</label></div>
      <table className="w-full max-w-4xl"><thead><tr><Th>Item</Th><Th>Peso</Th><Th>Mín</Th><Th>Máx</Th><Th>Chance</Th><Th></Th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}><Td><select className="input !py-1" value={r.itemId} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))}>{items.data?.items.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Td>
            {(['weight', 'min', 'max'] as const).map((k) => <Td key={k}><input type="number" step="any" className="input !py-1 !w-20" value={r[k]} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, [k]: Number(e.target.value) } : x)))} /></Td>)}
            <Td className="w-56"><div className="flex items-center gap-2"><div className="flex-1"><Bar value={(r.weight / total) * 100} color="#d98c1a" small /></div><span className="font-mono text-xs w-12 text-right">{((r.weight / total) * 100).toFixed(1)}%</span></div></Td>
            <Td><button className="text-blood-400 text-xs" onClick={() => setRows(rows.filter((_, j) => j !== i))}>remover</button></Td></tr>
        ))}</tbody></table>
      <div className="flex gap-2 mt-3"><button className="btn" onClick={() => setRows([...rows, { itemId: 'bandage', weight: 1, min: 1, max: 1 }])}>+ Linha</button><button className="btn btn-moss" onClick={() => run(api(`/admin/loot-tables/${sel}`, { method: 'PUT', body: { name: table.name, entries: rows } })).then(reload)}>Salvar tabela</button></div>
    </div>
  );
}

function Events() {
  const { data, reload } = useLoad<any>('/admin/event-defs');
  const locs = useLoad<any>('/admin/locations');
  const hist = useLoad<any>('/admin/events/history');
  const [prob, setProb] = useState({ scope: 'explore', locationId: 'rc_hospital_corridor', roadType: 'asphalt' });
  const probs = useLoad<any>(`/admin/event-probabilities?scope=${prob.scope}&locationId=${prob.locationId}&roadType=${prob.roadType}`, [prob.scope, prob.locationId, prob.roadType]);
  const [edit, setEdit] = useState<any>(null); const [trig, setTrig] = useState({ eventId: '', locationId: 'rc_main_street', runAt: '' });
  return (
    <div><H>Eventos dinâmicos</H>
      <div className="grid grid-cols-2 gap-5">
        <div>
          <table className="w-full"><thead><tr><Th>Evento</Th><Th>Escopo</Th><Th>Peso</Th><Th>Ativo</Th><Th></Th></tr></thead>
            <tbody>{data?.events.map((e: any) => <tr key={e.id}><Td>{e.name}<div className="text-[10px] text-ink-500">{e.kind}{e.requiresDecision ? ' · exige decisão' : ''}{e.cooldownMinutes ? ` · recarga ${e.cooldownMinutes}min` : ''}</div></Td><Td className="text-xs">{e.scope}</Td>
              <Td><input type="number" step="0.1" className="input !py-0.5 !w-16" defaultValue={e.weight} onBlur={(x) => run(api(`/admin/event-defs/${e.id}`, { method: 'PUT', body: { ...e, weight: Number(x.target.value) } })).then(reload)} /></Td>
              <Td><input type="checkbox" checked={e.enabled} onChange={(x) => run(api(`/admin/event-defs/${e.id}`, { method: 'PUT', body: { ...e, enabled: x.target.checked } })).then(reload)} /></Td>
              <Td><button className="text-xs text-amber-450" onClick={() => setEdit(e)}>editar</button></Td></tr>)}</tbody></table>
          <button className="btn mt-2" onClick={() => setEdit({ id: `custom_${Date.now().toString(36)}`, name: 'Novo evento', scope: 'world', kind: 'message', weight: 1, cooldownMinutes: 30, conditions: {}, effects: {}, text: 'Algo acontece…', requiresDecision: false, enabled: true })}>+ Novo evento</button>
          {edit && <div className="panel p-3 mt-3"><div className="label mb-1">{edit.id}</div><JsonEditor value={edit} height={300} onSave={(v) => run(api(`/admin/event-defs/${edit.id}`, { method: 'PUT', body: v })).then(() => { setEdit(null); reload(); })} />
            <div className="text-[10px] text-ink-500 mt-1">kind: combat | message | loot | stress | wound | vehicle | weather | horde | structure_damage | roadblock | alt_path | accident · conditions: categories, roadTypes, timeOfDay, weather, minDanger, vehicleOnly, footOnly</div></div>}
        </div>
        <div>
          <Section title="Probabilidades efetivas agora">
            <div className="flex gap-1 mb-2"><select className="input !py-1" value={prob.scope} onChange={(e) => setProb({ ...prob, scope: e.target.value })}>{['explore', 'travel', 'world'].map((s) => <option key={s}>{s}</option>)}</select>
              <select className="input !py-1" value={prob.locationId} onChange={(e) => setProb({ ...prob, locationId: e.target.value })}>{locs.data?.locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
              {prob.scope === 'travel' && <select className="input !py-1" value={prob.roadType} onChange={(e) => setProb({ ...prob, roadType: e.target.value })}>{['asphalt', 'dirt', 'trail', 'indoor'].map((r) => <option key={r}>{r}</option>)}</select>}</div>
            <div className="text-xs text-ink-400 mb-2">{probs.data?.notes} ({probs.data?.phase}, {probs.data?.weather})</div>
            {probs.data?.events.map((e: any) => <div key={e.id} className="flex items-center gap-2 text-sm"><span className="w-48 truncate">{e.name}</span><div className="flex-1"><Bar value={e.probability * 100} color="#d98c1a" small /></div><span className="font-mono text-xs w-12 text-right">{(e.probability * 100).toFixed(1)}%</span></div>)}
            {!probs.data?.events.length && <Empty>Nenhum evento elegível nessas condições.</Empty>}
          </Section>
          <Section title="Ativar ou programar evento">
            <div className="grid grid-cols-2 gap-1"><select className="input !py-1" value={trig.eventId} onChange={(e) => setTrig({ ...trig, eventId: e.target.value })}><option value="">Evento…</option>{data?.events.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
              <select className="input !py-1" value={trig.locationId} onChange={(e) => setTrig({ ...trig, locationId: e.target.value })}>{locs.data?.locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
              <input type="datetime-local" className="input !py-1" value={trig.runAt} onChange={(e) => setTrig({ ...trig, runAt: e.target.value })} /></div>
            <div className="flex gap-1 mt-2"><button className="btn btn-danger" disabled={!trig.eventId} onClick={() => run(api('/admin/events/trigger', { body: trig }), 'Evento disparado.').then(hist.reload)}>Disparar agora</button>
              <button className="btn" disabled={!trig.eventId || !trig.runAt} onClick={() => run(api('/admin/events/schedule', { body: { ...trig, runAt: new Date(trig.runAt).toISOString() } }), 'Programado.').then(hist.reload)}>Programar</button></div>
          </Section>
          <Section title="Histórico">{hist.data?.history.slice(0, 30).map((h: any) => <div key={h.id} className="text-xs text-ink-300">{new Date(h.createdAt).toLocaleString('pt-BR')} — {h.eventId} @ {h.locationId ?? 'viagem'}{h.triggeredBy ? ' (manual)' : ''}</div>)}
            {hist.data?.scheduled.filter((s: any) => !s.done).map((s: any) => <div key={s.id} className="text-xs text-amber-450 flex items-center gap-1"><GameIcon name="clock" size={13} label="agendado" />{new Date(s.runAt).toLocaleString('pt-BR')} — {s.eventId} @ {s.locationId}</div>)}</Section>
        </div>
      </div>
    </div>
  );
}

function Zombies() {
  const { data, reload } = useLoad<any>('/admin/zombie-types');
  return (
    <div><H>Tipos de infectados</H>
      <p className="text-sm text-ink-400 mb-3">Comportamentos: shambler (persegue/vagueia), runner (investe, 4 PA), brute (resistente, arremessa, arromba portas), wanderer (errático), lurker (oculto até alguém chegar perto). Estatísticas: body (resistência), headThreshold (dano para abate na cabeça), ap, perception, hitChance, chances de mordida/arranhão/laceração/contusão.</p>
      <div className="grid grid-cols-2 gap-4">{data?.types.map((z: any) => (
        <div key={z.id} className="panel p-4"><div className="flex justify-between"><b>{z.name}</b><span className="chip">{z.behavior}</span></div><div className="text-xs text-ink-400 mb-2">{z.description}</div>
          <JsonEditor value={{ name: z.name, description: z.description, behavior: z.behavior, stats: z.stats, spawnWeight: z.spawnWeight, nightMultiplier: z.nightMultiplier, allowedCategories: z.allowedCategories, enabled: z.enabled }} height={220}
            onSave={(v) => run(api(`/admin/zombie-types/${z.id}`, { method: 'PUT', body: v })).then(reload)} /></div>
      ))}</div>
    </div>
  );
}

function Items() {
  const { data, reload } = useLoad<any>('/admin/item-defs');
  const [q, setQ] = useState(''); const [sel, setSel] = useState<any>(null);
  const list = useMemo(() => data?.items.filter((i: any) => !q || i.name.toLowerCase().includes(q.toLowerCase()) || i.id.includes(q)) ?? [], [data, q]);
  return (
    <div className="grid grid-cols-[360px_1fr] gap-5"><div><H>Itens ({data?.items.length})</H>
      <input className="input mb-2" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-[70vh] overflow-y-auto">{list.map((i: any) => <button key={i.id} onClick={() => setSel(i)} className={`w-full text-left px-2 py-1 text-sm border-b border-ink-800 ${sel?.id === i.id ? 'text-amber-450' : 'hover:bg-ink-800'}`}>{i.name} <span className="text-[10px] text-ink-500">{i.id} · {i.category} · {i.rarity}</span></button>)}</div>
      <button className="btn mt-2" onClick={() => setSel({ id: 'novo_item', name: 'Novo item', category: 'misc', description: '', weight: 0.5, volume: 1, stackable: false, maxStack: 1, durabilityMax: 0, rarity: 'common', equipSlot: null, icon: 'generic', props: {} })}>+ Novo item</button></div>
      <div>{sel && <div className="panel p-4"><div className="label mb-2">{sel.id}</div><JsonEditor value={sel} height={420} onSave={(v) => run(api(`/admin/item-defs/${v.id}`, { method: 'PUT', body: v })).then(reload)} /></div>}</div>
    </div>
  );
}

function HordesVehiclesBases() {
  const hordes = useLoad<any>('/admin/hordes'); const vehicles = useLoad<any>('/admin/vehicles'); const bases = useLoad<any>('/admin/bases');
  const [spawn, setSpawn] = useState({ locationId: 'hw_crossroads', targetLocationId: '', size: 15 }); const [veh, setVeh] = useState({ locationId: 'rc_parking', type: 'compact' });
  return (
    <div><H>Hordas</H>
      <div className="flex gap-1 mb-2"><input className="input !py-1 !w-48" value={spawn.locationId} onChange={(e) => setSpawn({ ...spawn, locationId: e.target.value })} placeholder="local de origem" /><input className="input !py-1 !w-48" value={spawn.targetLocationId} onChange={(e) => setSpawn({ ...spawn, targetLocationId: e.target.value })} placeholder="alvo (opcional)" /><input type="number" className="input !py-1 !w-20" value={spawn.size} onChange={(e) => setSpawn({ ...spawn, size: Number(e.target.value) })} />
        <button className="btn btn-danger" onClick={() => run(api('/admin/hordes', { body: { ...spawn, targetLocationId: spawn.targetLocationId || undefined } }), 'Horda criada.').then(hordes.reload)}>Criar horda</button></div>
      <table className="w-full mb-8"><tbody>{hordes.data?.hordes.map((h: any) => <tr key={h.id} className={h.active ? '' : 'opacity-40'}><Td>{h.name}</Td><Td>~{h.size}</Td><Td>{h.locationName}{h.targetName ? `, indo para ${h.targetName}` : ', parada'}</Td><Td>{h.active && <button className="text-xs text-amber-450" onClick={() => run(api(`/admin/hordes/${h.id}`, { method: 'PATCH', body: { active: false } })).then(hordes.reload)}>dispersar</button>}</Td></tr>)}</tbody></table>
      <H>Veículos</H>
      <div className="flex gap-1 mb-2"><input className="input !py-1 !w-48" value={veh.locationId} onChange={(e) => setVeh({ ...veh, locationId: e.target.value })} /><select className="input !py-1 !w-40" value={veh.type} onChange={(e) => setVeh({ ...veh, type: e.target.value })}>{Object.keys(vehicles.data?.types ?? {}).map((t) => <option key={t}>{t}</option>)}</select><button className="btn" onClick={() => run(api('/admin/vehicles', { body: veh })).then(vehicles.reload)}>Colocar veículo</button></div>
      <table className="w-full mb-8"><tbody>{vehicles.data?.vehicles.map((v: any) => <tr key={v.id}><Td>{v.name}</Td><Td className="text-xs">{v.locationName}</Td><Td className="text-xs">comb. {Math.round(v.fuel)}/{v.fuelMax} · motor {Math.round(v.engine)} · pneus {Math.round(v.tires)} · bat. {Math.round(v.battery)}</Td><Td>{v.hasKey ? 'chave' : 'sem chave'}</Td></tr>)}</tbody></table>
      <H>Bases</H>
      <table className="w-full"><tbody>{bases.data?.bases.map((b: any) => <tr key={b.id}><Td>{b.name}</Td><Td className="text-xs">{b.locationName}</Td><Td className="text-xs">{b.structures.map((s: any) => `${s.kind} ${Math.round(s.hp)}/${s.maxHp}`).join(', ')}</Td><Td><button className="text-xs text-blood-400" onClick={() => confirm('Remover base? (auditado)') && run(api(`/admin/bases/${b.id}`, { method: 'DELETE' })).then(bases.reload)}>remover</button></Td></tr>)}</tbody></table>
    </div>
  );
}

function Config() {
  const { data, reload } = useLoad<any>('/admin/config');
  const [cfg, setCfg] = useState<any>(null);
  const role = useGame((s) => s.user?.role);
  useEffect(() => { if (data) setCfg(structuredClone(data.config)); }, [data]);
  if (!cfg) return <Empty>Carregando…</Empty>;
  const setAt = (path: string[], v: any) => { const n = structuredClone(cfg); let o = n; for (const p of path.slice(0, -1)) o = o[p]; o[path[path.length - 1]] = v; setCfg(n); };
  const render = (obj: any, path: string[]): React.ReactNode => Object.entries(obj).map(([k, v]) => {
    const p = [...path, k];
    if (v && typeof v === 'object' && !Array.isArray(v)) return <div key={k} className="ml-3 mt-2"><div className="label text-ink-300">{k}</div><div className="grid grid-cols-2 gap-x-4">{render(v, p)}</div></div>;
    return (
      <label key={k} className="flex items-center justify-between gap-2 py-1 border-b border-ink-800 text-sm">
        <span className="text-ink-300 font-mono text-xs">{k}</span>
        {typeof v === 'boolean' ? <input type="checkbox" checked={v} onChange={(e) => setAt(p, e.target.checked)} />
          : typeof v === 'number' ? <input type="number" step="any" className="input !py-0.5 !w-28 text-right" value={v} onChange={(e) => setAt(p, Number(e.target.value))} />
            : Array.isArray(v) ? <input className="input !py-0.5 !w-56 text-xs" value={JSON.stringify(v)} onChange={(e) => { try { setAt(p, JSON.parse(e.target.value)); } catch { /* aguardando JSON válido */ } }} />
              : <input className="input !py-0.5 !w-40" value={String(v)} onChange={(e) => setAt(p, e.target.value)} />}
      </label>
    );
  });
  return (
    <div><H>Configurações globais e balanceamento</H>
      <p className="text-sm text-ink-400 mb-4">Todas as regras de jogo leem estes valores (tempo, necessidades, exploração, viagens, ferimentos, infecção, combate, PVP, permadeath, hordas). "Por hora/minuto" é tempo real. A escala de tempo do relógio não altera viagens nem ferimentos.</p>
      <div className="grid grid-cols-2 gap-6">{Object.entries(cfg).map(([section, v]) => typeof v === 'object' ? <div key={section} className="panel p-4"><div className="panel-title text-amber-450 text-sm mb-2">{section}</div>{render(v, [section])}</div> : <div key={section} className="panel p-4"><label className="flex justify-between text-sm"><span className="font-mono">{section}</span><input className="input !w-40 !py-0.5" value={String(v)} onChange={(e) => setAt([section], e.target.value)} /></label></div>)}</div>
      <div className="sticky bottom-0 py-3 bg-ink-950/90 flex gap-2 mt-4">
        <button className="btn btn-moss" disabled={role !== 'admin'} onClick={() => run(api('/admin/config', { method: 'PUT', body: { config: cfg } }), 'Configuração aplicada.').then(reload)}>Salvar configurações</button>
        <button className="btn" onClick={() => setCfg(structuredClone(data.config))}>Descartar</button>
        <button className="btn btn-ghost" onClick={() => confirm('Restaurar padrões no formulário? (só aplica ao salvar)') && setCfg(structuredClone(data.defaults))}>Padrões</button>
        {role !== 'admin' && <span className="text-xs text-ink-400 self-center">Somente administradores podem salvar.</span>}
      </div>
    </div>
  );
}

function Assets() {
  const { data, reload } = useLoad<any>('/admin/assets');
  const [kind, setKind] = useState('scene');
  const upload = async (key: string, f: File) => { const fd = new FormData(); fd.append('file', f); await run(api(`/admin/assets/${key}`, { form: fd }), 'Arquivo substituído.'); reload(); };
  return (
    <div><H>Catálogo de assets</H>
      <p className="text-sm text-ink-400 mb-3">Substitua qualquer arquivo sem alterar código. Cenários: 1920×1080 (16:9) · retratos: PNG transparente ~800×1200 · arenas: 1024×704 (tiles de 64 px) · áudio: OGG/MP3. Também é possível trocar diretamente os arquivos em <code>client/public/assets</code>.</p>
      <div className="flex gap-1 mb-4">{['scene', 'arena', 'portrait', 'audio'].map((k) => <button key={k} onClick={() => setKind(k)} className={`chip ${kind === k ? 'border-amber-450 text-amber-450' : 'text-ink-400'}`}>{k}</button>)}</div>
      <div className="grid grid-cols-4 gap-3">{data?.assets.filter((a: any) => a.kind === kind).map((a: any) => (
        <div key={a.key} className="panel p-2">
          {a.kind !== 'audio' ? <Img src={a.path + `?v=${new Date(a.updatedAt).getTime()}`} fallback="/assets/scenes/street_city_01.png" className={`w-full ${a.kind === 'portrait' ? 'aspect-[2/3] object-contain' : 'aspect-video object-cover'} bg-ink-950`} /> : <div className="h-12 flex items-center">{a.exists ? <audio controls src={a.path} className="w-full h-8" /> : <span className="text-xs text-ink-500">arquivo ausente</span>}</div>}
          <div className="text-xs font-mono mt-1 truncate">{a.key}</div>
          <div className="text-[10px] text-ink-500 truncate">{a.path} {a.width ? `· ${a.width}×${a.height}` : ''}</div>
          <div className="flex justify-between items-center mt-1"><span className={`text-[10px] ${a.isPlaceholder ? 'text-amber-450' : 'text-moss-400'}`}>{a.exists ? (a.isPlaceholder ? 'placeholder' : 'definitivo') : 'ausente'}</span>
            <label className="text-[10px] text-ink-300 cursor-pointer hover:text-amber-450">substituir<input type="file" hidden onChange={(e) => e.target.files?.[0] && upload(a.key, e.target.files[0])} /></label></div>
          {a.usedBy.length > 0 && <div className="text-[10px] text-ink-500 mt-1 line-clamp-2">Usado em: {a.usedBy.join(', ')}</div>}
        </div>
      ))}</div>
    </div>
  );
}

function Logs() {
  const admin = useLoad<any>('/admin/logs'); const [kind, setKind] = useState('');
  const game = useLoad<any>(`/admin/game-logs${kind ? `?kind=${kind}` : ''}`, [kind]);
  return (
    <div className="grid grid-cols-2 gap-5">
      <div><H>Auditoria administrativa</H>{admin.data?.logs.map((l: any) => <div key={l.id} className="text-xs border-b border-ink-800 py-1"><span className="text-ink-500">{new Date(l.createdAt).toLocaleString('pt-BR')}</span> · usuário #{l.actorUserId} · <b>{l.action}</b> {l.targetType}:{l.targetId}<div className="text-ink-500 truncate">{JSON.stringify(l.details)}</div></div>)}</div>
      <div><H>Registros do jogo</H>
        <div className="flex flex-wrap gap-1 mb-2">{['', 'pvp', 'theft', 'combat', 'death', 'wound', 'explore', 'travel', 'base'].map((k) => <button key={k} onClick={() => setKind(k)} className={`chip ${kind === k ? 'border-amber-450 text-amber-450' : 'text-ink-400'}`}>{k || 'todos'}</button>)}</div>
        {game.data?.logs.map((l: any) => <div key={l.id} className="text-xs border-b border-ink-800 py-1"><span className="text-ink-500">{new Date(l.createdAt).toLocaleString('pt-BR')} · #{l.characterId} · {l.kind}</span> — {l.message}</div>)}</div>
    </div>
  );
}

function Reports() {
  const { data, reload } = useLoad<any>('/admin/reports');
  return (
    <div><H>Denúncias</H>
      {data?.reports.length ? data.reports.map((r: any) => (
        <div key={r.id} className={`panel p-3 mb-2 ${r.status === 'open' ? 'border-amber-450/50' : 'opacity-60'}`}>
          <div className="text-xs text-ink-400">#{r.id} · {new Date(r.createdAt).toLocaleString('pt-BR')} · usuário #{r.reporterUserId} denunciou #{r.targetUserId}</div>
          <div className="text-sm mt-1">{r.reason}</div>
          {r.message && <div className="text-sm mt-1 border-l-2 border-ink-600 pl-2 text-ink-300">“{r.message.content}” — {r.message.authorName}</div>}
          <div className="flex gap-1 mt-2">{r.status === 'open' && <button className="btn !py-1" onClick={() => run(api(`/admin/reports/${r.id}`, { method: 'PATCH', body: { status: 'resolved' } })).then(reload)}>Resolver</button>}
            {r.message && !r.message.deleted && <button className="btn btn-danger !py-1" onClick={() => run(api(`/admin/chat/${r.message.id}`, { method: 'DELETE' })).then(reload)}>Remover mensagem</button>}</div>
        </div>
      )) : <Empty>Nenhuma denúncia.</Empty>}
    </div>
  );
}
