import { and, desc, eq, gt, inArray, or } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { SKILLS } from '../content/character.js';
import { cfg } from './config.js';
import { fail } from './infra.js';
import { emitToLocation, emitToRoom, emitToUser } from './realtime.js';
import { rng } from '../rules/rng.js';
import { nearbyGroupIds } from './roads.js';

type Msg = typeof schema.chatMessages.$inferSelect;
export function publicMessage(m: Msg) {
  return { id: m.id, channel: m.channel, kind: m.kind, locationId: m.locationId, frequency: m.frequency, characterId: m.characterId, userId: m.userId,
    authorName: m.authorName, content: m.deleted ? '[mensagem removida pela moderação]' : m.content, deleted: m.deleted, createdAt: m.createdAt, toUserId: m.toUserId };
}

export async function systemEmote(locationId: string, content: string, kind: 'emote' | 'system' = 'emote') {
  const [m] = await db.insert(schema.chatMessages).values({ channel: 'local', kind, locationId, content, authorName: '' }).returning();
  emitToLocation(locationId, 'chat:message', publicMessage(m));
  return m;
}
/** Transmissão automática numa frequência (ex.: rádio KRVN em 88.1). Chega a quem tem rádio sintonizado. */
export async function radioBroadcast(frequency: number, authorName: string, content: string) {
  const [m] = await db.insert(schema.chatMessages).values({ channel: 'radio', kind: 'say', frequency, content, authorName }).returning();
  emitToRoom(`radio:${frequency}`, 'chat:message', publicMessage(m));
}
export async function travelMessage(groupId: string, content: string) {
  const [m] = await db.insert(schema.chatMessages).values({ channel: 'travel', kind: 'system', travelGroup: groupId, content, authorName: '' }).returning();
  emitToRoom(`travel:${groupId}`, 'chat:message', publicMessage(m));
}

const windows = new Map<number, number[]>();
function rateLimit(userId: number) {
  const now = Date.now(); const w = (windows.get(userId) ?? []).filter((t) => t > now - 10_000);
  if (w.length >= cfg().chat.rateLimitPerTenSeconds) fail('Devagar — você está enviando mensagens rápido demais.', 'rate_limited');
  w.push(now); windows.set(userId, w);
}

export type ChatSender = {
  userId: number; role: string; mutedUntil: Date | null;
  character: { id: number; name: string; locationId: string; state: string; radioFrequency: number | null; hasRadio: boolean; factionId: number | null; travelGroup: string | null; skills: Record<string, { level: number }>; attributes: Record<string, number> } | null;
};

