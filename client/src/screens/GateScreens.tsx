/**
 * Telas antes do jogo:
 *  • StaffHome: equipe (admin/mestre/moderador) escolhe entre o painel e jogar — personagem é opcional.
 *  • WaitingScreen: jogo pausado, condado fechado até a abertura ou ficha aguardando aprovação.
 *  • RejectedNotice: a ficha anterior foi recusada (com o motivo) antes de criar outra.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { api, portraitUrl } from '../lib/api';
import { Img } from '../components/ui';
import { GameIcon } from '../components/GameIcon';

export type Me = {
  user: { id: number; username: string; role: string } | null;
  characterId: number | null;
  character: { id: number; name: string; approved: boolean; portrait: string | null } | null;
  block: null | { reason: 'paused' | 'closed' | 'pending' | 'lobby' | 'prologue'; message: string; opensAt: number | null };
  server: { paused: boolean; pauseMessage: string; opensAt: number | null; openMessage: string; requireApproval: boolean };
  rejection: null | { name: string; reason: string; at: number };
};

const logout = async () => { await api('/auth/logout', { method: 'POST' }); location.hash = ''; location.reload(); };
const fmtDate = (ms: number) => new Date(ms).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' });
function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return d ? `${d}d ${h}h ${m}min` : h ? `${h}h ${m}min ${sec}s` : `${m}min ${sec}s`;
}

function Backdrop({ children }: { children: ReactNode }) {
  return (
    <main className="relative h-full w-full overflow-hidden noise">
      <Img src="/assets/scenes/main_menu.webp" fallback="/assets/scenes/street_city_01.webp" className="absolute inset-0 w-full h-full object-cover opacity-40 scale-105" />
      <div className="absolute inset-0 vignette" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b0c07]/95 via-[#0b0c07]/70 to-[#0b0c07]/30" />
      <div className="relative h-full overflow-y-auto flex items-center px-[6vw] py-8">
        <div className="w-full max-w-[560px]">{children}</div>
      </div>
      <button onClick={logout} className="absolute top-4 right-4 btn btn-ghost !px-3" aria-label="Sair da conta"><LogOut size={16} />Sair</button>
    </main>
  );
}

// ───────────────────────────── Equipe
export function StaffHome({ me, onPlay }: { me: Me; onPlay: () => void }) {
  const [info, setInfo] = useState<{ pending: unknown[]; online: number; characters: number } | null>(null);
  useEffect(() => { api('/admin/server').then(setInfo).catch(() => undefined); }, []);
  const s = me.server;
  const state = s.paused ? { t: 'Pausado', c: 'text-blood-400' } : s.opensAt ? { t: `Fechado até ${fmtDate(s.opensAt)}`, c: 'text-amber-450' } : { t: 'Aberto', c: 'text-moss-400' };
  const roleName = me.user?.role === 'admin' ? 'Administração' : me.user?.role === 'gm' ? 'Mestre' : 'Moderação';
  return (
    <Backdrop>
      <span className="tape !text-[16px]">{roleName}</span>
      <h1 className="mt-4 font-display font-extrabold text-[64px] max-sm:text-[46px] leading-[0.9] text-ink-100">Olá, <span className="text-amber-450">{me.user?.username}</span></h1>
      <div className="panel panel-plate mt-6 p-5 pl-7">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[15px]">
          <span>Jogo: <b className={state.c}>{state.t}</b></span>
          {info && <span>Online: <b className="text-ink-100">{info.online}</b></span>}
          {info && <span>Personagens vivos: <b className="text-ink-100">{info.characters}</b></span>}
          {info && info.pending.length > 0 && <span className="text-amber-450 font-bold">{info.pending.length} {info.pending.length === 1 ? 'ficha aguardando' : 'fichas aguardando'} aprovação</span>}
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-5">
          <a href="#/admin" className="btn btn-moss !min-h-[64px] !text-[18px] !justify-start gap-3"><GameIcon name="admin" size={26} />
            <span className="text-left leading-tight">Painel de administração<span className="block text-[12.5px] font-normal opacity-80">Pausar, abrir, aprovar fichas, resetar</span></span></a>
          <button onClick={onPlay} className="btn !min-h-[64px] !text-[18px] !justify-start gap-3"><GameIcon name="character" size={26} />
            <span className="text-left leading-tight">{me.character ? `Jogar como ${me.character.name.split(' ')[0]}` : 'Criar personagem'}<span className="block text-[12.5px] font-normal opacity-80">{me.character ? 'Entrar no condado' : 'Opcional: só se quiser jogar'}</span></span></button>
        </div>
      </div>
    </Backdrop>
  );
}

// ───────────────────────────── Espera
export function WaitingScreen({ me }: { me: Me }) {
  const b = me.block!;
  const [now, setNow] = useState(Date.now());
  // Confere a cada 15 s se já dá para jogar; na abertura agendada, entra sozinho na hora.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => { try { const r = await api<Me>('/auth/me'); if (!r.block) location.reload(); } catch { /* sem conexão: tenta de novo */ } }, 15000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, []);
  useEffect(() => { if (b.opensAt && now >= b.opensAt) { const t = setTimeout(() => location.reload(), 1500); return () => clearTimeout(t); } }, [now >= (b.opensAt ?? Infinity)]);
  const pendingSheet = me.character && !me.character.approved;
  const title = b.reason === 'paused' ? 'Jogo pausado' : b.reason === 'closed' ? 'O condado ainda não abriu' : b.reason === 'prologue' ? 'O Dia 1 já começou' : 'Ficha enviada';
  return (
    <Backdrop>
      <span className="tape !text-[16px]">{b.reason === 'paused' ? 'Pausa da administração' : b.reason === 'closed' ? 'Aguardando a abertura' : b.reason === 'prologue' ? 'Sessão ao vivo em andamento' : 'Aguardando aprovação'}</span>
      <h1 className="mt-4 font-display font-extrabold text-[64px] max-sm:text-[44px] leading-[0.9] text-ink-100">{title}</h1>
      <div className="panel panel-plate mt-6 p-5 pl-7 space-y-3" role="status" aria-live="polite">
        {b.reason === 'paused' && <p className="text-[15.5px] text-ink-200 leading-relaxed">A administração pausou o jogo. Enquanto isso, o tempo no condado está parado: ninguém passa fome, sangra ou perde nada.</p>}
        {b.reason === 'prologue' && (
          <div>
            <p className="text-[15.5px] text-ink-200 leading-relaxed">Os sobreviventes estão vivendo agora o primeiro dia do apocalipse, numa sessão ao vivo que não aceita quem chega depois. Quando ela terminar, o condado abre para todo mundo, e você começa já no mundo que eles deixaram.</p>
            {b.opensAt && <><div className="label mt-3">Termina em cerca de</div><div className="font-display font-extrabold text-[44px] leading-none text-amber-450 tabular-nums mt-1">{countdown(b.opensAt - now)}</div></>}
          </div>
        )}
        {b.reason === 'closed' && b.opensAt && (
          <div>
            <div className="label">Abre em</div>
            <div className="font-display font-extrabold text-[44px] leading-none text-amber-450 tabular-nums mt-1">{countdown(b.opensAt - now)}</div>
            <div className="text-[14px] text-ink-300 mt-1 first-letter:uppercase">{fmtDate(b.opensAt)}</div>
          </div>
        )}
        {b.message && <blockquote className="border-l-4 border-amber-450 bg-black/25 px-3 py-2 text-[15px] text-ink-100 italic">{b.message}</blockquote>}
        {pendingSheet && (
          <div className="flex items-center gap-3 border-t border-ink-700 pt-3">
            <div className="w-14 h-16 shrink-0 bg-[#101109] border border-black overflow-hidden flex items-end justify-center"><Img src={portraitUrl(me.character!.portrait)} fallback="/assets/portraits/default.png" className="h-full w-auto object-contain object-bottom" /></div>
            <p className="text-[15px] text-ink-200 leading-snug"><b className="text-ink-100">{me.character!.name}</b>: sua ficha foi enviada e está aguardando a aprovação da administração. Assim que aprovarem{b.reason === 'closed' ? ' e o condado abrir' : ''}, esta tela entra no jogo sozinha.</p>
          </div>
        )}
        {!pendingSheet && b.reason !== 'pending' && <p className="text-[14px] text-ink-300">Pode deixar esta tela aberta: ela entra no jogo sozinha quando liberar.</p>}
      </div>
    </Backdrop>
  );
}

