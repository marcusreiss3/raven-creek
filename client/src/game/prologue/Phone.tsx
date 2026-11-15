/**
 * O celular do Dia 1: tela de bloqueio com notificações, Mensagens (grupo, família, conversas), Notícias,
 * Raven Rede, Contatos e Lanterna. Bateria e sinal reais da sessão; sem bateria, a tela apaga.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Flashlight, MessageCircle, Newspaper, Send, Users, Globe, BatteryWarning, PhoneIncoming } from 'lucide-react';
import { usePhone, setLight, phoneSend, phoneReply, phoneClock, type PEvent } from '../../lib/prologue';
import { useGame } from '../../lib/store';
import { AskCard, openAsks, useNow } from './AskCard';
import { SocialApp } from './Social';
import { GameIcon } from '../../components/GameIcon';

const PHONE_KINDS = new Set(['msg', 'ask', 'answer', 'news', 'social', 'alert']);
/** Eventos que pertencem ao celular (o resto é narração da cena). */
export const onPhone = (e: PEvent) => PHONE_KINDS.has(e.kind) && e.thread !== 'cena' && e.thread !== 'sistema';
const isChat = (t: string) => t === 'grupo' || t === 'familia' || t.startsWith('dm:') || t.startsWith('p:');

type View = { app: 'home' } | { app: 'threads' } | { app: 'thread'; id: string } | { app: 'news' } | { app: 'social' } | { app: 'contacts' };

export function threadTitle(t: string, events: PEvent[], contacts: { id: number; name: string }[]) {
  if (t === 'grupo') return 'Grupo';
  if (t === 'familia') return 'Família ❤️';
  if (t.startsWith('p:')) return contacts.find((c) => c.id === Number(t.slice(2)))?.name ?? 'Contato';
  if (t.startsWith('dm:')) return events.find((e) => e.thread === t && e.payload.from)?.payload.from ?? t.slice(3);
  return t;
}

function StatusBar({ dark }: { dark?: boolean }) {
  const { session, me } = usePhone();
  const now = useNow(5000);
  const sig = session?.signal ?? 4;
  const bat = Math.max(0, Math.round(me?.battery ?? 100));
  return (
    <div className={`flex items-center px-5 pt-2.5 pb-1 text-[12.5px] font-semibold ${dark ? 'text-white/80' : 'text-white'}`}>
      <span className="tabular-nums">{phoneClock(session, now)}</span>
      {me?.light && <Flashlight size={12} className="ml-2 text-amber-300" aria-label="Lanterna ligada" />}
      <span className="ml-auto flex items-end gap-[2px] mr-1.5" aria-label={`Sinal: ${sig} de 4`}>
        {[1, 2, 3, 4].map((i) => <span key={i} className={`w-[3px] rounded-sm ${i <= sig ? 'bg-white' : 'bg-white/25'}`} style={{ height: 3 + i * 2.5 }} />)}
      </span>
      {sig === 0 && <span className="text-[10.5px] mr-1.5 text-white/70">Sem serviço</span>}
      <span className={`tabular-nums ${bat <= 15 ? 'text-blood-400' : ''}`}>{bat}%</span>
      <span className="ml-1 w-6 h-3 rounded-[3px] border border-white/60 p-[1.5px] relative" aria-hidden>
        <span className={`block h-full rounded-[1px] ${bat <= 15 ? 'bg-blood-400' : 'bg-white'}`} style={{ width: `${bat}%` }} />
      </span>
    </div>
  );
}

