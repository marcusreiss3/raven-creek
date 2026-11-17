import { noteInfo } from './stories.js';
import { and, eq, gte, isNull, ne, sql } from 'drizzle-orm';
import { db, schema, type Tx } from '../../db/index.js';
import { charMod } from '../content/character.js';
import { EQUIP_SLOTS, SALVAGE } from '../content/items.js';
import { cfg, getRecipes, itemDef } from './config.js';
import { fail } from './infra.js';

export type ItemRow = typeof schema.items.$inferSelect;
export type CharRow = typeof schema.characters.$inferSelect;

export async function itemsOf(tx: Tx, ownerType: string, ownerId: string | number) {
  return tx.select().from(schema.items).where(and(eq(schema.items.ownerType, ownerType), eq(schema.items.ownerId, String(ownerId)))).orderBy(schema.items.id);
}
export const itemWeight = (i: ItemRow) => (itemDef(i.defId)?.weight ?? 0) * i.quantity;

export function carryInfo(items: ItemRow[], ch: Pick<CharRow, 'attributes' | 'profession' | 'traits'>) {
  const weight = items.reduce((s, i) => s + (i.slot === 'back' ? (itemDef(i.defId)?.weight ?? 0) * 0.5 : itemWeight(i)), 0);
  const bag = items.find((i) => i.slot === 'back');
  const c = cfg().carry;
  const capacity = c.baseCapacity + (ch.attributes.strength ?? 4) * c.strengthBonus + (bag ? Number(itemDef(bag.defId)?.props.capacity ?? 0) : 0) + charMod(ch.profession, ch.traits, 'carryBonus', 0);
  return { weight: Math.round(weight * 100) / 100, capacity, ratio: weight / capacity };
}

export function equipped(items: ItemRow[]) {
  const out: Record<string, ItemRow | undefined> = {};
  for (const s of EQUIP_SLOTS) out[s] = items.find((i) => i.slot === s);
  return out;
}
/** Proteção por região a partir das roupas equipadas (p: contra golpes; b: balística). Não acumula linearmente. */
export function armorByRegion(items: ItemRow[]) {
  const out: Record<string, { p: number; b: number }> = {};
  for (const i of items) {
    if (!i.slot) continue; const d = itemDef(i.defId); if (!d || d.category !== 'clothing') continue;
    const wear = d.durabilityMax ? Math.max(0.3, i.durability / d.durabilityMax) : 1;
    for (const [r, v] of Object.entries((d.props.protection ?? {}) as Record<string, number>)) {
      const cur = out[r] ?? { p: 0, b: 0 }; cur.p = 1 - (1 - cur.p) * (1 - v * wear); out[r] = cur;
    }
    for (const [r, v] of Object.entries((d.props.ballistic ?? {}) as Record<string, number>)) {
      const cur = out[r] ?? { p: 0, b: 0 }; cur.b = 1 - (1 - cur.b) * (1 - v * wear); out[r] = cur;
    }
  }
  return out;
}
export const insulationOf = (items: ItemRow[]) => Math.min(1, items.filter((i) => i.slot).reduce((s, i) => s + Number(itemDef(i.defId)?.props.insulation ?? 0), 0));
export function hasTool(items: ItemRow[], tool: string) {
  return items.some((i) => {
    const p = itemDef(i.defId)?.props ?? {};
    if (tool === 'fire') return !!p.fire;
    if (tool === 'blade') return p.skill === 'blade';
    if (tool === 'light') return !!p.light;
    if (tool === 'fishing') return !!p.fishing;
    return Array.isArray(p.tool) && p.tool.includes(tool);
  });
}

// ───────────────────────── Pilhas ─────────────────────────
// Itens empilháveis iguais ficam numa pilha só por dono (mochila, chão, baú, porta-malas), sem limite de tamanho.

