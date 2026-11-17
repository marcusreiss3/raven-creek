import { and, eq, inArray, ne } from 'drizzle-orm';
import { drink, smoke } from '../rules/addiction.js';
import { schema, type Tx } from '../../db/index.js';
import { charMod } from '../content/character.js';
import { EQUIP_SLOTS, REGION_NAMES, type EquipSlot } from '../content/items.js';
import { WOUND_TYPES, amputatedRegions, computeBodyMods, makeWound, type WoundType } from '../rules/body.js';
import { grantXp } from '../rules/progression.js';
import { clamp, rng } from '../rules/rng.js';
import { assertCanAct, conditionsOf, withCharacter, withTwoCharacters, woundsOf } from './characters.js';
import { cfg, clock, itemDef } from './config.js';
import { fail, gameLog } from './infra.js';
import { addItem, carryInfo, consumeItem, hasTool as hasToolIn, itemsOf, salvageOf, transferItem, type CharRow, type ItemRow } from './inventory.js';
import { isUserOnline, notify, pushScene, pushSelf } from './realtime.js';
import { systemEmote } from './chat.js';
import { isDowned, reviveInTx } from './death.js';

const fullName = (c: CharRow) => `${c.firstName} ${c.lastName}`;

/** Professor ensina: quem está no mesmo lugar que um professor conectado aprende 25% mais rápido. */
export async function teacherBonus(tx: Tx, ch: { id: number; locationId: string }) {
  const t = await tx.select({ userId: schema.characters.userId }).from(schema.characters)
    .where(and(eq(schema.characters.locationId, ch.locationId), eq(schema.characters.profession, 'teacher'), eq(schema.characters.alive, true), ne(schema.characters.id, ch.id)));
  return t.some((x) => isUserOnline(x.userId)) ? 1.25 : 1;
}

async function giveXp(tx: Tx, ch: CharRow, skill: string, xp: number, key: string, maxLevel?: number) {
  xp *= await teacherBonus(tx, ch);
  const r = grantXp(ch.skills, ch.xpLedger, skill, xp, key, Date.now(), cfg(), { profession: ch.profession, traits: ch.traits, intellect: ch.attributes.intellect ?? 4, maxLevelFromSource: maxLevel });
  ch.skills = r.skills; ch.xpLedger = r.ledger;
  await tx.update(schema.characters).set({ skills: r.skills, xpLedger: r.ledger }).where(eq(schema.characters.id, ch.id));
  if (r.levelUp) notify(ch.userId, `Habilidade aprimorada: ${skill} nível ${r.skills[skill].level}.`, 'success');
  return r;
}
export { giveXp };

async function ownedItem(tx: Tx, ch: CharRow, itemId: number) {
  const [it] = await tx.select().from(schema.items).where(and(eq(schema.items.id, itemId), eq(schema.items.ownerType, 'character'), eq(schema.items.ownerId, String(ch.id))));
  if (!it) fail('Você não possui esse item.', 'item_gone');
  return it!;
}

/** Estão juntos? No mesmo lugar (ninguém viajando) ou no mesmo grupo de viagem. */
export async function sameSpot(tx: Tx, a: CharRow, b: CharRow) {
  if (a.state !== 'traveling' && b.state !== 'traveling') return a.locationId === b.locationId;
  if (a.state !== 'traveling' || b.state !== 'traveling') return false;
  const live = ['active', 'paused', 'awaiting_decision', 'combat'];
  const rows = await tx.select({ characterId: schema.travels.characterId, groupId: schema.travels.groupId, status: schema.travels.status }).from(schema.travels)
    .where(inArray(schema.travels.characterId, [a.id, b.id]));
  const ga = rows.find((r) => r.characterId === a.id && live.includes(r.status)); const gb = rows.find((r) => r.characterId === b.id && live.includes(r.status));
  return !!ga && !!gb && ga.groupId === gb.groupId;
}

// ───────────────────────── Inventário ─────────────────────────
export async function pickUp(characterId: number, itemId: number, qty?: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: false });
    const it = await transferItem(tx, itemId, { type: 'location', id: ch.locationId }, { type: 'character', id: ch.id }, qty);
    const items = await itemsOf(tx, 'character', ch.id);
    const carry = carryInfo(items, ch);
    if (carry.ratio > 1.6) fail('Peso demais. Largue algo antes de pegar isso.');
    await systemEmote(ch.locationId, `${fullName(ch)} pega ${itemDef(it.defId)?.name}.`);
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true };
  });
}

export async function dropItem(characterId: number, itemId: number, qty?: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: true });
    const it = await transferItem(tx, itemId, { type: 'character', id: ch.id }, { type: 'location', id: ch.locationId }, qty);
    await systemEmote(ch.locationId, `${fullName(ch)} larga ${itemDef(it.defId)?.name} no chão.`);
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true };
  });
}

export async function giveItem(characterId: number, targetId: number, itemId: number, qty?: number) {
  return withTwoCharacters(characterId, targetId, async (tx, ch, target) => {
    assertCanAct(ch, { allowBusy: true, allowTravel: true });
    if (!target.alive || !(await sameSpot(tx, ch, target))) fail('Essa pessoa não está aqui.');
    const it = await transferItem(tx, itemId, { type: 'character', id: ch.id }, { type: 'character', id: target.id }, qty);
    if (ch.state !== 'traveling') await systemEmote(ch.locationId, `${fullName(ch)} entrega ${itemDef(it.defId)?.name} para ${fullName(target)}.`);
    await gameLog(tx, target.id, 'trade', `${fullName(ch)} entregou ${itemDef(it.defId)?.name} para você.`);
    pushSelf(ch.id); pushSelf(target.id);
    return { ok: true };
  });
}

export async function containerItems(tx: Tx, containerId: number) { return itemsOf(tx, 'container', containerId); }

