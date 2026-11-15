import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, ChevronLeft, Flag, Ban, Trash2, Send } from 'lucide-react';
import { GameIcon } from '../components/GameIcon';
import { useGame } from '../lib/store';
import { action, sendChat, setTyping } from '../lib/socket';
import { api } from '../lib/api';
import type { ChatMsg } from '../lib/types';
import { pad } from '../components/ui';

const TABS = [
  { id: 'local', label: 'Local', icon: 'chat', match: (m: ChatMsg) => m.channel === 'local' || m.channel === 'travel' },
  { id: 'radio', label: 'Rádio', icon: 'radio', match: (m: ChatMsg) => m.channel === 'radio' },
  { id: 'pm', label: 'Sussurro', icon: 'whisper', match: (m: ChatMsg) => m.channel === 'pm' },
  { id: 'admin', label: 'Equipe', icon: 'team', match: (m: ChatMsg) => m.channel === 'admin' },
];

/** Canais de rádio pré-definidos (o jogador também pode digitar uma frequência livre). */
export const RADIO_CHANNELS = [
  { freq: 100.1, name: 'Canal 1' }, { freq: 101.5, name: 'Canal 2' }, { freq: 103.3, name: 'Canal 3' },
  { freq: 104.7, name: 'Canal 4' }, { freq: 106.9, name: 'Canal 5' }, { freq: 88.1, name: 'Emergência' },
];

/**
 * Formatação estilo Discord, sem HTML: **negrito**, *itálico* ou _itálico_, __sublinhado__, ~~riscado~~, `código`.
 * Os marcadores somem e o trecho aparece destacado.
 */
