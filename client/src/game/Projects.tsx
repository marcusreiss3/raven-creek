import { useEffect, useState } from 'react';
import { GameIcon, FactionEmblem } from '../components/GameIcon';
import { useGame } from '../lib/store';
import { action } from '../lib/socket';
import { Bar, Drawer, Empty, fmtDuration } from '../components/ui';

type Project = {
  id: string; name: string; description: string; effect: string; locationId: string; locationName: string;
  status: 'locked' | 'active' | 'complete'; integrity: number; active: boolean;
  requires: { id: string; name: string; done: boolean }[];
  materials: { itemId: string; name: string; need: number; delivered: number; have: number }[];
  labor: { done: number; need: number; allowed: number };
  skill: string; tools: { id: string; name: string }[]; sessionMinutes: number;
  blockers: { id: string; name: string; zombies: number }[];
  contributors: { id: number; name: string; items: number; minutes: number }[];
  mine: { items: number; minutes: number } | null; here: boolean;
  power: null | { on: boolean; controller: { id: number; name: string; emblem: string } | null; myFaction: number | null };
  production: null | { name: string; perHour: number; max: number; container: string };
};

const SKILL: Record<string, string> = { electrical: 'Elétrica', medicine: 'Medicina', carpentry: 'Carpintaria', mechanics: 'Mecânica', farming: 'Agricultura' };

