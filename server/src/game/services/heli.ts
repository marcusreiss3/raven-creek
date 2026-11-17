/**
 * Capítulo 1 da história: "A queda do Corvo 2-1".
 *
 * Um helicóptero do Fort Ashby sobrevoa o condado, entra em pane e cai na plantação da Fazenda Miller.
 *  - Quem tem rádio (ou está junto de alguém com rádio, no mesmo lugar ou no mesmo grupo de viagem) ouve a
 *    conversa da tripulação até a queda, num painel no meio da tela — e o MAYDAY diz onde caiu.
 *  - Quem não ouviu vê o helicóptero passar e, ao entrar no jogo (ou na hora, se estiver conectado), faz um
 *    teste no meio da tela: 1d6, tirando 3 ou mais deduz onde ele caiu.
 *  - No local: infectados (a tripulação virou) em volta dos destroços. Vasculhar fica travado até que todos
 *    caiam; o confronto usa um tabuleiro próprio (heli_crash) e os infectados começam do outro lado, sem ver ninguém.
 *  - Limpo o local, as primeiras buscas dão o loot do helicóptero (armas, munição, roupas, comida, remédio) e uma
 *    carta — só uma pessoa acha, e todo mundo fica sabendo. Esgotado, o lugar volta ao loot normal.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema, type Tx } from '../../db/index.js';
import { rng } from '../rules/rng.js';
import { assertCanAct, withCharacter } from './characters.js';
import { systemEmote } from './chat.js';
import { allItemDefs, itemDef } from './config.js';
import { fail, gameLog, withLock } from './infra.js';
import { addItem, carryInfo, itemsOf, type CharRow } from './inventory.js';
import { emitAll, emitToUser, notify, pushScene, pushSelf } from './realtime.js';
import { connectionsFrom, getLocation } from './world.js';

const KEY = 'lore:heli';
export const HELI_SITE = 'fm_miller_field';
const ZOMBIES = 10;          // tripulação que virou + os que o barulho trouxe
const SEARCHES = 6;          // buscas com o loot do helicóptero antes de o lugar voltar ao normal

type HeliState = {
  phase: 'flying' | 'crashed' | 'looted';
  locationId: string; startedAt: number; crashAt: number;
  /** quem ouviu pelo rádio: id do personagem → nome de quem tinha o rádio ('' = o próprio rádio) */
  heard: Record<string, string>;
  /** quem sabe onde caiu */
  know: Record<string, true>;
  /** teste pendente (não ouviu o rádio) e resultados */
  pending: Record<string, true>; tests: Record<string, { roll: number; ok: boolean }>;
  zombies: number; searchesLeft: number; letterBy: number | null; combatId: number | null;
};

let cache: HeliState | null | undefined;
async function read(tx: Tx = db): Promise<HeliState | null> {
  if (cache !== undefined && tx === db) return cache;
  const [r] = await tx.select().from(schema.gameConfig).where(eq(schema.gameConfig.key, KEY));
  const v = (r?.value ?? null) as HeliState | null;
  if (tx === db) cache = v;
  return v;
}
async function write(tx: Tx, s: HeliState) {
  await tx.insert(schema.gameConfig).values({ key: KEY, value: s }).onConflictDoUpdate({ target: schema.gameConfig.key, set: { value: s, updatedAt: new Date() } });
  cache = s;
}
const siteName = (s: HeliState) => getLocation(s.locationId)?.name ?? s.locationId;

