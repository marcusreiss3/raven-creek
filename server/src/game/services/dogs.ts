import { and, eq, inArray } from 'drizzle-orm';
import { db, schema, type Tx } from '../../db/index.js';
import { clamp, rng } from '../rules/rng.js';
import { assertCanAct, withCharacter } from './characters.js';
import { systemEmote } from './chat.js';
import { cfg, clock, getLootTable, itemDef } from './config.js';
import { fail, gameLog } from './infra.js';
import { addItem, carryInfo, consumeItem, itemsOf, type CharRow } from './inventory.js';
import { findCount, rollEntry } from '../rules/loot.js';
import { isUserOnline, notify, pushScene, pushSelf } from './realtime.js';
import { giveXp } from './survival.js';
import { getLocation } from './world.js';

/**
 * Cachorros: aparecem de vez em quando vasculhando casas, ruas e fazendas. Com comida e paciência,
 * viram companheiros: seguem o dono, rosnam quando há infectados, ajudam a farejar loot e na caça,
 * mordem infectados no combate — e podem se ferir e morrer. Mal alimentados, perdem a lealdade e vão embora.
 */
type Dog = typeof schema.companions.$inferSelect;
const D = () => ({ strayChanceOnExplore: 0.04, maxStrays: 3, hungerPerHour: 3, threatMultiplier: 0.6, findBonus: 0.2, combatAssistChance: 0.35,
  scavengeMinutes: 8, scavengeCooldownMinutes: 45, treatCooldownMinutes: 15, petCooldownMinutes: 60, ...((cfg() as any).dogs ?? {}) });
const fullName = (c: CharRow) => `${c.firstName} ${c.lastName}`;
const STRAY_CATEGORIES = new Set(['house', 'street', 'farm', 'field', 'yard', 'camp', 'garage', 'commercial', 'road', 'gas_station']);
const NAMES = ['Rex', 'Bolt', 'Luna', 'Toby', 'Mel', 'Thor', 'Nina', 'Duke', 'Pipoca', 'Faísca', 'Sombra', 'Bento'];
const LOOKS: { variant: DogVariant; look: string }[] = [
  { variant: 'caramelo', look: 'vira-lata caramelo, magro e desconfiado' }, { variant: 'caramelo', look: 'labrador amarelado, sujo de lama' },
  { variant: 'pastor', look: 'pastor-alemão com uma coleira velha' }, { variant: 'pastor', look: 'pastor mestiço de olhos atentos, mancando um pouco' },
  { variant: 'preto', look: 'cachorro preto e forte, com uma orelha rasgada' }, { variant: 'preto', look: 'rottweiler magro, de focinho grisalho' },
];
export type DogVariant = 'caramelo' | 'pastor' | 'preto';
/** Qual das 3 imagens usar (cachorros antigos sem variante são deduzidos pela descrição). */
export function dogVariant(d: Pick<Dog, 'id' | 'data'>): DogVariant {
  const v = d.data.variant as DogVariant | undefined; if (v) return v;
  const look = String(d.data.look ?? '');
  if (/caramelo|labrador|amarel/i.test(look)) return 'caramelo';
  if (/pastor|collie|malhado|caça/i.test(look)) return 'pastor';
  if (/preto|rottweiler/i.test(look)) return 'preto';
  return (['caramelo', 'pastor', 'preto'] as const)[d.id % 3];
}

export async function ownedDog(characterId: number, tx: Tx = db) {
  const [d] = await tx.select().from(schema.companions).where(and(eq(schema.companions.ownerCharacterId, characterId), eq(schema.companions.status, 'owned')));
  return d ?? null;
}
/** Fora, farejando sozinho: não ajuda em nada até voltar. */
const isAway = (d: Pick<Dog, 'data'>) => Number(d.data.awayUntil ?? 0) > Date.now();
const effective = (d: Dog | null) => !!d && d.health >= 20 && !isAway(d);
/** O cachorro está aqui e em condições de ajudar (combate, caça, achados). */
export const dogAvailable = (d: Dog | null) => effective(d);