/** Idade efetiva (horas) de um perecível agora, para juntar pilhas com frescores diferentes. */
function ageNow(i: Pick<ItemRow, 'data' | 'createdAt'>, now: number) {
  return Number(i.data?.age ?? 0) + Math.max(0, now - Number(i.data?.ageAt ?? i.createdAt?.getTime?.() ?? now)) / 3_600_000;
}
/** Dados da pilha juntada: perecíveis ficam com a idade média ponderada pela quantidade. */
function mergedData(defId: string, a: Pick<ItemRow, 'data' | 'createdAt' | 'quantity'>, b: Pick<ItemRow, 'data' | 'createdAt' | 'quantity'>) {
  const data = { ...(b.data ?? {}), ...(a.data ?? {}) };
  if (Number(itemDef(defId)?.props?.perishHours ?? 0) > 0) {
    const now = Date.now(); const total = Math.max(1, a.quantity + b.quantity);
    data.age = (ageNow(a, now) * a.quantity + ageNow(b, now) * b.quantity) / total; data.ageAt = now;
  }
  return data;
}
/** Junta a pilha `row` a outra pilha igual do mesmo dono, se houver. Retorna a pilha resultante. */
async function mergeStack(tx: Tx, row: ItemRow): Promise<ItemRow> {
  if (!itemDef(row.defId)?.stackable || row.slot) return row;
  const [other] = await tx.select().from(schema.items).where(and(eq(schema.items.ownerType, row.ownerType), eq(schema.items.ownerId, row.ownerId),
    eq(schema.items.defId, row.defId), isNull(schema.items.slot), ne(schema.items.id, row.id))).orderBy(schema.items.id).limit(1).for('update');
  if (!other) return row;
  const [merged] = await tx.update(schema.items).set({ quantity: other.quantity + row.quantity, version: other.version + 1, data: mergedData(row.defId, other, row) })
    .where(eq(schema.items.id, other.id)).returning();
  await tx.delete(schema.items).where(eq(schema.items.id, row.id));
  return merged;
}
/** Junta todas as pilhas repetidas de um dono (ex.: itens que caíram de um corpo no chão). */
export async function mergeOwnerStacks(tx: Tx, ownerType: string, ownerId: string | number) {
  const groups = new Map<string, ItemRow[]>();
  for (const i of await itemsOf(tx, ownerType, ownerId)) if (!i.slot && itemDef(i.defId)?.stackable) (groups.get(i.defId) ?? groups.set(i.defId, []).get(i.defId)!).push(i);
  for (const [defId, rows] of groups) {
    if (rows.length < 2) continue;
    let acc = rows[0];
    for (const r of rows.slice(1)) { acc = { ...acc, quantity: acc.quantity + r.quantity, data: mergedData(defId, acc, r) }; await tx.delete(schema.items).where(eq(schema.items.id, r.id)); }
    await tx.update(schema.items).set({ quantity: acc.quantity, data: acc.data, version: rows[0].version + 1 }).where(eq(schema.items.id, rows[0].id));
  }
}

/** Adiciona itens a um dono. Empilháveis vão para a pilha que já existe (uma só por item). */
export async function addItem(tx: Tx, ownerType: string, ownerId: string | number, defId: string, qty = 1, extra: { durability?: number; data?: Record<string, any> } = {}) {
  const d = itemDef(defId); if (!d) fail(`Item desconhecido: ${defId}`);
  const def = d!;
  let remaining = qty;
  const created: ItemRow[] = [];
  if (def.stackable && remaining > 0) {
    const stack = (await itemsOf(tx, ownerType, ownerId)).find((i) => i.defId === defId && !i.slot);
    if (stack) {
      const incoming = { data: extra.data ?? {}, createdAt: new Date(), quantity: remaining };
      const [row] = await tx.update(schema.items).set({ quantity: stack.quantity + remaining, version: stack.version + 1, data: mergedData(defId, stack, incoming) }).where(eq(schema.items.id, stack.id)).returning();
      created.push(row); remaining = 0;
    }
  }
  while (remaining > 0) {
    const q = def.stackable ? remaining : 1;
    const durability = extra.durability ?? (def.durabilityMax ? Math.round(def.durabilityMax * (0.5 + Math.random() * 0.5)) : 0);
    const [row] = await tx.insert(schema.items).values({ defId, quantity: q, durability, ownerType, ownerId: String(ownerId), data: extra.data ?? {} }).returning();
    created.push(row); remaining -= q;
  }
  return created;
}

/** Consome N unidades de um item específico, de forma atômica (impede uso duplo simultâneo). */
export async function consumeItem(tx: Tx, itemId: number, ownerType: string, ownerId: string | number, qty = 1) {
  const [row] = await tx.update(schema.items).set({ quantity: sql`${schema.items.quantity} - ${qty}`, version: sql`${schema.items.version} + 1` })
    .where(and(eq(schema.items.id, itemId), eq(schema.items.ownerType, ownerType), eq(schema.items.ownerId, String(ownerId)), gte(schema.items.quantity, qty)))
    .returning();
  if (!row) fail('Esse item não está mais disponível.', 'item_gone');
  if (row.quantity <= 0) await tx.delete(schema.items).where(eq(schema.items.id, itemId));
  return row;
}
/** Consome por tipo (receitas/construção) — várias pilhas se necessário. */
export async function consumeByDef(tx: Tx, ownerType: string, ownerId: string | number, defId: string, qty: number) {
  const stacks = (await itemsOf(tx, ownerType, ownerId)).filter((i) => i.defId === defId && !i.slot);
  const total = stacks.reduce((s, i) => s + i.quantity, 0);
  if (total < qty) fail(`Faltam materiais: ${itemDef(defId)?.name ?? defId} (${total}/${qty}).`);
  let left = qty;
  for (const s of stacks) { if (left <= 0) break; const take = Math.min(left, s.quantity); await consumeItem(tx, s.id, ownerType, ownerId, take); left -= take; }
}
export function countDef(items: ItemRow[], defId: string) { return items.filter((i) => i.defId === defId && !i.slot).reduce((s, i) => s + i.quantity, 0); }