// ───────────────────────── Roteiro do rádio ─────────────────────────
/** Falas na frequência militar, com o atraso (s) desde o início. A queda acontece logo depois do estrondo. */
const RADIO: { at: number; who: string; text: string }[] = [
  { at: 0, who: 'Corvo 2-1', text: 'Torre Ashby, aqui é Corvo 2-1. Decolamos do forte com carga de reabastecimento e quatro a bordo. Rumo norte, sobre a cidade.' },
  { at: 14, who: 'Torre Ashby', text: 'Corvo 2-1, Torre. Copiado. Mantenha acima de trezentos pés. Nada de pousar dentro do perímetro.' },
  { at: 28, who: 'Corvo 2-1', text: 'Torre, tem fumaça no centro… e gente viva lá embaixo. Estão acenando de um telhado. Pedindo permissão pra—' },
  { at: 40, who: 'Torre Ashby', text: 'Negativo, Corvo. Ordem 7. Ninguém sai, ninguém entra. Siga o plano de voo.' },
  { at: 56, who: 'Corvo 2-1 (piloto)', text: 'Torre… alarme de pressão no motor dois. A temperatura tá subindo rápido.' },
  { at: 70, who: 'Corvo 2-1 (piloto)', text: '(alarme ao fundo) Perdemos o motor dois! Vou tentar levar ela até campo aberto, depois da cidade—' },
  { at: 84, who: 'Corvo 2-1 (tripulante)', text: 'Tem um mordido aqui atrás! O Hayes foi mordido no embarque, ele escondeu, ele tá— (gritos, golpes contra o metal)' },
  { at: 98, who: 'Torre Ashby', text: 'Corvo 2-1, repita. Corvo 2-1, responda.' },
  { at: 110, who: 'Corvo 2-1 (piloto)', text: 'MAYDAY, MAYDAY, MAYDAY. Corvo 2-1 caindo. Fazenda Miller, na plantação, perto do silo. Quatro a bordo, um infectado—' },
  { at: 122, who: '—', text: '(estática… um estrondo… silêncio)' },
  { at: 136, who: 'Torre Ashby', text: 'Corvo 2-1… Corvo 2-1, Torre Ashby. (pausa longa) Torre para todas as unidades: Corvo 2-1 perdido. Não enviar resgate. Repito: não enviar resgate.' },
];
const CRASH_AT = 124;

const LETTER = {
  mystery: 'Destroços do Corvo 2-1',
  title: 'Carta dobrada no bolso de um soldado',
  text: 'Tom,\n\nO rádio do Walt pegou a frequência de vocês ontem à noite e eu ouvi sua voz por dois segundos. Dois segundos, e eu chorei feito boba na frente de todo mundo.\n\nEstamos bem. Somos quase setenta agora. Os muros aguentaram a última leva, o poço continua limpo e as crianças voltaram a ter aula, acredita? A dona Ruth insiste. Plantamos milho e feijão atrás da capela. À noite a gente apaga tudo e fica quieto, como você ensinou.\n\nPor favor, toma cuidado. Não confia no comando, não confia em ninguém que diga que "está tudo sob controle". Se mandarem vocês para dentro da cidade, não vai. Se tiver um jeito de sair, sai. Você sabe o caminho — o mesmo da nossa primeira viagem, aquele que só nós dois sabemos. Não escreve o nome em lugar nenhum, nem no rádio. Eles escutam.\n\nO portão abre ao amanhecer para quem chega com as mãos à vista. Eu deixei seu nome com a guarda.\n\nVolta pra mim.\n\nClara',
};

/** Loot dos destroços (peso relativo, mínimo, máximo). */
const HELI_LOOT: { itemId: string; w: number; min?: number; max?: number }[] = [
  { itemId: 'service_rifle', w: 1.4 }, { itemId: 'pistol_9mm', w: 2 }, { itemId: 'combat_knife', w: 2 },
  { itemId: 'ammo_9mm', w: 6, min: 10, max: 24 }, { itemId: 'ammo_308', w: 5, min: 5, max: 12 },
  { itemId: 'military_helmet', w: 1.8 }, { itemId: 'police_vest', w: 1.2 }, { itemId: 'combat_boots', w: 2.5 }, { itemId: 'cargo_pants', w: 2.5 },
  { itemId: 'military_bag', w: 1.4 }, { itemId: 'leather_gloves', w: 1.5 },
  { itemId: 'first_aid_kit', w: 2.5 }, { itemId: 'antibiotics', w: 2.5 }, { itemId: 'bandage', w: 3.5, min: 2, max: 4 }, { itemId: 'painkillers', w: 2.5 },
  { itemId: 'water_bottle', w: 5, min: 2, max: 4 }, { itemId: 'canned_beans', w: 4, min: 1, max: 3 }, { itemId: 'canned_soup', w: 3, min: 1, max: 2 }, { itemId: 'crackers', w: 3, min: 1, max: 3 },
  { itemId: 'radio', w: 1.2 }, { itemId: 'binoculars', w: 1.2 }, { itemId: 'flashlight', w: 2 }, { itemId: 'suppressor_9mm', w: 0.4 },
];

// ───────────────────────── Início e rádio ─────────────────────────
const timers: NodeJS.Timeout[] = [];

export async function heliStatus() {
  const s = await read();
  if (!s) return null;
  return { phase: s.phase, location: siteName(s), zombies: s.zombies, searchesLeft: s.searchesLeft, letterFound: !!s.letterBy,
    heard: Object.keys(s.heard).length, know: Object.keys(s.know).length, pendingTests: Object.keys(s.pending).length };
}