/** Bônus de achados ao vasculhar com o cachorro junto. */
export async function dogFindBonus(characterId: number, tx: Tx = db) { return effective(await ownedDog(characterId, tx)) ? 1 + D().findBonus : 1; }
export async function dogHuntBonus(characterId: number) { return effective(await ownedDog(characterId)) ? 0.15 : 0; }
/** Cachorro atento no local: infectados acham o grupo com menos frequência (ele avisa antes). */
export async function dogThreatMultiplier(characterIds: number[], tx: Tx = db) {
  if (!characterIds.length) return 1;
  const dogs = await tx.select().from(schema.companions).where(and(inArray(schema.companions.ownerCharacterId, characterIds), eq(schema.companions.status, 'owned')));
  return dogs.some((d) => effective(d)) ? D().threatMultiplier : 1;
}

/** Cachorros visíveis num local: de rua ali + companheiros de quem está ali. */
export async function dogsAt(locationId: string, presentCharacterIds: number[], tx: Tx = db) {
  const strays = await tx.select().from(schema.companions).where(and(eq(schema.companions.locationId, locationId), eq(schema.companions.status, 'stray')));
  const owned = presentCharacterIds.length ? await tx.select().from(schema.companions).where(and(inArray(schema.companions.ownerCharacterId, presentCharacterIds), eq(schema.companions.status, 'owned'))) : [];
  return [...strays, ...owned].map((d) => ({ id: d.id, name: d.status === 'stray' ? 'Cachorro de rua' : d.name, ownerId: d.ownerCharacterId, status: d.status, look: String(d.data.look ?? ''), variant: dogVariant(d), health: Math.round(d.health), trust: Math.round(d.trust), away: isAway(d) }));
}

export async function maybeSpawnStray(tx: Tx, locationId: string) {
  const loc = getLocation(locationId); if (!loc || !STRAY_CATEGORIES.has(loc.category)) return null;
  if (!rng.chance(D().strayChanceOnExplore)) return null;
  const strays = await tx.select().from(schema.companions).where(eq(schema.companions.status, 'stray'));
  if (strays.length >= D().maxStrays || strays.some((s) => s.locationId === locationId)) return null;
  const pick = rng.pick(LOOKS);
  const [d] = await tx.insert(schema.companions).values({ name: rng.pick(NAMES), locationId, status: 'stray', health: rng.range(55, 90), hunger: rng.range(55, 85), data: { look: pick.look, variant: pick.variant } }).returning();
  await systemEmote(locationId, `Um cachorro aparece entre os escombros — ${d.data.look}. Ele observa vocês de longe, faminto.`);
  return d;
}

export async function tameDog(characterId: number, dogId: number, itemId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: true });
    const [d] = await tx.select().from(schema.companions).where(eq(schema.companions.id, dogId)).for('update');
    if (!d || d.status !== 'stray' || d.locationId !== ch.locationId) fail('Não há cachorro de rua aqui.');
    if (await ownedDog(ch.id, tx)) fail('Você já tem um cachorro.');
    const items = await itemsOf(tx, 'character', ch.id);
    const it = items.find((i) => i.id === itemId); const def = it ? itemDef(it.defId) : null;
    if (!it || def?.category !== 'food') fail('Ofereça comida.');
    await consumeItem(tx, it!.id, 'character', ch.id, 1);
    const meaty = /meat|fish/.test(def!.id);
    const surv = ch.skills.survival?.level ?? 0;
    const trust = clamp(d!.trust + (meaty ? 40 : 22) + surv * 3 + rng.range(-8, 8), 0, 100);
    const hunger = clamp(d!.hunger + Number(def!.props.hunger ?? -15), 0, 100);
    if (trust >= 70) {
      await tx.update(schema.companions).set({ status: 'owned', ownerCharacterId: ch.id, trust, loyalty: 60, hunger, lastTickAt: new Date() }).where(eq(schema.companions.id, d!.id));
      await systemEmote(ch.locationId, `O cachorro come da mão de ${fullName(ch)}, abana o rabo e encosta na perna. Ele decidiu ficar.`);
      await gameLog(tx, ch.id, 'event', 'Um cachorro passou a te seguir. Dê um nome a ele no painel do personagem.');
      await giveXp(tx, ch, 'survival', 10, 'tame_dog');
      notify(ch.userId, 'Você ganhou um companheiro! Abra o painel do personagem (P) para dar um nome e cuidar dele.', 'success');
      pushSelf(ch.id); pushScene(ch.locationId);
      return { ok: true, tamed: true };
    }
    await tx.update(schema.companions).set({ trust, hunger }).where(eq(schema.companions.id, d!.id));
    await systemEmote(ch.locationId, trust > 40 ? `O cachorro pega ${def!.name.toLowerCase()} e fica mais perto de ${fullName(ch)}, ainda desconfiado.` : `O cachorro arranca ${def!.name.toLowerCase()} da mão de ${fullName(ch)} e recua alguns passos.`);
    pushScene(ch.locationId);
    return { ok: true, tamed: false, trust: Math.round(trust) };
  });
}

