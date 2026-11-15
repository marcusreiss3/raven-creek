/** Painel do Dia 1: liga o prólogo na próxima abertura, ritmo, início/parada manual e os grupos ao vivo. */
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useGame } from '../lib/store';
import { Confirm } from '../components/ui';
import { GameIcon } from '../components/GameIcon';

type Member = { id: number; name: string; status: string; online: boolean };
type Group = { id: number; track: string; beat: string; phase: string; status: string; location: string; members: Member[] };
type Info = {
  settings: { enabled: boolean; speed: number };
  running: null | { id: number; minute: number; act: number; signal: number; speed: number; startedAt: string; endsAt: number | null };
  groups: Group[]; lobby: number; candidates: number;
  latecomers?: { id: number; name: string; approved: boolean; staff: boolean }[];
  content: { trilhas?: number; encontros?: number; batidas?: number; mensagens?: number; perguntas?: number; errors: string[]; warnings: number };
};
const toast = (t: string, l: 'success' | 'warn' = 'success') => useGame.getState().toast(t, l);
const PHASE: Record<string, string> = { say: 'narrando', ask: 'decidindo', combat: 'em confronto', hub_wait: 'esperando o encontro', ended: 'terminou', merged: 'juntou-se' };
const ST: Record<string, string> = { active: 'text-moss-400', dead: 'text-blood-400', ended: 'text-ink-300' };