/** Transfere um item entre donos atomicamente (pegar do chão, guardar em contêiner, entregar). */
export async function transferItem(tx: Tx, itemId: number, from: { type: string; id: string | number }, to: { type: string; id: string | number }, qty?: number) {
  const [it] = await tx.select().from(schema.items).where(and(eq(schema.items.id, itemId), eq(schema.items.ownerType, from.type), eq(schema.items.ownerId, String(from.id)))).for('update');
  if (!it) fail('Alguém já pegou esse item.', 'item_gone');
  const amount = Math.min(qty ?? it!.quantity, it!.quantity);
  if (amount < it!.quantity) {
    await tx.update(schema.items).set({ quantity: it!.quantity - amount, version: it!.version + 1 }).where(eq(schema.items.id, itemId));
    const [n] = await tx.insert(schema.items).values({ defId: it!.defId, quantity: amount, durability: it!.durability, ownerType: to.type, ownerId: String(to.id), data: it!.data }).returning();
    // junta com a pilha que o destino já tem; quem chamou recebe a quantidade movida
    return { ...(await mergeStack(tx, n)), quantity: amount };
  }
  // Mapa que sai das mãos de alguém perde as marcações feitas por essa pessoa.
  const data = itemDef(it!.defId)?.props?.map && Array.isArray(it!.data?.marks) && it!.data.marks.length ? { ...it!.data, marks: [] } : it!.data;
  const [moved] = await tx.update(schema.items).set({ ownerType: to.type, ownerId: String(to.id), slot: null, version: it!.version + 1, data })
    .where(and(eq(schema.items.id, itemId), eq(schema.items.version, it!.version))).returning();
  if (!moved) fail('Alguém já pegou esse item.', 'item_gone');
  return { ...(await mergeStack(tx, moved)), quantity: amount };
}

const NO_SALVAGE_CATS = ['food', 'water', 'medical', 'ammo', 'book'];
/** O que se recupera ao desmontar um item (null se não dá para desmontar). Roupas de pano são "rasgadas" à parte. */
export function salvageOf(defId: string): { itemId: string; qty: number }[] | null {
  const d = itemDef(defId); if (!d || NO_SALVAGE_CATS.includes(d.category)) return null;
  if (SALVAGE[defId]) return SALVAGE[defId];
  const r = getRecipes().find((x) => x.output.itemId === defId && x.output.qty > 0 && x.skill !== 'cooking' && !x.inputs.some((y) => y.itemId === defId) && x.inputs.length > 0);
  if (!r) return null;
  return r.inputs.map((x, idx) => ({ itemId: x.itemId, qty: idx === 0 ? Math.max(1, x.qty * 0.5) : x.qty * 0.5 }));
}

export function describeItem(i: ItemRow) {
  const d = itemDef(i.defId);
  return {
    id: i.id, defId: i.defId, name: d?.name ?? i.defId, category: d?.category ?? 'misc', quantity: i.quantity, weight: d?.weight ?? 0,
    durability: i.durability, durabilityMax: d?.durabilityMax ?? 0, slot: i.slot, equipSlot: d?.equipSlot ?? null, icon: d?.icon ?? 'generic',
    rarity: d?.rarity ?? 'common', description: d?.description ?? '', props: publicProps(d?.props ?? {}),
    data: {
      ammo: i.data?.ammo ?? undefined,
      // peças tiradas de veículos guardam o estado (litros no galão, carga da bateria, condição do motor)
      fuel: typeof i.data?.fuel === 'number' ? i.data.fuel : undefined, charge: typeof i.data?.battery === 'number' ? i.data.battery : undefined, condition: typeof i.data?.engine === 'number' ? i.data.engine : undefined,
      suppressor: i.data?.suppressor ? { name: itemDef(i.data.suppressor.defId)?.name ?? 'Silenciador', durability: i.data.suppressor.durability, durabilityMax: itemDef(i.data.suppressor.defId)?.durabilityMax ?? 0 } : undefined,
    },
    note: d?.props?.note ? noteInfo(i.data) : undefined,
    canDismantle: !!salvageOf(i.defId), rippable: Number(d?.props?.rippable ?? 0) || undefined,
    freshness: Number(d?.props?.perishHours ?? 0) > 0 ? Math.max(0, Math.round(100 * (1 - Number(i.data?.age ?? 0) / Number(d!.props.perishHours)))) : undefined,
  };
}
function publicProps(p: Record<string, any>) {
  const keep = ['weaponType', 'skill', 'damage', 'range', 'apCost', 'twoHanded', 'ammoType', 'magSize', 'protection', 'ballistic', 'capacity', 'use', 'hunger', 'thirst', 'light', 'radio', 'fuel', 'insulation', 'tool', 'noise', 'fuelMinutes', 'perishHours', 'fishing', 'fire', 'smokable', 'alcohol', 'doses',
    'battery', 'tires', 'engine', 'engineBlock', 'emptyCan', 'carKey', 'suppressor', 'fits', 'map', 'skill', 'xp'];
  const o: Record<string, any> = {}; for (const k of keep) if (p[k] !== undefined) o[k] = p[k]; return o;
}
export { db };