export async function feedDog(characterId: number, itemId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: true, allowTravel: true });
    const d = await ownedDog(ch.id, tx); if (!d) fail('Você não tem cachorro.');
    const items = await itemsOf(tx, 'character', ch.id);
    const it = items.find((i) => i.id === itemId); const def = it ? itemDef(it.defId) : null;
    if (!it || def?.category !== 'food') fail('Escolha uma comida.');
    await consumeItem(tx, it!.id, 'character', ch.id, 1);
    const sick = def!.props.spoiled && rng.chance(0.3);
    await tx.update(schema.companions).set({
      hunger: clamp(d!.hunger + Number(def!.props.hunger ?? -15) * 1.3, 0, 100), loyalty: clamp(d!.loyalty + (/meat|fish/.test(def!.id) ? 8 : 5), 0, 100),
      health: clamp(d!.health - (sick ? 10 : 0), 0, 100),
    }).where(eq(schema.companions.id, d!.id));
    await systemEmote(ch.locationId, `${fullName(ch)} dá ${def!.name.toLowerCase()} para ${d!.name}${sick ? ', que vomita logo depois' : ', que devora tudo'}.`);
    pushSelf(ch.id);
    return { ok: true };
  });
}

export async function renameDog(characterId: number, name: string) {
  const clean = name.replace(/[^\p{L}\p{N} '-]/gu, '').trim().slice(0, 20);
  if (clean.length < 2) fail('Nome muito curto.');
  const d = await ownedDog(characterId); if (!d) fail('Você não tem cachorro.');
  await db.update(schema.companions).set({ name: clean }).where(eq(schema.companions.id, d!.id));
  pushSelf(characterId);
  return { ok: true };
}

export async function releaseDog(characterId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    const d = await ownedDog(ch.id, tx); if (!d) fail('Você não tem cachorro.');
    await tx.update(schema.companions).set({ status: 'stray', ownerCharacterId: null, locationId: ch.locationId, trust: 30, loyalty: 0 }).where(eq(schema.companions.id, d!.id));
    await systemEmote(ch.locationId, `${fullName(ch)} solta ${d!.name}. O cachorro fica parado, olhando, sem entender.`);
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true };
  });
}

/** Fome, saúde e lealdade dos cachorros com dono (só avança enquanto o dono está conectado). */
export async function processDogs() {
  const dogs = await db.select().from(schema.companions).where(eq(schema.companions.status, 'owned'));
  if (!dogs.length) return;
  const owners = await db.select().from(schema.characters).where(inArray(schema.characters.id, dogs.map((d) => d.ownerCharacterId!).filter(Boolean)));
  const now = Date.now();
  for (const d of dogs) {
    const o = owners.find((x) => x.id === d.ownerCharacterId);
    const hours = (now - d.lastTickAt.getTime()) / 3_600_000;
    if (!o || !o.alive) {
      await db.update(schema.companions).set({ status: 'stray', ownerCharacterId: null, locationId: o?.locationId ?? d.locationId, trust: 20, loyalty: 0 }).where(eq(schema.companions.id, d.id));
      if (o) await systemEmote(o.locationId, `${d.name} fica ao lado do corpo do dono, uivando baixo.`);
      continue;
    }
    if (!isUserOnline(o.userId)) { await db.update(schema.companions).set({ lastTickAt: new Date(now), locationId: o.locationId }).where(eq(schema.companions.id, d.id)); continue; }
    const hunger = clamp(d.hunger + D().hungerPerHour * hours, 0, 100);
    const loyalty = clamp(d.loyalty + (hunger > 80 ? -4 : hunger < 50 ? 0.5 : 0) * hours, 0, 100);
    const health = clamp(d.health + (hunger < 60 ? 2 : hunger > 95 ? -2 : 0) * hours, 0, 100);
    const warned = Boolean(d.data.warnedHunger);
    if (hunger > 80 && !warned) notify(o.userId, `${d.name} está com fome e choraminga perto de você.`, 'warn');
    if (loyalty <= 0) {
      await db.update(schema.companions).set({ status: 'stray', ownerCharacterId: null, locationId: o.locationId, trust: 10, loyalty: 0, hunger, health }).where(eq(schema.companions.id, d.id));
      await systemEmote(o.locationId, `Faminto, ${d.name} se afasta de ${fullName(o)} e não volta quando chamado.`);
      notify(o.userId, `${d.name} foi embora. Cachorro com fome não fica.`, 'danger');
      pushSelf(o.id); pushScene(o.locationId);
      continue;
    }
    if (health <= 0) {
      await db.update(schema.companions).set({ status: 'dead', health: 0 }).where(eq(schema.companions.id, d.id));
      await systemEmote(o.locationId, `${d.name} deita e não levanta mais.`);
      notify(o.userId, `${d.name} morreu.`, 'danger'); pushSelf(o.id); continue;
    }
    await db.update(schema.companions).set({ hunger, loyalty, health, locationId: o.locationId, lastTickAt: new Date(now), data: { ...d.data, warnedHunger: hunger > 80 } }).where(eq(schema.companions.id, d.id));
  }
}