async function assertContainerAccess(tx: Tx, ch: CharRow, containerId: number) {
  const [ct] = await tx.select().from(schema.containers).where(eq(schema.containers.id, containerId));
  if (!ct || ct.locationId !== ch.locationId) fail('Esse contêiner não está aqui.');
  if (ct!.baseId) {
    const [base] = await tx.select().from(schema.bases).where(eq(schema.bases.id, ct!.baseId));
    if (base) {
      let allowed = base.ownerCharacterId === ch.id;
      if (!allowed && base.factionId) {
        const [m] = await tx.select().from(schema.factionMembers).where(and(eq(schema.factionMembers.factionId, base.factionId), eq(schema.factionMembers.characterId, ch.id)));
        allowed = !!m && m.rank !== 'recruit';
      }
      if (!allowed) fail('Este estoque pertence a outra base. Arrombá-lo exige invadir a base (pendente).');
    }
  }
  return ct!;
}
export async function storeItem(characterId: number, itemId: number, containerId: number, qty?: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: true });
    const ct = await assertContainerAccess(tx, ch, containerId);
    const inside = await itemsOf(tx, 'container', containerId);
    const it = await transferItem(tx, itemId, { type: 'character', id: ch.id }, { type: 'container', id: containerId }, qty);
    const used = inside.reduce((s, i) => s + (itemDef(i.defId)?.weight ?? 0) * i.quantity, 0) + (itemDef(it.defId)?.weight ?? 0) * it.quantity;
    if (used > ct.capacity) fail(`${ct.name} está cheio.`);
    if (ct.baseId) await gameLog(tx, ch.id, 'base', `Guardou ${itemDef(it.defId)?.name} em ${ct.name}.`, { baseId: ct.baseId });
    pushSelf(ch.id);
    return { ok: true };
  });
}
export async function takeFromContainer(characterId: number, itemId: number, containerId: number, qty?: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: true });
    const ct = await assertContainerAccess(tx, ch, containerId);
    const it = await transferItem(tx, itemId, { type: 'container', id: containerId }, { type: 'character', id: ch.id }, qty);
    if (ct.baseId || ct.kind === 'corpse') await gameLog(tx, ch.id, ct.kind === 'corpse' ? 'theft' : 'base', `Retirou ${itemDef(it.defId)?.name} de ${ct.name}.`, { containerId });
    if (ct.kind === 'stash') { const { markStashClaimed } = await import('./stories.js'); await markStashClaimed(tx, containerId, ch); }
    pushSelf(ch.id);
    return { ok: true };
  });
}

export async function equip(characterId: number, itemId: number, slot?: EquipSlot) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: true, allowCombat: false, allowTravel: true });
    const it = await ownedItem(tx, ch, itemId);
    return equipInTx(tx, ch, it, slot);
  });
}
export async function equipInTx(tx: Tx, ch: CharRow, it: ItemRow, slot?: EquipSlot) {
  const d = itemDef(it.defId)!;
  const target = slot ?? (d.equipSlot as EquipSlot | null);
  if (!target || !EQUIP_SLOTS.includes(target)) fail('Esse item não pode ser equipado.');
  const weaponSlots = ['primary', 'secondary'];
  if (weaponSlots.includes(target!) ? !d.props.weaponType && d.category !== 'weapon' && d.category !== 'tool' : d.equipSlot !== target) fail('Encaixe incompatível.');
  const wounds = await woundsOf(tx, ch.id);
  const mods = computeBodyMods(wounds, ch.amputations, ch.needs);
  if (target === 'primary' && d.props.twoHanded && !mods.canUseTwoHanded) fail('Seus ferimentos ou amputações impedem usar armas de duas mãos.');
  if (target === 'gloves' && mods.usableHands === 0) fail('Você não tem mãos para usar luvas.');
  const items = await itemsOf(tx, 'character', ch.id);
  const current = items.find((i) => i.slot === target && i.id !== it.id);
  if (current) await tx.update(schema.items).set({ slot: null }).where(eq(schema.items.id, current.id));
  await tx.update(schema.items).set({ slot: target }).where(eq(schema.items.id, it.id));
  pushSelf(ch.id);
  return { ok: true };
}
export async function unequip(characterId: number, itemId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: true, allowTravel: true });
    await ownedItem(tx, ch, itemId);
    await tx.update(schema.items).set({ slot: null }).where(eq(schema.items.id, itemId));
    pushSelf(ch.id);
    return { ok: true };
  });
}

/** Recarrega a arma equipada com munição compatível do inventário. Retorna a munição carregada. */
export async function reloadInTx(tx: Tx, ch: CharRow) {
  const items = await itemsOf(tx, 'character', ch.id);
  const weapon = items.find((i) => i.slot === 'primary');
  const d = weapon && itemDef(weapon.defId);
  if (!weapon || !d || d.props.weaponType !== 'ranged') fail('Você não está empunhando uma arma de fogo.');
  const loaded = Number(weapon!.data.ammo ?? 0); const need = Number(d!.props.magSize) - loaded;
  if (need <= 0) fail('A arma já está carregada.');
  const stacks = items.filter((i) => i.defId === d!.props.ammoType);
  const available = stacks.reduce((s, i) => s + i.quantity, 0);
  if (!available) fail('Sem munição compatível.');
  let take = Math.min(need, available); const total = take;
  for (const s of stacks) { if (take <= 0) break; const n = Math.min(take, s.quantity); await consumeItem(tx, s.id, 'character', ch.id, n); take -= n; }
  await tx.update(schema.items).set({ data: { ...weapon!.data, ammo: loaded + total } }).where(eq(schema.items.id, weapon!.id));
  return { ammo: loaded + total, itemId: weapon!.id };
}
export async function reload(characterId: number) {
  return withCharacter(characterId, async (tx, ch) => { assertCanAct(ch, { allowBusy: true, allowTravel: true }); const r = await reloadInTx(tx, ch); pushSelf(ch.id); return { ok: true, ...r }; });
}
export async function unloadWeapon(characterId: number, itemId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: true });
    const it = await ownedItem(tx, ch, itemId); const d = itemDef(it.defId)!;
    const ammo = Number(it.data.ammo ?? 0); if (!ammo) fail('A arma está vazia.');
    await tx.update(schema.items).set({ data: { ...it.data, ammo: 0 } }).where(eq(schema.items.id, it.id));
    await addItem(tx, 'character', ch.id, d.props.ammoType, ammo);
    pushSelf(ch.id); return { ok: true };
  });
}

