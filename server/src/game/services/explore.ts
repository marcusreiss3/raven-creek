import { and, eq } from 'drizzle-orm';
import { db, schema, type Tx } from '../../db/index.js';
import { charMod } from '../content/character.js';
import { computeBodyMods, makeWound } from '../rules/body.js';
import { findCount, rollEntry } from '../rules/loot.js';
import { clamp, rng } from '../rules/rng.js';
import { assertCanAct, withCharacter, woundsOf } from './characters.js';
import { cfg, clock, getLootTable, itemDef, setWeather } from './config.js';
import { logEvent, pickEvent, randomVehicle, type EventDef } from './events.js';
import { fail, gameLog } from './infra.js';
import { addItem, carryInfo, hasTool, itemsOf, type CharRow } from './inventory.js';
import { notify, pushScene, pushSelf } from './realtime.js';
import { systemEmote } from './chat.js';
import { giveXp } from './survival.js';
import { startCombat } from './combat.js';
import { getLocation } from './world.js';
import { baseDefense } from './zombies.js';
import { isPowered } from './projects.js';
import { fireLit } from './nature.js';
import { dogFindBonus, maybeSpawnStray } from './dogs.js';
import { maybeFindNote, searchHiddenStash } from './stories.js';
import { assertHeliSearchable, heliSearch } from './heli.js';

const fullName = (c: CharRow) => `${c.firstName} ${c.lastName}`;

/** Inicia "Vasculhar": consome energia e estamina na hora (não dá para cancelar recarregando a página) e agenda a conclusão no servidor. */
export async function startExplore(characterId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    assertCanAct(ch);
    await assertHeliSearchable(ch.locationId); // capítulo 1: destroços cercados de infectados
    const e = cfg().exploration; const loc = getLocation(ch.locationId)!;
    if (ch.needs.energy < e.energyCost) fail('Você está exausto demais para vasculhar. Descanse ou durma — ainda dá para conversar, negociar e organizar o inventário.', 'no_energy');
    if (ch.needs.stamina < e.staminaCost) fail('Recupere o fôlego antes de vasculhar.', 'no_stamina');
    const items = await itemsOf(tx, 'character', ch.id);
    const wounds = await woundsOf(tx, ch.id);
    const mods = computeBodyMods(wounds, ch.amputations, ch.needs);
    const dark = clock().isDark && !hasTool(items, 'light') && !(loc.indoor && await baseHasLight(tx, ch.locationId));
    const lvl = ch.skills.scavenging?.level ?? 0;
    const seconds = e.baseSeconds * (dark ? e.nightWithoutLightTimeMultiplier : 1) * (1 + (1 - mods.manipulation) * 0.6) / (1 + lvl * 0.06);
    const runAt = new Date(Date.now() + seconds * 1000);
    const needs = { ...ch.needs, energy: ch.needs.energy - e.energyCost, stamina: ch.needs.stamina - e.staminaCost };
    const [job] = await tx.insert(schema.jobs).values({ kind: 'explore_complete', characterId: ch.id, runAt, payload: { locationId: ch.locationId, dark } }).returning();
    await tx.update(schema.characters).set({ state: 'busy', activity: 'idle', busyUntil: runAt, busyAction: { type: 'explore', jobId: job.id, label: 'Vasculhando', startedAt: Date.now() }, needs }).where(eq(schema.characters.id, ch.id));
    await systemEmote(ch.locationId, `${fullName(ch)} começa a vasculhar o local${dark ? ' no escuro, tateando' : ''}.`);
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true, seconds: Math.round(seconds), dark };
  });
}

async function baseHasLight(tx: Tx, locationId: string) {
  const [b] = await tx.select().from(schema.bases).where(eq(schema.bases.locationId, locationId));
  if (!b) return false;
  const st = await tx.select().from(schema.baseStructures).where(eq(schema.baseStructures.baseId, b.id));
  return st.some((s) => s.kind === 'lights') && st.some((s) => s.kind === 'generator' && Number(s.data.fuel ?? 0) > 0);
}

