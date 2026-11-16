import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, schema, pool } from '../src/db/index.js';
import { boot, makePlayer } from './helpers.js';
import { addItem, itemsOf, describeItem } from '../src/game/services/inventory.js';
import { dismantleItem, giveItem, tearClothing, treat, useItem } from '../src/game/services/survival.js';
import { previewTravel, startTravel } from '../src/game/services/travel.js';
import { enterVehicle } from '../src/game/services/vehicles.js';
import { makeWound } from '../src/game/rules/body.js';
import { cfg, getRecipes, itemDef } from '../src/game/services/config.js';
import { CONNECTIONS } from '../src/game/content/world.js';

beforeAll(async () => { await boot(); });
afterAll(async () => { await pool.end(); });

const inv = async (id: number) => itemsOf(db as any, 'character', id);
const give = async (id: number, defId: string, qty = 1) => (await addItem(db as any, 'character', id, defId, qty))[0];
const count = async (id: number, defId: string) => (await inv(id)).filter((i) => i.defId === defId).reduce((s, i) => s + i.quantity, 0);

describe('lote: sobrevivência', () => {
  it('fome/sede mais altas, caça de 15 min e receita com restos', () => {
    expect(cfg().needs.hungerPerHour).toBeGreaterThanOrEqual(12);
    expect(cfg().needs.thirstPerHour).toBeGreaterThanOrEqual(15);
    expect((cfg() as any).nature.huntMinutes).toBe(15);
    const r = getRecipes().find((x) => x.id === 'leftovers_meal');
    expect(r?.minLevel).toBe(4);
    expect(getRecipes().some((x) => x.id === 'wash_rag')).toBe(true);
  });

  it('rasga roupa em trapos e desmonta lança em tábua', async () => {
    const p = await makePlayer({ locationId: 'rc_main_street' }); const id = p.character.id;
    const jeansBefore = await count(id, 'jeans');
    const jeans = await give(id, 'jeans', 1);
    expect(describeItem(jeans).rippable).toBe(3);
    const before = await count(id, 'rag');
    await tearClothing(id, jeans.id);
    expect(await count(id, 'rag')).toBeGreaterThan(before);
    expect(await count(id, 'jeans')).toBe(jeansBefore);
    const spear = await give(id, 'spear', 1);
    expect(describeItem(spear).canDismantle).toBe(true);
    const planks = await count(id, 'plank');
    await dismantleItem(id, spear.id);
    expect(await count(id, 'plank')).toBe(planks + 1);
    const beans = await give(id, 'canned_beans', 1);
    await expect(dismantleItem(id, beans.id)).rejects.toThrow(/aproveitar/);
  });

  it('trocar curativo de trapo devolve um trapo sujo', async () => {
    const p = await makePlayer({ locationId: 'rc_main_street' }); const id = p.character.id;
    const [w] = await db.insert(schema.wounds).values({ characterId: id, ...makeWound('cut_deep', 'left_arm', 0.6, 't') }).returning();
    const r1 = await give(id, 'rag', 2);
    await treat(id, id, w.id, r1.id);
    expect(await count(id, 'dirty_rag')).toBe(0);
    const r2 = (await inv(id)).find((i) => i.defId === 'rag')!;
    await treat(id, id, w.id, r2.id);
    expect(await count(id, 'dirty_rag')).toBe(1);
  });
});

describe('lote: viagem', () => {
  it('correndo leva metade do tempo e gasta fôlego; dá para comer e entregar itens na estrada', async () => {
    const conn = CONNECTIONS.find((c) => c.roadType !== 'indoor')!;
    const a = await makePlayer({ locationId: conn.fromId }); const b = await makePlayer({ locationId: conn.fromId });
    const walk = await previewTravel(a.character.id, conn.toId);
    await startTravel(a.character.id, conn.toId, { run: true });
    const [t] = await db.select().from(schema.travels).where(eq(schema.travels.characterId, a.character.id));
    expect(t.durationMs).toBeLessThan(walk.durationMs * 0.6);
    const [ca] = await db.select().from(schema.characters).where(eq(schema.characters.id, a.character.id));
    expect(ca.needs.stamina).toBeLessThanOrEqual(80);
    expect(ca.state).toBe('traveling');
    await give(a.character.id, 'crackers', 1);
    const crackers = await count(a.character.id, 'crackers');
    const food = (await inv(a.character.id)).find((i) => i.defId === 'crackers')!;
    await useItem(a.character.id, food.id);
    expect(await count(a.character.id, 'crackers')).toBe(crackers - 1);
    // quem ficou no lugar não recebe itens de quem está na estrada
    await give(a.character.id, 'rag', 1);
    const gift = (await inv(a.character.id)).find((i) => i.defId === 'rag')!;
    await expect(giveItem(a.character.id, b.character.id, gift.id)).rejects.toThrow(/aqui/);
  });
});

