import { and, eq, ne } from 'drizzle-orm';
import { schema } from '../../db/index.js';
import { charMod } from '../content/character.js';
import { clamp, rng } from '../rules/rng.js';
import { assertCanAct, withCharacter } from './characters.js';
import { cfg, getRecipes, itemDef } from './config.js';
import { fail, gameLog } from './infra.js';
import { fireLit } from './nature.js';
import { isPowered } from './projects.js';
import { addItem, consumeByDef, consumeItem, hasTool, itemsOf, type CharRow } from './inventory.js';
import { notify, pushScene, pushSelf } from './realtime.js';
import { systemEmote } from './chat.js';
import { giveXp } from './survival.js';

const fullName = (c: CharRow) => `${c.firstName} ${c.lastName}`;

async function vehicleHere(tx: any, ch: CharRow, vehicleId: number) {
  const [v] = await tx.select().from(schema.vehicles).where(eq(schema.vehicles.id, vehicleId)).for('update');
  if (!v || v.locationId !== ch.locationId) fail('Esse veículo não está aqui.');
  return v as typeof schema.vehicles.$inferSelect;
}

export async function enterVehicle(characterId: number, vehicleId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch);
    const v = await vehicleHere(tx, ch, vehicleId);
    if (v.driverId && v.driverId !== ch.id) {
      // motorista que morreu, saiu do lugar ou já desembarcou não segura mais o volante
      const [d] = await tx.select({ alive: schema.characters.alive, locationId: schema.characters.locationId, vehicleId: schema.characters.vehicleId, state: schema.characters.state }).from(schema.characters).where(eq(schema.characters.id, v.driverId));
      const stale = !d || !d.alive || d.vehicleId !== v.id || d.locationId !== v.locationId || d.state === 'traveling';
      if (!stale) fail('Já há alguém ao volante. Siga o motorista para ir como passageiro.');
      await tx.update(schema.vehicles).set({ driverId: null, running: false }).where(eq(schema.vehicles.id, v.id));
    }
    if (v.factionId) { const [m] = await tx.select().from(schema.factionMembers).where(eq(schema.factionMembers.characterId, ch.id)); if (!m || m.factionId !== v.factionId) fail('Este veículo pertence a outra facção.'); }
    if (ch.amputations.some((a) => a.includes('leg') || a.includes('foot'))) fail('Sem uma das pernas você não consegue dirigir.');
    // trocar de veículo (ex.: do carro para a moto) larga o volante do anterior — senão a pessoa ficava "ao volante" dos dois
    await tx.update(schema.vehicles).set({ driverId: null, running: false }).where(and(eq(schema.vehicles.driverId, ch.id), ne(schema.vehicles.id, v.id)));
    await tx.update(schema.vehicles).set({ driverId: ch.id }).where(eq(schema.vehicles.id, v.id));
    await tx.update(schema.characters).set({ vehicleId: v.id }).where(eq(schema.characters.id, ch.id));
    await systemEmote(ch.locationId, `${fullName(ch)} assume o volante de ${v.name.toLowerCase()}.`);
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true };
  });
}
export async function exitVehicle(characterId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    if (!ch.vehicleId) fail('Você não está em um veículo.');
    await tx.update(schema.vehicles).set({ driverId: null, running: false }).where(and(eq(schema.vehicles.id, ch.vehicleId!), eq(schema.vehicles.driverId, ch.id)));
    await tx.update(schema.characters).set({ vehicleId: null }).where(eq(schema.characters.id, ch.id));
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true };
  });
}

/**
 * Dar partida. Com chave: depende só do motor/bateria. Sem chave: minigame ABSTRATO de três etapas,
 * em que o jogador escolhe a abordagem (cautelosa/normal/arriscada) e o servidor rola a chance com
 * base em Mecânica. Não reproduz nenhum procedimento real. Falhas fazem barulho e gastam bateria.
 */