/** Conclusão (executada pelo agendador, persistente a reinicializações). Idempotente pelo jobId. */
export async function completeExplore(jobId: number, characterId: number) {
  return withCharacter(characterId, async (tx, ch) => {
    if (ch.state !== 'busy' || (ch.busyAction as any)?.jobId !== jobId) return { skipped: true };
    const loc = getLocation(ch.locationId)!; const e = cfg().exploration; const now = Date.now();
    const [ll0] = await tx.select().from(schema.locationLoot).where(eq(schema.locationLoot.locationId, ch.locationId)).for('update');
    if (!ll0) fail('Local sem tabela de recursos.');
    const hours = (now - ll0!.lastRegenAt.getTime()) / 3_600_000;
    let reserve = Math.min(ll0!.maxReserve, ll0!.reserve + ll0!.regenPerHour * hours);
    const items = await itemsOf(tx, 'character', ch.id);
    const wounds = await woundsOf(tx, ch.id);
    const mods = computeBodyMods(wounds, ch.amputations, ch.needs);
    const dark = clock().isDark && !hasTool(items, 'light');
    const recent = (ch.xpLedger.scavenging ?? []).filter((x) => x.k === `search_${ch.locationId}` && x.t > now - 30 * 60000).length;
    const lvl = ch.skills.scavenging?.level ?? 0;
    const farmMult = (loc.category === 'farm' || loc.category === 'field' ? charMod(ch.profession, ch.traits, 'farmLoot') : 1) * (await dogFindBonus(ch.id, tx));
    const count = findCount({
      reserveRatio: reserve / ll0!.maxReserve, skillLevel: lvl, perception: ch.attributes.perception ?? 4,
      lightMult: dark && loc.indoor ? e.nightWithoutLightFindMultiplier : 1, findMult: mods.findMult * charMod(ch.profession, ch.traits, 'findChance') * farmMult,
      baseFinds: e.baseFinds, repeatPenalty: recent * e.repeatSearchPenaltyPerSearch, minRatio: e.minReserveRatioToFind,
    });
    const table = getLootTable(loc.lootTableId);
    // capítulo 1: enquanto houver o que tirar dos destroços do helicóptero, a busca é neles
    const heliFound = await heliSearch(tx, ch);
    const found: string[] = heliFound ?? []; let dropped = false;
    let carry = carryInfo(items, ch);
    for (let i = 0; i < count && table && !heliFound; i++) {
      const entry = rollEntry(table.entries, clock().isDark, loc.tags);
      if (!entry) continue;
      const def = itemDef(entry.itemId); if (!def) continue;
      const cost = entry.cost ?? (e.reserveCost as Record<string, number>)[def.rarity] ?? 5;
      if (reserve < cost) continue;
      reserve -= cost;
      const qty = rng.int(entry.min, entry.max);
      const over = carry.weight + def.weight * qty > carry.capacity * 1.5;
      await addItem(tx, over ? 'location' : 'character', over ? ch.locationId : ch.id, def.id, qty);
      if (over) dropped = true; else carry = { ...carry, weight: carry.weight + def.weight * qty };
      found.push(qty > 1 ? `${def.name} ×${qty}` : def.name);
    }
    await tx.update(schema.locationLoot).set({ reserve, lastRegenAt: new Date(now), timesSearched: ll0!.timesSearched + 1 }).where(eq(schema.locationLoot.locationId, ch.locationId));
    await tx.update(schema.characters).set({ state: 'idle', busyUntil: null, busyAction: null }).where(eq(schema.characters.id, ch.id));
    ch.state = 'idle';
    await giveXp(tx, ch, 'scavenging', 4 + found.length * 2, `search_${ch.locationId}`);
    const summary = found.length ? `Encontrou: ${found.join(', ')}.${dropped ? ' (Pesado demais — parte ficou no chão.)' : ''}` : reserve / ll0!.maxReserve < 0.15 ? 'Este lugar já foi completamente saqueado.' : 'Não encontrou nada útil desta vez.';
    await gameLog(tx, ch.id, 'explore', `${loc.name}: ${summary}`, { found });
    notify(ch.userId, summary, found.length ? 'success' : 'info');
    await systemEmote(ch.locationId, `${fullName(ch)} termina de vasculhar${found.length ? ` e guarda ${found.length} item(ns)` : ', de mãos vazias'}.`);

    // ── Barulho: chance de atrair infectados
    const zombies = ll0!.zombies;
    const stealth = ch.skills.stealth?.level ?? 0;
    const chance = clamp(e.noiseEncounterBase * loc.danger * (zombies > 0 ? Math.min(1.6, 0.5 + zombies / 6) : 0.15) * (clock().phase === 'night' && !isPowered(ch.locationId) && !fireLit(ch.locationId) ? e.nightEncounterMultiplier : 1)
      * charMod(ch.profession, ch.traits, 'noise') * (1 - stealth * 0.05)
      * (1 - Math.min(0.9, (await baseDefense(tx, ch.locationId)) * Number((cfg() as any).zombies?.baseDefenseReduction ?? 0.05))), 0, 0.85);
    await (async () => {
      if (rng.chance(chance)) {
        const n = Math.max(1, Math.min(zombies || 1, rng.int(1, loc.danger > 0.6 ? 3 : 2)));
        await startCombat(tx, { characters: [ch], locationId: ch.locationId, zombieCount: n, reason: 'O barulho atraiu infectados enquanto você vasculhava!' });
        await systemEmote(ch.locationId, `Gemidos! Infectados avançam sobre ${fullName(ch)}!`, 'system');
        return;
      }
      if (await searchHiddenStash(tx, ch)) return;
      if (await maybeSpawnStray(tx, ch.locationId)) return;
      if (await maybeFindNote(tx, ch)) return;
      if (rng.chance(e.eventChance)) {
        const ev = await pickEvent(tx, { scope: 'explore', category: loc.category, danger: loc.danger, locationId: ch.locationId });
        if (ev) await applyExploreEvent(tx, ch, ev);
      }
    })();
    pushSelf(ch.id); pushScene(ch.locationId);
    return { ok: true, found };
  });
}