export async function startHeliChapter() {
  return withLock('lore:heli', async () => {
    const cur = await read();
    if (cur && cur.phase !== 'looted') fail(cur.phase === 'flying' ? 'O helicóptero já está no ar.' : 'O helicóptero já caiu e os destroços ainda não foram esgotados.');
    const now = Date.now();
    const s: HeliState = { phase: 'flying', locationId: HELI_SITE, startedAt: now, crashAt: now + CRASH_AT * 1000, heard: {}, know: {}, pending: {}, tests: {}, zombies: ZOMBIES, searchesLeft: SEARCHES, letterBy: null, combatId: null };
    await db.transaction((tx) => write(tx, s));
    for (const t of timers.splice(0)) clearTimeout(t);
    RADIO.forEach((line, i) => timers.push(setTimeout(() => { void deliverRadio(i).catch((e) => console.error('[heli rádio]', e)); }, line.at * 1000)));
    timers.push(setTimeout(() => { void processHeli().catch((e) => console.error('[heli queda]', e)); }, CRASH_AT * 1000 + 300));
    // quem está sem rádio vê o helicóptero passar (o painel do rádio mostra o resto para quem ouve)
    const { out } = await listeners();
    emitAll('lore:overflight', { exceptCharacterIds: [...out.keys()], text: 'Um ronco grave corta o céu. Um helicóptero militar verde-oliva passa baixo sobre o condado, vindo do leste. Alguns minutos depois o som muda: o motor engasga, tosse, e uma trilha de fumaça preta começa a sair da cauda.' });
    return { ok: true };
  });
}

/** Quem escuta agora: donos de rádio e quem está junto deles (mesmo lugar ou mesmo grupo de viagem). */
async function listeners() {
  const radioIds = allItemDefs().filter((d) => (d.props as any)?.radio).map((d) => d.id);
  const chars = await db.select().from(schema.characters).where(eq(schema.characters.alive, true));
  const holders = new Map<number, CharRow>();
  const owners = radioIds.length ? new Set((await db.select({ ownerId: schema.items.ownerId }).from(schema.items)
    .where(and(eq(schema.items.ownerType, 'character'), inArray(schema.items.defId, radioIds)))).map((r) => Number(r.ownerId))) : new Set<number>();
  for (const c of chars) if (owners.has(c.id)) holders.set(c.id, c);
  const travels = await db.select({ characterId: schema.travels.characterId, groupId: schema.travels.groupId, status: schema.travels.status }).from(schema.travels);
  const groupOf = new Map<number, string>();
  for (const t of travels) if (['active', 'paused', 'awaiting_decision', 'combat'].includes(t.status)) groupOf.set(t.characterId, t.groupId);
  const out = new Map<number, { c: CharRow; via: string }>();
  for (const c of chars) {
    if (holders.has(c.id)) { out.set(c.id, { c, via: '' }); continue; }
    const g = c.state === 'traveling' ? groupOf.get(c.id) : undefined;
    const h = [...holders.values()].find((x) => g ? groupOf.get(x.id) === g : x.state !== 'traveling' && x.locationId === c.locationId);
    if (h) out.set(c.id, { c, via: `${h.firstName} ${h.lastName}` });
  }
  return { holders, out };
}

async function deliverRadio(i: number) {
  const line = RADIO[i]; if (!line) return;
  const s = await read(); if (!s || s.phase === 'looted') return;
  const { out } = await listeners();
  const heard = { ...s.heard }; let changed = false;
  for (const { c, via } of out.values()) {
    emitToUser(c.userId, 'lore:radio', { index: i, total: RADIO.length, who: line.who, text: line.text, via: via || null, final: i === RADIO.length - 1 });
    if (heard[c.id] === undefined) { heard[c.id] = via; changed = true; }
  }
  if (changed) await withLock('lore:heli', async () => { const cur = await read(); if (cur) await db.transaction((tx) => write(tx, { ...cur, heard: { ...heard, ...cur.heard } })); });
}