const hotwireSessions = new Map<number, { vehicleId: number; step: number; progress: number; noise: number; expires: number }>();
export async function startEngine(characterId: number, approach?: 'careful' | 'normal' | 'risky') {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch);
    if (!ch.vehicleId) fail('Entre no veículo primeiro.');
    const v = await vehicleHere(tx, ch, ch.vehicleId!);
    if (v.running) fail('O motor já está ligado.');
    if (v.battery < 5) fail('A bateria está morta. Troque por uma bateria automotiva.');
    if (v.engine < 5) fail('O motor está destruído. Use peças de motor.');
    const items = await itemsOf(tx, 'character', ch.id);
    const hasKey = v.hasKey || items.some((i) => itemDef(i.defId)?.props.carKey && Number(i.data.vehicleId ?? v.id) === v.id);
    const mech = ch.skills.mechanics?.level ?? 0;
    if (hasKey) {
      const ok = rng.chance(clamp(0.5 + v.engine / 200 + v.battery / 400, 0.2, 0.98));
      await tx.update(schema.vehicles).set({ running: ok, battery: Math.max(0, v.battery - (ok ? 1 : 4)) }).where(eq(schema.vehicles.id, v.id));
      await systemEmote(ch.locationId, ok ? `O motor de ${v.name.toLowerCase()} ronca e pega.` : `O motor engasga e morre.`);
      pushScene(ch.locationId);
      return { ok: true, started: ok, minigame: null };
    }
    if (!hasTool(items, 'screwdriver')) fail('Sem chave, você precisa ao menos de uma chave de fenda para tentar.');
    let sess = hotwireSessions.get(ch.id);
    if (!sess || sess.vehicleId !== v.id || sess.expires < Date.now()) { sess = { vehicleId: v.id, step: 0, progress: 0, noise: 0, expires: Date.now() + 5 * 60000 }; hotwireSessions.set(ch.id, sess); }
    if (!approach) return { ok: true, started: false, minigame: { step: sess.step, progress: sess.progress, noise: sess.noise, stepsTotal: 3 } };
    const base = { careful: 0.55, normal: 0.42, risky: 0.3 }[approach];
    const gain = { careful: 1, normal: 1.5, risky: 2.2 }[approach];
    const chance = clamp(base + mech * 0.06 * charMod(ch.profession, ch.traits, 'hotwire'), 0.05, 0.95);
    const success = rng.chance(chance);
    sess.step += 1;
    if (success) sess.progress += gain; else { sess.noise += approach === 'risky' ? 3 : approach === 'normal' ? 2 : 1; }
    await tx.update(schema.vehicles).set({ battery: Math.max(0, v.battery - (success ? 1 : 3)) }).where(eq(schema.vehicles.id, v.id));
    let started = false; let finished = false;
    if (sess.progress >= 3) { started = true; finished = true; }
    else if (sess.step >= 3) finished = true;
    if (finished) {
      hotwireSessions.delete(ch.id);
      if (started) await tx.update(schema.vehicles).set({ running: true }).where(eq(schema.vehicles.id, v.id));
      await giveXp(tx, ch, 'mechanics', started ? 12 : 4, `hotwire_${v.id}`);
      if (sess.noise >= 4) {
        const [ll] = await tx.select().from(schema.locationLoot).where(eq(schema.locationLoot.locationId, ch.locationId));
        if (ll) await tx.update(schema.locationLoot).set({ zombies: ll.zombies + 1 }).where(eq(schema.locationLoot.locationId, ch.locationId));
        notify(ch.userId, 'O barulho chamou atenção. Algo se move por perto.', 'warn');
      }
      await systemEmote(ch.locationId, started ? `Depois de muito esforço, ${fullName(ch)} faz o motor de ${v.name.toLowerCase()} pegar!` : `${fullName(ch)} desiste de dar partida em ${v.name.toLowerCase()}.`);
      pushScene(ch.locationId);
    }
    return { ok: true, started, minigame: finished ? null : { step: sess.step, progress: sess.progress, noise: sess.noise, stepsTotal: 3, lastSuccess: success } };
  });
}
export async function stopEngine(characterId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    if (!ch.vehicleId) fail('Você não está em um veículo.');
    await tx.update(schema.vehicles).set({ running: false }).where(eq(schema.vehicles.id, ch.vehicleId!));
    pushScene(ch.locationId); return { ok: true };
  });
}