// ───────────────────────────── Ficha recusada
export function RejectedNotice({ rejection, onContinue }: { rejection: NonNullable<Me['rejection']>; onContinue: () => void }) {
  return (
    <Backdrop>
      <span className="tape !text-[16px]">Ficha recusada</span>
      <h1 className="mt-4 font-display font-extrabold text-[56px] max-sm:text-[40px] leading-[0.9] text-ink-100">{rejection.name} não foi aprovada</h1>
      <div className="panel panel-plate mt-6 p-5 pl-7 space-y-3">
        {rejection.reason ? <><div className="label">Motivo</div><blockquote className="border-l-4 border-blood-500 bg-black/25 px-3 py-2 text-[15px] text-ink-100">{rejection.reason}</blockquote></>
          : <p className="text-[15px] text-ink-200">A administração não deixou um motivo.</p>}
        <p className="text-[14.5px] text-ink-300">Você pode criar outra ficha e enviar de novo.</p>
        <button className="btn btn-moss !min-h-[46px] !text-[17px]" onClick={onContinue}>Criar outra ficha</button>
      </div>
    </Backdrop>
  );
}

// ───────────────────────────── Sala de espera do Dia 1
/** Nos minutos antes da abertura: quem está aqui na hora entra na sessão ao vivo do Dia 1. */
export function LobbyScreen({ me }: { me: Me }) {
  const b = me.block!;
  const [now, setNow] = useState(Date.now());
  const [waiting, setWaiting] = useState<number | null>(null);
  const [opensAt, setOpensAt] = useState(b.opensAt);
  useEffect(() => {
    let stop = false;
    const ping = async () => {
      try {
        const r = await api<{ block: Me['block']; waiting: number; server: Me['server'] }>('/prologue/lobby', { method: 'POST' });
        if (stop) return;
        setWaiting(r.waiting); setOpensAt(r.server.opensAt ?? r.block?.opensAt ?? null);
        if (!r.block || r.block.reason !== 'lobby') location.reload();
      } catch { /* sem conexão: tenta de novo */ }
    };
    ping();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(ping, 4000);
    return () => { stop = true; clearInterval(tick); clearInterval(poll); };
  }, []);
  const left = opensAt ? opensAt - now : 0;
  return (
    <Backdrop>
      <span className="tape !text-[16px]">Sala de espera · Dia 1</span>
      <h1 className="mt-4 font-display font-extrabold text-[60px] max-sm:text-[42px] leading-[0.9] text-ink-100">Segunda-feira, 7 da manhã</h1>
      <div className="panel panel-plate mt-6 p-5 pl-7 space-y-4" role="status" aria-live="polite">
        <div>
          <div className="label">{left > 0 ? 'Começa em' : 'Começando…'}</div>
          <div className="font-display font-extrabold text-[48px] leading-none text-amber-450 tabular-nums mt-1">{left > 0 ? countdown(left) : '00:00'}</div>
        </div>
        <p className="text-[15.5px] text-ink-200 leading-relaxed">Raven Creek ainda não sabe o que vem por aí. Seu personagem começa o dia no trabalho, e tudo chega pelo <b className="text-ink-100">celular</b>: mensagens, notícias, ligações e as decisões, que o seu grupo vota junto. São cerca de <b className="text-ink-100">2 horas ao vivo</b>, e só nos últimos atos dá para morrer.</p>
        <ul className="text-[14px] text-ink-300 space-y-1 list-disc pl-5">
          <li>Deixe esta tela aberta: na hora, você entra sozinho.</li>
          <li>Quem chegar depois do começo perde o Dia 1.</li>
          <li>Ligue o som: o celular toca e vibra.</li>
        </ul>
        {waiting !== null && <div className="text-[14.5px] text-moss-400 font-semibold">{waiting} {waiting === 1 ? 'sobrevivente esperando' : 'sobreviventes esperando'}</div>}
        {b.message && <blockquote className="border-l-4 border-amber-450 bg-black/25 px-3 py-2 text-[15px] text-ink-100 italic">{b.message}</blockquote>}
      </div>
    </Backdrop>
  );
}
