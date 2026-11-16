import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, schema, pool } from '../src/db/index.js';
import { boot, makePlayer } from './helpers.js';
import { MYSTERIES } from '../src/game/content/mysteries.js';
import { getLocation, connectionsFrom } from '../src/game/services/world.js';
import { cfg, itemDef } from '../src/game/services/config.js';
import { maybeFindNote, openSafe, safesAt, searchHiddenStash, spotHiddenStash } from '../src/game/services/stories.js';
import { addItem, itemsOf } from '../src/game/services/inventory.js';
import { hideFromHorde, hordeIntel, lureHorde, stopHiding } from '../src/game/services/hordes.js';
import { rng } from '../src/game/rules/rng.js';

beforeAll(async () => { await boot(); });
afterAll(async () => { await pool.end(); });
const charRow = async (id: number) => (await db.select().from(schema.characters).where(eq(schema.characters.id, id)))[0];

describe('novos mistérios', () => {
  it('todos os lugares e itens existem', () => {
    for (const m of MYSTERIES) {
      expect(getLocation(m.locationId), m.id).toBeTruthy();
      for (const r of m.reward) expect(itemDef(r.itemId), `${m.id}:${r.itemId}`).toBeTruthy();
      if (m.requiresItem) expect(itemDef(m.requiresItem)).toBeTruthy();
      for (const f of m.fragments) {
        for (const l of f.locationIds) expect(getLocation(l), `${f.id}:${l}`).toBeTruthy();
        if (f.itemId) expect(itemDef(f.itemId), f.id).toBeTruthy();
      }
    }
  });

  it('porta do laboratório só abre com o crachá', async () => {
    const p = await makePlayer({ locationId: 'in_factory_floor' }); const id = p.character.id;
    const doors = await safesAt('in_factory_floor');
    expect(doors.some((d) => d.keycard)).toBe(true);
    await expect(openSafe(id, 'lab_ashcroft', '')).rejects.toThrow(/crachá/i);
    await addItem(db as any, 'character', id, 'ashcroft_keycard', 1);
    const r = await openSafe(id, 'lab_ashcroft', '');
    expect(r.opened).toBe(true);
    expect((await itemsOf(db as any, 'character', id)).some((i) => i.defId === 'gas_mask')).toBe(true);
  });

  it('foto: achar revela, mas o esconderijo só aparece vasculhando o lugar certo', async () => {
    (cfg() as any).mysteries = { ...((cfg() as any).mysteries ?? {}), findChance: 1 };
    const finder = await makePlayer({ locationId: 'res_house_08' });
    const title = await db.transaction(async (tx) => maybeFindNote(tx as any, await charRow(finder.character.id)));
    expect(title).toMatch(/balanço/);
    expect((await itemsOf(db as any, 'character', finder.character.id)).some((i) => i.defId === 'old_photo')).toBe(true);
    const [st] = await db.select().from(schema.mysteries).where(eq(schema.mysteries.id, 'foto_escorregador'));
    expect(st.status).toBe('revealed');
    const stash = () => db.select().from(schema.containers).where(and(eq(schema.containers.locationId, 'res_playground'), eq(schema.containers.kind, 'stash')));
    expect((await stash()).length).toBe(0);
    const seeker = await makePlayer({ locationId: 'res_playground' });
    let found = false;
    for (let i = 0; i < 30 && !found; i++) found = await db.transaction(async (tx) => searchHiddenStash(tx as any, await charRow(seeker.character.id)));
    expect(found).toBe(true);
    expect((await stash()).length).toBe(1);
  });

  it('comboio: aparece para quem chega depois das pistas', async () => {
    await db.insert(schema.mysteries).values({ id: 'comboio_perdido', status: 'revealed' }).onConflictDoUpdate({ target: schema.mysteries.id, set: { status: 'revealed' } });
    const p = await makePlayer({ locationId: 'hw_dirt_north' });
    const ok = await db.transaction(async (tx) => spotHiddenStash(tx as any, 'hw_dirt_north', [await charRow(p.character.id)]));
    expect(ok).toBe(true);
    const again = await db.transaction(async (tx) => spotHiddenStash(tx as any, 'hw_dirt_north', [await charRow(p.character.id)]));
    expect(again).toBe(false);
  });
});

describe('hordas migrando', () => {
  it('sem equipamento só ouve; com binóculo vê tamanho e caminho; rojão desvia; esconder-se', async () => {
    await db.update(schema.hordes).set({ active: false });
    const here = 'hw_crossroads';
    const near = connectionsFrom(here).find((c) => !getLocation(c.other)?.indoor)!.other;
    const far = connectionsFrom(near).map((c) => c.other).find((x) => x !== here)!;
    const [h] = await db.insert(schema.hordes).values({ name: 'Horda de teste', size: 17, locationId: near, targetLocationId: far, nextMoveAt: new Date(Date.now() + 30 * 60000) }).returning();
    const p = await makePlayer({ locationId: here }); const id = p.character.id;

    let intel = await hordeIntel(id);
    const mine = intel.hordes.find((x) => x.id === h.id)!;
    expect(mine.source).toBe('heard'); expect(mine.size).toBeNull(); expect(mine.path).toEqual([]);

    await addItem(db as any, 'character', id, 'binoculars', 1);
    intel = await hordeIntel(id);
    const seen = intel.hordes.find((x) => x.id === h.id)!;
    expect(seen.source).toBe('binoculars'); expect(seen.size).toBe(17); expect(seen.path[0]).toBe(far);

    await addItem(db as any, 'character', id, 'firecrackers', 1);
    await lureHorde(id, 'firecrackers').catch(() => undefined); // o barulho pode puxar um combate local; o desvio já foi gravado
    const [moved] = await db.select().from(schema.hordes).where(eq(schema.hordes.id, h.id));
    expect(moved.targetLocationId).toBe(here);
    intel = await hordeIntel(id);
    expect(intel.hordes.find((x) => x.id === h.id)!.headingHere).toBe(true);

    const q = await makePlayer({ locationId: here });
    const orig = rng.chance; (rng as any).chance = () => false; // furtividade: não falha
    try { const r = await hideFromHorde(q.character.id); expect(r.hidden).toBe(true); } finally { (rng as any).chance = orig; }
    expect((await charRow(q.character.id)).state).toBe('busy');
    await stopHiding(q.character.id);
    expect((await charRow(q.character.id)).state).toBe('idle');
  });
});