/** Facção dona do veículo: só membros mexem nele (porta-malas, peças). */
async function assertVehicleAccess(tx: any, ch: CharRow, v: typeof schema.vehicles.$inferSelect) {
  if (!v.factionId) return;
  const [m] = await tx.select().from(schema.factionMembers).where(eq(schema.factionMembers.characterId, ch.id));
  if (!m || m.factionId !== v.factionId) fail('Este veículo pertence a outra facção.');
}

/** Usa uma peça/combustível do inventário no veículo presente. */
export async function serviceVehicle(characterId: number, vehicleId: number, itemId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch);
    const v = await vehicleHere(tx, ch, vehicleId);
    const it = (await itemsOf(tx, 'character', ch.id)).find((i) => i.id === itemId);
    if (!it) fail('Item não encontrado.');
    const p = itemDef(it!.defId)?.props ?? {}; const mech = ch.skills.mechanics?.level ?? 0;
    const patch: Partial<typeof v> = {}; let text = '';
    const parts = (cfg() as any).vehicleParts ?? {};
    if (p.fuel) {
      const liters = typeof it!.data?.fuel === 'number' ? it!.data.fuel : p.fuel;
      if (v.fuel >= v.fuelMax - 0.5) fail('O tanque já está cheio.');
      const poured = Math.min(liters, v.fuelMax - v.fuel); const left = Math.round((liters - poured) * 10) / 10;
      patch.fuel = v.fuel + poured; text = 'abastece';
      // o galão volta vazio (ou com o que sobrou)
      if (left > 0.05) { await tx.update(schema.items).set({ data: { ...it!.data, fuel: left } }).where(eq(schema.items.id, it!.id)); }
      else { await consumeItem(tx, it!.id, 'character', ch.id, 1); await addItem(tx, 'character', ch.id, 'gas_can_empty', 1); }
      await tx.update(schema.vehicles).set(patch).where(eq(schema.vehicles.id, v.id));
      await systemEmote(ch.locationId, `${fullName(ch)} ${text} ${v.name.toLowerCase()}.`);
      pushSelf(ch.id); pushScene(ch.locationId);
      return { ok: true };
    }
    else if (p.battery) { patch.battery = typeof it!.data?.battery === 'number' ? it!.data.battery : p.battery; text = 'troca a bateria de'; }
    else if (p.tires) { if (v.tires >= 100) fail('Os pneus já estão em bom estado.'); patch.tires = Math.min(100, v.tires + p.tires); text = 'troca um pneu de'; }
    else if (p.engineBlock) {
      if (mech < Number(parts.engineLevel ?? 3)) fail(`Instalar um motor exige Mecânica nível ${parts.engineLevel ?? 3}.`);
      if (!hasTool(await itemsOf(tx, 'character', ch.id), 'wrench')) fail('Precisa de uma chave inglesa.');
      if (v.engine >= 5) fail('Este veículo já tem motor. Retire o atual antes de instalar outro.');
      patch.engine = Math.max(5, Number(it!.data?.engine ?? 60)); text = 'instala um motor em';
    }
    else if (p.engine) { if (!(await itemsOf(tx, 'character', ch.id)).some((i) => itemDef(i.defId)?.props.tool?.includes('wrench'))) fail('Precisa de uma chave inglesa.'); patch.engine = Math.min(100, v.engine + p.engine * (1 + mech * 0.1)); text = 'conserta o motor de'; }
    else if (p.carKey) { await tx.update(schema.items).set({ data: { ...it!.data, vehicleId: v.id } }).where(eq(schema.items.id, it!.id)); if (rng.chance(0.35)) { patch.hasKey = true; text = 'encontra a chave certa para'; } else { notify(ch.userId, 'A chave não serve neste veículo.', 'info'); pushSelf(ch.id); return { ok: true, matched: false }; } }
    else fail('Esse item não serve para o veículo.');
    if (!p.carKey) await consumeItem(tx, it!.id, 'character', ch.id, 1);
    await tx.update(schema.vehicles).set(patch).where(eq(schema.vehicles.id, v.id));
    if (p.engine || p.tires || p.engineBlock) await giveXp(tx, ch, 'mechanics', p.engineBlock ? 15 : 6, `service_${v.id}`);
    await systemEmote(ch.locationId, `${fullName(ch)} ${text} ${v.name.toLowerCase()}.`);
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true };
  });
}
export async function inspectVehicle(characterId: number, vehicleId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    const v = await vehicleHere(tx, ch, vehicleId);
    const storage = await itemsOf(tx, 'vehicle', v.id);
    const mech = ch.skills.mechanics?.level ?? 0;
    const fuzz = (n: number) => (mech >= 2 ? Math.round(n) : n > 66 ? 'bom' : n > 33 ? 'regular' : 'ruim');
    const used = storage.reduce((s, i) => s + (itemDef(i.defId)?.weight ?? 0) * i.quantity, 0);
    return { ok: true, vehicle: { id: v.id, name: v.name, type: v.type, seats: v.seats, fuel: mech >= 1 ? Math.round(v.fuel) : v.fuel > v.fuelMax / 2 ? 'mais da metade' : v.fuel > 0 ? 'pouco' : 'vazio', fuelMax: v.fuelMax, engine: v.engine < 5 ? 'sem motor' : fuzz(v.engine), tires: fuzz(v.tires), battery: v.battery < 5 ? 'sem bateria' : fuzz(v.battery), body: fuzz(v.body), running: v.running, hasKey: v.hasKey, driverId: v.driverId, noise: v.noise,
      storage: storage.length, trunk: { used: Math.round(used * 10) / 10, capacity: v.storage }, mechanics: mech,
      // o que dá para tirar deste veículo agora (o servidor confere de novo na hora)
      strip: { tire: v.tires >= 25, battery: v.battery >= 5, engine: v.engine >= 5, fuel: v.fuel >= 1 } } };
  });
}

