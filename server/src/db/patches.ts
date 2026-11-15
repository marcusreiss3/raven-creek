import { eq, sql } from 'drizzle-orm';
import { db, schema } from './index.js';
import { ITEM_DEFS, RECIPES } from '../game/content/items.js';
import { LOOT_TABLES } from '../game/content/loot.js';

const itemRow = (d: (typeof ITEM_DEFS)[number]) => ({ id: d.id, name: d.name, category: d.category, description: d.description ?? '', weight: d.weight, volume: (d as any).volume ?? 1, stackable: !!d.stackable, maxStack: d.maxStack ?? 1, durabilityMax: d.durabilityMax ?? 0, rarity: d.rarity ?? 'common', equipSlot: d.equipSlot ?? null, icon: d.icon ?? 'generic', props: d.props ?? {} });

/**
 * Ajustes de balanceamento versionados, aplicados uma única vez em bancos já existentes
 * (o seed não sobrescreve dados que o administrador possa ter editado).
 */
const PATCHES: { version: number; name: string; run: () => Promise<void> }[] = [
  {
    version: 2, name: 'Combate mais perigoso: zumbis mais rápidos e menos PA para sobreviventes',
    run: async () => {
      const ap: Record<string, number> = { walker: 3, runner: 6, wanderer: 4 };
      for (const [id, v] of Object.entries(ap)) {
        await db.update(schema.zombieTypes).set({ stats: sql`jsonb_set(${schema.zombieTypes.stats}, '{ap}', to_jsonb(${v}::int))` })
          .where(sql`${schema.zombieTypes.id} = ${id} and (${schema.zombieTypes.stats}->>'ap')::int < ${v}`);
      }
      const [g] = await db.select().from(schema.gameConfig).where(eq(schema.gameConfig.key, 'game'));
      if (g && g.value?.combat?.playerAp === 6) {
        await db.update(schema.gameConfig).set({ value: { ...g.value, combat: { ...g.value.combat, playerAp: 4 } }, updatedAt: new Date() }).where(eq(schema.gameConfig.key, 'game'));
      }
    },
  },
  {
    version: 3, name: 'Mais infectados: estradas mais perigosas e zumbis na estrada mais comuns',
    run: async () => {
      const [g] = await db.select().from(schema.gameConfig).where(eq(schema.gameConfig.key, 'game'));
      if (g?.value?.travel) {
        const t = { ...g.value.travel };
        if (t.encounterChancePerKm === 0.22) t.encounterChancePerKm = 0.5;
        if (t.encounterChanceMin === 0.03) t.encounterChanceMin = 0.1;
        await db.update(schema.gameConfig).set({ value: { ...g.value, travel: t }, updatedAt: new Date() }).where(eq(schema.gameConfig.key, 'game'));
      }
      await db.update(schema.eventDefs).set({ weight: 8 }).where(sql`${schema.eventDefs.id} = 'trv_zombies_road' and ${schema.eventDefs.weight} = 5`);
      await db.update(schema.eventDefs).set({ weight: 2 }).where(sql`${schema.eventDefs.id} = 'trv_runner' and ${schema.eventDefs.weight} = 1.2`);
    },
  },
  {
    version: 4, name: 'Corpo congelado enquanto o jogador está desconectado',
    run: async () => {
      const [g] = await db.select().from(schema.gameConfig).where(eq(schema.gameConfig.key, 'game'));
      if (g?.value?.needs) {
        const needs = { ...g.value.needs, offlineBodyTimeMultiplier: 0 };
        delete needs.offlineNeedsMultiplier;
        await db.update(schema.gameConfig).set({ value: { ...g.value, needs }, updatedAt: new Date() }).where(eq(schema.gameConfig.key, 'game'));
      }
    },
  },
  {
    version: 5, name: 'Sobrevivência: fogueiras, caça e pesca, comida que estraga, estações e cachorros',
    run: async () => {
      const NEW = ['raw_fish', 'cooked_fish', 'cooked_meat', 'smoked_meat', 'salted_meat', 'salt', 'fishing_rod', 'firewood'];
      for (const d of ITEM_DEFS) if (NEW.includes(d.id)) await db.insert(schema.itemDefs).values(itemRow(d) as any).onConflictDoNothing();
      for (const id of ['apple', 'raw_meat', 'cooked_meal', 'plank', 'log', 'spoiled_food']) {
        const d = ITEM_DEFS.find((x) => x.id === id); if (!d) continue;
        await db.update(schema.itemDefs).set({ props: sql`${schema.itemDefs.props} || ${JSON.stringify(d.props ?? {})}::jsonb` }).where(eq(schema.itemDefs.id, id));
      }
      for (const r of RECIPES) await db.insert(schema.recipes).values(r as any).onConflictDoUpdate({ target: schema.recipes.id, set: r as any });
      const tables = await db.select().from(schema.lootTables);
      for (const t of LOOT_TABLES) {
        const row = tables.find((x) => x.id === t.id); if (!row) continue;
        const add = t.entries.filter((e) => NEW.includes(e.itemId) && !(row.entries as any[]).some((x) => x.itemId === e.itemId));
        if (add.length) await db.update(schema.lootTables).set({ entries: [...(row.entries as any[]), ...add] as any }).where(eq(schema.lootTables.id, t.id));
      }
    },
  },
  {
    version: 6, name: 'Bilhetes e mistérios, mural de recados e mortos que levantam',
    run: async () => {
      const d = ITEM_DEFS.find((x) => x.id === 'note');
      if (d) await db.insert(schema.itemDefs).values(itemRow(d) as any).onConflictDoNothing();
    },
  },
  {
    version: 7, name: 'Vícios: cigarro e bebida, abstinência e embriaguez',
    run: async () => {
      const NEW = ['beer', 'whiskey'];
      for (const d of ITEM_DEFS) if (NEW.includes(d.id)) await db.insert(schema.itemDefs).values(itemRow(d) as any).onConflictDoNothing();
      const cig = ITEM_DEFS.find((x) => x.id === 'cigarettes');
      if (cig) await db.update(schema.itemDefs).set({ name: cig.name, description: cig.description ?? '', weight: cig.weight, rarity: cig.rarity ?? 'uncommon', props: sql`${schema.itemDefs.props} || ${JSON.stringify(cig.props)}::jsonb` }).where(eq(schema.itemDefs.id, 'cigarettes'));
      const tables = await db.select().from(schema.lootTables);
      for (const t of LOOT_TABLES) {
        const row = tables.find((x) => x.id === t.id); if (!row) continue;
        const add = t.entries.filter((e) => (NEW.includes(e.itemId) || e.itemId === 'cigarettes') && !(row.entries as any[]).some((x) => x.itemId === e.itemId));
        if (add.length) await db.update(schema.lootTables).set({ entries: [...(row.entries as any[]), ...add] as any }).where(eq(schema.lootTables.id, t.id));
      }
    },
  },
  {
    version: 8, name: 'Emblemas de facção em símbolos (sem emoji)',
    run: async () => {
      const keys = ['wolf', 'raven', 'axes', 'anchor', 'skull', 'radiation', 'biohazard', 'fist', 'eagle', 'wire', 'crown', 'flame', 'pine', 'wheat', 'cross', 'banner'];
      const map: Record<string, string> = { '☣': 'biohazard', '☢': 'radiation', '💀': 'skull', '☠': 'skull', '🐺': 'wolf', '🦅': 'eagle', '⚓': 'anchor', '🔥': 'flame', '✊': 'fist', '👑': 'crown', '🌲': 'pine', '🌾': 'wheat', '✚': 'cross', '➕': 'cross' };
      for (const f of await db.select().from(schema.factions)) {
        if (keys.includes(f.emblem)) continue;
        await db.update(schema.factions).set({ emblem: map[f.emblem] ?? 'banner' }).where(eq(schema.factions.id, f.id));
      }
    },
  },
  {
    version: 9, name: 'Arenas de combate novas, uma para cada tipo de lugar',
    run: async () => {
      const { ARENA_BY_CATEGORY } = await import('../game/content/world.js');
      // Mapa antigo: só troca o que ainda está no padrão (arenas escolhidas à mão no painel ficam como estão).
      const OLD: Record<string, string> = {
        hospital: 'hospital_corridor', clinic: 'hospital_corridor', street: 'street', commercial: 'street', alley: 'street', house: 'house', apartment: 'house',
        basement: 'house', garage: 'house', shed: 'house', prison: 'prison_yard', prison_inside: 'hospital_corridor', forest: 'forest', camp: 'forest', lake: 'forest',
        parking: 'parking', road: 'road', bridge: 'road', tunnel: 'road', supermarket: 'supermarket', store: 'supermarket', pharmacy: 'supermarket', farm: 'forest',
        field: 'forest', barn: 'house', industrial: 'parking', warehouse: 'supermarket', military: 'parking', police: 'hospital_corridor', school: 'hospital_corridor',
        church: 'house', restaurant: 'supermarket', gas_station: 'parking', workshop: 'house', office: 'house', sewer: 'hospital_corridor', cabin: 'house', yard: 'street',
      };
      for (const l of await db.select().from(schema.locations)) {
        const next = ARENA_BY_CATEGORY[l.category];
        if (next && l.arenaKey === (OLD[l.category] ?? 'street') && next !== l.arenaKey) await db.update(schema.locations).set({ arenaKey: next }).where(eq(schema.locations.id, l.id));
      }
    },
  },
  {
    version: 10, name: 'Velhice: a idade passa a pesar a partir dos 60 anos',
    run: async () => {
      const { withAgeTrait } = await import('../game/content/character.js');
      for (const ch of await db.select().from(schema.characters)) {
        const next = withAgeTrait(ch.traits, ch.age);
        if (next.join() !== ch.traits.join()) await db.update(schema.characters).set({ traits: next }).where(eq(schema.characters.id, ch.id));
      }
    },
  },
  {
    version: 11, name: 'Vasculhar atrai infectados com mais frequência',
    run: async () => {
      const [g] = await db.select().from(schema.gameConfig).where(eq(schema.gameConfig.key, 'game'));
      // Só muda se ainda estiver no padrão antigo (valor ajustado à mão no painel fica como está).
      if (g?.value?.exploration?.noiseEncounterBase === 0.35)
        await db.update(schema.gameConfig).set({ value: { ...g.value, exploration: { ...g.value.exploration, noiseEncounterBase: 0.55 } }, updatedAt: new Date() }).where(eq(schema.gameConfig.key, 'game'));
    },
  },
  {
    version: 12, name: 'Combate rebalanceado: infectados mordem menos e lutar armado compensa',
    run: async () => {
      // Antigo → novo, por tipo; só troca o que ainda está no valor antigo (ajustes feitos à mão no painel ficam).
      const CHANGES: Record<string, Record<string, [number, number]>> = {"walker": {"body": [26, 22], "hitChance": [55, 45], "biteChance": [0.25, 0.12], "scratchChance": [0.5, 0.6], "lacerationChance": [0.25, 0.28]}, "runner": {"hitChance": [62, 55], "biteChance": [0.3, 0.16], "scratchChance": [0.45, 0.56], "lacerationChance": [0.25, 0.28]}, "brute": {"hitChance": [50, 45], "biteChance": [0.15, 0.08], "scratchChance": [0.2, 0.27]}, "wanderer": {"body": [24, 22], "hitChance": [55, 45], "biteChance": [0.25, 0.12], "scratchChance": [0.5, 0.6], "lacerationChance": [0.25, 0.28]}, "decayed": {"hitChance": [70, 60], "biteChance": [0.45, 0.25], "scratchChance": [0.35, 0.5], "lacerationChance": [0.2, 0.25]}};
      for (const z of await db.select().from(schema.zombieTypes)) {
        const ch = CHANGES[z.id]; if (!ch) continue;
        const stats: any = { ...z.stats };
        for (const [k, [from, to]] of Object.entries(ch)) if (stats[k] === from) stats[k] = to;
        await db.update(schema.zombieTypes).set({ stats }).where(eq(schema.zombieTypes.id, z.id));
      }
      const [g] = await db.select().from(schema.gameConfig).where(eq(schema.gameConfig.key, 'game'));
      if (g?.value) {
        const v = structuredClone(g.value);
        if (v.combat?.unarmedDamage === 3) v.combat.unarmedDamage = 5;
        if (v.infection?.lacerationChance === 0.2) v.infection.lacerationChance = 0.12;
        if (v.infection?.scratchChance === 0.06) v.infection.scratchChance = 0.03;
        await db.update(schema.gameConfig).set({ value: v, updatedAt: new Date() }).where(eq(schema.gameConfig.key, 'game'));
      }
    },
  },
  {
    version: 13, name: 'Cenários em WEBP (arquivos bem mais leves)',
    run: async () => {
      await db.execute(sql`update assets set path = regexp_replace(path, '\\.png$', '.webp') where kind = 'scene' and path like '/assets/scenes/%.png'`);
    },
  },
  {
    version: 14, name: 'Policiais e militares com arma de serviço (pistola e fuzil carregados)',
    run: async () => {
      const rifle = ITEM_DEFS.find((d) => d.id === 'service_rifle');
      if (rifle) await db.insert(schema.itemDefs).values(itemRow(rifle) as any).onConflictDoNothing();
      // quem já existe também recebe a arma da profissão (se ainda não tiver arma de fogo)
      const kits: Record<string, { gun: string; mag: number; ammo: string; qty: number }> = {
        police: { gun: 'pistol_9mm', mag: 15, ammo: 'ammo_9mm', qty: 15 },
        soldier: { gun: 'service_rifle', mag: 10, ammo: 'ammo_308', qty: 10 },
      };
      const chars = await db.select({ id: schema.characters.id, profession: schema.characters.profession }).from(schema.characters)
        .where(sql`${schema.characters.alive} = true and ${schema.characters.profession} in ('police', 'soldier')`);
      const guns = ITEM_DEFS.filter((d) => (d.props as any)?.weaponType === 'ranged').map((d) => d.id);
      for (const c of chars) {
        const k = kits[c.profession]; if (!k) continue;
        const owned = await db.select({ defId: schema.items.defId, slot: schema.items.slot }).from(schema.items)
          .where(sql`${schema.items.ownerType} = 'character' and ${schema.items.ownerId} = ${String(c.id)}`);
        if (owned.some((i) => guns.includes(i.defId))) continue;
        const handFree = !owned.some((i) => i.slot === 'primary');
        const dmax = ITEM_DEFS.find((d) => d.id === k.gun)?.durabilityMax ?? 100;
        await db.insert(schema.items).values({ defId: k.gun, quantity: 1, durability: Math.round(dmax * 0.8), ownerType: 'character', ownerId: String(c.id), slot: handFree ? 'primary' : null, data: { ammo: k.mag } });
        await db.insert(schema.items).values({ defId: k.ammo, quantity: k.qty, durability: 0, ownerType: 'character', ownerId: String(c.id), data: {} });
      }
    },
  },
  {
    version: 15, name: 'Classes de suporte: fome mais presente, cozinheiro, agricultor e professor mais fortes',
    run: async () => {
      // fome e sede passam a pesar (tempo conectado); só muda se ainda estiver no valor antigo
      const [g] = await db.select().from(schema.gameConfig).where(eq(schema.gameConfig.key, 'game'));
      if (g?.value?.needs) {
        const v = structuredClone(g.value);
        if (v.needs.hungerPerHour === 3) v.needs.hungerPerHour = 7;
        if (v.needs.thirstPerHour === 4.5) v.needs.thirstPerHour = 8;
        await db.update(schema.gameConfig).set({ value: v, updatedAt: new Date() }).where(eq(schema.gameConfig.key, 'game'));
      }
      const stew = RECIPES.find((r) => r.id === 'hearty_stew');
      if (stew) await db.insert(schema.recipes).values(stew as any).onConflictDoUpdate({ target: schema.recipes.id, set: stew as any });
      // quem já é cozinheiro aprende o ensopado; professores ganham os níveis novos da profissão
      const chars = await db.select({ id: schema.characters.id, profession: schema.characters.profession, knownRecipes: schema.characters.knownRecipes, skills: schema.characters.skills })
        .from(schema.characters).where(sql`${schema.characters.alive} = true and ${schema.characters.profession} in ('cook', 'teacher')`);
      const xpAt = (lvl: number) => Math.round(60 * Math.pow(lvl, 1.55));
      for (const c of chars) {
        if (c.profession === 'cook' && !c.knownRecipes.includes('hearty_stew')) await db.update(schema.characters).set({ knownRecipes: [...c.knownRecipes, 'hearty_stew'] }).where(eq(schema.characters.id, c.id));
        if (c.profession === 'teacher') {
          const sk = structuredClone(c.skills) as Record<string, { level: number; xp: number }>;
          for (const [id, lvl] of Object.entries({ medicine: 2, carpentry: 1, electrical: 1 })) {
            const cur = sk[id] ?? { level: 0, xp: 0 };
            if (cur.level < lvl) sk[id] = { level: lvl, xp: Math.max(cur.xp, xpAt(lvl)) };
          }
          await db.update(schema.characters).set({ skills: sk as any }).where(eq(schema.characters.id, c.id));
        }
      }
    },
  },
  {
    version: 16, name: 'Caçador com arco de caça e flechas (dá para fazer e recolher flechas)',
    run: async () => {
      for (const id of ['hunting_bow', 'arrow']) { const d = ITEM_DEFS.find((x) => x.id === id); if (d) await db.insert(schema.itemDefs).values(itemRow(d) as any).onConflictDoNothing(); }
      const rec = RECIPES.find((r) => r.id === 'arrow_craft');
      if (rec) await db.insert(schema.recipes).values(rec as any).onConflictDoUpdate({ target: schema.recipes.id, set: rec as any });
      const hunters = await db.select({ id: schema.characters.id, knownRecipes: schema.characters.knownRecipes }).from(schema.characters)
        .where(sql`${schema.characters.alive} = true and ${schema.characters.profession} = 'hunter'`);
      const guns = ITEM_DEFS.filter((d) => (d.props as any)?.weaponType === 'ranged').map((d) => d.id);
      for (const h of hunters) {
        if (!h.knownRecipes.includes('arrow_craft')) await db.update(schema.characters).set({ knownRecipes: [...h.knownRecipes, 'arrow_craft'] }).where(eq(schema.characters.id, h.id));
        const owned = await db.select({ defId: schema.items.defId, slot: schema.items.slot }).from(schema.items)
          .where(sql`${schema.items.ownerType} = 'character' and ${schema.items.ownerId} = ${String(h.id)}`);
        if (owned.some((i) => guns.includes(i.defId))) continue;
        const handFree = !owned.some((i) => i.slot === 'primary');
        await db.insert(schema.items).values({ defId: 'hunting_bow', quantity: 1, durability: 200, ownerType: 'character', ownerId: String(h.id), slot: handFree ? 'primary' : null, data: { ammo: 6 } });
        await db.insert(schema.items).values({ defId: 'arrow', quantity: 12, durability: 0, ownerType: 'character', ownerId: String(h.id), data: {} });
      }
    },
  },
];

export async function applyPatches() {
  const [meta] = await db.select().from(schema.gameConfig).where(eq(schema.gameConfig.key, 'contentVersion'));
  let current = Number(meta?.value ?? 1);
  for (const p of PATCHES) {
    if (p.version <= current) continue;
    await p.run();
    current = p.version;
    await db.insert(schema.gameConfig).values({ key: 'contentVersion', value: current }).onConflictDoUpdate({ target: schema.gameConfig.key, set: { value: current, updatedAt: new Date() } });
    console.log(`Atualização de conteúdo aplicada: ${p.name}`);
  }
}
