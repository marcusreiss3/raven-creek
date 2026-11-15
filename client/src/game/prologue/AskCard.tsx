/**
 * Cartão de decisão do Dia 1: enquete do grupo, escolha individual, segredo ou ligação.
 * Mostra opções, chance dos testes, contagem de votos ao vivo, tempo restante e, depois, o resultado.
 */
import { useEffect, useState } from 'react';
import { usePhone, vote, type PEvent, type AskOption } from '../../lib/prologue';
import { buzz } from '../../lib/mobile';
import { GameIcon } from '../../components/GameIcon';

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export function askResolution(events: PEvent[], askId: string) {
  return events.find((x) => x.kind === 'answer' && x.payload.askId === askId) ?? null;
}

/** Decisões ainda abertas (para o painel da cena e o aviso no topo do celular). */
export function openAsks(events: PEvent[], now: number) {
  const done = new Set(events.filter((x) => x.kind === 'answer').map((x) => x.payload.askId));
  return events.filter((e) => e.kind === 'ask' && !done.has(e.payload.askId) && e.payload.deadline > now - 3000);
}

const KIND: Record<string, string> = { poll: 'Votação do grupo', each: 'Só você decide', secret: 'Segredo: só você vê', call: 'Ligação' };
const KIND_ICON: Record<string, string> = { poll: 'd1ui-vote', each: 'character', secret: 'd1ui-secret', call: 'd1ui-phone-call' };

export function AskCard({ e, tone = 'phone' }: { e: PEvent; tone?: 'phone' | 'scene' }) {
  const p = e.payload;
  const { events, tallies, myVotes, me } = usePhone();
  const now = useNow(500);
  const res = askResolution(events, p.askId);
  const mine = myVotes[p.askId];
  const t = tallies[p.askId];
  const left = Math.max(0, Math.ceil((p.deadline - now) / 1000));
  const total = Math.max(1, Math.round((p.deadline - Date.parse(e.createdAt)) / 1000) || 45);
  const dead = me?.status === 'dead';
  const disabled = !!res || dead || left <= 0;
  const scene = tone === 'scene';
  const pick = (o: AskOption) => { if (disabled) return; buzz(15); vote(p.askId, o.id); };
  return (
    <div className={`rounded-2xl border ${scene ? 'border-amber-450/60 bg-[#17150e]/95' : 'border-white/10 bg-[#1b1f26]'} p-3 shadow-lg`} role="group" aria-label={p.text}>
      <div className="flex items-center gap-2 text-[11.5px] uppercase tracking-wider">
        <span className={`flex items-center gap-1.5 font-bold ${p.kind === 'secret' ? 'text-blood-400' : p.kind === 'call' ? 'text-moss-400' : 'text-amber-450'}`}><GameIcon name={KIND_ICON[p.kind] ?? 'd1ui-vote'} size={15} />{KIND[p.kind] ?? 'Decisão'}</span>
        {p.kind === 'poll' && p.group > 1 && <span className="text-white/50">{p.group} pessoas</span>}
        {p.from && p.kind !== 'poll' && <span className="text-white/50 truncate">· {p.from}</span>}
        {!res && <span className={`ml-auto tabular-nums font-bold ${left <= 10 ? 'text-blood-400' : 'text-white/70'}`}>{left}s</span>}
      </div>
      <p className={`mt-1.5 leading-snug ${scene ? 'text-[15.5px] text-ink-100' : 'text-[14.5px] text-white'}`}>{p.text}</p>
      {!res && <div className="h-1 mt-2 rounded bg-white/10 overflow-hidden"><div className={`h-full ${left <= 10 ? 'bg-blood-500' : 'bg-amber-450'} transition-all`} style={{ width: `${Math.min(100, (left / total) * 100)}%` }} /></div>}
      <div className="mt-2.5 space-y-1.5">
        {(p.options as AskOption[]).map((o) => {
          const votes = t?.tally?.[o.id] ?? 0;
          const chosen = mine === o.id;
          const won = res?.payload.option === o.id;
          return (
            <button key={o.id} disabled={disabled} onClick={() => pick(o)}
              className={`w-full text-left rounded-xl px-3 py-2.5 min-h-[44px] border transition relative overflow-hidden
                ${won ? 'border-moss-400 bg-moss-400/15' : chosen ? 'border-amber-450 bg-amber-450/15' : 'border-white/10 bg-white/[.04] hover:bg-white/[.09]'}
                ${disabled && !won && !chosen ? 'opacity-55' : ''}`}>
              {p.kind === 'poll' && votes > 0 && <span className="absolute inset-y-0 left-0 bg-amber-450/10" style={{ width: `${(votes / Math.max(1, p.group)) * 100}%` }} />}
              <span className="relative flex items-start gap-2">
                {o.icon && <GameIcon name={o.icon} size={scene ? 21 : 19} className={`mt-[1px] ${chosen || won ? 'text-amber-450' : scene ? 'text-tape' : 'text-white/75'}`} />}
                <span className={`flex-1 ${scene ? 'text-[15px] text-ink-100' : 'text-[14px] text-white'}`}>{o.label}</span>
                {p.kind === 'poll' && votes > 0 && <span className="text-[12px] font-bold text-amber-450 tabular-nums">{votes}</span>}
                {chosen && !res && <span className="text-[11px] text-amber-450 font-bold">SEU VOTO</span>}
              </span>
              {o.check && <span className={`relative flex items-center gap-1 text-[12px] text-white/55 mt-0.5 ${o.icon ? 'pl-[27px]' : ''}`}><GameIcon name="dice" size={13} />{o.check.label} · {o.check.chance}%</span>}
            </button>
          );
        })}
      </div>
      {res && (
        <div className="mt-2 text-[13px] text-moss-400 font-semibold flex flex-wrap items-center gap-x-1">
          <GameIcon name={res.payload.timedOut ? 'd1ui-timer' : 'd1ui-result'} size={14} />{res.payload.timedOut ? 'Tempo esgotado: ' : p.kind === 'poll' ? 'O grupo decidiu: ' : 'Você escolheu: '}{res.payload.label}
          {p.kind === 'poll' && res.payload.total > 0 && <span className="text-white/50 font-normal"> ({res.payload.votes}/{res.payload.total} votos)</span>}
        </div>
      )}
      {!res && p.kind === 'poll' && <div className="mt-2 text-[12px] text-white/50">{mine ? 'Esperando os outros votarem… (dá para trocar o voto)' : 'Conversem no chat do local antes de votar: a votação fecha quando todos tiverem votado. A maioria decide; no empate, vale a opção de quem é da área.'}{t ? ` ${t.voters}/${p.group} votaram.` : ''}</div>}
      {dead && !res && <div className="mt-2 text-[12px] text-white/50">Você não pode mais escolher.</div>}
    </div>
  );
}