// ───────────────────────── Porta-malas ─────────────────────────
/** Itens no porta-malas (limite em kg = capacidade de carga do veículo). */
export async function openTrunk(characterId: number, vehicleId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: true });
    const v = await vehicleHere(tx, ch, vehicleId);
    await assertVehicleAccess(tx, ch, v);
    const items = await itemsOf(tx, 'vehicle', v.id);
    const used = items.reduce((s, i) => s + (itemDef(i.defId)?.weight ?? 0) * i.quantity, 0);
    const { describeItem } = await import('./inventory.js');
    return { ok: true, trunk: { vehicleId: v.id, name: v.name, used: Math.round(used * 10) / 10, capacity: v.storage }, items: items.map(describeItem) };
  });
}
export async function trunkStore(characterId: number, vehicleId: number, itemId: number, qty?: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: true });
    const v = await vehicleHere(tx, ch, vehicleId);
    await assertVehicleAccess(tx, ch, v);
    const inside = await itemsOf(tx, 'vehicle', v.id);
    const { transferItem } = await import('./inventory.js');
    const it = await transferItem(tx, itemId, { type: 'character', id: ch.id }, { type: 'vehicle', id: v.id }, qty);
    const used = inside.reduce((s, i) => s + (itemDef(i.defId)?.weight ?? 0) * i.quantity, 0) + (itemDef(it.defId)?.weight ?? 0) * it.quantity;
    if (used > v.storage + 0.001) fail(`O porta-malas de ${v.name.toLowerCase()} não comporta isso (${Math.round(used * 10) / 10} de ${v.storage} kg).`);
    await systemEmote(ch.locationId, `${fullName(ch)} guarda ${itemDef(it.defId)?.name.toLowerCase()} no porta-malas de ${v.name.toLowerCase()}.`);
    pushSelf(ch.id);
    return { ok: true };
  });
}
export async function trunkTake(characterId: number, vehicleId: number, itemId: number, qty?: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch, { allowBusy: true });
    const v = await vehicleHere(tx, ch, vehicleId);
    await assertVehicleAccess(tx, ch, v);
    const { transferItem, carryInfo } = await import('./inventory.js');
    const it = await transferItem(tx, itemId, { type: 'vehicle', id: v.id }, { type: 'character', id: ch.id }, qty);
    if (carryInfo(await itemsOf(tx, 'character', ch.id), ch).ratio > 1.6) fail('Peso demais. Largue algo antes de tirar isso do porta-malas.');
    await systemEmote(ch.locationId, `${fullName(ch)} tira ${itemDef(it.defId)?.name.toLowerCase()} do porta-malas de ${v.name.toLowerCase()}.`);
    pushSelf(ch.id);
    return { ok: true };
  });
}

