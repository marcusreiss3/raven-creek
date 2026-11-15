/** Aba "Controle do jogo": pausa, abertura agendada, aprovação de fichas e resets. */
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api, portraitUrl } from '../lib/api';
import { useGame } from '../lib/store';
import { Confirm, Empty, Img, Modal, Section } from '../components/ui';
import { GameIcon } from '../components/GameIcon';
import { Dia1Control } from './Dia1Control';

type Status = { paused: boolean; pausedAt: number | null; pauseMessage: string; opensAt: number | null; openMessage: string; requireApproval: boolean };
type Pending = { id: number; userId: number; username: string; firstName: string; lastName: string; age: number; professionName: string; traits: string[]; attributes: Record<string, number>; appearance: string; backstory: string; portrait: string | null; createdAt: string; online: boolean };
type Data = { status: Status; pending: Pending[]; characters: number; online: number; now: number };

const toast = (t: string, l: 'success' | 'warn' = 'success') => useGame.getState().toast(t, l);
async function run(p: Promise<unknown>, ok: string) { try { await p; toast(ok); return true; } catch (e: any) { toast(e.message, 'warn'); return false; } }
const fmt = (ms: number) => new Date(ms).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
/** ms → valor de <input type="datetime-local"> no fuso de quem está usando o painel. */
const toLocalInput = (ms: number) => { const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
const fromLocalInput = (v: string) => (v ? new Date(v).getTime() : NaN);
const ATTR: Record<string, string> = { strength: 'For', agility: 'Agi', endurance: 'Res', perception: 'Per', intellect: 'Int' };
const RESET_WORD = 'RESETAR';

export function ServerControl() {
  const role = useGame((s) => s.user?.role);
  const content = useGame((s) => s.content);
  const isAdmin = role === 'admin';
  const [data, setData] = useState<Data | null>(null);
  const reload = () => api<Data>('/admin/server').then(setData).catch((e) => toast(e.message, 'warn'));
  useEffect(() => { reload(); const t = setInterval(reload, 15000); return () => clearInterval(t); }, []);

  const [pauseMsg, setPauseMsg] = useState('');
  const [confirmPause, setConfirmPause] = useState(false);
  const [opening, setOpening] = useState<{ at: string; message: string; approval: boolean } | null>(null);
  const [reject, setReject] = useState<{ p: Pending; reason: string } | null>(null);
  const [reset, setReset] = useState<null | { kind: 'characters' | 'world'; word: string; at: string; openNow: boolean; approval: boolean; message: string }>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data && !opening) setOpening({ at: data.status.opensAt && data.status.opensAt > Date.now() ? toLocalInput(data.status.opensAt) : '', message: data.status.openMessage, approval: data.status.requireApproval }); }, [data]);
  if (!data || !opening) return <Empty>Carregando…</Empty>;
  const st = data.status;
  const closed = !!st.opensAt && st.opensAt > Date.now();
  const traitName = (id: string) => content?.traits?.find((t: any) => t.id === id)?.name ?? id;

  const doReset = async () => {
    if (!reset) return;
    setBusy(true);
    const opensAt = reset.kind === 'world' && !reset.openNow ? fromLocalInput(reset.at) : null;
    const ok = await run(api(`/admin/reset/${reset.kind}`, { body: reset.kind === 'world' ? { confirm: reset.word, opensAt, requireApproval: reset.approval, openMessage: reset.message } : { confirm: reset.word } }),
      reset.kind === 'world' ? 'Mundo resetado.' : 'Personagens resetados.');
    setBusy(false);
    if (ok) { setReset(null); setOpening(null); reload(); }
  };

  return (
    <div>
      <h2 className="font-display font-extrabold text-[34px] leading-none mb-5 flex items-center">Controle do jogo
        <button className="btn btn-ghost !px-2 ml-3" aria-label="Recarregar" title="Recarregar" onClick={reload}><RefreshCw size={15} /></button></h2>

      {/* Situação atual */}
      <div className={`panel p-4 mb-6 border-l-4 ${st.paused ? 'border-blood-500' : closed ? 'border-amber-450' : 'border-moss-400'}`} role="status">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span className={`font-display font-extrabold text-[28px] leading-none ${st.paused ? 'text-blood-400' : closed ? 'text-amber-450' : 'text-moss-400'}`}>
            {st.paused ? 'Pausado' : closed ? 'Fechado' : 'Aberto'}</span>
          <span className="text-[14px] text-ink-300">{st.paused && st.pausedAt ? `desde ${fmt(st.pausedAt)}` : closed ? `abre ${fmt(st.opensAt!)}` : 'jogadores podem jogar'}</span>
          <span className="text-[14px]">Online: <b>{data.online}</b></span>
          <span className="text-[14px]">Personagens vivos: <b>{data.characters}</b></span>
          <span className="text-[14px]">Aprovação de fichas: <b className={st.requireApproval ? 'text-amber-450' : 'text-ink-200'}>{st.requireApproval ? 'ligada' : 'desligada'}</b></span>
        </div>
      </div>

      <Dia1Control isAdmin={isAdmin} opensAt={st.opensAt} />
      <MassActions />

      <div className="grid grid-cols-2 max-lg:grid-cols-1 gap-5">
        {/* Pausa */}
        <div className="panel p-4">
          <div className="label mb-2">Pausar o jogo</div>
          {st.paused ? (
            <>
              <p className="text-[14px] text-ink-200">Ninguém está jogando e o tempo do condado está parado (fome, viagens, combates, fogueiras…). Ao retomar, tudo continua de onde parou.</p>
              {st.pauseMessage && <blockquote className="mt-2 border-l-4 border-ink-500 pl-3 text-[14px] italic">{st.pauseMessage}</blockquote>}
              <button className="btn btn-moss mt-3" disabled={!isAdmin} onClick={() => run(api('/admin/server/resume', { method: 'POST' }), 'Jogo retomado.').then(reload)}><GameIcon name="play" size={16} />Retomar o jogo</button>
            </>
          ) : (
            <>
              <p className="text-[14px] text-ink-300">Desconecta todo mundo (inclusive a equipe dentro do jogo) e congela o tempo do condado. O painel continua funcionando.</p>
              <textarea className="input h-16 mt-2" maxLength={300} value={pauseMsg} onChange={(e) => setPauseMsg(e.target.value)} placeholder="Mensagem para os jogadores (opcional). Ex.: Manutenção, voltamos às 20h." />
              <button className="btn btn-danger mt-2" disabled={!isAdmin} onClick={() => setConfirmPause(true)}>Pausar o jogo</button>
            </>
          )}
          {!isAdmin && <p className="text-[12.5px] text-ink-400 mt-2">Só administradores pausam e retomam.</p>}
        </div>

        {/* Abertura */}
        <div className="panel p-4">
          <div className="label mb-2">Abertura e fichas</div>
          <label className="block text-[14px]">Abre para os jogadores em
            <input type="datetime-local" className="input mt-1" value={opening.at} min={toLocalInput(Date.now())} onChange={(e) => setOpening({ ...opening, at: e.target.value })} disabled={!isAdmin} />
          </label>
          <input className="input mt-2" maxLength={300} value={opening.message} onChange={(e) => setOpening({ ...opening, message: e.target.value })} placeholder="Mensagem na tela de espera (opcional)" disabled={!isAdmin} />
          <label className="flex items-center gap-2 mt-2 text-[14px]"><input type="checkbox" checked={opening.approval} onChange={(e) => setOpening({ ...opening, approval: e.target.checked })} disabled={!isAdmin} />Fichas novas precisam de aprovação</label>
          <p className="text-[12.5px] text-ink-400 mt-1">Enquanto estiver fechado, a galera pode criar ficha, mas só joga depois da abertura (e da aprovação, se ligada). A equipe entra antes para preparar.</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button className="btn btn-moss" disabled={!isAdmin || (!!opening.at && !(fromLocalInput(opening.at) > Date.now()))}
              onClick={() => run(api('/admin/server/opening', { body: { opensAt: opening.at ? fromLocalInput(opening.at) : null, openMessage: opening.message, requireApproval: opening.approval } }), opening.at ? 'Abertura agendada.' : 'Salvo.').then(reload)}>
              {opening.at ? 'Agendar abertura' : 'Salvar'}</button>
            {closed && <button className="btn" disabled={!isAdmin} onClick={() => run(api('/admin/server/opening', { body: { opensAt: null } }), 'Condado aberto.').then(() => { setOpening({ ...opening, at: '' }); reload(); })}>Abrir agora</button>}
          </div>
        </div>
      </div>

      {/* Fichas pendentes */}
      <div className="mt-6">
        <Section title={`Fichas aguardando aprovação (${data.pending.length})`} right={data.pending.length > 1 ? <button className="btn btn-moss !py-1" onClick={() => run(api('/admin/characters/approve-all', { method: 'POST' }), 'Todas aprovadas.').then(reload)}>Aprovar todas</button> : undefined}>
          {!data.pending.length ? <Empty>Nenhuma ficha esperando.</Empty> : (
            <div className="grid grid-cols-2 max-xl:grid-cols-1 gap-3">
              {data.pending.map((p) => (
                <article key={p.id} className="panel p-3 flex gap-3">
                  <div className="w-24 h-32 shrink-0 bg-[#101109] border border-black overflow-hidden flex items-end justify-center"><Img src={portraitUrl(p.portrait)} fallback="/assets/portraits/default.png" className="h-full w-auto object-contain object-bottom" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="font-[family-name:var(--font-plate)] font-bold text-[18px] leading-tight">{p.firstName} {p.lastName}</div>
                    <div className="text-[12.5px] text-ink-400">{p.username}{p.online && <span className="text-moss-400"> · online</span>} · enviada {fmt(new Date(p.createdAt).getTime())}</div>
                    <div className="flex flex-wrap gap-1 mt-1.5"><span className="chip">{p.age} anos</span><span className="chip">{p.professionName}</span>{p.traits.map((t) => <span key={t} className="chip text-ink-300">{traitName(t)}</span>)}</div>
                    <div className="text-[12.5px] text-ink-300 mt-1">{Object.entries(p.attributes).map(([k, v]) => `${ATTR[k] ?? k} ${v}`).join(' · ')}</div>
                    {p.appearance && <p className="text-[13.5px] italic text-ink-200 mt-1.5">{p.appearance}</p>}
                    {p.backstory ? <details className="mt-1"><summary className="text-[13px] text-ink-300 cursor-pointer">História</summary><p className="text-[13.5px] text-ink-200 whitespace-pre-wrap mt-1">{p.backstory}</p></details>
                      : <p className="text-[12.5px] text-ink-400 mt-1">Sem história.</p>}
                    <div className="flex gap-2 mt-2">
                      <button className="btn btn-moss !py-1" onClick={() => run(api(`/admin/characters/${p.id}/approve`, { method: 'POST' }), `${p.firstName} aprovado.`).then(reload)}>Aprovar</button>
                      <button className="btn btn-danger !py-1" onClick={() => setReject({ p, reason: '' })}>Recusar</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* Zona de perigo */}
      {isAdmin && (
        <div className="mt-2">
          <Section title="Resets">
            <div className="grid grid-cols-2 max-lg:grid-cols-1 gap-5">
              <div className="panel p-4 border-l-4 border-blood-500">
                <div className="font-[family-name:var(--font-plate)] font-bold text-[17px]">Resetar personagens</div>
                <p className="text-[13.5px] text-ink-300 mt-1">Apaga <b>todos</b> os personagens, inventários, corpos, facções, bases e cachorros adotados. Contas e o estado do mundo (loot saqueado, infectados, obras) ficam como estão.</p>
                <button className="btn btn-danger mt-3" onClick={() => setReset({ kind: 'characters', word: '', at: '', openNow: true, approval: st.requireApproval, message: '' })}>Resetar personagens…</button>
              </div>
              <div className="panel p-4 border-l-4 border-blood-500">
                <div className="font-[family-name:var(--font-plate)] font-bold text-[17px]">Resetar o mundo</div>
                <p className="text-[13.5px] text-ink-300 mt-1">Recomeço completo: personagens <b>e</b> mundo voltam ao início (loot, infectados, veículos, obras, mistérios, mural, chat, relógio no dia 1). Você escolhe quando abre de novo; até lá a galera pode criar ficha.</p>
                <button className="btn btn-danger mt-3" onClick={() => setReset({ kind: 'world', word: '', at: toLocalInput(Date.now() + 86_400_000), openNow: false, approval: true, message: '' })}>Resetar o mundo…</button>
              </div>
            </div>
            <p className="text-[12.5px] text-ink-400 mt-2">Configurações, locais, rotas, itens, loot, eventos e tipos de zumbi editados no painel são mantidos nos dois casos.</p>
          </Section>
        </div>
      )}

      {confirmPause && <Confirm title="Pausar o jogo?" confirmLabel="Pausar agora" onCancel={() => setConfirmPause(false)}
        onConfirm={() => { setConfirmPause(false); run(api('/admin/server/pause', { body: { message: pauseMsg } }), 'Jogo pausado.').then(() => { setPauseMsg(''); reload(); }); }}
        text={<p>Todos os {data.online} conectados saem do jogo agora e veem a tela de pausa{pauseMsg ? ' com a sua mensagem' : ''}. O tempo do condado para até você retomar.</p>} />}

      {reject && (
        <Modal title={`Recusar ${reject.p.firstName} ${reject.p.lastName}?`} onClose={() => setReject(null)} danger>
          <p className="text-[14px] text-ink-200">A ficha é apagada. Na próxima vez que entrar, {reject.p.username} vê o motivo e pode mandar outra.</p>
          <textarea className="input h-20 mt-3" maxLength={500} value={reject.reason} onChange={(e) => setReject({ ...reject, reason: e.target.value })} placeholder="Motivo (opcional, mas ajuda). Ex.: História precisa de mais detalhes sobre como chegou ao condado." autoFocus />
          <div className="flex justify-end gap-2 mt-4"><button className="btn" onClick={() => setReject(null)}>Cancelar</button>
            <button className="btn btn-danger" onClick={() => run(api(`/admin/characters/${reject.p.id}/reject`, { body: { reason: reject.reason } }), 'Ficha recusada.').then((ok) => { if (ok) { setReject(null); reload(); } })}>Recusar ficha</button></div>
        </Modal>
      )}

      {reset && (
        <Modal title={reset.kind === 'world' ? 'Resetar o mundo' : 'Resetar personagens'} onClose={() => !busy && setReset(null)} width={560} danger>
          <p className="text-[14px] text-ink-200">{reset.kind === 'world'
            ? 'Todos os personagens e todo o progresso do mundo serão apagados. Não dá para desfazer. Quem estiver jogando sai na hora.'
            : `Todos os ${data.characters} personagens vivos (e os mortos) serão apagados, com tudo o que carregam. Não dá para desfazer. Quem estiver jogando sai na hora.`}</p>
          {reset.kind === 'world' && (
            <div className="mt-3 space-y-2">
              <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={reset.openNow} onChange={(e) => setReset({ ...reset, openNow: e.target.checked })} />Abrir imediatamente</label>
              {!reset.openNow && <label className="block text-[14px]">Abre de novo em<input type="datetime-local" className="input mt-1" value={reset.at} min={toLocalInput(Date.now())} onChange={(e) => setReset({ ...reset, at: e.target.value })} /></label>}
              <input className="input" maxLength={300} value={reset.message} onChange={(e) => setReset({ ...reset, message: e.target.value })} placeholder="Mensagem na tela de espera (opcional). Ex.: Temporada 2 começa sábado!" />
              <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={reset.approval} onChange={(e) => setReset({ ...reset, approval: e.target.checked })} />Fichas novas precisam de aprovação</label>
            </div>
          )}
          <label className="block text-[14px] mt-4">Digite <b className="text-blood-400">{RESET_WORD}</b> para confirmar
            <input className="input mt-1 font-mono" value={reset.word} onChange={(e) => setReset({ ...reset, word: e.target.value })} autoComplete="off" /></label>
          <div className="flex justify-end gap-2 mt-4">
            <button className="btn" disabled={busy} onClick={() => setReset(null)}>Cancelar</button>
            <button className="btn btn-danger" aria-busy={busy}
              disabled={busy || reset.word !== RESET_WORD || (reset.kind === 'world' && !reset.openNow && !(fromLocalInput(reset.at) > Date.now()))}
              onClick={doReset}>{busy ? 'Resetando…' : reset.kind === 'world' ? 'Resetar o mundo' : 'Resetar personagens'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

type MassKind = 'heal' | 'wounds' | 'wake' | 'bites';
const MASS: { kind: MassKind; label: string; icon: string; text: string; done: (n: number) => string }[] = [
  { kind: 'heal', label: 'Curar todo mundo', icon: 'aid', text: 'Fecha todos os ferimentos, tira todas as doenças e infecções, enche sangue e vitalidade e acorda quem estiver desmaiado. Vale para todos os personagens vivos.', done: (n) => `${n} personagens curados.` },
  { kind: 'wounds', label: 'Tirar ferimentos', icon: 'bandage', text: 'Fecha todos os ferimentos abertos (cortes, arranhões, mordidas, fraturas…) de todos os personagens vivos. Doenças e infecção continuam.', done: (n) => `${n} ferimentos fechados.` },
  { kind: 'wake', label: 'Acordar todo mundo', icon: 'wake', text: 'Acorda todos os desmaiados e repõe o sangue até pelo menos 60%. Os ferimentos continuam.', done: (n) => `${n} personagens acordados.` },
  { kind: 'bites', label: 'Tirar mordidas e infecção', icon: 'zombie', text: 'Fecha todas as mordidas e cura a infecção zumbi de todos os personagens vivos (ninguém vai virar).', done: (n) => `${n} mordidas/infecções removidas.` },
];
function MassActions() {
  const [ask, setAsk] = useState<(typeof MASS)[number] | null>(null);
  const go = (m: (typeof MASS)[number]) => api<{ affected: number }>(`/admin/mass/${m.kind}`, { method: 'POST' })
    .then((r) => toast(m.done(r.affected))).catch((e) => toast(e.message, 'warn'));
  return (
    <div className="panel p-4 mb-6">
      <div className="label mb-2">Ações para todos os personagens</div>
      <div className="flex flex-wrap gap-2">
        {MASS.map((m) => <button key={m.kind} className="btn" onClick={() => setAsk(m)}><GameIcon name={m.icon} size={17} />{m.label}</button>)}
      </div>
      {ask && <Confirm title={`${ask.label}?`} danger={false} confirmLabel={ask.label} onCancel={() => setAsk(null)} onConfirm={() => { const m = ask; setAsk(null); go(m); }} text={ask.text} />}
    </div>
  );
}