describe('lote: veículo de quem morreu', () => {
  it('motorista morto não bloqueia o volante', async () => {
    const dead = await makePlayer({ locationId: 'rc_main_street' }); const p = await makePlayer({ locationId: 'rc_main_street' });
    const [v] = await db.insert(schema.vehicles).values({ type: 'sedan', name: 'Sedã', locationId: 'rc_main_street', seats: 4, storage: 40, fuelMax: 50, fuel: 10, engine: 70, tires: 70, battery: 60, body: 70, speed: 12, consumption: 0.1, noise: 1, hasKey: false, driverId: dead.character.id, ownerCharacterId: dead.character.id }).returning();
    await db.update(schema.characters).set({ alive: false, state: 'dead', vehicleId: null }).where(eq(schema.characters.id, dead.character.id));
    await enterVehicle(p.character.id, v.id);
    const [vv] = await db.select().from(schema.vehicles).where(and(eq(schema.vehicles.id, v.id)));
    expect(vv.driverId).toBe(p.character.id);
  });
});

describe('lote: sono e obras', () => {
  it('as obras só pedem itens que existem', async () => {
    const { PROJECTS } = await import('../src/game/content/projects.js');
    for (const p of PROJECTS) for (const m of p.materials) expect(itemDef(m.itemId), `${p.id}:${m.itemId}`).toBeTruthy();
    expect(getRecipes().find((r) => r.id === 'barricade_kit_craft')?.output.itemId).toBe('barricade_kit');
  });
});

import { completeDogScavenge, petDog, sendDogScavenge, treatDog, dogView } from '../src/game/services/dogs.js';
describe('lote: cachorro', () => {
  it('cuida, fareja com recarga e alivia o estresse', async () => {
    const p = await makePlayer({ locationId: 'res_house_03' }); const id = p.character.id;
    const [d] = await db.insert(schema.companions).values({ name: 'Rex', status: 'owned', ownerCharacterId: id, locationId: 'res_house_03', health: 50, hunger: 20, trust: 80, loyalty: 60, data: { variant: 'caramelo' } }).returning();
    await give(id, 'bandage', 2);
    const band = (await inv(id)).find((i) => i.defId === 'bandage')!;
    const r = await treatDog(id, band.id);
    expect(r.health).toBeGreaterThan(50);
    const band2 = (await inv(id)).find((i) => i.defId === 'bandage')!;
    await expect(treatDog(id, band2.id)).rejects.toThrow(/assentar/);

    await sendDogScavenge(id);
    expect((await dogView(id))!.awayUntil).toBeTruthy();
    await expect(sendDogScavenge(id)).rejects.toThrow(/farejando/);
    await completeDogScavenge(id, d.id, 'res_house_03');
    const v = await dogView(id);
    expect(v!.awayUntil).toBeNull(); expect(v!.scavengeReadyAt).toBeTruthy();
    await expect(sendDogScavenge(id)).rejects.toThrow(/cansado/);

    await db.update(schema.characters).set({ needs: { ...(await db.select().from(schema.characters).where(eq(schema.characters.id, id)))[0].needs, stress: 50 } }).where(eq(schema.characters.id, id));
    await petDog(id);
    const [c] = await db.select().from(schema.characters).where(eq(schema.characters.id, id));
    expect(c.needs.stress).toBeLessThan(50);
    await expect(petDog(id)).rejects.toThrow(/carinho/);
  });
});
