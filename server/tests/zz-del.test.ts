import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import { db, schema, pool } from '../src/db/index.js';
import { boot, makePlayer, startServer } from './helpers.js';
import { makeWound } from '../src/game/rules/body.js';
let srv: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => { await boot(); srv = await startServer(); });
afterAll(async () => { await srv.close(); await pool.end(); });
describe('apagar ficha', () => {
  it('admin apaga a ficha (com itens e ferimentos); a pessoa pode criar outra', async () => {
    const admin = await makePlayer({ role: 'admin' });
    const p = await makePlayer({ profession: 'police' });
    await db.insert(schema.wounds).values({ characterId: p.character.id, ...makeWound('scratch', 'left_arm', 0.3, 't') });
    const gm = await makePlayer({ role: 'gm' });
    expect((await request(srv.url).delete(`/api/admin/characters/${p.character.id}`).set('Cookie', gm.cookie).send({})).status).toBe(403);
    const r = await request(srv.url).delete(`/api/admin/characters/${p.character.id}`).set('Cookie', admin.cookie).send({ reason: 'teste' });
    expect(r.body.ok).toBe(true);
    expect((await db.select().from(schema.characters).where(eq(schema.characters.id, p.character.id))).length).toBe(0);
    expect((await db.select().from(schema.items).where(and(eq(schema.items.ownerType, 'character'), eq(schema.items.ownerId, String(p.character.id))))).length).toBe(0);
    const me = await request(srv.url).get('/api/auth/me').set('Cookie', p.cookie);
    expect(me.body.characterId).toBeNull();
  });
});
