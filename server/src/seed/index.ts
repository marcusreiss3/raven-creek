import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { db, pool, schema } from '../db/index.js';
import { env } from '../config/env.js';
import { defaultGameConfig } from '../game/content/defaultConfig.js';
import { CONNECTIONS, LOCATIONS, REGIONS, SCENE_KEYS, ARENA_KEYS, MUSIC_KEYS, SFX_KEYS } from '../game/content/world.js';
import { ITEM_DEFS, RECIPES } from '../game/content/items.js';
import { LOOT_TABLES } from '../game/content/loot.js';
import { ZOMBIE_TYPES } from '../game/content/zombies.js';
import { EVENT_DEFS } from '../game/content/events.js';
import { VEHICLE_TYPES } from '../game/content/structures.js';
import { generatePlaceholders } from './placeholders.js';

const RESERVE_BY_CATEGORY: Record<string, [number, number]> = {
  supermarket: [160, 2], store: [110, 1.6], hospital: [140, 1.4], pharmacy: [90, 1], police: [90, 0.8], military: [130, 0.8], prison: [90, 0.8], prison_inside: [100, 0.9],
  warehouse: [150, 1.5], industrial: [110, 1.2], farm: [120, 2.5], field: [110, 3], forest: [90, 3], lake: [80, 4], house: [80, 1], apartment: [70, 0.9],
};

/** Popula o banco com o conteúdo inicial. Idempotente: atualiza definições, preserva estado de jogo. */
export async function seed(opts: { demo?: boolean } = {}) {
  await db.transaction(async (tx) => {
    await tx.insert(schema.gameConfig).values({ key: 'game', value: defaultGameConfig }).onConflictDoNothing();
    await tx.insert(schema.gameConfig).values({ key: 'contentVersion', value: 12 }).onConflictDoNothing();
    await tx.insert(schema.gameConfig).values({ key: 'world', value: { baseGameMinutes: 8 * 60, baseRealMs: Date.now(), weather: 'clear', weatherChangedAtGameMinutes: 8 * 60 } }).onConflictDoNothing();
    for (const r of REGIONS) await tx.insert(schema.regions).values(r).onConflictDoUpdate({ target: schema.regions.id, set: r });
    for (const l of LOCATIONS) {
      const row = { ...l, data: l.data ?? {} };
      await tx.insert(schema.locations).values(row).onConflictDoUpdate({ target: schema.locations.id, set: { name: row.name, description: row.description, category: row.category, regionId: row.regionId, x: row.x, y: row.y } });
      const [res, regen] = RESERVE_BY_CATEGORY[l.category] ?? [80, 1.2];
      await tx.insert(schema.locationLoot).values({ locationId: l.id, reserve: res, maxReserve: res, regenPerHour: regen, zombies: Math.round(l.danger * 9) }).onConflictDoNothing();
    }
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.connections);
    if (!n) for (const c of CONNECTIONS) await tx.insert(schema.connections).values(c);
    for (const d of ITEM_DEFS) {
      const row = { id: d.id, name: d.name, category: d.category, description: d.description ?? '', weight: d.weight, volume: d.volume ?? 1, stackable: !!d.stackable, maxStack: d.maxStack ?? 1, durabilityMax: d.durabilityMax ?? 0, rarity: d.rarity ?? 'common', equipSlot: d.equipSlot ?? null, icon: d.icon ?? 'generic', props: d.props ?? {} };
      await tx.insert(schema.itemDefs).values(row).onConflictDoNothing();
    }
    for (const t of LOOT_TABLES) await tx.insert(schema.lootTables).values(t).onConflictDoNothing();
    for (const r of RECIPES) await tx.insert(schema.recipes).values(r).onConflictDoUpdate({ target: schema.recipes.id, set: r });
    for (const z of ZOMBIE_TYPES) await tx.insert(schema.zombieTypes).values(z).onConflictDoNothing();
    for (const e of EVENT_DEFS) await tx.insert(schema.eventDefs).values({ ...e, cooldownMinutes: e.cooldownMinutes ?? 0, conditions: e.conditions ?? {}, effects: e.effects ?? {}, requiresDecision: e.requiresDecision ?? false }).onConflictDoNothing();
    // Catálogo de assets
    const assets = [
      ...SCENE_KEYS.map((k) => ({ key: k, kind: 'scene', path: `/assets/scenes/${k}.webp`, label: k.replace(/_/g, ' '), width: 1920, height: 1080 })),
      ...ARENA_KEYS.map((k) => ({ key: `arena_${k}`, kind: 'arena', path: `/assets/arenas/${k}.png`, label: `Arena: ${k}`, width: 1024, height: 704 })),
      { key: 'portrait_default', kind: 'portrait', path: '/assets/portraits/default.png', label: 'Retrato padrão', width: 600, height: 900 },
      { key: 'portrait_npc_survivor', kind: 'portrait', path: '/assets/portraits/npc_survivor.png', label: 'NPC sobrevivente', width: 600, height: 900 },
      ...MUSIC_KEYS.map((k) => ({ key: `music_${k}`, kind: 'audio', path: `/assets/audio/music/${k}.ogg`, label: `Música: ${k}`, width: null, height: null })),
      ...SFX_KEYS.map((k) => ({ key: `sfx_${k}`, kind: 'audio', path: `/assets/audio/sfx/${k}.ogg`, label: `Efeito: ${k}`, width: null, height: null })),
    ];
    for (const a of assets) await tx.insert(schema.assets).values(a).onConflictDoNothing();
    // Contas
    const adminHash = await bcrypt.hash(env.seedAdminPassword, 10);
    await tx.insert(schema.users).values({ username: env.seedAdminUser, passwordHash: adminHash, role: 'admin' }).onConflictDoNothing();
    // Contêineres fixos e veículos abandonados iniciais (somente na primeira execução)
    const [{ ct }] = await tx.select({ ct: sql<number>`count(*)::int` }).from(schema.containers);
    if (!ct) {
      const spots: [string, string][] = [['res_house_01', 'Armário da cozinha'], ['res_house_02', 'Guarda-roupa'], ['res_house_04_basement', 'Baú empoeirado'], ['rc_hospital_ward', 'Armário de medicamentos'], ['rc_police', 'Gaveta trancada'], ['fm_miller_farm', 'Despensa'], ['fo_hunting_cabin', 'Baú do caçador'], ['in_warehouse_a', 'Prateleira alta']];
      for (const [loc, name] of spots) await tx.insert(schema.containers).values({ locationId: loc, name, kind: 'cabinet', capacity: 30 });
      const cars: [string, string, boolean][] = [['rc_parking', 'compact', false], ['rc_workshop', 'pickup', true], ['fm_miller_barn', 'pickup', false], ['mil_motor_pool', 'armored', false], ['res_house_02_garage', 'compact', true], ['in_truck_depot', 'truck', false], ['hw_service_station', 'motorcycle', false], ['rc_gas_station', 'van', false]];
      for (const [loc, type, key] of cars) { const v = VEHICLE_TYPES[type]; await tx.insert(schema.vehicles).values({ type, name: v.name, locationId: loc, seats: v.seats, storage: v.storage, fuelMax: v.fuelMax, fuel: Math.round(v.fuelMax * 0.3), engine: 70, tires: 75, battery: 60, body: 70, speed: v.speed, consumption: v.consumption, noise: v.noise, hasKey: key }); }
    }
  });
  if (opts.demo) await seedDemo();
  const n = await generatePlaceholders();
  return { placeholders: n };
}