// ───────────────────────── Consumir ─────────────────────────
async function startDisease(tx: Tx, ch: CharRow, kind: string, msg: string) {
  const existing = (await conditionsOf(tx, ch.id)).find((c) => c.kind === kind);
  if (existing) return;
  await tx.insert(schema.conditions).values({ characterId: ch.id, kind, durationHours: (cfg().diseases.durationsHours as Record<string, number>)[kind] ?? 8, discovered: true, stage: 1 });
  await gameLog(tx, ch.id, 'disease', msg);
}

export async function useItem(characterId: number, itemId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: false, allowTravel: true });
    const it = await ownedItem(tx, ch, itemId); const d = itemDef(it.defId)!; const p = d.props; const n = { ...ch.needs };
    const msgs: string[] = []; const c = cfg().diseases;
    if (d.category === 'food' || d.category === 'water') {
      if (p.plantable) fail('Sementes devem ser plantadas numa base.');
      if (p.container) fail('O cantil está vazio. Encha-o em um riacho ou lago (use "Vasculhar" lá).');
      if (p.doses && it.durability > 1) await tx.update(schema.items).set({ durability: it.durability - 1 }).where(eq(schema.items.id, it.id));
      else await consumeItem(tx, it.id, 'character', ch.id, 1);
      const mealMult = d.id === 'cooked_meal' ? charMod(ch.profession, ch.traits, 'mealBonus') : 1;
      if (p.hunger) n.hunger = clamp(n.hunger + p.hunger * mealMult, 0, 100);
      if (p.thirst) n.thirst = clamp(n.thirst + p.thirst, 0, 100);
      if (p.stress) n.stress = clamp(n.stress + p.stress, 0, 100);
      if (p.refill) await addItem(tx, 'character', ch.id, p.refill, 1);
      const poisonMult = charMod(ch.profession, ch.traits, 'foodPoison');
      if (p.spoiled && rng.chance(c.foodPoisoningFromSpoiled * poisonMult)) await startDisease(tx, ch, 'food_poisoning', 'Seu estômago revira. Algo que você comeu estava estragado.');
      if (p.raw && rng.chance(c.foodPoisoningFromRaw * poisonMult)) await startDisease(tx, ch, 'food_poisoning', 'Carne crua não foi uma boa ideia.');
      if (p.dirty && rng.chance(c.waterborneFromDirty)) await startDisease(tx, ch, 'waterborne', 'A água tinha um gosto estranho… cólicas começam.');
      if (p.alcohol) drink(n, Number(p.alcohol), cfg());
      msgs.push(`${fullName(ch)} ${d.category === 'food' ? 'come' : 'bebe'} ${p.doses ? 'um gole de ' : ''}${d.name.toLowerCase()}.`);
    } else if (p.smokable) {
      if (!hasToolIn(await itemsOf(tx, 'character', ch.id), 'fire')) fail('Você precisa de um isqueiro ou fósforos para acender.');
      await consumeItem(tx, it.id, 'character', ch.id, 1);
      n.stress = clamp(n.stress + (p.stress ?? -15), 0, 100);
      smoke(n, cfg());
      msgs.push(`${fullName(ch)} acende um cigarro e traga fundo.`);
    } else if (d.category === 'book') {
      return startReading(tx, ch, it);
    } else if (d.category === 'medical') {
      fail('Use itens médicos pelo painel do corpo, escolhendo o ferimento.');
    } else if (d.category === 'vehicle') {
      fail('Use peças e combustível pelo painel do veículo.');
    } else fail('Não há uso direto para este item.');
    await tx.update(schema.characters).set({ needs: n }).where(eq(schema.characters.id, ch.id));
    if (ch.state !== 'traveling') for (const m of msgs) await systemEmote(ch.locationId, m);
    pushSelf(ch.id);
    return { ok: true };
  });
}

// ───────────────────────── Leitura ─────────────────────────
/** Ler um livro leva vários minutos: o personagem fica ocupado (sem poder fazer mais nada) até terminar ou desistir. */
async function startReading(tx: Tx, ch: CharRow, it: ItemRow) {
  const d = itemDef(it.defId)!;
  if (ch.state === 'traveling') fail('Não dá para estudar andando. Leia quando estiver parado num lugar.');
  const key = `read:${d.id}`;
  if (ch.knownRecipes.includes(key)) fail('Você já leu este material. Passe-o adiante.');
  if (clock().isDark && !(await itemsOf(tx, 'character', ch.id)).some((i) => itemDef(i.defId)?.props.light)) fail('Está escuro demais para ler sem uma lanterna.');
  // Intelecto alto lê um pouco mais rápido, mas nunca menos de 5 minutos.
  const base = Number(cfg().books?.readMinutes ?? 6);
  const minutes = Math.max(5, base * (1 - ((ch.attributes.intellect ?? 4) - 4) * 0.05));
  const runAt = new Date(Date.now() + minutes * 60_000);
  const [job] = await tx.insert(schema.jobs).values({ kind: 'read_complete', characterId: ch.id, runAt, payload: { itemId: it.id, defId: d.id } }).returning();
  await tx.update(schema.characters).set({ state: 'busy', activity: 'idle', busyUntil: runAt, busyAction: { type: 'read', jobId: job.id, label: `Lendo ${d.name.toLowerCase()}`, startedAt: Date.now(), itemId: it.id } }).where(eq(schema.characters.id, ch.id));
  await systemEmote(ch.locationId, `${fullName(ch)} senta e abre ${d.name.toLowerCase()}, concentrado.`);
  pushSelf(ch.id); pushScene(ch.locationId);
  return { ok: true, minutes: Math.round(minutes) };
}