/** Depois de um combate, o cachorro pode ter se machucado (ou morrido). */
export async function dogAfterCombat(tx: Tx, characterId: number, rounds: number, fought: number) {
  const d = await ownedDog(characterId, tx); if (!d) return;
  const chance = clamp(0.12 + fought * 0.12 + rounds * 0.02, 0, 0.7);
  if (!rng.chance(chance)) return;
  const dmg = rng.range(15, 45); const health = Math.max(0, d.health - dmg);
  const [o] = await tx.select().from(schema.characters).where(eq(schema.characters.id, characterId));
  if (health <= 0) {
    await tx.update(schema.companions).set({ status: 'dead', health: 0 }).where(eq(schema.companions.id, d.id));
    if (o) { await systemEmote(o.locationId, `${d.name} foi pego pelos infectados. Não há mais nada a fazer por ele.`); notify(o.userId, `${d.name} morreu protegendo você.`, 'danger'); await gameLog(tx, o.id, 'event', `${d.name} morreu em combate.`); }
  } else {
    await tx.update(schema.companions).set({ health }).where(eq(schema.companions.id, d.id));
    if (o) notify(o.userId, `${d.name} saiu machucado do confronto (${Math.round(health)}% de saúde).`, 'warn');
  }
}

/** Para a interface: o cachorro do personagem. */
export async function dogView(characterId: number, tx: Tx = db) {
  const d = await ownedDog(characterId, tx);
  if (!d) return null;
  const iso = (k: string) => (Number(d.data[k] ?? 0) > Date.now() ? new Date(Number(d.data[k])).toISOString() : null);
  return {
    id: d.id, name: d.name, look: String(d.data.look ?? ''), variant: dogVariant(d), health: Math.round(d.health), hunger: Math.round(d.hunger), loyalty: Math.round(d.loyalty),
    awayUntil: iso('awayUntil'), scavengeReadyAt: iso('scavengeReadyAt'), treatReadyAt: iso('treatReadyAt'), petReadyAt: iso('petReadyAt'),
  };
}

// ───────────────────────── Cuidar, farejar, carinho ─────────────────────────
/** Quanto cada item médico recupera da saúde do cachorro. */
const DOG_MEDS: Record<string, number> = {
  first_aid_kit: 45, surgical_supplies: 35, suture_kit: 30, antibiotics: 25, bandage: 20, splint: 15, rag: 12, antiseptic: 10, painkillers: 8, dirty_rag: 6,
};
export const dogMedItems = () => Object.keys(DOG_MEDS);