/** Duas contas de demonstração para testar multiplayer em duas sessões de navegador. */
async function seedDemo() {
  const { createCharacter } = await import('../game/services/characters.js');
  const { loadAll } = await import('../game/services/config.js');
  await loadAll();
  const demo = [
    { username: 'alice', firstName: 'Alice', lastName: 'Moreau', profession: 'nurse', traits: ['keen_eye', 'smoker'], attributes: { strength: 4, agility: 5, endurance: 4, perception: 5, intellect: 4 } },
    { username: 'bruno', firstName: 'Bruno', lastName: 'Kessler', profession: 'carpenter', traits: ['tough', 'clumsy', 'heavy_eater'], attributes: { strength: 6, agility: 4, endurance: 5, perception: 3, intellect: 4 } },
  ];
  for (const d of demo) {
    const [u] = await db.insert(schema.users).values({ username: d.username, passwordHash: await bcrypt.hash('senha1234', 10) }).onConflictDoNothing().returning();
    if (!u) continue;
    await createCharacter(u.id, { firstName: d.firstName, lastName: d.lastName, age: 32, appearance: 'Roupas sujas, olhar cansado.', backstory: 'Personagem de demonstração.', profession: d.profession, traits: d.traits, attributes: d.attributes });
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('seed/index.ts')) {
  seed({ demo: process.env.SEED_DEMO !== '0' }).then(async (r) => { console.log(`Seed concluído. ${LOCATIONS.length} locais, ${CONNECTIONS.length} conexões, ${ITEM_DEFS.length} itens. Placeholders novos: ${r.placeholders}.`); await pool.end(); })
    .catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
}
