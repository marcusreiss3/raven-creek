import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, schema, pool } from '../src/db/index.js';
import { boot, makePlayer } from './helpers.js';
import { startTravel, turnBack, follow } from '../src/game/services/travel.js';
import { CONNECTIONS } from '../src/game/content/world.js';
beforeAll(async () => { await boot(); });
afterAll(async () => { await pool.end(); });
const itemsOf = (id: number) => db.select().from(schema.items).where(and(eq(schema.items.ownerType, 'character'), eq(schema.items.ownerId, String(id))));
describe('profissões e viagem', () => {
  it('policial começa com pistola carregada na mão; militar com fuzil; médico no hospital', async () => {
    const p = await makePlayer({ profession: 'police' });
    const pi = await itemsOf(p.character.id);
    const gun = pi.find((i) => i.defId === 'pistol_9mm')!;
    expect(gun.slot).toBe('primary'); expect(gun.data.ammo).toBe(15);
    expect(pi.find((i) => i.defId === 'ammo_9mm')?.quantity).toBe(15);
    const s = await makePlayer({ profession: 'soldier' });
    const rifle = (await itemsOf(s.character.id)).find((i) => i.defId === 'service_rifle')!;
    expect(rifle.slot).toBe('primary'); expect(rifle.data.ammo).toBe(10);
    const d = await makePlayer({ profession: 'doctor' });
    expect(d.character.locationId).toBe('rc_hospital_lobby');
  });
  it('dar meia-volta: o líder volta com o grupo; quem segue volta sozinho e para de seguir', async () => {
    const conn = CONNECTIONS.find((c) => c.roadType !== 'indoor' && c.distance > 300)!;
    const a = await makePlayer({ locationId: conn.fromId }); const b = await makePlayer({ locationId: conn.fromId });
    await follow(b.character.id, a.character.id);
    await startTravel(a.character.id, conn.toId);
    const rb = await turnBack(b.character.id); expect(rb.detached).toBe(true);
    const [tb] = await db.select().from(schema.travels).where(and(eq(schema.travels.characterId, b.character.id), eq(schema.travels.status, 'active')));
    expect(tb.toId).toBe(conn.fromId); expect(tb.isLeader).toBe(true);
    const [cb] = await db.select().from(schema.characters).where(eq(schema.characters.id, b.character.id));
    expect(cb.followingId).toBeNull();
    await turnBack(a.character.id);
    const [ta] = await db.select().from(schema.travels).where(and(eq(schema.travels.characterId, a.character.id), eq(schema.travels.status, 'active')));
    expect(ta.toId).toBe(conn.fromId); expect(ta.fromId).toBe(conn.toId);
  });
});

import { teacherBonus } from '../src/game/services/survival.js';
describe('classes de suporte', () => {
  it('professor começa com 5 níveis e ensina quem está perto', async () => {
    const t = await makePlayer({ profession: 'teacher' });
    expect(t.character.skills.medicine.level).toBe(2);
    const sum = Object.values(t.character.skills).reduce((a: number, s: any) => a + s.level, 0);
    expect(sum).toBeGreaterThanOrEqual(5);
    const other = await makePlayer({ locationId: t.character.locationId });
    expect(await teacherBonus(db, other.character)).toBe(1); // professor desconectado não conta
  });
});