/** Tratar o cachorro com um item médico (precisa de um intervalo entre curativos). */
export async function treatDog(characterId: number, itemId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: true, allowTravel: true });
    const d = await ownedDog(ch.id, tx); if (!d) fail('Você não tem cachorro.');
    if (isAway(d!)) fail(`${d!.name} ainda não voltou.`);
    if (d!.health >= 100) fail(`${d!.name} está inteiro.`);
    const wait = Number(d!.data.treatReadyAt ?? 0) - Date.now();
    if (wait > 0) fail(`Deixe o último curativo de ${d!.name} assentar. Mais ${Math.ceil(wait / 60000)} min.`);
    const items = await itemsOf(tx, 'character', ch.id);
    const it = items.find((i) => i.id === itemId);
    const base = it ? DOG_MEDS[it.defId] : undefined;
    if (!it || !base) fail('Use um item médico: curativo, trapo, kit de primeiros socorros, antibiótico…');
    await consumeItem(tx, it!.id, 'character', ch.id, 1);
    const med = ch.skills.medical?.level ?? 0;
    const gain = base! * (1 + med * 0.08) * (ch.profession === 'doctor' || ch.profession === 'nurse' || ch.profession === 'hunter' || ch.profession === 'farmer' ? 1.25 : 1);
    const health = clamp(d!.health + gain, 0, 100);
    await tx.update(schema.companions).set({ health, loyalty: clamp(d!.loyalty + 3, 0, 100), data: { ...d!.data, treatReadyAt: Date.now() + D().treatCooldownMinutes * 60000 } }).where(eq(schema.companions.id, d!.id));
    const name = itemDef(it!.defId)?.name.toLowerCase() ?? 'o curativo';
    await systemEmote(ch.locationId, `${fullName(ch)} cuida dos machucados de ${d!.name} com ${name}. Ele lambe a mão de quem ajudou.`);
    await giveXp(tx, ch, 'medical', 2, `dog_treat_${d!.id}`);
    notify(ch.userId, `${d!.name}: saúde ${Math.round(d!.health)}% → ${Math.round(health)}%.`, 'success', 'dog');
    pushSelf(ch.id);
    return { ok: true, health: Math.round(health) };
  });
}

/** Mandar o cachorro farejar o local sozinho: traz coisas pequenas que achar. Tem tempo de recarga. */
export async function sendDogScavenge(characterId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: true });
    if (ch.state === 'traveling') fail('Na estrada não dá para mandar o cachorro sozinho.');
    const d = await ownedDog(ch.id, tx); if (!d) fail('Você não tem cachorro.');
    if (isAway(d!)) fail(`${d!.name} já está farejando por aí.`);
    if (d!.health < 40) fail(`${d!.name} está machucado demais para sair sozinho. Cuide dele primeiro.`);
    if (d!.hunger > 75) fail(`${d!.name} está com fome demais e não sai do seu lado. Dê comida antes.`);
    const wait = Number(d!.data.scavengeReadyAt ?? 0) - Date.now();
    if (wait > 0) fail(`${d!.name} ainda está cansado da última volta. Mais ${Math.ceil(wait / 60000)} min.`);
    const loc = getLocation(ch.locationId);
    if (!loc?.lootTableId) fail('Não tem nada aqui para farejar.');
    const runAt = new Date(Date.now() + D().scavengeMinutes * 60000);
    await tx.insert(schema.jobs).values({ kind: 'dog_scavenge', characterId: ch.id, runAt, payload: { dogId: d!.id, locationId: ch.locationId } });
    await tx.update(schema.companions).set({ data: { ...d!.data, awayUntil: runAt.getTime(), scavengeReadyAt: Date.now() + D().scavengeCooldownMinutes * 60000 } }).where(eq(schema.companions.id, d!.id));
    await systemEmote(ch.locationId, `${fullName(ch)} faz um sinal e ${d!.name} sai farejando pelos cantos de ${loc!.name}.`);
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true, minutes: D().scavengeMinutes };
  });
}

/** Itens que um cachorro consegue carregar na boca. */
const DOG_CARRY_CATS = new Set(['food', 'medical', 'misc', 'clothing', 'ammo', 'water']);