/** Fim da leitura (agendador). Idempotente pelo jobId; só conta se o livro ainda estiver com a pessoa. */
export async function completeReading(jobId: number, characterId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    if (ch.state !== 'busy' || (ch.busyAction as any)?.jobId !== jobId) return { skipped: true };
    await tx.update(schema.characters).set({ state: 'idle', busyUntil: null, busyAction: null }).where(eq(schema.characters.id, ch.id));
    ch.state = 'idle';
    const itemId = Number((ch.busyAction as any)?.itemId);
    const [it] = await tx.select().from(schema.items).where(and(eq(schema.items.id, itemId), eq(schema.items.ownerType, 'character'), eq(schema.items.ownerId, String(ch.id))));
    const d = it ? itemDef(it.defId) : null;
    if (!it || !d || d.category !== 'book') { notify(ch.userId, 'O livro não está mais com você. A leitura ficou pela metade.', 'warn'); pushSelf(ch.id); pushScene(ch.locationId); return { ok: false }; }
    const p = d.props; const key = `read:${d.id}`;
    if (!ch.knownRecipes.includes(key)) {
      const mult = charMod(ch.profession, ch.traits, 'bookXp');
      await giveXp(tx, ch, p.skill, p.xp * mult, key, p.maxLevel);
      const recipes = [...new Set([...ch.knownRecipes, key, ...(p.recipes ?? [])])];
      await tx.update(schema.characters).set({ knownRecipes: recipes }).where(eq(schema.characters.id, ch.id));
      notify(ch.userId, `Você terminou de estudar ${d.name}. Novos conhecimentos: ${(p.recipes ?? []).length}.`, 'success');
    }
    await systemEmote(ch.locationId, `${fullName(ch)} fecha ${d.name.toLowerCase()}, pensativo.`);
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true };
  });
}

/** Desistir da leitura: perde o que leu até agora. */
export async function stopReading(characterId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    if (ch.state !== 'busy' || (ch.busyAction as any)?.type !== 'read') fail('Você não está lendo.');
    await tx.update(schema.characters).set({ state: 'idle', busyUntil: null, busyAction: null }).where(eq(schema.characters.id, ch.id));
    await systemEmote(ch.locationId, `${fullName(ch)} fecha o livro antes de terminar.`);
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true };
  });
}

// ───────────────────────── Silenciadores ─────────────────────────
/** Encaixa um silenciador compatível na arma (o silenciador sai do inventário e passa a fazer parte da arma). */
export async function attachSuppressor(characterId: number, weaponId: number, suppressorId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: true, allowTravel: true });
    const w = await ownedItem(tx, ch, weaponId); const wd = itemDef(w.defId)!;
    const s = await ownedItem(tx, ch, suppressorId); const sd = itemDef(s.defId)!;
    if (!sd.props.suppressor) fail('Isso não é um silenciador.');
    if (!(sd.props.fits ?? []).includes(wd.id)) fail(`${sd.name} não encaixa em ${wd.name.toLowerCase()}.`);
    if (w.data?.suppressor) fail('A arma já tem um silenciador. Tire o atual primeiro.');
    await consumeItem(tx, s.id, 'character', ch.id, 1);
    await tx.update(schema.items).set({ data: { ...w.data, suppressor: { defId: sd.id, durability: s.durability || sd.durabilityMax } } }).where(eq(schema.items.id, w.id));
    notify(ch.userId, `Você rosqueia ${sd.name.toLowerCase()} em ${wd.name.toLowerCase()}. Os disparos não vão mais atrair infectados.`, 'success');
    pushSelf(ch.id);
    return { ok: true };
  });
}
export async function detachSuppressor(characterId: number, weaponId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: true, allowTravel: true });
    const w = await ownedItem(tx, ch, weaponId);
    const sup = w.data?.suppressor as { defId: string; durability: number } | undefined;
    if (!sup) fail('Essa arma não tem silenciador.');
    const { suppressor: _s, ...rest } = w.data;
    await tx.update(schema.items).set({ data: rest }).where(eq(schema.items.id, w.id));
    await addItem(tx, 'character', ch.id, sup!.defId, 1, { durability: sup!.durability });
    pushSelf(ch.id);
    return { ok: true };
  });
}

