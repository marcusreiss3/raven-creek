/**
 * Raven Rede (rede social da cidade) e RC Agora (notícias) no celular do Dia 1.
 * As postagens são as mesmas para todo mundo: os jogadores curtem, comentam e veem os comentários uns dos outros.
 * Imagens: client/public/assets/dia1/social/<chave>.png (se faltar, aparece um quadro com a legenda).
 */
import { useMemo, useState } from 'react';
import { ChevronLeft, Heart, MessageCircle, Play, Send, WifiOff } from 'lucide-react';
import { usePhone, socialLike, socialComment, type PEvent } from '../../lib/prologue';
import { useGame } from '../../lib/store';
import { GameIcon } from '../../components/GameIcon';
import { useNow } from './AskCard';

const hash = (t: string) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const AVATAR = ['#c0573e', '#3e7cc0', '#4f9a63', '#a4518f', '#c08f3e', '#3ea4a0', '#7a62c4', '#b84c6a'];
const handle = (name: string) => '@' + name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export function Avatar({ name, size = 38 }: { name: string; size?: number }) {
  return <span className="shrink-0 rounded-full flex items-center justify-center font-bold text-white" style={{ width: size, height: size, background: AVATAR[hash(name) % AVATAR.length], fontSize: size * 0.38 }} aria-hidden>{initials(name)}</span>;
}

/** Tempo da postagem no relógio do jogo (o dia anda mais rápido que o real). */
function useAgo(createdAt: string) {
  const now = useNow(15000);
  const s = usePhone((x) => x.session);
  const realMin = (now - Date.parse(createdAt)) / 60000;
  const gameMin = s ? realMin * s.speed * (900 / (s.minutes || 120)) : realMin;
  if (gameMin < 1) return 'agora';
  if (gameMin < 60) return `${Math.floor(gameMin)} min`;
  return `${Math.floor(gameMin / 60)} h`;
}