export async function completeDogScavenge(characterId: number, dogId: number, locationId: string) {
  return withCharacter(characterId, async (tx, ch) => {
    const [d] = await tx.select().from(schema.companions).where(eq(schema.companions.id, dogId)).for('update');
    if (!d || d.status !== 'owned' || d.ownerCharacterId !== ch.id) return { skipped: true };
    const loc = getLocation(locationId);
    const [ll] = await tx.select().from(schema.locationLoot).where(eq(schema.locationLoot.locationId, locationId)).for('update');
    const table = loc?.lootTableId ? getLootTable(loc.lootTableId) : null;
    const found: string[] = [];
    let health = d.health; let hurt = false;
    if (ll && table) {
      const hours = (Date.now() - ll.lastRegenAt.getTime()) / 3_600_000;
      let reserve = Math.min(ll.maxReserve, ll.reserve + ll.regenPerHour * hours);
      const e = cfg().exploration;
      const count = Math.min(2, findCount({ reserveRatio: reserve / ll.maxReserve, skillLevel: 0, perception: 6, lightMult: 1, findMult: 0.8, baseFinds: 1.4, repeatPenalty: 0, minRatio: e.minReserveRatioToFind }));
      const entries = table.entries.filter((x) => { const def = itemDef(x.itemId); return !!def && def.weight <= 1.2 && DOG_CARRY_CATS.has(def.category); });
      let carry = carryInfo(await itemsOf(tx, 'character', ch.id), ch);
      for (let i = 0; i < count && entries.length; i++) {
        const entry = rollEntry(entries, clock().isDark, loc!.tags);
        const def = entry ? itemDef(entry.itemId) : null; if (!entry || !def) continue;
        const cost = entry.cost ?? (e.reserveCost as Record<string, number>)[def.rarity] ?? 5;
        if (reserve < cost) continue;
        reserve -= cost;
        const qty = Math.max(1, Math.min(entry.max, rng.int(entry.min, entry.max), def.category === 'ammo' ? 4 : 2));
        const over = carry.weight + def.weight * qty > carry.capacity * 1.5;
        await addItem(tx, over ? 'location' : 'character', over ? ch.locationId : ch.id, def.id, qty);
        if (!over) carry = { ...carry, weight: carry.weight + def.weight * qty };
        found.push(qty > 1 ? `${def.name} ×${qty}` : def.name);
      }
      await tx.update(schema.locationLoot).set({ reserve, lastRegenAt: new Date() }).where(eq(schema.locationLoot.locationId, locationId));
      // lugar com infectados: o cachorro pode voltar machucado
      if (ll.zombies > 0 && rng.chance(Math.min(0.35, 0.08 + (loc?.danger ?? 0.3) * 0.25))) { hurt = true; health = Math.max(5, health - rng.range(10, 25)); }
    }
    await tx.update(schema.companions).set({ health, hunger: clamp(d.hunger + 8, 0, 100), data: { ...d.data, awayUntil: 0 } }).where(eq(schema.companions.id, d.id));
    const text = found.length ? `${d.name} volta abanando o rabo e larga aos seus pés: ${found.join(', ')}.` : `${d.name} volta de boca vazia, cheirando a poeira.`;
    await systemEmote(ch.locationId, `${d.name} volta correndo para ${fullName(ch)}${found.length ? ' com alguma coisa na boca' : ''}.`);
    await gameLog(tx, ch.id, 'event', text + (hurt ? ` Ele está mancando: os infectados de lá o pegaram de raspão.` : ''));
    notify(ch.userId, text + (hurt ? ` Ele voltou machucado (${Math.round(health)}% de saúde).` : ''), found.length ? 'success' : 'info', 'dog');
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true, found };
  });
}

/** Carinho no cachorro: alivia o estresse do dono (de hora em hora). */
export async function petDog(characterId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: true, allowTravel: true });
    const d = await ownedDog(ch.id, tx); if (!d) fail('Você não tem cachorro.');
    if (isAway(d!)) fail(`${d!.name} ainda não voltou.`);
    const wait = Number(d!.data.petReadyAt ?? 0) - Date.now();
    if (wait > 0) fail(`${d!.name} já ganhou carinho agora há pouco. Mais ${Math.ceil(wait / 60000)} min.`);
    const stress = clamp(ch.needs.stress - 8, 0, 100);
    await tx.update(schema.characters).set({ needs: { ...ch.needs, stress } }).where(eq(schema.characters.id, ch.id));
    await tx.update(schema.companions).set({ loyalty: clamp(d!.loyalty + 2, 0, 100), data: { ...d!.data, petReadyAt: Date.now() + D().petCooldownMinutes * 60000 } }).where(eq(schema.companions.id, d!.id));
    if (ch.state !== 'traveling') await systemEmote(ch.locationId, `${fullName(ch)} se agacha e coça atrás da orelha de ${d!.name}. Por um instante, o mundo parece menos ruim.`);
    pushSelf(ch.id);
    return { ok: true };
  });
}