// ───────────────────────── Marcações no mapa ─────────────────────────
export type MapMark = { id: string; x: number; y: number; label: string; color: string };
const MARK_COLORS = ['red', 'blue', 'green', 'black'];
/** O mapa (item) da pessoa: as marcações ficam desenhadas nele. Sem mapa, sem marcações. */
async function ownMap(tx: Tx, ch: CharRow) {
  const m = (await itemsOf(tx, 'character', ch.id)).find((i) => itemDef(i.defId)?.props.map);
  if (!m) fail('Você precisa de um mapa do condado para fazer marcações.');
  return m!;
}
export async function addMapMark(characterId: number, x: number, y: number, label: string, color: string) {
  return withCharacter(characterId, async (tx, ch) => {
    if (!ch.alive) fail('Seu personagem está morto.');
    const m = await ownMap(tx, ch);
    const marks: MapMark[] = Array.isArray(m.data?.marks) ? m.data.marks : [];
    if (marks.length >= 40) fail('O mapa já está cheio de rabiscos (máximo de 40 marcações). Apague alguma.');
    const mark: MapMark = { id: `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, x: Math.round(x), y: Math.round(y), label: label.trim().slice(0, 40) || 'Marcação', color: MARK_COLORS.includes(color) ? color : 'red' };
    await tx.update(schema.items).set({ data: { ...m.data, marks: [...marks, mark] } }).where(eq(schema.items.id, m.id));
    pushSelf(ch.id);
    return { ok: true, mark };
  });
}
export async function removeMapMark(characterId: number, markId: string) {
  return withCharacter(characterId, async (tx, ch) => {
    const m = await ownMap(tx, ch);
    const marks: MapMark[] = Array.isArray(m.data?.marks) ? m.data.marks : [];
    await tx.update(schema.items).set({ data: { ...m.data, marks: marks.filter((k) => k.id !== markId) } }).where(eq(schema.items.id, m.id));
    pushSelf(ch.id);
    return { ok: true };
  });
}

// ───────────────────────── Medicina ─────────────────────────
function treatQuality(actor: CharRow) {
  const lvl = actor.skills.medicine?.level ?? 0;
  return clamp(1 + lvl * cfg().wounds.medicalSkillTreatBonus, 0.6, 2) * charMod(actor.profession, actor.traits, 'treatment');
}

/** Trocar um curativo feito com trapo devolve o pano usado, sujo. */
async function returnOldRag(tx: Tx, actor: CharRow, w: { bandaged: boolean; treatments: string[] }) {
  if (!w.bandaged || !w.treatments.includes('rag')) return false;
  await addItem(tx, 'character', actor.id, 'dirty_rag', 1);
  return true;
}

/** Aplica um item médico em um ferimento (próprio ou de outro personagem no mesmo local). */
export async function treat(actorId: number, targetId: number, woundId: number | null, itemId: number) {
  return withTwoCharacters(actorId, targetId, async (tx, actor, target) => {
    assertCanAct(actor, { allowBusy: true, allowCombat: true, allowTravel: true });
    if (!target.alive) fail('Não há mais nada a fazer.');
    if (actor.id !== target.id && !(await sameSpot(tx, actor, target))) fail('O paciente precisa estar no mesmo local.');
    return treatInTx(tx, actor, target, woundId, itemId);
  });
}
export async function treatInTx(tx: Tx, actor: CharRow, target: CharRow, woundId: number | null, itemId: number) {
  const it = await ownedItem(tx, actor, itemId); const d = itemDef(it.defId)!; const use = d.props.use as string;
  if (!use) fail('Esse item não serve para tratamento.');
  // Quem caiu só volta com um kit de primeiros socorros (o kit reanima em vez de tratar um ferimento).
  if (isDowned(target.needs)) {
    if (actor.id === target.id) fail('Você está caído.');
    if (use !== 'medkit') fail('Só um kit de primeiros socorros salva quem caiu.');
    const r = await reviveInTx(tx, actor, target, it.id);
    if (!r?.ok) fail(r?.error ?? 'Não foi possível reanimar.');
    await giveXp(tx, actor, 'medicine', 10, `revive_${target.id}`);
    return { ok: true, text: r!.text, revived: true };
  }
  const q = treatQuality(actor); const n = { ...target.needs }; const self = actor.id === target.id;
  const wounds = await woundsOf(tx, target.id);
  // Sem ferimento escolhido (ex.: tratando outra pessoa), escolhe o mais adequado ao item.
  const autoPick = () => {
    const open = wounds.filter((w) => WOUND_TYPES[w.type as WoundType]?.open);
    if (use === 'splint') return wounds.find((w) => w.type === 'fracture' && !w.splinted);
    if (use === 'disinfect') return [...open].sort((a, b) => b.contamination - a.contamination)[0];
    if (use === 'suture') return [...open].filter((w) => !w.sutured).sort((a, b) => b.severity - a.severity)[0];
    return [...open].filter((w) => !w.bandaged || w.bandageDirt > 0.5).sort((a, b) => b.bleeding - a.bleeding)[0] ?? open[0];
  };
  const wound = woundId ? wounds.find((w) => w.id === woundId) : ['bandage', 'disinfect', 'splint', 'suture', 'medkit'].includes(use) ? autoPick() ?? null : null;
  const regionName = wound ? REGION_NAMES[wound.region as keyof typeof REGION_NAMES]?.toLowerCase() : '';
  const who = self ? 'em si mesmo' : `em ${fullName(target)}`;
  let text = ''; let xp = 4;
  const needWound = () => { if (!wound) fail('Escolha um ferimento.'); return wound!; };
  switch (use) {
    case 'bandage': {
      const w = needWound();
      if (!WOUND_TYPES[w.type as WoundType]?.open && w.type !== 'bruise') fail('Bandagem não ajuda neste tipo de lesão.');
      const quality = Number(d.props.quality ?? 1) * q * (actor.profession === 'nurse' ? charMod('nurse', [], 'bandageDurability') : 1);
      const oldRag = await returnOldRag(tx, actor, w);
      const isCloth = d.id === 'rag' || d.id === 'dirty_rag';
      await tx.update(schema.wounds).set({ bandaged: true, bandageDirt: Number(d.props.dirty ?? 0), treatments: [...w.treatments.filter((t) => !t.startsWith('q:') && t !== 'rag'), 'bandage', `q:${quality.toFixed(2)}`, ...(isCloth ? ['rag'] : [])] }).where(eq(schema.wounds.id, w.id));
      if (oldRag) notify(actor.userId, 'Você tira o trapo velho do curativo: ficou um trapo sujo. Lave antes de reaproveitar.', 'info');
      text = `${fullName(actor)} aplica ${d.name.toLowerCase()} ${who} (${regionName}).`; break;
    }
    case 'disinfect': {
      const w = needWound();
      await tx.update(schema.wounds).set({ disinfected: true, contamination: w.contamination * 0.2, treatments: [...w.treatments, 'disinfect'] }).where(eq(schema.wounds.id, w.id));
      n.stress = clamp(n.stress + 3, 0, 100);
      text = `${fullName(actor)} limpa o ferimento ${who} com antisséptico (${regionName}).`; break;
    }
    case 'splint': {
      const w = needWound(); if (w.type !== 'fracture') fail('Talas são para fraturas.');
      await tx.update(schema.wounds).set({ splinted: true, treatments: [...w.treatments, 'splint'] }).where(eq(schema.wounds.id, w.id));
      text = `${fullName(actor)} imobiliza ${self ? 'o próprio' : 'o'} ${regionName} ${self ? '' : `de ${fullName(target)} `}com uma tala.`; xp = 6; break;
    }
    case 'suture': {
      const w = needWound();
      if (!['cut_deep', 'laceration', 'puncture', 'gunshot', 'bite', 'amputation', 'cut_shallow'].includes(w.type)) fail('Este ferimento não precisa de sutura.');
      const lvl = actor.skills.medicine?.level ?? 0; const min = Number(d.props.minSkill ?? 2);
      const success = lvl >= min || rng.chance(0.35 + lvl * 0.1);
      if (success) {
        await tx.update(schema.wounds).set({ sutured: true, bleeding: w.bleeding * 0.1, treatments: [...w.treatments, 'suture'] }).where(eq(schema.wounds.id, w.id));
        text = `${fullName(actor)} sutura cuidadosamente o ferimento ${who} (${regionName}).`;
      } else {
        await tx.update(schema.wounds).set({ pain: clamp(w.pain + 15, 0, 100), contamination: clamp(w.contamination + 0.15, 0, 1) }).where(eq(schema.wounds.id, w.id));
        text = `${fullName(actor)} tenta suturar ${who}, mas as mãos tremem — o ponto não fecha direito.`;
      }
      xp = 10; break;
    }
    case 'painkiller':
      n.painkillerUntil = Date.now() + Number(d.props.hours ?? 3) * 3_600_000;
      text = `${fullName(actor)} ${self ? 'toma' : `dá a ${fullName(target)}`} analgésicos.`; xp = 1; break;
    case 'antibiotic':
      n.antibioticUntil = Date.now() + 8 * 3_600_000;
      text = `${fullName(actor)} ${self ? 'toma' : `administra a ${fullName(target)}`} antibióticos.`; xp = 2; break;
    case 'medkit': {
      const w = needWound();
      await returnOldRag(tx, actor, w);
      await tx.update(schema.wounds).set({ bandaged: true, bandageDirt: 0, disinfected: true, contamination: w.contamination * 0.1, bleeding: w.bleeding * 0.6, treatments: [...w.treatments.filter((t) => !t.startsWith('q:') && t !== 'rag'), 'medkit', `q:${(q * 1.25).toFixed(2)}`] }).where(eq(schema.wounds.id, w.id));
      text = `${fullName(actor)} usa um kit de primeiros socorros ${who} (${regionName}).`; xp = 6;
      if (it.durability > 1) { await tx.update(schema.items).set({ durability: it.durability - 1 }).where(eq(schema.items.id, it.id)); }
      else await consumeItem(tx, it.id, 'character', actor.id, 1);
      break;
    }
    case 'surgery': fail('Suprimentos cirúrgicos são usados em amputações e cirurgias.');
    default: fail('Tratamento desconhecido.');
  }
  if (use !== 'medkit') await consumeItem(tx, it.id, 'character', actor.id, 1);
  if (actor.traits.includes('hemophobic') && ['bandage', 'suture', 'disinfect', 'medkit'].includes(use)) { const an = { ...actor.needs, stress: clamp(actor.needs.stress + 10, 0, 100) }; if (self) n.stress = an.stress; else await tx.update(schema.characters).set({ needs: an }).where(eq(schema.characters.id, actor.id)); }
  await tx.update(schema.characters).set({ needs: n }).where(eq(schema.characters.id, target.id));
  await giveXp(tx, actor, 'medicine', xp, `treat_${target.id}_${use}`);
  if (actor.state !== 'traveling') await systemEmote(actor.locationId, text);
  if (!self) await gameLog(tx, target.id, 'medical', text);
  pushSelf(actor.id); if (!self) pushSelf(target.id);
  return { ok: true, text };
}

/** Reanimar quem caiu, usando o kit de primeiros socorros do socorrista (botão no retrato da pessoa). */
export async function revive(actorId: number, targetId: number) {
  return withTwoCharacters(actorId, targetId, async (tx, actor, target) => {
    assertCanAct(actor, { allowBusy: true, allowTravel: true, allowCombat: false });
    if (actor.id === target.id) fail('Você não consegue se reanimar sozinho.');
    if (!target.alive) fail('Tarde demais.');
    if (!isDowned(target.needs)) fail('Essa pessoa não está caída.');
    if (!(await sameSpot(tx, actor, target))) fail('A pessoa precisa estar aqui.');
    const r = await reviveInTx(tx, actor, target);
    if (!r?.ok) fail(r?.error ?? 'Não foi possível reanimar.');
    await giveXp(tx, actor, 'medicine', 10, `revive_${target.id}`);
    return { ok: true, text: r!.text };
  });
}

/** Diagnóstico: médicos (ou Medicina ≥ 4) conseguem identificar a infecção zumbi oculta. */
export async function diagnose(actorId: number, targetId: number) {
  return withTwoCharacters(actorId, targetId, async (tx, actor, target) => {
    assertCanAct(actor, { allowBusy: true });
    if (actor.id !== target.id && actor.locationId !== target.locationId) fail('O paciente precisa estar aqui.');
    const lvl = actor.skills.medicine?.level ?? 0; const doctor = actor.profession === 'doctor';
    const conds = await conditionsOf(tx, target.id);
    const z = conds.find((c) => c.kind === 'zombie_infection');
    const wounds = await woundsOf(tx, target.id);
    let result: string;
    if (z && (doctor || lvl >= 4) && z.stage >= (doctor ? 0 : 1)) {
      await tx.update(schema.conditions).set({ discovered: true }).where(eq(schema.conditions.id, z.id));
      result = `O diagnóstico é inequívoco: infecção zumbi em progressão (estágio ${z.stage}).`;
    } else if (z && z.stage >= 1) result = 'Há febre e sinais de infecção grave, mas você não consegue determinar a causa.';
    else {
      const infected = wounds.filter((w) => w.infected).length;
      result = infected ? `${infected} ferimento(s) infeccionado(s). Antibióticos e antisséptico são recomendados.` : 'Nenhuma infecção evidente no momento.';
    }
    await giveXp(tx, actor, 'medicine', 2, `diag_${target.id}`);
    await gameLog(tx, target.id, 'medical', `Avaliação de ${fullName(actor)}: ${result}`);
    if (actor.id !== target.id) await gameLog(tx, actor.id, 'medical', `Você avaliou ${fullName(target)}: ${result}`);
    pushSelf(target.id); pushSelf(actor.id);
    return { ok: true, result };
  });
}

/** Ficha médica de outra pessoa presente (para prestar socorro): ferimentos e o que dá para ver dela. */
export async function patientSheet(actorId: number, targetId: number) {
  const { db } = await import('../../db/index.js');
  const { buildSelfState } = await import('./characters.js');
  const [a] = await db.select().from(schema.characters).where(eq(schema.characters.id, actorId));
  const [t] = await db.select().from(schema.characters).where(eq(schema.characters.id, targetId));
  if (!a || !t || !t.alive) fail('Paciente não encontrado.');
  if (a!.id !== t!.id && (a!.locationId !== t!.locationId || t!.state === 'traveling')) fail('O paciente precisa estar aqui.');
  const st = (await buildSelfState(targetId))?.state as any;
  if (!st) fail('Paciente não encontrado.');
  return { ok: true, patient: { id: st.id, name: st.name, firstName: st.firstName, amputations: st.amputations, wounds: st.wounds, conditions: st.conditions,
    needs: { blood: st.needs.blood, health: st.needs.health, pain: st.needs.pain, vitality: st.needs.vitality, bodyTemp: st.needs.bodyTemp, unconscious: !!st.needs.unconscious } } };
}

// ───────────────────────── Amputação de emergência (abstrata) ─────────────────────────
const AMPUTABLE = ['left_arm', 'right_arm', 'left_hand', 'right_hand', 'left_leg', 'right_leg', 'left_foot', 'right_foot'];
const consents = new Map<string, number>(); // `${actor}:${target}:${region}` → expira em
export function requestAmputationConsent(actorId: number, targetId: number, region: string) { consents.set(`${actorId}:${targetId}:${region}`, Date.now() + 120_000); }
export function hasConsent(actorId: number, targetId: number, region: string) { const k = `${actorId}:${targetId}:${region}`; const v = consents.get(k); return !!v && v > Date.now(); }
export function grantConsent(actorId: number, targetId: number, region: string) { consents.set(`${actorId}:${targetId}:${region}:ok`, Date.now() + 120_000); }
const consentGiven = (a: number, t: number, r: string) => (consents.get(`${a}:${t}:${r}:ok`) ?? 0) > Date.now();

/**
 * Remove um membro de forma permanente. Mecânica de jogo abstrata: exige ferramenta de corte,
 * bandagens e (idealmente) suprimentos cirúrgicos; o sucesso depende de Medicina. Pode impedir a
 * infecção zumbi APENAS se o membro mordido for removido dentro da janela configurada e com a chance configurada.
 */
export async function amputate(actorId: number, targetId: number, region: string) {
  const a = cfg().infection.amputation;
  if (!a.enabled) fail('Amputações estão desativadas neste servidor.');
  if (!AMPUTABLE.includes(region)) fail('Região inválida para amputação.');
  if (actorId !== targetId && !consentGiven(actorId, targetId, region)) fail('O paciente precisa consentir com o procedimento.', 'needs_consent');
  return withTwoCharacters(actorId, targetId, async (tx, actor, target) => {
    assertCanAct(actor, { allowBusy: false });
    if (target.state === 'combat' || target.state === 'traveling') fail('Impossível durante combate ou viagem.');
    if (actor.locationId !== target.locationId) fail('O paciente precisa estar aqui.');
    if (amputatedRegions(target.amputations).includes(region)) fail('Esse membro já foi perdido.');
    const items = await itemsOf(tx, 'character', actor.id);
    const tool = items.find((i) => { const t = itemDef(i.defId)?.props.tool; return Array.isArray(t) && (t.includes('saw') || t.includes('axe')); });
    if (!tool) fail('É preciso um serrote ou machado.');
    const bandages = items.filter((i) => itemDef(i.defId)?.props.use === 'bandage');
    if (bandages.reduce((s, i) => s + i.quantity, 0) < 2) fail('São necessárias pelo menos 2 bandagens ou trapos.');
    const supplies = items.find((i) => i.defId === 'surgical_supplies');
    const lvl = actor.skills.medicine?.level ?? 0;
    const chance = clamp(a.baseSuccess + lvl * a.medicalSkillBonus + (actor.profession === 'doctor' ? a.doctorBonus : 0) + (supplies ? 0.15 : 0) - (actor.id === target.id ? 0.25 : 0), 0.05, 0.95);
    const success = rng.chance(chance);
    // consome recursos
    let left = 2; for (const b of bandages) { if (left <= 0) break; const n = Math.min(left, b.quantity); await consumeItem(tx, b.id, 'character', actor.id, n); left -= n; }
    if (supplies) await consumeItem(tx, supplies.id, 'character', actor.id, 1);
    const removed = amputatedRegions([region]);
    const amps = [...new Set([...target.amputations, region])];
    // ferimentos nas partes removidas deixam de existir
    const wounds = await woundsOf(tx, target.id);
    for (const w of wounds) if (removed.includes(w.region)) await tx.update(schema.wounds).set({ healedAt: new Date(), healing: 1 }).where(eq(schema.wounds.id, w.id));
    const stump = makeWound('amputation', region, success ? 0.6 : 1, 'Amputação', 1, success ? 0.6 : 1.6);
    if (success) { stump.bandaged = true; stump.disinfected = !!supplies; stump.contamination *= supplies ? 0.3 : 1; }
    await tx.insert(schema.wounds).values({ characterId: target.id, ...stump });
    const n = { ...target.needs, blood: clamp(target.needs.blood - (success ? 12 : 25), 0, 100), stress: clamp(target.needs.stress + 40, 0, 100) };
    await tx.update(schema.characters).set({ amputations: amps, needs: n }).where(eq(schema.characters.id, target.id));
    // itens equipados na mão perdida
    const tItems = await itemsOf(tx, 'character', target.id);
    for (const i of tItems) {
      const d = itemDef(i.defId);
      if ((i.slot === 'primary' && d?.props.twoHanded) || (i.slot === 'gloves')) await tx.update(schema.items).set({ slot: null }).where(eq(schema.items.id, i.id));
    }
    // efeito na infecção zumbi (só dentro da janela e com chance configurada)
    const z = (await conditionsOf(tx, target.id)).find((c) => c.kind === 'zombie_infection');
    if (z && z.sourceRegion && removed.includes(z.sourceRegion)) {
      const minutes = (Date.now() - z.startedAt.getTime()) / 60000;
      const cureChance = minutes <= a.windowMinutes ? a.cureChanceInsideWindow : a.cureChanceOutsideWindow;
      if (rng.chance(cureChance)) await tx.update(schema.conditions).set({ resolvedAt: new Date(), data: { ...z.data, curedBy: 'amputation' } }).where(eq(schema.conditions.id, z.id));
    }
    await giveXp(tx, actor, 'medicine', 20, `amputate_${target.id}`);
    const text = success
      ? `${fullName(actor)} realiza uma amputação de emergência (${REGION_NAMES[region as keyof typeof REGION_NAMES].toLowerCase()}) em ${actor.id === target.id ? 'si mesmo' : fullName(target)}. O sangramento é contido.`
      : `${fullName(actor)} amputa ${REGION_NAMES[region as keyof typeof REGION_NAMES].toLowerCase()} de ${actor.id === target.id ? 'si mesmo' : fullName(target)}, mas há complicações graves — o sangue não para.`;
    await systemEmote(actor.locationId, text);
    await gameLog(tx, target.id, 'medical', text + ' Só o tempo dirá se a infecção foi contida.');
    consents.delete(`${actorId}:${targetId}:${region}:ok`);
    pushSelf(target.id); pushSelf(actor.id); pushScene(actor.locationId);
    return { ok: true, success, text };
  });
}

// ───────────────────────── Descanso ─────────────────────────
export async function setActivity(characterId: number, activity: 'idle' | 'resting' | 'sleeping') {
  return withCharacter(characterId, async (tx, ch) => {
    if (activity !== 'idle') assertCanAct(ch);
    if (activity === 'sleeping' && ch.needs.sleepiness < 25) fail('Você não está com sono suficiente para dormir.');
    if (activity === 'sleeping' && !clock().isDark && ch.needs.sleepiness < 50) fail('Está claro demais — só consegue dormir se estiver muito cansado.');
    await tx.update(schema.characters).set({ activity }).where(eq(schema.characters.id, ch.id));
    const t = activity === 'sleeping' ? `${fullName(ch)} se deita para dormir.` : activity === 'resting' ? `${fullName(ch)} senta para descansar.` : `${fullName(ch)} se levanta.`;
    await systemEmote(ch.locationId, t);
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true };
  });
}

// ───────────────────────── Reparo ─────────────────────────
/** Repara armas, ferramentas e roupas gastando materiais. Habilidade aumenta o reparo; o item perde um pouco da durabilidade máxima efetiva. */
export async function repairItem(characterId: number, itemId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch);
    const it = await ownedItem(tx, ch, itemId); const d = itemDef(it.defId)!;
    if (!d.durabilityMax) fail('Este item não se desgasta.');
    if (it.durability >= d.durabilityMax) fail('Já está em perfeito estado.');
    const items = await itemsOf(tx, 'character', ch.id);
    const has = (id: string, n = 1) => items.filter((i) => i.defId === id && i.id !== it.id).reduce((s2, i) => s2 + i.quantity, 0) >= n;
    const hasTool = (t: string) => items.some((i) => (itemDef(i.defId)?.props.tool ?? []).includes(t));
    let mats: { id: string; n: number }[]; let skill: string; let tool: string | null;
    if (d.category === 'clothing') { mats = [{ id: 'rag', n: 2 }]; skill = 'survival'; tool = null; }
    else if (d.props.weaponType === 'ranged') { mats = [{ id: 'scrap_metal', n: 1 }, { id: 'electronic_parts', n: 1 }]; skill = 'mechanics'; tool = 'screwdriver'; }
    else { mats = [{ id: 'scrap_metal', n: 1 }, { id: 'nails', n: 3 }]; skill = d.props.skill === 'blade' ? 'carpentry' : 'carpentry'; tool = 'hammer'; }
    if (tool && !hasTool(tool)) fail(`Ferramenta necessária: ${tool}.`);
    for (const m of mats) if (!has(m.id, m.n)) fail(`Materiais: ${mats.map((x) => `${x.n}× ${itemDef(x.id)?.name}`).join(', ')}.`);
    const { consumeByDef } = await import('./inventory.js');
    for (const m of mats) await consumeByDef(tx, 'character', ch.id, m.id, m.n);
    const lvl = ch.skills[skill]?.level ?? 0;
    const gain = Math.round(d.durabilityMax * (0.25 + lvl * 0.04));
    const repairs = Number(it.data.repairs ?? 0);
    const cap = Math.round(d.durabilityMax * Math.max(0.5, 1 - repairs * 0.08));
    await tx.update(schema.items).set({ durability: Math.min(cap, it.durability + gain), data: { ...it.data, repairs: repairs + 1 } }).where(eq(schema.items.id, it.id));
    await giveXp(tx, ch, skill, 5, `repair_${d.id}`);
    await systemEmote(ch.locationId, `${fullName(ch)} conserta ${d.name.toLowerCase()}.`);
    pushSelf(ch.id);
    return { ok: true };
  });
}

// ───────────────────────── Rasgar e desmontar ─────────────────────────
/** Rasga uma peça de roupa de pano em trapos (mais trapos quanto mais inteira estiver). */
export async function tearClothing(characterId: number, itemId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: false, allowTravel: true });
    const it = await ownedItem(tx, ch, itemId); const d = itemDef(it.defId)!;
    const n = Number(d.props.rippable ?? 0);
    if (!n) fail('Isso não dá para rasgar em trapos.');
    if (it.slot) fail('Tire a peça antes de rasgar.');
    const cond = d.durabilityMax ? it.durability / d.durabilityMax : 1;
    const rags = Math.max(1, Math.round(n * (0.5 + cond * 0.5)));
    await consumeItem(tx, it.id, 'character', ch.id, 1);
    await addItem(tx, 'character', ch.id, 'rag', rags);
    await giveXp(tx, ch, 'survival', 1, `tear_${d.id}`);
    if (ch.state !== 'traveling') await systemEmote(ch.locationId, `${fullName(ch)} rasga ${d.name.toLowerCase()} em tiras de pano.`);
    notify(ch.userId, `Você conseguiu ${rags} trapo${rags > 1 ? 's' : ''}.`, 'success');
    pushSelf(ch.id);
    return { ok: true, rags };
  });
}

/** Desmonta um item e recupera parte do material (cerca de metade do que se gasta para fazê-lo). */
export async function dismantleItem(characterId: number, itemId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: false, allowTravel: true });
    const it = await ownedItem(tx, ch, itemId); const d = itemDef(it.defId)!;
    const parts = salvageOf(d.id);
    if (!parts) fail('Não há o que aproveitar desmontando isso.');
    const cond = d.durabilityMax ? it.durability / d.durabilityMax : 1;
    await consumeItem(tx, it.id, 'character', ch.id, 1);
    const got: string[] = [];
    for (const [idx, p] of parts!.entries()) {
      const raw = p.qty * (cond < 0.25 ? 0.75 : 1);
      let n = Math.floor(raw) + (rng.chance(raw - Math.floor(raw)) ? 1 : 0);
      if (idx === 0) n = Math.max(1, n);
      if (n <= 0) continue;
      await addItem(tx, 'character', ch.id, p.itemId, n);
      got.push(`${n}× ${itemDef(p.itemId)?.name ?? p.itemId}`);
    }
    await giveXp(tx, ch, 'carpentry', 1, `dismantle_${d.id}`);
    if (ch.state !== 'traveling') await systemEmote(ch.locationId, `${fullName(ch)} desmonta ${d.name.toLowerCase()}.`);
    notify(ch.userId, `Você desmontou ${d.name.toLowerCase()} e aproveitou: ${got.join(', ')}.`, 'success');
    pushSelf(ch.id);
    return { ok: true };
  });
}
