/** Registro do roteiro do Dia 1: trilhas, pontos de encontro, linha do tempo global e marcas. */
import type { Beat, Track } from './types.js';
import { TIMELINE, SESSION_MINUTES } from './timeline.js';
import { OPTION_ICONS } from './icons.js';
import { MARKS } from './marks.js';
import { POLICIA } from './tracks/policia.js';
import { HOSPITAL } from './tracks/hospital.js';
import { MILITAR } from './tracks/militar.js';
import { FABRICA } from './tracks/fabrica.js';
import { CIVIL } from './tracks/civil.js';
import { HUBS } from './tracks/hubs.js';
import { FREE_TRACKS } from './livre.js';

export { TIMELINE, SESSION_MINUTES, MARKS, FREE_TRACKS };
export const TRACKS: Track[] = [POLICIA, HOSPITAL, MILITAR, FABRICA, CIVIL, ...HUBS];

/** Emoji no começo de um texto (com seletor de variação e junções). */
const LEADING_EMOJI = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\uFE0F|\u200D(?:\p{Extended_Pictographic}))*\uFE0F?)\s*/u;
// As escolhas aparecem com ícones do jogo, não com emojis: tira o emoji do texto e guarda o ícone correspondente.
for (const t of [...TRACKS, ...FREE_TRACKS]) for (const b of t.beats) {
  if (!b.ask) continue;
  b.ask.text = b.ask.text.replace(LEADING_EMOJI, '');
  for (const o of b.ask.options) {
    const m = o.label.match(LEADING_EMOJI);
    if (!m) continue;
    o.icon = OPTION_ICONS[m[1]] ?? OPTION_ICONS[m[1].replace(/\uFE0F/g, '')];
    o.label = o.label.slice(m[0].length);
  }
}
const ALL = [...TRACKS, ...FREE_TRACKS];
const byId = new Map(ALL.map((t) => [t.id, t]));
const beats = new Map<string, Map<string, Beat>>(ALL.map((t) => [t.id, new Map(t.beats.map((b) => [b.id, b]))]));

export const getTrack = (id: string) => byId.get(id);
export const getBeat = (trackId: string, beatId: string) => beats.get(trackId)?.get(beatId);
/** Trilha inicial de uma profissão (quem não tem trilha própria vai para a civil). */
export function trackForProfession(prof: string): Track {
  return TRACKS.find((t) => !t.hub && t.professions.includes(prof)) ?? CIVIL;
}

// ───────────────────────────── Ritmo
/** Minutos "de projeto" em que os atos começam: a linha do tempo global e os pontos de encontro são escritos nessa escala. */
const DESIGN = [0, 15, 45, 85, 125, 150];
const ASK_SECONDS = 80; // tempo médio de uma decisão humana com RP (ler, conversar, votar)
const COMBAT_SECONDS = 360; // um combate tático com gente de verdade dura uns 6 minutos

/** Segundos que a própria batida leva (mensagens + decisão/combate + pausa). */
function ownSeconds(b: Beat) {
  const msgs = (b.say ?? []).reduce((s, m, i) => s + (i === 0 ? m.wait ?? 3 : m.wait ?? 6), 0) + (b.say?.length ? 3 : 0);
  return msgs + (b.ask ? ASK_SECONDS : 0) + (b.combat ? COMBAT_SECONDS : 0) + (b.wait ?? 2);
}
function successors(trackId: string, b: Beat): [string, string][] {
  if (b.hub) { const h = getTrack(b.hub); return h ? [[h.id, h.start]] : []; }
  const ids = [b.next, b.else, b.combat?.win, b.combat?.lose, ...(b.ask?.options.flatMap((o) => [o.next, o.fail]) ?? [])].filter(Boolean) as string[];
  return [...new Set(ids)].map((id) => [trackId, id]);
}
const memo = new Map<string, number>();
/** Estimativa (segundos) do que falta de história até o fim do ato desta batida, seguindo os caminhos possíveis (média). */
export function remainingInAct(trackId: string, beatId: string, depth = 0): number {
  const k = `${trackId}:${beatId}`;
  const hit = memo.get(k); if (hit !== undefined) return hit;
  const b = getBeat(trackId, beatId); if (!b || depth > 80) return 0;
  const succ = successors(trackId, b).filter(([t, id]) => (getBeat(t, id)?.act ?? 99) === b.act);
  const rest = succ.length ? succ.reduce((s, [t, id]) => s + remainingInAct(t, id, depth + 1), 0) / succ.length : 0;
  const v = ownSeconds(b) + rest;
  memo.set(k, v);
  return v;
}

/** Pontos de entrada de cada ato em todas as trilhas (início da trilha ou batida que vem de um ato anterior). */
function actEntries() {
  const out: Record<number, [string, string][]> = {};
  for (const t of TRACKS) {
    const entry = new Set<string>([t.start]);
    for (const b of t.beats) for (const [tt, id] of successors(t.id, b)) { const nb = getBeat(tt, id); if (tt === t.id && nb && nb.act > b.act) entry.add(id); }
    for (const id of entry) { const b = getBeat(t.id, id); if (b) (out[b.act] ??= []).push([t.id, id]); }
  }
  return out;
}
/** Minutos de história de cada ato pelo caminho mais longo (estimativa realista). */
export function actContentMinutes() {
  const e = actEntries();
  return [1, 2, 3, 4, 5].map((a) => Math.max(1, ...(e[a] ?? []).map(([t, id]) => remainingInAct(t, id) / 60)));
}
/**
 * Janelas dos atos: os 150 minutos são divididos em proporção ao conteúdo de cada ato (mínimo de 6 min por ato).
 * Assim o ritmo fica uniforme e o motor só estica as pausas o necessário.
 */
const content = actContentMinutes();
const total = content.reduce((a, b) => a + b, 0);
const widths = content.map((c) => Math.max(6, (c / total) * SESSION_MINUTES));
const wsum = widths.reduce((a, b) => a + b, 0);
const norm = widths.map((w) => (w / wsum) * SESSION_MINUTES);
export const ACT_START: number[] = [0]; export const ACT_END: number[] = [0];
{ let acc = 0; for (const w of norm) { ACT_START.push(acc); acc += w; ACT_END.push(acc); } }
/** Converte um minuto "de projeto" (linha do tempo, abertura dos encontros) para o minuto real da sessão. */
export function mapDesignMinute(m: number) {
  for (let a = 1; a <= 5; a++) {
    if (m <= DESIGN[a] || a === 5) { const f = (m - DESIGN[a - 1]) / (DESIGN[a] - DESIGN[a - 1]); return ACT_START[a] + Math.max(0, Math.min(1, f)) * (ACT_END[a] - ACT_START[a]); }
  }
  return m;
}
/** Ato de um minuto da sessão. */
export const actAtMinute = (minute: number) => { for (let a = 5; a >= 1; a--) if (minute >= ACT_START[a]) return a; return 1; };

/** Eventos de quem saiu do trabalho: o do local (se houver) e os globais possíveis num ato. */
export const isFreeTrack = (id: string) => id === 'livre' || FREE_TRACKS.some((t) => t.id === id);
export function freeLocalEvent(locationId: string, act: number) {
  return FREE_TRACKS.find((t) => t.free?.at === locationId && act >= t.free.acts[0] && act <= t.free.acts[1]);
}
export function freeGlobalEvents(act: number) {
  return FREE_TRACKS.filter((t) => t.free && !t.free.at && act >= t.free.acts[0] && act <= t.free.acts[1]);
}