function PostImage({ img, media, news }: { img?: string; media?: string; news?: boolean }) {
  const [broken, setBroken] = useState(false);
  const video = media?.startsWith('Vídeo') && media !== 'Vídeo indisponível';
  const live = /ao vivo/i.test(media ?? '');
  if (media === 'Vídeo indisponível') return <div className="mt-2 rounded-xl bg-[#1a1d23] border border-white/10 py-8 text-center text-[13px] text-white/45">Vídeo indisponível</div>;
  if (!img && !media) return null;
  return (
    <div className={`relative mt-2 rounded-xl overflow-hidden border border-white/10 bg-[#1a1d23] aspect-video`}>
      {img && !broken
        ? <img src={`/assets/dia1/social/${img}.png`} alt={media ?? ''} loading="lazy" onError={() => setBroken(true)} className={`w-full h-full object-cover ${video ? 'brightness-90' : ''}`} />
        : <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-[12.5px] text-white/45 italic bg-[radial-gradient(circle_at_40%_40%,#2b3038,#14171c)]">{media ?? 'Foto'}</div>}
      {video && <span className="absolute inset-0 flex items-center justify-center"><span className="w-12 h-12 rounded-full bg-black/55 flex items-center justify-center text-white"><Play size={22} fill="currentColor" /></span></span>}
      {video && <span className="absolute right-2 bottom-2 rounded bg-black/70 text-white text-[11px] px-1.5 py-0.5 tabular-nums">{media!.replace(/^Vídeo · /, '')}</span>}
      {live && <span className="absolute left-2 top-2 rounded bg-[#d33] text-white text-[10.5px] font-bold px-1.5 py-0.5 tracking-wide">{media!.toUpperCase()}</span>}
    </div>
  );
}

function Comments({ e }: { e: PEvent }) {
  const p = e.payload;
  const data = usePhone((s) => s.social[p.postKey]);
  const signal = usePhone((s) => s.session?.signal ?? 4);
  const dead = usePhone((s) => s.me?.status === 'dead' || (s.me?.battery ?? 100) <= 0);
  const selfId = useGame((s) => s.self?.id);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => { const t = text.trim(); if (!t || busy) return; setBusy(true); const r = await socialComment(p.postKey, t); setBusy(false); if (r.ok) setText(''); };
  const npc = (p.npcComments ?? []) as { from: string; text: string }[];
  return (
    <div className="mt-2 border-t border-white/[.07] pt-2 space-y-2">
      {npc.map((c, i) => <Comment key={`n${i}`} name={c.from} text={c.text} />)}
      {(data?.comments ?? []).map((c) => <Comment key={c.id} name={c.name} text={c.text} player mine={c.by === selfId} />)}
      {npc.length + (data?.comments.length ?? 0) === 0 && <p className="text-[12.5px] text-white/40">Ninguém comentou ainda.</p>}
      {!dead && (signal >= 3
        ? <form className="flex gap-1.5 pt-1" onSubmit={(ev) => { ev.preventDefault(); send(); }}>
            <input value={text} onChange={(ev) => setText(ev.target.value)} maxLength={240} placeholder="Comentar…" aria-label="Escrever um comentário"
              className="flex-1 min-w-0 rounded-full bg-[#262b33] px-3 py-1.5 text-[13px] text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-[#e0624a]/60" />
            <button disabled={!text.trim() || busy} className="w-8 h-8 rounded-full bg-[#e0624a] text-white flex items-center justify-center disabled:opacity-40" aria-label="Publicar comentário"><Send size={14} /></button>
          </form>
        : <p className="text-[12px] text-white/40 flex items-center gap-1.5"><WifiOff size={13} />Sem internet para comentar.</p>)}
    </div>
  );
}
function Comment({ name, text, player, mine }: { name: string; text: string; player?: boolean; mine?: boolean }) {
  return (
    <div className="flex gap-2">
      <Avatar name={name} size={26} />
      <div className={`rounded-2xl px-2.5 py-1.5 text-[13px] leading-snug ${mine ? 'bg-[#e0624a]/20' : 'bg-white/[.06]'}`}>
        <span className="font-bold text-white mr-1">{name}</span>{player && !mine && <span className="text-[10.5px] text-[#e0624a] font-bold mr-1">● sobrevivente</span>}
        <span className="text-white/85">{text}</span>
      </div>
    </div>
  );
}

function PostCard({ e, news }: { e: PEvent; news?: boolean }) {
  const p = e.payload;
  const ago = useAgo(e.createdAt);
  const data = usePhone((s) => s.social[p.postKey]);
  const selfId = useGame((s) => s.self?.id);
  const signal = usePhone((s) => s.session?.signal ?? 4);
  const [open, setOpen] = useState(false);
  const system = p.from === 'Raven Rede';
  if (system) return <div className="mx-3 my-2 rounded-xl bg-white/[.05] border border-white/10 px-3 py-2.5 text-[13px] text-white/60 flex gap-2 items-start"><GameIcon name="emblem:raven" size={16} className="mt-0.5 text-[#e0624a]" /><span>{p.text}{p.media === 'Vídeo indisponível' ? '' : ''}</span></div>;
  const liked = !!selfId && !!data?.likedBy.includes(selfId);
  const base = p.postKey ? 3 + (hash(p.postKey) % (news ? 90 : 40)) : 0;
  const likes = base + (data?.likedBy.length ?? 0);
  const comments = (p.npcComments?.length ?? 0) + (data?.comments.length ?? 0);
  const like = () => { if (p.postKey) socialLike(p.postKey); };
  return (
    <article className="px-3 py-3 border-b border-white/[.07]">
      {news ? (
        <>
          <PostImage img={p.img} media={p.media} news />
          <h3 className="mt-2 text-[15px] font-bold text-white leading-snug">{p.text}</h3>
          <div className="text-[11.5px] text-white/45 mt-0.5">{p.from} · {ago}</div>
        </>
      ) : (
        <>
          <header className="flex items-center gap-2">
            <Avatar name={p.from} />
            <div className="min-w-0 leading-tight"><div className="text-[14px] font-bold text-white truncate">{p.from}</div><div className="text-[11.5px] text-white/45 truncate">{handle(p.from)} · {ago}</div></div>
          </header>
          <p className="mt-2 text-[14px] text-white/90 leading-snug whitespace-pre-wrap">{p.text}</p>
          <PostImage img={p.img} media={p.media} />
        </>
      )}
      {p.postKey && (
        <div className="flex items-center gap-5 mt-2 text-[13px] text-white/55">
          <button onClick={like} disabled={signal < 3} className={`flex items-center gap-1.5 disabled:opacity-50 ${liked ? 'text-[#e0624a]' : 'hover:text-white'}`} aria-pressed={liked} aria-label={liked ? 'Descurtir' : 'Curtir'}>
            <Heart size={17} fill={liked ? 'currentColor' : 'none'} /><span className="tabular-nums">{likes}</span>
          </button>
          <button onClick={() => setOpen(!open)} className={`flex items-center gap-1.5 hover:text-white ${open ? 'text-white' : ''}`} aria-expanded={open} aria-label="Comentários">
            <MessageCircle size={17} /><span className="tabular-nums">{comments}</span>
          </button>
        </div>
      )}
      {open && p.postKey && <Comments e={e} />}
    </article>
  );
}

export function SocialApp({ kind, back }: { kind: 'news' | 'social'; back: () => void }) {
  const events = usePhone((s) => s.events);
  const signal = usePhone((s) => s.session?.signal ?? 4);
  const list = useMemo(() => events.filter((e) => e.kind === kind).slice().reverse(), [events, kind]);
  const news = kind === 'news';
  return (
    <div className="flex flex-col h-full min-h-0 bg-[#101318]">
      <div className={`flex items-center gap-1 px-2 py-2 border-b border-white/10 ${news ? 'bg-[#1b2a44]' : 'bg-[#16191f]'}`}>
        <button onClick={back} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 text-white" aria-label="Voltar"><ChevronLeft size={22} /></button>
        {news
          ? <div className="leading-tight"><div className="text-[16px] font-extrabold text-white tracking-tight">RC <span className="text-[#ffcf4a]">AGORA</span></div><div className="text-[10.5px] text-white/55 uppercase tracking-wider">Notícias de Raven Creek</div></div>
          : <div className="flex items-center gap-1.5"><GameIcon name="emblem:raven" size={20} className="text-[#e0624a]" /><span className="text-[17px] font-extrabold text-white tracking-tight">raven<span className="text-[#e0624a]">rede</span></span></div>}
      </div>
      {signal < 3 && <div className="px-3 py-1.5 text-[12px] bg-[#3a2a12] text-[#ffcf4a] flex items-center gap-1.5"><WifiOff size={13} />Sem internet: mostrando o que já carregou.</div>}
      <div className="flex-1 overflow-y-auto">
        {list.length === 0 && <p className="text-center text-white/40 text-[13px] mt-8">Nada por aqui ainda.</p>}
        {list.map((e) => <PostCard key={e.id} e={e} news={news} />)}
      </div>
    </div>
  );
}