export async function applyExploreEvent(tx: Tx, ch: CharRow, ev: EventDef, triggeredBy: number | null = null) {
  const loc = getLocation(ch.locationId)!; const fx = ev.effects ?? {};
  await logEvent(tx, ev.id, ch.locationId, ch.id, {}, triggeredBy);
  notify(ch.userId, ev.text, ev.kind === 'combat' ? 'danger' : 'warn');
  await gameLog(tx, ch.id, 'event', ev.text);
  switch (ev.kind) {
    case 'combat': {
      const n = rng.int(fx.zombies?.min ?? 1, fx.zombies?.max ?? 1);
      if (fx.dangerBump) await tx.update(schema.locationLoot).set({ zombies: n + 1 }).where(eq(schema.locationLoot.locationId, ch.locationId));
      if (fx.stress) await tx.update(schema.characters).set({ needs: { ...ch.needs, stress: clamp(ch.needs.stress + fx.stress, 0, 100) } }).where(eq(schema.characters.id, ch.id));
      await startCombat(tx, { characters: [ch], locationId: ch.locationId, zombieCount: n, zombieTypes: fx.types, reason: ev.text });
      break;
    }
    case 'stress': await tx.update(schema.characters).set({ needs: { ...ch.needs, stress: clamp(ch.needs.stress + (fx.stress ?? 5), 0, 100) } }).where(eq(schema.characters.id, ch.id)); break;
    case 'message': if (fx.loot) await addItem(tx, 'character', ch.id, fx.loot.itemId, fx.loot.qty ?? 1); break;
    case 'loot': if (fx.loot) await addItem(tx, 'location', ch.locationId, fx.loot.itemId, fx.loot.qty ?? 1); break;
    case 'wound': {
      const region = fx.wound?.region === 'random_hand' ? rng.pick(['left_hand', 'right_hand']) : fx.wound?.region === 'random_leg' ? rng.pick(['left_leg', 'right_leg']) : fx.wound?.region ?? 'torso';
      await tx.insert(schema.wounds).values({ characterId: ch.id, ...makeWound(fx.wound?.type ?? 'scratch', region, rng.range(0.2, 0.5), ev.name) });
      break;
    }
    case 'vehicle': await tx.insert(schema.vehicles).values(randomVehicle(ch.locationId)); await systemEmote(ch.locationId, `${ch.firstName} encontrou um veículo abandonado aqui.`, 'system'); break;
    case 'weather': if (fx.weather) await setWeather(fx.weather); break;
  }
  if (ev.kind !== 'combat') await systemEmote(loc.id, ev.text, 'system');
}
export { db, and };