function Bubble({ e }: { e: PEvent }) {
  const self = useGame((s) => s.self);
  const p = e.payload;
  if (e.kind === 'ask') return <div className="my-2"><AskCard e={e} /></div>;
  if (e.kind === 'answer') return null;
  const mine = p.mine || (p.player && p.player === self?.id);
  return (
    <div className={`flex my-1 ${mine ? 'justify-end' : 'flex-col items-start'}`}>
      <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-[14px] leading-snug ${mine ? 'bg-[#2f6f4f] text-white rounded-br-md' : 'bg-[#262b33] text-white rounded-bl-md'}`}>
        {!mine && p.from && (e.thread === 'grupo' || e.thread === 'familia') && <div className="text-[11.5px] font-bold text-amber-300 mb-0.5">{p.from}</div>}
        {p.media && <div className="mb-1.5 rounded-lg bg-black/40 border border-white/10 px-2 py-3 text-[12px] text-white/60 italic flex items-center gap-1.5"><GameIcon name="d1ui-media" size={14} />{p.media}</div>}
        <span className="whitespace-pre-wrap">{p.text}</span>
        {p.delayed && <div className="text-[10.5px] text-white/45 mt-0.5">entregue com atraso</div>}
        {p.failed && <div className="text-[10.5px] text-blood-400 mt-0.5">não entregue: sem sinal</div>}
      </div>
      {!mine && Array.isArray(p.replies) && <Replies e={e} />}
    </div>
  );
}

/** Respostas prontas a uma mensagem da família (uma vez só; o parente responde de volta). */
function Replies({ e }: { e: PEvent }) {
  const [sent, setSent] = useState<number | null>(e.payload.replied ?? null);
  const [busy, setBusy] = useState(false);
  const dead = usePhone((s) => s.me?.status === 'dead');
  if (sent !== null || dead) return null;
  const pick = async (i: number) => { if (busy) return; setBusy(true); const r = await phoneReply(e.id, i); setBusy(false); if (r.ok) setSent(i); };
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5 max-w-[92%]" role="group" aria-label="Respostas rápidas">
      {(e.payload.replies as string[]).map((t, i) => (
        <button key={i} disabled={busy} onClick={() => pick(i)} className="rounded-full border border-[#3d8a63] text-[#8fd6ae] bg-[#2f6f4f]/15 hover:bg-[#2f6f4f]/35 px-3 py-1.5 text-[13px] text-left disabled:opacity-50">{t}</button>
      ))}
    </div>
  );
}

function Composer({ to }: { to: number | 'grupo' }) {
  const [text, setText] = useState('');
  const sig = usePhone((s) => s.session?.signal ?? 4);
  const send = async () => { const t = text.trim(); if (!t) return; const r = await phoneSend(to, t); if (r.ok) setText(''); };
  if (sig < 2) return <div className="px-3 py-2.5 text-[12.5px] text-white/50 text-center border-t border-white/10">Sem serviço. Para falar com quem está perto, use o chat do local.</div>;
  return (
    <form className="flex gap-2 p-2 border-t border-white/10" onSubmit={(ev) => { ev.preventDefault(); send(); }}>
      <input value={text} onChange={(ev) => setText(ev.target.value)} maxLength={400} placeholder="Mensagem de texto" aria-label="Mensagem de texto"
        className="flex-1 min-w-0 rounded-full bg-[#262b33] px-3.5 py-2 text-[14px] text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-amber-450/60" />
      <button className="w-10 h-10 rounded-full bg-[#2f6f4f] text-white flex items-center justify-center disabled:opacity-40" disabled={!text.trim()} aria-label="Enviar"><Send size={17} /></button>
    </form>
  );
}

function ThreadView({ id, back }: { id: string; back: () => void }) {
  const { events, contacts } = usePhone();
  const list = useMemo(() => events.filter((e) => e.thread === id && onPhone(e)), [events, id]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' }); }, [list.length]);
  const canWrite = id === 'grupo' ? 'grupo' : id.startsWith('p:') ? Number(id.slice(2)) : null;
  return (
    <div className="flex flex-col h-full min-h-0">
      <AppHeader title={threadTitle(id, events, contacts)} back={back} />
      <div ref={box} className="flex-1 overflow-y-auto px-3 py-2">{list.length ? list.map((e) => <Bubble key={e.id} e={e} />) : <p className="text-center text-white/40 text-[13px] mt-8">Nenhuma mensagem ainda.</p>}</div>
      {canWrite !== null && <Composer to={canWrite} />}
    </div>
  );
}

function AppHeader({ title, back, sub }: { title: string; back: () => void; sub?: string }) {
  return (
    <div className="flex items-center gap-1 px-2 py-2 border-b border-white/10 bg-[#14171c]">
      <button onClick={back} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 text-white" aria-label="Voltar"><ChevronLeft size={22} /></button>
      <div className="min-w-0"><div className="text-[15px] font-bold text-white truncate">{title}</div>{sub && <div className="text-[11.5px] text-white/50 truncate">{sub}</div>}</div>
    </div>
  );
}

function ThreadsView({ open, back, unread }: { open: (id: string) => void; back: () => void; unread: Record<string, number> }) {
  const { events, contacts } = usePhone();
  const threads = useMemo(() => {
    const last = new Map<string, PEvent>();
    for (const e of events) if (onPhone(e) && isChat(e.thread)) last.set(e.thread, e);
    return [...last.entries()].sort((a, b) => b[1].id - a[1].id);
  }, [events]);
  return (
    <div className="flex flex-col h-full min-h-0">
      <AppHeader title="Mensagens" back={back} />
      <div className="flex-1 overflow-y-auto">
        {threads.map(([t, e]) => (
          <button key={t} onClick={() => open(t)} className="w-full text-left flex items-center gap-3 px-4 py-3 border-b border-white/[.07] hover:bg-white/[.04]">
            <span className="w-10 h-10 shrink-0 rounded-full bg-[#2b3038] flex items-center justify-center text-white font-bold">{threadTitle(t, events, contacts).slice(0, 1)}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-[14.5px] font-bold text-white truncate">{threadTitle(t, events, contacts)}</span>
              <span className="block text-[13px] text-white/55 truncate">{e.kind === 'ask' ? 'Decisão: ' + e.payload.text : e.payload.text ?? e.payload.label}</span>
            </span>
            {unread[t] > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-blood-500 text-white text-[11px] font-bold flex items-center justify-center">{unread[t]}</span>}
          </button>
        ))}
        {threads.length === 0 && <p className="text-center text-white/40 text-[13px] mt-8">Nenhuma conversa.</p>}
      </div>
    </div>
  );
}

function ContactsView({ open, back }: { open: (id: string) => void; back: () => void }) {
  const { contacts, group } = usePhone();
  return (
    <div className="flex flex-col h-full min-h-0">
      <AppHeader title="Contatos" sub="Outros sobreviventes do Dia 1. SMS precisa de sinal." back={back} />
      <div className="flex-1 overflow-y-auto">
        {contacts.map((c) => {
          const near = group?.members.some((m) => m.id === c.id);
          return (
            <button key={c.id} onClick={() => open(`p:${c.id}`)} className="w-full text-left flex items-center gap-3 px-4 py-2.5 border-b border-white/[.07] hover:bg-white/[.04]">
              <span className="w-9 h-9 shrink-0 rounded-full bg-[#2b3038] flex items-center justify-center text-white font-bold">{c.name.slice(0, 1)}</span>
              <span className="flex-1 min-w-0"><span className="block text-[14.5px] text-white truncate">{c.name}</span>{near && <span className="block text-[12px] text-moss-400">Está com você</span>}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const APP_OF = (e: PEvent): View => (e.kind === 'news' ? { app: 'news' } : e.kind === 'social' ? { app: 'social' } : isChat(e.thread) ? { app: 'thread', id: e.thread } : { app: 'home' });

function Home({ go, unread }: { go: (v: View) => void; unread: Record<string, number> }) {
  const { session, events, me } = usePhone();
  const now = useNow(5000);
  const notes = useMemo(() => events.filter((e) => onPhone(e) && e.kind !== 'answer').slice(-5).reverse(), [events]);
  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);
  const newsCount = events.filter((e) => e.kind === 'news').length;
  const app = (label: string, icon: React.ReactNode, onClick: () => void, badge = 0, active = false) => (
    <button onClick={onClick} className="flex flex-col items-center gap-1 text-white" aria-label={label}>
      <span className={`relative w-[52px] h-[52px] rounded-2xl flex items-center justify-center ${active ? 'bg-amber-300 text-black' : 'bg-white/[.13]'} backdrop-blur`}>{icon}
        {badge > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-blood-500 text-[10.5px] font-bold flex items-center justify-center">{badge}</span>}</span>
      <span className="text-[11px] text-white/85">{label}</span>
    </button>
  );
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="text-center mt-4">
        <div className="text-[54px] font-light leading-none text-white tabular-nums">{phoneClock(session, now)}</div>
        <div className="text-[13px] text-white/70 mt-1">Segunda-feira · Raven Creek</div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 mt-4 space-y-2">
        {notes.map((e) => (
          <button key={e.id} onClick={() => go(APP_OF(e))} className={`w-full text-left rounded-2xl px-3 py-2.5 backdrop-blur ${e.kind === 'alert' ? 'bg-blood-500/30 border border-blood-400/50' : 'bg-white/[.12]'}`}>
            <div className="flex items-center text-[11px] text-white/60 uppercase tracking-wide">{e.kind === 'news' ? 'RC Agora' : e.kind === 'social' ? 'Raven Rede' : e.kind === 'alert' ? 'Alerta' : 'Mensagens'}<span className="ml-auto normal-case">{e.kind === 'ask' ? 'decisão' : ''}</span></div>
            <div className="text-[13.5px] font-semibold text-white truncate">{e.payload.from ?? ''}</div>
            <div className="text-[13px] text-white/85 line-clamp-2">{e.kind === 'ask' ? 'Decisão: ' + e.payload.text : e.payload.text}</div>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1 px-3 pt-3 pb-4">
        {app('Mensagens', <MessageCircle size={24} />, () => go({ app: 'threads' }), totalUnread)}
        {app('Notícias', <Newspaper size={24} />, () => go({ app: 'news' }), 0)}
        {app('Rede', <Globe size={24} />, () => go({ app: 'social' }))}
        {app('Contatos', <Users size={24} />, () => go({ app: 'contacts' }))}
        {app('Lanterna', <Flashlight size={24} />, () => setLight(!me?.light), 0, !!me?.light)}
      </div>
      {newsCount === 0 && null}
    </div>
  );
}

/** Ligação recebida: ocupa a tela inteira do celular até a escolha. */
function CallOverlay({ e }: { e: PEvent }) {
  return (
    <div className="absolute inset-0 z-20 bg-gradient-to-b from-[#173327] to-[#0b0f0d] flex flex-col px-4 pt-10 pb-5">
      <div className="text-center">
        <PhoneIncoming size={30} className="mx-auto text-moss-400 animate-pulse" />
        <div className="text-[13px] text-white/60 mt-3">Chamada recebida</div>
        <div className="text-[26px] font-semibold text-white mt-1">{e.payload.from}</div>
      </div>
      <div className="mt-auto"><AskCard e={e} /></div>
    </div>
  );
}

/** Alerta extremo da Defesa Civil: tela vermelha, som próprio, precisa tocar em OK. */
function AlertOverlay({ e, onOk }: { e: PEvent; onOk: () => void }) {
  return (
    <div className="absolute inset-0 z-30 bg-[#4a0d0d]/95 flex flex-col px-5 pt-12 pb-6 text-white" role="alertdialog" aria-label="Alerta de emergência">
      <div className="text-[13px] font-bold tracking-widest uppercase text-red-200">Alerta de emergência</div>
      <div className="text-[13px] text-red-200/80 mt-1">{e.payload.from}</div>
      <p className="mt-4 text-[17px] leading-snug font-semibold">{e.payload.text}</p>
      <button onClick={onOk} className="mt-auto rounded-full bg-white text-[#4a0d0d] font-bold py-3 text-[16px]">OK</button>
    </div>
  );
}

function HeadsUp({ e, onOpen }: { e: PEvent; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="absolute left-2 right-2 top-9 z-10 text-left rounded-2xl bg-[#2a2f37]/95 border border-white/10 px-3 py-2 shadow-xl animate-[panel-in_.2s_ease-out]">
      <div className="text-[11px] text-white/55 uppercase tracking-wide">{e.kind === 'news' ? 'RC Agora' : e.kind === 'social' ? 'Raven Rede' : e.kind === 'ask' ? 'Decisão' : 'Mensagens'}</div>
      <div className="text-[13.5px] text-white"><b>{e.payload.from}</b> {e.kind === 'ask' ? e.payload.text : e.payload.text}</div>
    </button>
  );
}

export function Phone({ fill }: { fill?: boolean }) {
  const { events, me, pop, loaded } = usePhone();
  const [view, setView] = useState<View>({ app: 'home' });
  const [seen, setSeen] = useState<Record<string, number>>({});
  const [okAlerts, setOkAlerts] = useState<Set<number>>(() => new Set());
  const [heads, setHeads] = useState<PEvent | null>(null);
  const now = useNow(1000);
  const curThread = view.app === 'thread' ? view.id : null;

  // marca como lida a conversa aberta
  useEffect(() => { if (curThread) { const last = events.filter((e) => e.thread === curThread).at(-1); if (last && (seen[curThread] ?? 0) < last.id) setSeen({ ...seen, [curThread]: last.id }); } }, [curThread, events.length]);
  // na primeira carga, o que já tinha chegado conta como lido
  useEffect(() => { if (!loaded) return; const s: Record<string, number> = {}; for (const e of events) if (e.kind !== 'ask') s[e.thread] = e.id; setSeen((cur) => ({ ...s, ...cur })); setOkAlerts(new Set(events.filter((e) => e.kind === 'alert').map((e) => e.id))); }, [loaded]);
  useEffect(() => {
    if (!pop || !onPhone(pop) || pop.kind === 'alert' || pop.kind === 'ask' || (curThread && pop.thread === curThread)) return;
    setHeads(pop); const t = setTimeout(() => setHeads(null), 4500); return () => clearTimeout(t);
  }, [pop?.id]);

  const unread = useMemo(() => {
    const u: Record<string, number> = {};
    for (const e of events) if (onPhone(e) && isChat(e.thread) && e.kind !== 'answer' && e.id > (seen[e.thread] ?? 0)) u[e.thread] = (u[e.thread] ?? 0) + 1;
    return u;
  }, [events, seen]);
  const asks = openAsks(events, now);
  const call = asks.find((e) => e.payload.kind === 'call');
  const alert = events.filter((e) => e.kind === 'alert' && /ALERTA EXTREMO/i.test(e.payload.text ?? '') && !okAlerts.has(e.id)).at(-1);
  const pending = asks.find((e) => e.payload.kind !== 'call' && onPhone(e) && e.thread !== curThread);
  const dead = (me?.battery ?? 100) <= 0;
  const go = (v: View) => { setHeads(null); setView(v); };
  const home = () => go({ app: 'home' });

  const frame = fill ? 'h-full w-full' : 'w-[360px] h-[min(740px,calc(100vh-120px))] rounded-[44px] border-[10px] border-[#050506] shadow-[0_30px_80px_rgba(0,0,0,.7),0_0_0_2px_#2a2a2e]';
  return (
    <div className={`relative overflow-hidden bg-[#0d1014] flex flex-col ${frame}`} aria-label="Celular">
      {!fill && <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-6 rounded-full bg-black z-40" aria-hidden />}
      {dead ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 bg-black">
          <BatteryWarning size={40} className="text-blood-400" />
          <div className="text-white/80 mt-3 text-[15px] font-semibold">Sem bateria</div>
          <p className="text-white/45 text-[13px] mt-2">O celular apagou. As decisões continuam aparecendo no painel da cena.</p>
        </div>
      ) : (
        <>
          <div className={view.app === 'home' ? 'bg-[radial-gradient(ellipse_at_top,#2a3b4d_0%,#0d1014_70%)]' : 'bg-[#14171c]'}><StatusBar /></div>
          {pending && (
              <button onClick={() => go({ app: 'thread', id: pending.thread })} className="mx-2 mb-1 rounded-xl bg-amber-450 text-black px-3 py-1.5 text-[12.5px] font-bold text-left flex items-center gap-2 shadow-lg">
                <GameIcon name="d1ui-vote" size={16} /><span className="flex-1 truncate">Decisão pendente: {pending.payload.text}</span><span className="tabular-nums">{Math.max(0, Math.ceil((pending.payload.deadline - now) / 1000))}s</span>
              </button>
            )}
          <div className={`flex-1 min-h-0 relative ${view.app === 'home' ? 'bg-[radial-gradient(ellipse_at_top,#1d2a37_0%,#0d1014_65%)]' : ''}`}>
            {view.app === 'home' && <Home go={go} unread={unread} />}
            {view.app === 'threads' && <ThreadsView open={(id) => go({ app: 'thread', id })} back={home} unread={unread} />}
            {view.app === 'thread' && <ThreadView id={view.id} back={() => go({ app: 'threads' })} />}
            {view.app === 'news' && <SocialApp kind="news" back={home} />}
            {view.app === 'social' && <SocialApp kind="social" back={home} />}
            {view.app === 'contacts' && <ContactsView open={(id) => go({ app: 'thread', id })} back={home} />}
            {heads && !call && <HeadsUp e={heads} onOpen={() => go(APP_OF(heads))} />}
          </div>
          {view.app !== 'home' && <button onClick={home} className="h-6 flex items-center justify-center bg-[#14171c]" aria-label="Tela inicial"><span className="w-28 h-1 rounded-full bg-white/50" /></button>}
          {call && <CallOverlay e={call} />}
          {alert && <AlertOverlay e={alert} onOk={() => setOkAlerts(new Set([...okAlerts, alert.id]))} />}
        </>
      )}
    </div>
  );
}