/** Chamado pelo agendador do mundo: derruba o helicóptero na hora certa (mesmo se o servidor reiniciou no meio). */
export async function processHeli() {
  const s0 = await read();
  if (!s0 || s0.phase !== 'flying' || Date.now() < s0.crashAt) return;
  await withLock('lore:heli', async () => {
    const s = await read();
    if (!s || s.phase !== 'flying') return;
    const alive = await db.select().from(schema.characters).where(eq(schema.characters.alive, true));
    const know: Record<string, true> = {}; const pending: Record<string, true> = {};
    // ouviu o MAYDAY (ou qualquer parte da conversa): sabe onde caiu. Os outros fazem o teste.
    for (const c of alive) { if (s.heard[c.id] !== undefined) know[c.id] = true; else pending[c.id] = true; }
    const name = siteName(s);
    await db.transaction(async (tx) => {
      await write(tx, { ...s, phase: 'crashed', know, pending });
      if (alive.length) await tx.insert(schema.gameLogs).values(alive.map((c) => ({ characterId: c.id, kind: 'lore', data: { chapter: 'heli' },
        message: know[c.id] ? `O helicóptero Corvo 2-1, do Fort Ashby, caiu. Pelo rádio: ${name}.` : 'Um helicóptero militar caiu em algum lugar do condado. Dava para ver a fumaça de longe.' })));
    });
    await systemEmote(s.locationId, 'Um helicóptero militar despenca do céu girando e se arrebenta no meio da plantação. Uma bola de fogo, metal retorcido por todo lado — e, no meio da fumaça, vultos se levantando.', 'system');
    for (const cn of connectionsFrom(s.locationId)) await systemEmote(cn.other, 'Um estrondo enorme sacode o chão aqui perto. Uma coluna de fumaça preta sobe logo ali.', 'system');
    emitAll('world:sound', { key: 'gunshot_distant', gain: 1 });
    emitAll('lore:crash', {});
    for (const c of alive) pushSelf(c.id);
    pushScene(s.locationId);
  });
}

// ───────────────────────── Teste (1d6) ─────────────────────────
export async function heliRoll(characterId: number) {
  return withLock('lore:heli', async () => {
    const s = await read();
    if (!s || !s.pending[characterId]) fail('Não há teste para fazer agora.');
    const roll = rng.int(1, 6); const ok = roll >= 3;
    const next = { ...s!, pending: { ...s!.pending }, tests: { ...s!.tests, [characterId]: { roll, ok } }, know: { ...s!.know } };
    delete next.pending[characterId];
    if (ok) next.know[characterId] = true;
    await db.transaction(async (tx) => {
      await write(tx, next);
      await gameLog(tx, characterId, 'lore', ok ? `Teste (1d6): ${roll}. Pela fumaça e pelo barulho, você deduz que o helicóptero caiu em ${siteName(s!)}.` : `Teste (1d6): ${roll}. A fumaça se espalhou com o vento e você não conseguiu dizer onde o helicóptero caiu.`);
    });
    pushSelf(characterId);
    return { ok: true, roll, success: ok, locationId: ok ? s!.locationId : null, locationName: ok ? siteName(s!) : null };
  });
}

/** O que o jogador sabe/vê do capítulo (vai no estado privado). */
export async function heliView(characterId: number) {
  const s = await read();
  if (!s) return null;
  if (s.phase === 'flying') return { phase: 'flying' as const };
  const knows = !!s.know[characterId];
  return {
    phase: s.phase, knows, testPending: !!s.pending[characterId], test: s.tests[characterId] ?? null,
    heardVia: s.heard[characterId] === undefined ? null : s.heard[characterId] || 'próprio rádio',
    locationId: knows ? s.locationId : null, locationName: knows ? siteName(s) : null,
  };
}

/** Destroços na cena do local (qualquer um que chegue lá vê). */
export async function heliSceneInfo(locationId: string) {
  const s = await read();
  if (!s || s.phase !== 'crashed' || s.locationId !== locationId) return null;
  return { zombies: s.zombies, searchesLeft: s.searchesLeft, combatId: s.combatId };
}

// ───────────────────────── Infectados dos destroços ─────────────────────────
/** Vasculhar o local do acidente só depois que os infectados em volta caírem. */
export async function assertHeliSearchable(locationId: string) {
  const s = await read();
  if (s && s.phase === 'crashed' && s.locationId === locationId && s.zombies > 0) fail(`Há ${s.zombies} infectado(s) em volta dos destroços. Enfrente-os antes de vasculhar.`);
}

