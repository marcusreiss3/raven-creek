import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema, pool } from '../src/db/index.js';
import { boot, makePlayer } from './helpers.js';
import { follow, startTravel } from '../src/game/services/travel.js';
import { CONNECTIONS } from '../src/game/content/world.js';
beforeAll(async () => { await boot(); });
afterAll(async () => { await pool.end(); });
describe('seguir alguém', () => {
  it('quem ficou para trás deixa de seguir sozinho ao escolher um caminho', async () => {
    const conn = CONNECTIONS.find((c) => c.roadType !== "indoor")!;
    const a = await makePlayer({ locationId: conn.fromId }); const b = await makePlayer({ locationId: conn.fromId });
    await follow(b.character.id, a.character.id);
    // o líder foi embora sem o seguidor
    await db.update(schema.characters).set({ locationId: conn.toId }).where(eq(schema.characters.id, a.character.id));
    const r = await startTravel(b.character.id, conn.toId);
    expect(r.ok ?? true).toBeTruthy();
    const [bb] = await db.select().from(schema.characters).where(eq(schema.characters.id, b.character.id));
    expect(bb.followingId).toBeNull();
  });
  it('com o líder ainda aqui, continua pedindo para parar de seguir', async () => {
    const conn = CONNECTIONS.find((c) => c.roadType !== "indoor")!;
    const a = await makePlayer({ locationId: conn.fromId }); const b = await makePlayer({ locationId: conn.fromId });
    await follow(b.character.id, a.character.id);
    await expect(startTravel(b.character.id, conn.toId)).rejects.toThrow(/seguindo/);
  });
});