// ───────────────────────── Desmontar peças ─────────────────────────
/**
 * Tira uma peça de um veículo para usar em outro: pneu, bateria, motor ou combustível (com um galão vazio).
 * Exige Mecânica (nível por peça na configuração) e ferramentas. A peça vai para a mochila — ou para o chão, se pesar demais.
 */
export async function stripVehicle(characterId: number, vehicleId: number, part: 'tire' | 'battery' | 'engine' | 'fuel') {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch);
    const v = await vehicleHere(tx, ch, vehicleId);
    await assertVehicleAccess(tx, ch, v);
    if (v.running) fail('Desligue o motor antes de mexer nas peças.');
    if (v.driverId && v.driverId !== ch.id) fail('Tem alguém ao volante.');
    const parts = (cfg() as any).vehicleParts ?? {};
    const need = Number(parts[`${part}Level`] ?? (part === 'engine' ? 3 : 1));
    const mech = ch.skills.mechanics?.level ?? 0;
    const names = { tire: 'tirar um pneu', battery: 'tirar a bateria', engine: 'tirar o motor', fuel: 'tirar combustível' } as const;
    if (mech < need) fail(`Você não sabe como ${names[part]}: exige Mecânica nível ${need} (o seu é ${mech}).`);
    const items = await itemsOf(tx, 'character', ch.id);
    let give: { defId: string; data?: Record<string, any> } | null = null; const patch: Partial<typeof v> = {}; let text = '';
    if (part === 'tire') {
      if (!hasTool(items, 'wrench')) fail('Precisa de uma chave inglesa.');
      if (v.tires < 25) fail('Os pneus deste veículo estão acabados demais para aproveitar.');
      patch.tires = v.tires - 25; give = { defId: 'tire' }; text = `tira um pneu de ${v.name.toLowerCase()}`;
    } else if (part === 'battery') {
      if (!hasTool(items, 'wrench') && !hasTool(items, 'screwdriver')) fail('Precisa de uma chave inglesa ou de fenda.');
      if (v.battery < 5) fail('Não há bateria que preste aqui.');
      patch.battery = 0; give = { defId: 'car_battery', data: { battery: Math.round(v.battery) } }; text = `solta a bateria de ${v.name.toLowerCase()}`;
    } else if (part === 'engine') {
      if (!hasTool(items, 'wrench') || !hasTool(items, 'screwdriver')) fail('Precisa de chave inglesa e chave de fenda.');
      if (v.engine < 5) fail('Este veículo está sem motor.');
      if (ch.needs.energy < 15) fail('Tirar um motor é trabalho pesado. Descanse antes.');
      patch.engine = 0; give = { defId: 'car_engine', data: { engine: Math.round(v.engine) } }; text = `desmonta e arranca o motor de ${v.name.toLowerCase()}`;
      await tx.update(schema.characters).set({ needs: { ...ch.needs, energy: ch.needs.energy - 15 } }).where(eq(schema.characters.id, ch.id));
    } else {
      const can = items.find((i) => i.defId === 'gas_can_empty' && !i.slot);
      if (!can) fail('Precisa de um galão vazio para guardar o combustível.');
      if (v.fuel < 1) fail('O tanque está seco.');
      const liters = Math.round(Math.min(10, v.fuel) * 10) / 10;
      await consumeItem(tx, can!.id, 'character', ch.id, 1);
      patch.fuel = v.fuel - liters; give = { defId: 'gas_can', data: { fuel: liters } }; text = `puxa ${liters} L de combustível de ${v.name.toLowerCase()} com uma mangueira`;
    }
    await tx.update(schema.vehicles).set(patch).where(eq(schema.vehicles.id, v.id));
    const def = itemDef(give!.defId)!;
    const { carryInfo } = await import('./inventory.js');
    const carry = carryInfo(await itemsOf(tx, 'character', ch.id), ch);
    const tooHeavy = carry.weight + def.weight > carry.capacity * 1.6;
    await addItem(tx, tooHeavy ? 'location' : 'character', tooHeavy ? ch.locationId : ch.id, def.id, 1, { data: give!.data });
    await giveXp(tx, ch, 'mechanics', part === 'engine' ? 15 : 5, `strip_${v.id}_${part}`);
    await systemEmote(ch.locationId, `${fullName(ch)} ${text}.`);
    if (tooHeavy) notify(ch.userId, `${def.name} é pesado demais para carregar agora: ficou no chão. Guarde num porta-malas ou largue algo.`, 'warn');
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true };
  });
}