export async function fightHeli(characterId: number) {
  return withLock('lore:heli', () => withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch);
    const s = await read(tx);
    if (!s || s.phase !== 'crashed' || s.locationId !== ch.locationId) fail('Não há destroços aqui.');
    if (s!.zombies <= 0) fail('Os infectados em volta dos destroços já caíram.');
    if (s!.combatId) {
      const [cb] = await tx.select().from(schema.combats).where(eq(schema.combats.id, s!.combatId));
      if (cb?.status === 'active') fail('Já tem gente lutando nos destroços. Use "Entrar para ajudar" no confronto.');
    }
    const { pickZombies } = await import('./events.js');
    const { startCombat } = await import('./combat.js');
    const zs = pickZombies('field', s!.zombies, ['walker', 'runner', 'wanderer', 'brute'], ch.locationId) as any[];
    // os primeiros são a tripulação do Corvo 2-1
    zs.slice(0, 4).forEach((z, i) => { z.name = ['Piloto infectado', 'Copiloto infectado', 'Soldado Hayes (infectado)', 'Tripulante infectado'][i]; });
    const row = await startCombat(tx, { characters: [ch], locationId: ch.locationId, arenaKey: 'heli_crash', zombieList: zs, calm: { face: [1, 0] }, tag: 'heli',
      reason: 'Destroços do Corvo 2-1: os infectados ainda não perceberam você.' });
    await write(tx, { ...s!, combatId: row.id });
    await systemEmote(ch.locationId, `${ch.firstName} ${ch.lastName} avança, abaixado, na direção dos destroços do helicóptero.`, 'system');
    pushScene(ch.locationId);
    return { ok: true, combatId: row.id };
  }));
}

/** Fim de um confronto nos destroços (chamado de dentro da transação do combate). */
export async function onHeliCombatEnd(tx: Tx, kills: number) {
  const s = await read(tx);
  if (!s || s.phase !== 'crashed') return;
  const zombies = Math.max(0, s.zombies - kills);
  await write(tx, { ...s, zombies, combatId: null });
  if (zombies === 0 && s.zombies > 0) await systemEmote(s.locationId, 'O último infectado em volta do helicóptero cai. Os destroços estão livres: dá para vasculhar.', 'system');
  else if (kills > 0) await systemEmote(s.locationId, `Ainda restam ${zombies} infectado(s) rondando os destroços.`, 'system');
  pushScene(s.locationId);
}

// ───────────────────────── Loot ─────────────────────────
/** Vasculhar os destroços: retorna o que achou, ou null se o local já voltou ao normal. */
export async function heliSearch(tx: Tx, ch: CharRow): Promise<string[] | null> {
  const s = await read(tx);
  if (!s || s.phase !== 'crashed' || s.locationId !== ch.locationId || s.zombies > 0 || s.searchesLeft <= 0) return null;
  const found: string[] = [];
  let carry = carryInfo(await itemsOf(tx, 'character', ch.id), ch);
  const n = rng.int(3, 5);
  for (let k = 0; k < n; k++) {
    const e = rng.weighted(HELI_LOOT.filter((x) => itemDef(x.itemId)), (x) => x.w); if (!e) continue;
    const def = itemDef(e.itemId)!; const qty = e.min ? rng.int(e.min, e.max ?? e.min) : 1;
    const over = carry.weight + def.weight * qty > carry.capacity * 1.5;
    const extra = (def.props as any)?.weaponType === 'ranged' ? { data: { ammo: rng.int(0, Number((def.props as any).magSize ?? 0)) } } : {};
    await addItem(tx, over ? 'location' : 'character', over ? ch.locationId : ch.id, def.id, qty, extra);
    if (!over) carry = { ...carry, weight: carry.weight + def.weight * qty };
    found.push(`${qty > 1 ? `${def.name} ×${qty}` : def.name}${over ? ' (no chão: pesado demais)' : ''}`);
  }
  let letterBy = s.letterBy;
  // a carta: uma só, para quem tiver sorte (garantida até a terceira busca)
  if (!letterBy && (rng.chance(0.5) || SEARCHES - s.searchesLeft >= 2)) {
    await addItem(tx, 'character', ch.id, 'note', 1, { data: { loreNote: LETTER } });
    letterBy = ch.id; found.push('uma carta dobrada');
    emitAll('notify', { text: `${ch.firstName} ${ch.lastName} encontrou uma carta no bolso de um dos soldados do helicóptero.`, level: 'warn', icon: 'note', at: Date.now() });
    await gameLog(tx, ch.id, 'lore', 'Nos destroços do Corvo 2-1, você encontrou uma carta de uma mulher chamada Clara para um dos soldados. Leia no inventário.');
  }
  const searchesLeft = s.searchesLeft - 1;
  await write(tx, { ...s, searchesLeft, letterBy, phase: searchesLeft <= 0 ? 'looted' : 'crashed' });
  if (searchesLeft <= 0) await systemEmote(s.locationId, 'Dos destroços do helicóptero não sobrou mais nada que preste. Só metal queimado.', 'system');
  pushScene(s.locationId);
  return found;
}

export { notify };