const RULES: { re: RegExp; wrap: (c: ReactNode, k: string) => ReactNode }[] = [
  { re: /\*\*(.+?)\*\*/s, wrap: (c, k) => <strong key={k} className="font-bold text-white">{c}</strong> },
  { re: /__(.+?)__/s, wrap: (c, k) => <u key={k}>{c}</u> },
  { re: /~~(.+?)~~/s, wrap: (c, k) => <s key={k} className="opacity-80">{c}</s> },
  { re: /`([^`]+?)`/, wrap: (c, k) => <code key={k} className="text-[13px] bg-black/40 px-1 py-px border border-ink-700">{c}</code> },
  { re: /\*(?!\s)(.+?)(?<!\s)\*/s, wrap: (c, k) => <em key={k}>{c}</em> },
  { re: /(?<![\w])_(?!\s)(.+?)(?<!\s)_(?![\w])/s, wrap: (c, k) => <em key={k}>{c}</em> },
];
export function RichText({ text, k = 'r' }: { text: string; k?: string }): ReactNode {
  let best: { i: number; m: RegExpExecArray; r: (typeof RULES)[number] } | null = null;
  for (const r of RULES) { const m = r.re.exec(text); if (m && (best === null || m.index < best.i)) best = { i: m.index, m, r }; }
  if (!best) return text;
  const before = text.slice(0, best.i); const after = text.slice(best.i + best.m[0].length);
  return <Fragment key={k}>{before}{best.r.wrap(<RichText text={best.m[1]} k={`${k}i`} />, `${k}w`)}<RichText text={after} k={`${k}a`} /></Fragment>;
}

export function ChatPanel({ mobile }: { mobile?: boolean } = {}) {
  const { messages, self, scene, user, blocks } = useGame();
  const chatPmTo = useGame((s) => s.chatPmTo);
  const [tab, setTab] = useState('local');
  const [text, setText] = useState(''); const [pmTo, setPmTo] = useState<number | null>(null);
  const [width, setWidth] = useState(() => Number(user?.settings?.chatWidth ?? 380));
  const [collapsed, setCollapsed] = useState(!!user?.settings?.chatCollapsed);
  const [error, setError] = useState('');
  const [radioFreq, setRadioFreq] = useState<number>(() => self?.radioFrequency ?? RADIO_CHANNELS[0].freq);
  const listRef = useRef<HTMLDivElement>(null); const inputRef = useRef<HTMLTextAreaElement>(null);
  const staff = user && user.role !== 'player';
  const locId = self?.locationId; const traveling = self?.state === 'traveling';
  const t = TABS.find((x) => x.id === tab)!;
  const visible = useMemo(() => messages.filter((m) => t.match(m) && (m.channel !== 'local' || traveling || m.locationId === locId) && !(m.userId && blocks.includes(m.userId))), [messages, tab, locId, blocks, traveling]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [visible.length, tab]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Enter' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '')) { e.preventDefault(); setCollapsed(false); setTimeout(() => inputRef.current?.focus(), 0); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);
  // caixa de texto cresce com o conteúdo (até ~6 linhas)
  useEffect(() => { const el = inputRef.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 140)}px`; }, [text]);
  const others = scene?.characters.filter((c) => c.id !== self?.id && c.online) ?? [];
  // "Sussurrar" no menu do personagem: abre direto o sussurro para ele
  useEffect(() => { if (chatPmTo) { setTab('pm'); setPmTo(chatPmTo); useGame.getState().set({ chatPmTo: null }); setTimeout(() => inputRef.current?.focus(), 50); } }, [chatPmTo]);
  useEffect(() => { if (pmTo && !others.some((c) => c.id === pmTo)) setPmTo(null); }, [others.map((c) => c.id).join(',')]);

  const send = async () => {
    if (!text.trim()) return;
    let body = text; let channel: string | undefined; let frequency: number | undefined;
    if (tab === 'radio') { channel = 'radio'; frequency = radioFreq; }
    if (tab === 'admin' && !text.startsWith('/')) body = `/a ${text}`;
    if (tab === 'pm') { if (!pmTo) return setError('Escolha para quem sussurrar (precisa estar aqui).'); channel = 'pm'; }
    const r = await sendChat(body, { channel, toCharacterId: pmTo ?? undefined, frequency });
    if (!r.ok) setError(r.error ?? 'Erro'); else { setError(''); setText(''); setTyping(false); }
  };
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !mobile) {
      if (e.ctrlKey || e.shiftKey || e.metaKey) {
        // Ctrl+Enter (ou Shift+Enter) quebra a linha em vez de enviar
        e.preventDefault();
        const el = e.currentTarget; const { selectionStart: a, selectionEnd: b } = el;
        const next = text.slice(0, a) + '\n' + text.slice(b);
        setText(next); requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = a + 1; });
        return;
      }
      e.preventDefault(); send();
    }
    if (e.key === 'Escape') inputRef.current?.blur();
  };
  const widthRef = useRef(width); widthRef.current = width;
  const startResize = (e: React.MouseEvent) => {
    const x0 = e.clientX; const w0 = width;
    const move = (ev: MouseEvent) => setWidth(Math.max(280, Math.min(680, w0 + (x0 - ev.clientX))));
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); api('/me/settings', { method: 'PUT', body: { chatWidth: Math.round(widthRef.current) } }).catch(() => undefined); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  };
  const toggle = () => { setCollapsed(!collapsed); api('/me/settings', { method: 'PUT', body: { chatCollapsed: !collapsed } }).catch(() => undefined); };

  if (collapsed && !mobile) return (
    <button onClick={toggle} className="w-10 shrink-0 border-l border-black panel !outline-none flex flex-col items-center pt-3 gap-3 hover:brightness-125" aria-label="Abrir chat (Enter)" title="Abrir chat (Enter)">
      <ChevronLeft size={16} /><GameIcon name="chat" size={18} className="text-tape" /><span className="text-[13px] text-tape [writing-mode:vertical-rl] rotate-180">Conversa</span>
    </button>
  );
  const present = traveling ? [] : scene?.characters.filter((c) => c.online) ?? [];
  const hasRadio = !!self?.inventory.some((i) => i.props.radio);
  return (
    <aside className={mobile ? 'flex-1 min-h-0 w-full panel !outline-none flex flex-col relative' : 'shrink-0 border-l border-black panel !outline-none flex flex-col relative'} style={mobile ? undefined : { width }} aria-label="Conversa">
      {!mobile && <div className="absolute left-0 top-0 bottom-0 w-1.5 -ml-1 cursor-col-resize hover:bg-amber-450/40 z-10" onMouseDown={startResize} aria-hidden />}
      <div className="flex items-stretch panel-plate !shadow-none shrink-0" role="tablist" aria-label="Canais">
        {!mobile && <button className="px-2.5 text-ink-300 hover:text-ink-100" onClick={toggle} aria-label="Recolher a conversa" title="Recolher"><ChevronRight size={16} /></button>}
        {TABS.filter((x) => x.id !== 'admin' || staff).map((x) => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => { setTab(x.id); setError(''); }}
            className={`relative flex items-center gap-1.5 px-3 py-3 font-[family-name:var(--font-plate)] font-bold text-[16px] ${mobile ? 'flex-1 justify-center min-h-[48px] !px-1' : ''} ${tab === x.id ? 'text-amber-450' : 'text-ink-300 hover:text-ink-100'}`}>
            <GameIcon name={x.icon} size={16} />{x.label}
            {tab === x.id && <span className="absolute bottom-0 left-2 right-2 h-[3px] bg-amber-450 shadow-[0_0_10px_#f0a73a]" />}
          </button>
        ))}
      </div>
      {tab === 'local' && present.length > 0 && (
        <div className="px-4 py-2 border-b border-black/60 text-[13px] flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-ink-400">Aqui agora:</span>
          {present.map((c) => <span key={c.id} className={`flex items-center gap-1 ${c.id === self?.id ? 'text-amber-450' : 'text-ink-200'}`}><span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden />{c.name.split(' ')[0]}</span>)}
        </div>
      )}
      {tab === 'radio' && (
        <div className="px-4 py-2.5 border-b border-black/60 text-[13px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-1 bg-[#0b0c07] border border-black shadow-[inset_0_2px_4px_rgba(0,0,0,.8)] font-[family-name:var(--font-plate)] font-bold text-[19px] tabular-nums ${hasRadio ? 'text-amber-450' : 'text-ink-500'}`} style={hasRadio ? { textShadow: '0 0 10px rgba(240,167,58,.6)' } : undefined} aria-label="Frequência">{radioFreq.toFixed(1)} MHz</span>
            {hasRadio ? (
              <>
                <label className="sr-only" htmlFor="radio-ch">Canal</label>
                <select id="radio-ch" className="input !py-1 !w-auto text-[13px]" value={radioFreq} onChange={(e) => setRadioFreq(Number(e.target.value))}>
                  {RADIO_CHANNELS.map((c) => <option key={c.freq} value={c.freq}>{c.name} · {c.freq.toFixed(1)} MHz</option>)}
                  {!RADIO_CHANNELS.some((c) => c.freq === radioFreq) && <option value={radioFreq}>{radioFreq.toFixed(1)} MHz</option>}
                </select>
                <input aria-label="Outra frequência (88 a 108)" className="input !py-1 !w-20 text-[13px]" placeholder="outra" onKeyDown={(e) => { if (e.key === 'Enter') { const f = Math.round(Number((e.target as HTMLInputElement).value.replace(',', '.')) * 10) / 10; if (f >= 88 && f <= 108) { setRadioFreq(f); (e.target as HTMLInputElement).value = ''; } } }} title="Digite uma frequência de 88.0 a 108.0 e Enter" />
              </>
            ) : <span className="text-ink-300">Sem rádio. Arranje um rádio portátil para falar e ouvir à distância.</span>}
          </div>
          {hasRadio && <div className="text-[12px] text-ink-400 mt-1.5">Ouvindo {self?.radioFrequency ? `${self.radioFrequency.toFixed(1)} MHz` : 'nenhum canal'}. Ao transmitir, o rádio passa a ouvir o canal escolhido.</div>}
        </div>
      )}
      <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 scroll-fade" role="log" aria-live="polite" aria-label="Mensagens">
        {visible.map((m, i) => { const prev = visible[i - 1]; const cont = !!prev && prev.userId === m.userId && prev.kind === m.kind && m.kind === 'chat' && prev.channel === m.channel && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 180000;
          return <Message key={m.id} m={m} mine={m.userId === user?.id} staff={!!staff && user!.role !== 'gm'} continued={cont} touch={mobile} />; })}
        {!visible.length && <div className="text-[14px] text-ink-400 text-center mt-8">{tab === 'local' ? 'Ninguém disse nada aqui ainda.' : tab === 'radio' ? 'Só estática.' : 'Nenhuma conversa.'}</div>}
      </div>
      <div className={`border-t border-black panel-plate !shadow-none shrink-0 ${mobile ? 'px-2 pt-2 pb-2' : 'p-3'}`}>
        {tab === 'pm' && (
          <select aria-label="Para quem sussurrar" className="input !py-1 mb-2 text-[14px]" value={pmTo ?? ''} onChange={(e) => setPmTo(Number(e.target.value) || null)}>
            <option value="">{others.length ? 'Sussurrar para…' : 'Ninguém aqui para sussurrar'}</option>
            {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {error && <div className="text-[13px] text-blood-400 mb-1.5" role="alert">{error}</div>}
        <div className="flex gap-1.5 items-end">
          <label htmlFor="chat-input" className="sr-only">Mensagem</label>
          <textarea id="chat-input" ref={inputRef} rows={1} className="input !py-2 text-[15px] resize-none leading-snug" placeholder={tab === 'radio' ? 'Transmitir no rádio…' : tab === 'pm' ? 'Sussurrar…' : 'Fale… (/me para ações)'} value={text} maxLength={1200}
            onChange={(e) => { setText(e.target.value); setTyping(tab !== 'admin' && e.target.value.trim().length > 0); }} onKeyDown={onKey} onBlur={() => setTyping(false)} />
          <button className={`btn btn-moss !px-3 ${mobile ? '!min-h-[44px] !min-w-[48px] justify-center' : '!min-h-[38px]'}`} onClick={send} aria-label="Enviar" title="Enviar (Enter)"><Send size={mobile ? 19 : 16} /></button>
        </div>
        {mobile ? <p className="text-[12px] text-ink-400 mt-1 px-1 leading-snug">/me para ações, /roll 2d6 para dados. **negrito**, *itálico*.{staff ? ' /gm para narrar.' : ''}</p> : <p className="text-[11.5px] text-ink-400 mt-1.5 leading-snug">Enter envia, Ctrl+Enter quebra a linha. <b className="text-ink-300">**negrito**</b>, <i>*itálico*</i>, __sublinhado__, ~~riscado~~. /me para ações, /roll 2d6 para dados{staff ? ', /gm para narrar' : ''}.</p>}
      </div>
    </aside>
  );
}

function Message({ m, mine, staff, continued, touch }: { m: ChatMsg; mine: boolean; staff: boolean; continued?: boolean; touch?: boolean }) {
  const [hover, setHover] = useState(false);
  const time = new Date(m.createdAt); const ts = `${pad(time.getHours())}:${pad(time.getMinutes())}`;
  const tools = hover && m.userId && !mine && (
    <span className={`float-right flex text-ink-400 ${touch ? 'gap-1 [&>button]:p-2 [&_svg]:w-[18px] [&_svg]:h-[18px]' : 'gap-1.5'}`} onClick={(e) => e.stopPropagation()}>
      <button aria-label="Denunciar mensagem" title="Denunciar" className="hover:text-amber-450" onClick={() => { const reason = prompt('Motivo da denúncia:'); if (reason) action('report', { userId: m.userId, messageId: m.id, reason }).then((r) => r.ok && useGame.getState().toast('Denúncia enviada.', 'success')); }}><Flag size={13} /></button>
      <button aria-label="Bloquear este jogador" title="Bloquear" className="hover:text-blood-400" onClick={() => action('block_user', { userId: m.userId }).then((r) => r.ok && useGame.getState().set({ blocks: r.blocked }))}><Ban size={13} /></button>
      {staff && <button aria-label="Remover mensagem (moderação)" title="Remover" className="hover:text-blood-400" onClick={() => api(`/admin/chat/${m.id}`, { method: 'DELETE' })}><Trash2 size={13} /></button>}
    </span>
  );
  const body = <RichText text={m.content} />;
  const wrap = (cls: string, children: ReactNode, extra = '') => <div className={`text-[15px] leading-[1.45] whitespace-pre-wrap break-words ${extra} ${cls}`} onMouseEnter={() => !touch && setHover(true)} onMouseLeave={() => !touch && setHover(false)} onClick={() => touch && setHover((h) => !h)}>{tools}{children}</div>;
  if (m.kind === 'emote') return wrap('text-center text-[13.5px] text-ink-300 italic', body, 'my-2.5 px-4');
  if (m.kind === 'system') return wrap('text-center text-[13.5px] text-amber-450', body, 'my-2.5 px-3 py-1 border-y border-amber-450/20 bg-amber-450/[.04]');
  if (m.kind === 'narration') return wrap('panel-paper paper-note !text-[16px]', <><span className="flex items-center gap-1 text-[12.5px] font-bold text-[#6b4a1a] font-[family-name:var(--font-sans)]"><GameIcon name="narrator" size={13} />Narrador</span>{body}</>, 'my-3 px-4 py-2.5 rotate-[-.4deg]');
  if (m.kind === 'me') return wrap('italic text-amber-200', <><span className="not-italic font-semibold">{m.authorName}</span> {body}</>, 'my-2 pl-3 border-l-2 border-amber-450/50');
  if (m.kind === 'roll') return wrap('text-steel-400', <span className="flex items-start gap-1.5"><GameIcon name="dice" size={16} className="mt-0.5" /><span><b>{m.authorName}</b> {body}</span></span>, 'my-2');
  const tone = m.channel === 'radio' ? { bar: '#7f9aa6', tag: <span className="chip !py-0 text-steel-400 mr-1.5"><GameIcon name="radio" size={11} />{m.frequency?.toFixed(1)} MHz</span> }
    : m.channel === 'pm' ? { bar: '#a497cf', tag: <span className="chip !py-0 text-[#b9addf] mr-1.5"><GameIcon name="whisper" size={11} />sussurro</span> }
    : m.channel === 'admin' ? { bar: '#e0554a', tag: <span className="chip !py-0 text-blood-400 mr-1.5">equipe</span> } : null;
  return (
    <div className={`text-[15px] leading-[1.45] whitespace-pre-wrap break-words ${continued ? 'mt-0.5' : 'mt-3'} ${tone ? 'pl-2.5 border-l-2' : ''} ${m.deleted ? 'text-ink-500 italic' : 'text-ink-100'}`} style={tone ? { borderColor: tone.bar } : undefined} onMouseEnter={() => !touch && setHover(true)} onMouseLeave={() => !touch && setHover(false)} onClick={() => touch && setHover((h) => !h)}>
      {tools}
      {!continued && <div className="flex items-baseline gap-2 mb-0.5">{tone?.tag}<span className={`font-bold ${mine ? 'text-amber-450' : 'text-tape'}`}>{m.authorName}</span><span className="text-[11.5px] text-ink-500 tabular-nums">{ts}</span></div>}
      <div>{body}</div>
    </div>
  );
}