export function Dia1Control({ isAdmin, opensAt }: { isAdmin: boolean; opensAt: number | null }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [confirm, setConfirm] = useState<null | 'start' | 'stop'>(null);
  const reload = () => api<Info>('/admin/prologue').then(setInfo).catch((e) => toast(e.message, 'warn'));
  useEffect(() => { reload(); const t = setInterval(reload, 5000); return () => clearInterval(t); }, []);
  if (!info) return null;
  const r = info.running;
  const save = (p: { enabled?: boolean; speed?: number }) => api('/admin/prologue/settings', { body: p }).then(() => { toast('Dia 1 atualizado.'); reload(); }).catch((e) => toast(e.message, 'warn'));
  const start = () => api<{ sessionId?: number; players?: number }>('/admin/prologue/start', { body: {} }).then(() => { toast('Dia 1 começou.'); reload(); }).catch((e) => toast(e.message, 'warn'));
  const stop = () => api('/admin/prologue/stop', { method: 'POST' }).then(() => { toast('Dia 1 encerrado. Crônicas entregues.'); reload(); }).catch((e) => toast(e.message, 'warn'));
  const join = (id: number, name: string) => api('/admin/prologue/join', { body: { characterId: id } }).then(() => { toast(`${name} entrou no Dia 1.`); reload(); }).catch((e) => toast(e.message, 'warn'));
  const c = info.content;
  return (
    <div className={`panel p-4 mb-6 border-l-4 ${r ? 'border-amber-450' : info.settings.enabled ? 'border-moss-400' : 'border-ink-600'}`}>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <span className="font-display font-extrabold text-[26px] leading-none">Dia 1 <span className="text-ink-300 text-[16px] font-normal">· prólogo ao vivo pelo celular</span></span>
        {r ? <span className="text-amber-450 font-bold text-[14.5px]">AO VIVO · ato {r.act} · minuto {r.minute} · sinal {r.signal}/4</span>
          : <span className={`text-[14.5px] font-semibold ${info.settings.enabled ? 'text-moss-400' : 'text-ink-400'}`}>{info.settings.enabled ? (opensAt ? `começa na abertura (${new Date(opensAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})` : 'ligado: começa na próxima abertura agendada') : 'desligado'}</span>}
      </div>
      {!r && (
        <div className="mt-3 grid md:grid-cols-[1fr_auto] gap-4 items-start">
          <div className="text-[14px] text-ink-300 space-y-1.5">
            <p>Ligado, o Dia 1 começa sozinho na hora da abertura agendada, com quem estiver na sala de espera (ela abre 15 min antes). Quem chegar depois perde a sessão e entra quando ela acabar (≈ 2 h).</p>
            <p className="text-ink-400">Roteiro: {c.trilhas} trilhas, {c.encontros} encontros, {c.batidas} cenas, {c.perguntas} decisões.{c.errors.length ? <b className="text-blood-400"> {c.errors.length} erro(s) no roteiro!</b> : ' Sem erros.'}</p>
            <p>Na sala de espera agora: <b className="text-ink-100">{info.lobby}</b> · Entrariam se começasse agora: <b className="text-ink-100">{info.candidates}</b></p>
          </div>
          <div className="flex flex-col gap-2 min-w-[230px]">
            <label className="flex items-center gap-2 text-[14.5px]"><input type="checkbox" checked={info.settings.enabled} disabled={!isAdmin} onChange={(e) => save({ enabled: e.target.checked })} />Fazer o Dia 1 na próxima abertura</label>
            <label className="text-[13px] text-ink-300">Ritmo
              <select className="input mt-1" value={info.settings.speed} disabled={!isAdmin} onChange={(e) => save({ speed: Number(e.target.value) })}>
                <option value={1}>Normal (≈ 2 h)</option><option value={1.5}>Rápido (≈ 1h20)</option><option value={2}>Muito rápido (≈ 1 h)</option><option value={10}>Teste (≈ 12 min)</option>
              </select>
            </label>
            <button className="btn btn-moss" disabled={!isAdmin || info.candidates === 0} onClick={() => setConfirm('start')}>Começar agora</button>
          </div>
        </div>
      )}
      {r && (
        <div className="mt-3">
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2">
            {info.groups.map((g) => (
              <div key={g.id} className="border border-ink-700 bg-black/20 px-3 py-2">
                <div className="text-[13.5px] font-bold text-ink-100">{g.track} <span className="font-normal text-ink-400">· {g.beat}</span></div>
                <div className="text-[12.5px] text-ink-300">{g.location} · {PHASE[g.phase] ?? g.phase}</div>
                <div className="text-[13px] mt-1 flex flex-wrap gap-x-2">{g.members.map((m) => <span key={m.id} className={ST[m.status] ?? ''}>{m.name}{m.status === 'dead' && <GameIcon name="skull" size={13} className="inline ml-0.5 -mt-0.5" label="morto" />}{!m.online && m.status === 'active' ? ' (offline)' : ''}</span>)}</div>
              </div>
            ))}
          </div>
          {!!info.latecomers?.length && (
            <div className="mt-3 border border-amber-450/40 bg-black/20 px-3 py-2">
              <div className="text-[13.5px] font-bold text-ink-100">Conectados fora do Dia 1 ({info.latecomers.length})</div>
              <p className="text-[12.5px] text-ink-300">Não estavam na sala de espera na hora do começo (ou a ficha ainda não estava aprovada). "Colocar no Dia 1" aprova a ficha se precisar e junta a pessoa a um grupo da mesma profissão; ela recebe as mensagens daqui em diante.</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {info.latecomers.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-2 border border-ink-700 px-2 py-1 text-[13.5px]">
                    {p.name}{p.staff ? <span className="text-ink-400">(equipe)</span> : null}{!p.approved ? <span className="text-amber-450">(ficha não aprovada)</span> : null}
                    <button className="btn btn-moss !py-0.5 !px-2 !text-[12.5px]" onClick={() => join(p.id, p.name)}>Colocar no Dia 1</button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <button className="btn btn-danger mt-3" disabled={!isAdmin} onClick={() => setConfirm('stop')}>Encerrar o Dia 1 agora</button>
        </div>
      )}
      {confirm === 'start' && <Confirm title="Começar o Dia 1 agora?" danger={false} confirmLabel="Começar" onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); start(); }}
        text={<>Entram os <b>{info.candidates}</b> personagens aprovados que estão conectados ou na sala de espera. Quem não estiver perde a sessão.</>} />}
      {confirm === 'stop' && <Confirm title="Encerrar o Dia 1?" confirmLabel="Encerrar" onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); stop(); }}
        text="Todo mundo recebe a crônica como está agora e volta para o jogo normal. Quem morreu na história morre de verdade." />}
    </div>
  );
}
