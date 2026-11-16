import { and, eq } from 'drizzle-orm';
import { schema } from '../../db/index.js';
import { charMod } from '../content/character.js';
import { clamp, rng } from '../rules/rng.js';
import { assertCanAct, withCharacter } from './characters.js';
import { getRecipes, itemDef } from './config.js';
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

/** Usa uma peça/combustível do inventário no veículo presente. */
export async function serviceVehicle(characterId: number, vehicleId: number, itemId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch);
    const v = await vehicleHere(tx, ch, vehicleId);
    const it = (await itemsOf(tx, 'character', ch.id)).find((i) => i.id === itemId);
    if (!it) fail('Item não encontrado.');
    const p = itemDef(it!.defId)?.props ?? {}; const mech = ch.skills.mechanics?.level ?? 0;
    const patch: Partial<typeof v> = {}; let text = '';
    if (p.fuel) { patch.fuel = Math.min(v.fuelMax, v.fuel + p.fuel); text = 'abastece'; }
    else if (p.battery) { patch.battery = p.battery; text = 'troca a bateria de'; }
    else if (p.tires) { patch.tires = Math.min(100, v.tires + p.tires); text = 'troca um pneu de'; }
    else if (p.engine) { if (!(await itemsOf(tx, 'character', ch.id)).some((i) => itemDef(i.defId)?.props.tool?.includes('wrench'))) fail('Precisa de uma chave inglesa.'); patch.engine = Math.min(100, v.engine + p.engine * (1 + mech * 0.1)); text = 'conserta o motor de'; }
    else if (p.carKey) { await tx.update(schema.items).set({ data: { ...it!.data, vehicleId: v.id } }).where(eq(schema.items.id, it!.id)); if (rng.chance(0.35)) { patch.hasKey = true; text = 'encontra a chave certa para'; } else { notify(ch.userId, 'A chave não serve neste veículo.', 'info'); pushSelf(ch.id); return { ok: true, matched: false }; } }
    else fail('Esse item não serve para o veículo.');
    if (!p.carKey) await consumeItem(tx, it!.id, 'character', ch.id, 1);
    await tx.update(schema.vehicles).set(patch).where(eq(schema.vehicles.id, v.id));
    if (p.engine || p.tires) await giveXp(tx, ch, 'mechanics', 6, `service_${v.id}`);
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
    return { ok: true, vehicle: { id: v.id, name: v.name, type: v.type, seats: v.seats, fuel: mech >= 1 ? Math.round(v.fuel) : v.fuel > v.fuelMax / 2 ? 'mais da metade' : v.fuel > 0 ? 'pouco' : 'vazio', fuelMax: v.fuelMax, engine: fuzz(v.engine), tires: fuzz(v.tires), battery: fuzz(v.battery), body: fuzz(v.body), running: v.running, hasKey: v.hasKey, driverId: v.driverId, noise: v.noise, storage: storage.length } };
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