export function ProjectsPanel({ onClose }: { onClose: () => void }) {
  const tick = useGame((s) => s.projectsTick);
  const self = useGame((s) => s.self);
  const [data, setData] = useState<{ projects: Project[]; minIntegrity: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => { const r = await action('projects_list', {}, { silent: true }); if (r.ok) setData(r as any); };
  useEffect(() => { load(); }, [tick, self?.locationId, self?.state]);
  const run = async (type: string, payload: any) => { setBusy(true); await action(type, payload); setBusy(false); load(); };
  const list = [...(data?.projects ?? [])].sort((a, b) => Number(b.here) - Number(a.here) || ({ active: 0, complete: 1, locked: 2 }[a.status] - { active: 0, complete: 1, locked: 2 }[b.status]));
  const idle = self?.state === 'idle';
  return (
    <Drawer title="Projetos da comunidade" onClose={onClose} width={640} icon={<GameIcon name="projects" size={22} />}>
      <p className="text-[14.5px] text-ink-300 mb-4 max-w-[62ch]">
        Obras coletivas que mudam Raven Creek para todo mundo. Os materiais são entregues <b>no local da obra</b>, e o trabalho é feito lá em turnos de
        {' '}{data?.projects[0]?.sessionMinutes ?? 20} minutos. O trabalho só avança conforme os materiais chegam. Obras prontas se desgastam com o tempo e com hordas, e
        param de funcionar abaixo de {data?.minIntegrity ?? 40}%. Aí precisam de reparo.
      </p>
      {!data && <Empty>Carregando…</Empty>}
      <div className="space-y-4">
        {list.map((p) => <ProjectCard key={p.id} p={p} busy={busy} idle={idle} run={run} minIntegrity={data!.minIntegrity} />)}
      </div>
    </Drawer>
  );
}

function ProjectCard({ p, busy, idle, run, minIntegrity }: { p: Project; busy: boolean; idle: boolean; run: (t: string, x: any) => void; minIntegrity: number }) {
  const matNeed = p.materials.reduce((s, m) => s + m.need, 0); const matDone = p.materials.reduce((s, m) => s + m.delivered, 0);
  const status = p.status === 'locked' ? { t: 'Bloqueado', c: 'text-ink-300', i: 'lock' }
    : p.status === 'active' ? { t: 'Em obras', c: 'text-amber-450', i: 'crafting' }
    : p.active ? { t: 'Funcionando', c: 'text-moss-400', i: 'check' } : { t: 'Danificada', c: 'text-blood-400', i: 'danger' };
  const canDeliverAny = p.here && p.status === 'active' && p.materials.some((m) => m.have > 0 && m.delivered < m.need);
  const laborFull = p.labor.done >= p.labor.need;
  const workBlockedByMaterials = p.status === 'active' && p.labor.done >= p.labor.allowed && !laborFull;
  return (
    <article className={`panel ${p.here ? '!border-amber-450/70' : ''} p-4`} aria-label={p.name}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display font-extrabold text-[24px] leading-none text-ink-100">{p.name}</h3>
          <div className="text-[13px] text-ink-300 flex items-center gap-1 mt-1.5"><GameIcon name="pin" size={13} />{p.locationName}{p.here && <span className="tape !text-[12.5px] ml-2">você está aqui</span>}</div>
        </div>
        <span className={`chip ${status.c} shrink-0`}><GameIcon name={status.i} size={13} />{status.t}</span>
      </div>
      <p className="text-[14.5px] text-ink-200 mt-2">{p.description}</p>
      <p className="text-[14px] text-moss-400 mt-1.5">{p.effect}</p>

      {p.status === 'locked' && <div className="text-[14px] text-ink-300 mt-3 flex flex-wrap items-center gap-1.5">Depende de: {p.requires.map((r) => <span key={r.id} className={`chip ${r.done ? 'text-moss-400' : 'text-blood-400'}`}><GameIcon name={r.done ? 'check' : 'lock'} size={12} />{r.name}<span className="sr-only">{r.done ? ', pronto' : ', pendente'}</span></span>)}</div>}

      {p.status !== 'locked' && p.status !== 'complete' && (
        <>
          <div className="mt-3">
            <div className="flex justify-between label mb-1"><span className="flex items-center gap-1"><GameIcon name="materials" size={14} />Materiais</span><span>{matDone} de {matNeed}</span></div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {p.materials.map((m) => (
                <div key={m.itemId} className="text-[13px]">
                  <div className="flex justify-between"><span className={m.delivered >= m.need ? 'text-moss-400' : 'text-ink-200'}>{m.name}</span><span className="text-ink-300">{m.delivered}/{m.need}</span></div>
                  <Bar value={(m.delivered / m.need) * 100} color={m.delivered >= m.need ? '#7a8c4e' : '#d98c1a'} small />
                  {p.here && m.have > 0 && m.delivered < m.need && <button className="text-[12.5px] min-h-[28px] text-amber-450 underline decoration-dotted underline-offset-2 hover:decoration-solid" disabled={busy} onClick={() => run('project_deliver', { projectId: p.id, itemId: m.itemId })}>entregar ({Math.min(m.have, m.need - m.delivered)} de {m.have})</button>}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3">
            <div className="flex justify-between label mb-1"><span className="flex items-center gap-1"><GameIcon name="crafting" size={14} />Trabalho de {(SKILL[p.skill] ?? p.skill).toLowerCase()}</span><span>{fmtDuration(p.labor.done * 60000)} de {fmtDuration(p.labor.need * 60000)}</span></div>
            <div className="relative"><Bar value={(p.labor.done / p.labor.need) * 100} color="#d98c1a" />
              {p.labor.allowed < p.labor.need && <div className="absolute top-0 bottom-0 border-r-2 border-dashed border-ink-300/70" style={{ left: `${(p.labor.allowed / p.labor.need) * 100}%` }} title="Limite liberado pelos materiais entregues" />}
            </div>
            <div className="text-[12.5px] text-ink-400 mt-1">A linha tracejada é até onde os materiais entregues permitem trabalhar. Ferramentas: {p.tools.map((t) => t.name).join(', ')}.</div>
          </div>
          {p.blockers.length > 0 && <div className="mt-2 text-[13px] text-blood-400 flex items-start gap-1.5"><GameIcon name="zombie" size={15} className="shrink-0" />Para concluir, limpe os infectados em: {p.blockers.map((b) => `${b.name} (${b.zombies})`).join(', ')}.</div>}
        </>
      )}

      {p.status === 'complete' && (
        <div className="mt-3">
          <div className="flex justify-between label mb-1"><span className="flex items-center gap-1"><GameIcon name="wrench" size={14} />Estado da obra</span><span>{p.integrity}%</span></div>
          <div className="relative"><Bar value={p.integrity} color={p.integrity >= minIntegrity ? '#7a8c4e' : '#d1382f'} />
            <div className="absolute top-0 bottom-0 border-r-2 border-dashed border-blood-400/70" style={{ left: `${minIntegrity}%` }} title="Abaixo disso, para de funcionar" /></div>
          {p.production && <div className="text-[13px] text-ink-300 mt-2">Produz {p.production.perHour >= 1 ? `${p.production.perHour}/h` : `1 a cada ${Math.round(1 / p.production.perHour)} h`} de {p.production.name} em "{p.production.container}" (até {p.production.max}).</div>}
        </div>
      )}

      {p.power && p.status === 'complete' && (
        <div className="mt-3 bg-[#101109] border border-black shadow-[inset_0_2px_4px_rgba(0,0,0,.6)] p-2.5 text-[14px]">
          <div className="flex flex-wrap items-center gap-2"><GameIcon name="power" size={18} className={p.power.on ? 'text-amber-450 drop-shadow-[0_0_6px_rgba(240,167,58,.7)]' : 'text-ink-500'} />
            <span>Energia {p.power.on ? 'ligada' : 'desligada'}.</span> {p.power.controller ? <span className="flex items-center gap-1">Controlada por <FactionEmblem emblem={p.power.controller.emblem} size={16} /><b>{p.power.controller.name}</b></span> : <span className="text-ink-400">Ninguém controla.</span>}</div>
          {p.here && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {p.power.myFaction && p.power.controller?.id !== p.power.myFaction && <button className="btn btn-danger !py-1" disabled={busy || !idle} onClick={() => run('project_claim', {})}><GameIcon name="faction" size={16} />Assumir o controle (30 min)</button>}
              {p.power.myFaction && p.power.controller?.id === p.power.myFaction && <button className="btn !py-1" disabled={busy} onClick={() => run('project_power', { on: !p.power!.on })}><GameIcon name="power" size={16} />{p.power.on ? 'Desligar a luz' : 'Ligar a luz'}</button>}
              {!p.power.myFaction && <span className="text-[13px] text-ink-400">Só facções podem disputar o controle da subestação.</span>}
            </div>
          )}
        </div>
      )}

      {p.status !== 'locked' && (
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {p.here ? (
            <>
              {canDeliverAny && <button className="btn !py-1.5" disabled={busy} onClick={() => run('project_deliver', { projectId: p.id })}><GameIcon name="materials" size={16} />Entregar tudo o que tenho</button>}
              {p.status === 'active' && <button className="btn btn-moss !py-1.5" disabled={busy || !idle || workBlockedByMaterials} onClick={() => run('project_work', { projectId: p.id })} title={workBlockedByMaterials ? 'Faltam materiais' : ''}><GameIcon name="crafting" size={16} />Trabalhar ({p.sessionMinutes} min)</button>}
              {p.status === 'complete' && p.integrity < 100 && <button className="btn btn-moss !py-1.5" disabled={busy || !idle} onClick={() => run('project_work', { projectId: p.id })}><GameIcon name="wrench" size={16} />Reparar ({p.sessionMinutes} min)</button>}
              {!idle && <span className="text-[13px] text-ink-400">Você está ocupado agora.</span>}
            </>
          ) : <span className="text-[13px] text-ink-400">Para contribuir, vá até {p.locationName}.</span>}
        </div>
      )}

      {(p.contributors.length > 0 || p.mine) && (
        <div className="mt-3 pt-2 border-t border-ink-800">
          <div className="label flex items-center gap-1 mb-1"><GameIcon name="team" size={14} />Quem ajudou</div>
          <ul className="flex flex-wrap gap-1">{p.contributors.map((c) => <li key={c.id} className="chip text-ink-200" title={`${c.items} materiais e ${Math.round(c.minutes)} min de trabalho`}>{c.name.split(' ')[0]}{c.items > 0 && <span className="flex items-center gap-0.5 text-ink-400"><GameIcon name="materials" size={12} label="materiais" />{c.items}</span>}{c.minutes > 0 && <span className="text-ink-400">{Math.round(c.minutes / 60 * 10) / 10} h</span>}</li>)}</ul>
          {p.mine && <div className="text-[12.5px] text-amber-450 mt-1.5">Sua parte: {p.mine.items} materiais e {Math.round(p.mine.minutes)} min de trabalho.</div>}
        </div>
      )}
    </article>
  );
}