/** Interpreta comandos de chat e entrega no canal correto. O servidor decide quem recebe. */
export async function sendChat(sender: ChatSender, raw: string, opts: { channel?: string; toCharacterId?: number; frequency?: number } = {}) {
  if (sender.mutedUntil && sender.mutedUntil > new Date()) fail('Você está silenciado pela moderação.');
  rateLimit(sender.userId);
  // Mantém quebras de linha internas (Ctrl+Enter), remove espaços/linhas vazias nas pontas e limita linhas em branco seguidas.
  let text = String(raw ?? '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1200);
  if (!text.trim()) fail('Mensagem vazia.');
  const ch = sender.character; const staff = ['gm', 'moderator', 'admin'].includes(sender.role);
  let channel = opts.channel ?? 'local'; let kind = 'say';
  let frequency: number | null = null; const factionId: number | null = null; let toUserId: number | null = null;
  if (channel !== 'local' && channel !== 'radio' && channel !== 'pm' && !(channel === 'admin' && staff)) channel = 'local';

  const cmd = text.match(/^\/(\w+)\s*([\s\S]*)$/);
  if (cmd) {
    const [, c, rest] = cmd; text = rest.trim();
    switch (c.toLowerCase()) {
      case 'me': kind = 'me'; break;
      case 'r': case 'radio': channel = 'radio'; break;
      case 'a': case 'admin': if (!staff) fail('Canal restrito à equipe.'); channel = 'admin'; break;
      case 'gm': case 'narrar': if (!staff) fail('Somente mestres podem narrar.'); kind = 'narration'; break;
      case 'roll': case 'rolar': return roll(sender, text);
      case 'freq': return { ok: true, setFrequency: parseFrequency(text) };
      default: fail(`Comando desconhecido: /${c}. Use /me, /roll${staff ? ', /gm, /a' : ''}.`);
    }
  }
  if (!text) fail('Mensagem vazia.');

  if (channel === 'local') {
    if (!ch) fail('Crie um personagem para conversar.');
    if (ch!.state === 'traveling' && ch!.travelGroup) channel = 'travel';
  }
  if (channel === 'radio') {
    if (!ch?.hasRadio) fail('Você precisa de um rádio no inventário.');
    // O canal escolhido no envio também passa a ser o sintonizado (para ouvir as respostas).
    frequency = opts.frequency != null ? parseFrequency(String(opts.frequency)) : ch!.radioFrequency;
    if (!frequency) fail('Escolha um canal de rádio.');
    if (frequency !== ch!.radioFrequency) {
      await db.update(schema.characters).set({ radioFrequency: frequency }).where(eq(schema.characters.id, ch!.id));
      retune?.(ch!.id);
    }
  }
  if (channel === 'pm') {
    if (!cfg().chat.allowPrivateMessages && !staff) fail('Mensagens privadas estão desativadas neste servidor.');
    const [target] = await db.select().from(schema.characters).where(eq(schema.characters.id, opts.toCharacterId ?? -1));
    if (!target || !target.alive) fail('Destinatário não encontrado.');
    // Mensagem privada é um sussurro: só para quem está no mesmo lugar que você.
    if (!staff && (!ch || target!.id === ch.id || target!.locationId !== ch.locationId || target!.state === 'traveling' || ch.state === 'traveling')) fail('Você só pode sussurrar para alguém que esteja no mesmo local.');
    toUserId = target!.userId;
    const [blocked] = await db.select().from(schema.userBlocks).where(and(eq(schema.userBlocks.userId, toUserId!), eq(schema.userBlocks.blockedUserId, sender.userId)));
    if (blocked) fail('Essa pessoa não aceita suas mensagens.');
  }
  const travelGroup = channel === 'travel' ? ch!.travelGroup : null;
  const locationId = channel === 'local' ? (ch?.state === 'traveling' ? null : ch?.locationId ?? null) : null;
  const authorName = kind === 'narration' ? 'Narrador' : ch?.name ?? 'Equipe';
  const [m] = await db.insert(schema.chatMessages).values({ channel, kind, locationId, frequency, factionId, travelGroup, toUserId, userId: sender.userId, characterId: ch?.id ?? null, authorName, content: text }).returning();
  deliver(m);
  return { ok: true, id: m.id, frequency };
}

/** Na estrada, quem está à vista também ouve (exceto mensagens de sistema do próprio grupo). */
function emitToTravel(groupId: string, pm: unknown, includeNearby: boolean) {
  emitToRoom(`travel:${groupId}`, 'chat:message', pm);
  if (includeNearby) void nearbyGroupIds(groupId).then((gs) => gs.forEach((g) => emitToRoom(`travel:${g}`, 'chat:message', pm))).catch(() => undefined);
}

let retune: ((characterId: number) => void) | null = null;
/** O módulo de socket registra como reposicionar as salas de rádio quando a frequência muda. */
export function onRetune(fn: (characterId: number) => void) { retune = fn; }

function deliver(m: Msg) {
  const pm = publicMessage(m);
  if (m.channel === 'local' || m.channel === 'ooc') { if (m.locationId) emitToLocation(m.locationId, 'chat:message', pm); else if (m.travelGroup) emitToTravel(m.travelGroup, pm, m.kind !== 'system'); }
  else if (m.channel === 'travel') emitToTravel(m.travelGroup!, pm, m.kind !== 'system');
  else if (m.channel === 'radio') emitToRoom(`radio:${m.frequency}`, 'chat:message', pm);
  else if (m.channel === 'faction') emitToRoom(`faction:${m.factionId}`, 'chat:message', pm);
  else if (m.channel === 'admin') emitToRoom('staff', 'chat:message', pm);
  else if (m.channel === 'pm') { emitToUser(m.toUserId!, 'chat:message', pm); if (m.userId) emitToUser(m.userId, 'chat:message', pm); }
}

function parseFrequency(t: string) {
  const f = Math.round(Number(t.replace(',', '.')) * 10) / 10;
  if (!(f >= 88 && f <= 108)) fail('Frequência inválida (88.0 – 108.0).');
  return f;
}

async function roll(sender: ChatSender, text: string) {
  const ch = sender.character; if (!ch) fail('Crie um personagem.');
  let content: string;
  const dice = text.match(/^(\d{0,2})d(\d{1,3})$/i);
  const skill = Object.entries(SKILLS).find(([id, s]) => id === text.toLowerCase() || s.name.toLowerCase() === text.toLowerCase());
  if (dice) {
    const n = Math.min(10, Number(dice[1] || 1)); const sides = Math.min(100, Math.max(2, Number(dice[2])));
    const rolls = Array.from({ length: n }, () => rng.int(1, sides));
    content = `rola ${n}d${sides}: [${rolls.join(', ')}] = ${rolls.reduce((a, b) => a + b, 0)}`;
  } else if (skill) {
    const [id, s] = skill; const lvl = ch!.skills[id]?.level ?? 0; const attr = ch!.attributes[s.attribute] ?? 4;
    const d20 = rng.int(1, 20); const total = d20 + lvl * 2 + Math.floor((attr - 4) / 2);
    content = `testa ${s.name}: d20(${d20}) + nível ${lvl}×2 + atributo ${Math.floor((attr - 4) / 2)} = ${total}`;
  } else { const d = rng.int(1, 20); content = `rola 1d20: ${d}`; }
  const travelGroup = ch!.state === 'traveling' ? ch!.travelGroup : null;
  const [m] = await db.insert(schema.chatMessages).values({ channel: travelGroup ? 'travel' : 'local', kind: 'roll', locationId: travelGroup ? null : ch!.locationId, travelGroup, userId: sender.userId, characterId: ch!.id, authorName: ch!.name, content }).returning();
  deliver(m);
  return { ok: true };
}

export async function localHistory(locationId: string, sinceMinutes = 360) {
  const since = new Date(Date.now() - sinceMinutes * 60000);
  const rows = await db.select().from(schema.chatMessages)
    .where(and(eq(schema.chatMessages.locationId, locationId), inArray(schema.chatMessages.channel, ['local']), gt(schema.chatMessages.createdAt, since)))
    .orderBy(desc(schema.chatMessages.id)).limit(cfg().chat.historySize);
  return rows.reverse().map(publicMessage);
}
export async function privateHistory(userId: number, factionId: number | null, frequency: number | null, travelGroup: string | null) {
  const conds = [and(eq(schema.chatMessages.channel, 'pm'), or(eq(schema.chatMessages.toUserId, userId), eq(schema.chatMessages.userId, userId)))];
  if (factionId) conds.push(and(eq(schema.chatMessages.channel, 'faction'), eq(schema.chatMessages.factionId, factionId)));
  if (frequency) conds.push(and(eq(schema.chatMessages.channel, 'radio'), eq(schema.chatMessages.frequency, frequency)));
  if (travelGroup) conds.push(eq(schema.chatMessages.travelGroup, travelGroup));
  const rows = await db.select().from(schema.chatMessages).where(or(...conds)).orderBy(desc(schema.chatMessages.id)).limit(80);
  return rows.reverse().map(publicMessage);
}

export async function deleteMessage(messageId: number) {
  const [m] = await db.update(schema.chatMessages).set({ deleted: true }).where(eq(schema.chatMessages.id, messageId)).returning();
  if (m) deliverDeleted(m);
  return m;
}
function deliverDeleted(m: Msg) {
  const payload = { id: m.id };
  if (m.locationId) emitToLocation(m.locationId, 'chat:deleted', payload);
  if (m.travelGroup) emitToRoom(`travel:${m.travelGroup}`, 'chat:deleted', payload);
  if (m.frequency) emitToRoom(`radio:${m.frequency}`, 'chat:deleted', payload);
  if (m.factionId) emitToRoom(`faction:${m.factionId}`, 'chat:deleted', payload);
}