// ───────────────────────── Crafting ─────────────────────────
export async function craft(characterId: number, recipeId: string) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch);
    const r = getRecipes().find((x) => x.id === recipeId); if (!r) fail('Receita desconhecida.');
    const lvl = ch.skills[r!.skill]?.level ?? 0;
    if (lvl < r!.minLevel) fail(`Exige ${r!.skill} nível ${r!.minLevel}.`);
    if (r!.requiresKnowledge && !ch.knownRecipes.includes(r!.id)) fail('Você não conhece esta receita. Livros e profissões ensinam receitas.');
    const items = await itemsOf(tx, 'character', ch.id);
    for (const t of r!.tools) {
      if (t === 'campfire') { if (!fireLit(ch.locationId) && !isPowered(ch.locationId)) fail('Precisa de fogo: acenda uma fogueira aqui (ou use um fogão num local com energia).'); continue; }
      if (!hasTool(items, t)) fail(`Ferramenta necessária: ${t}.`);
    }
    const waste = charMod(ch.profession, ch.traits, 'buildMaterial');
    for (const inp of r!.inputs) await consumeByDef(tx, 'character', ch.id, inp.itemId, Math.max(1, Math.round(inp.qty * (r!.skill === 'carpentry' ? waste : 1))));
    // cozinheiro: toda receita de comida rende o dobro
    const yieldMult = r!.skill === 'cooking' && itemDef(r!.output.itemId)?.category === 'food' ? charMod(ch.profession, ch.traits, 'mealYield') : 1;
    await addItem(tx, 'character', ch.id, r!.output.itemId, Math.max(1, Math.round(r!.output.qty * yieldMult)));
    await tx.update(schema.characters).set({ needs: { ...ch.needs, energy: Math.max(0, ch.needs.energy - 2) } }).where(eq(schema.characters.id, ch.id));
    await giveXp(tx, ch, r!.skill, r!.xp, `craft_${r!.id}`);
    await gameLog(tx, ch.id, 'craft', `Fabricou: ${r!.name}.`);
    await systemEmote(ch.locationId, `${fullName(ch)} trabalha em: ${r!.name.toLowerCase()}.`);
    pushSelf(ch.id);
    return { ok: true };
  });
}
