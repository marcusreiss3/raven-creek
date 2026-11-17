import type { LootEntry } from '../../db/schema.js';

const e = (itemId: string, weight: number, min = 1, max = 1, extra: Partial<LootEntry> = {}): LootEntry => ({ itemId, weight, min, max, ...extra });

/** Tabelas de loot centralizadas (pesos relativos). Editáveis no painel → Loot. */
export const LOOT_TABLES: { id: string; name: string; entries: LootEntry[] }[] = [
  { id: 'residential', name: 'Residência comum', entries: [ e('beer', 3, 1, 2), e('whiskey', 1.2), 
    e('canned_beans', 8, 1, 2), e('canned_soup', 6), e('cereal', 6), e('crackers', 6), e('spoiled_food', 8), e('water_bottle', 6), e('soda', 5), e('dirty_water', 3),
    e('rag', 6, 1, 3), e('bandage', 3), e('painkillers', 2), e('kitchen_knife', 4), e('baseball_bat', 1.5), e('hammer', 1.5), e('screwdriver', 2), e('flashlight', 2.5),
    e('lighter', 3), e('tshirt', 4), e('flannel_shirt', 3), e('jeans', 3), e('sneakers', 2), e('school_bag', 2), e('cigarettes', 3), e('family_photo', 2), e('wedding_ring', 0.6),
    e('book_first_aid', 0.6), e('book_carpentry', 0.5), e('book_farming', 0.4), e('nails', 2, 4, 12), e('car_keys', 0.8), e('chocolate', 2), e('scarf', 1.5), e('winter_coat', 1),
  ] },
  { id: 'residential_doctor', name: 'Casa de médico', entries: [
    e('bandage', 6, 1, 3), e('antiseptic', 4), e('painkillers', 4), e('antibiotics', 1.5), e('suture_kit', 1), e('first_aid_kit', 1), e('book_first_aid', 2), e('canned_soup', 4), e('water_bottle', 4), e('surgical_mask', 3),
  ] },
  { id: 'residential_hunter', name: 'Casa/cabana de caçador', entries: [ e('whiskey', 2), e('beer', 2, 1, 2), e('cigarettes', 2, 1, 3), 
    e('fishing_rod', 2.5), e('salt', 2), e('firewood', 3, 1, 3), 
    e('hunting_knife', 3), e('hunting_rifle', 0.6), e('ammo_308', 2, 2, 6), e('raw_meat', 4), e('canteen', 2), e('hiking_bag', 2), e('rope', 3), e('book_survival', 1), e('canned_beans', 4), e('leather_gloves', 2), e('flashlight', 2), e('cargo_pants', 2),
  ] },
  { id: 'street', name: 'Rua / exterior', entries: [
    e('spoiled_food', 4), e('soda', 3), e('water_bottle', 2), e('rag', 4), e('pipe', 2), e('scrap_metal', 4, 1, 2), e('cigarettes', 3), e('school_bag', 1.5), e('car_keys', 1), e('crowbar', 0.8), e('tire', 0.5), e('plank', 2), e('nails', 1, 3, 8), e('lighter', 1),
  ] },
  { id: 'store', name: 'Loja / mercado', entries: [ e('beer', 5, 1, 3), e('whiskey', 1.5), 
    e('salt', 3), 
    e('canned_beans', 7, 1, 3), e('canned_soup', 6, 1, 2), e('cereal', 5), e('crackers', 6), e('chocolate', 5), e('soda', 6, 1, 2), e('water_bottle', 6, 1, 2), e('spoiled_food', 6), e('lighter', 3), e('cigarettes', 4), e('flashlight', 1.5), e('rag', 2),
  ] },
  { id: 'supermarket', name: 'Supermercado', entries: [ e('beer', 6, 1, 4), e('whiskey', 2), 
    e('salt', 3, 1, 2), 
    e('canned_beans', 8, 1, 4), e('canned_soup', 7, 1, 3), e('cereal', 6, 1, 2), e('crackers', 6, 1, 2), e('chocolate', 4), e('soda', 6, 1, 3), e('water_bottle', 8, 1, 3), e('spoiled_food', 8, 1, 2), e('apple', 3), e('bandage', 2), e('painkillers', 1.5), e('kitchen_knife', 2), e('tarp', 1), e('rope', 1.5), e('seeds', 1),
  ] },
  { id: 'pharmacy', name: 'Farmácia', entries: [
    e('bandage', 8, 1, 3), e('antiseptic', 5), e('painkillers', 6, 1, 2), e('antibiotics', 2), e('suture_kit', 0.8), e('first_aid_kit', 1), e('surgical_mask', 4), e('water_bottle', 2), e('chocolate', 2),
  ] },
  { id: 'clinic', name: 'Clínica / enfermaria', entries: [
    e('bandage', 7, 1, 2), e('antiseptic', 4), e('painkillers', 4), e('antibiotics', 1.5), e('splint', 2.5), e('suture_kit', 1.2), e('surgical_mask', 3), e('first_aid_kit', 0.8),
  ] },
  { id: 'hospital', name: 'Hospital', entries: [
    e('bandage', 8, 1, 3), e('antiseptic', 5), e('painkillers', 5), e('antibiotics', 2.5), e('splint', 3), e('suture_kit', 2), e('first_aid_kit', 1.5), e('surgical_supplies', 0.6), e('surgical_mask', 5), e('rag', 4), e('gas_mask', 0.3), e('book_first_aid', 1),
  ] },
  { id: 'hospital_surgery', name: 'Centro cirúrgico', entries: [
    e('surgical_supplies', 3), e('suture_kit', 4), e('antiseptic', 5), e('antibiotics', 3), e('bandage', 5, 1, 3), e('saw', 1.5), e('painkillers', 4),
  ] },
  { id: 'police', name: 'Delegacia / guardas', entries: [ e('cigarettes', 2, 1, 3), e('whiskey', 0.8), 
    e('baton', 4), e('flashlight', 4), e('pistol_9mm', 0.8), e('ammo_9mm', 3, 3, 10), e('ammo_38', 2, 3, 8), e('police_vest', 0.4), e('radio', 1), e('bandage', 3), e('soda', 2), e('canned_soup', 2), e('leather_gloves', 1.5), e('motorcycle_helmet', 0.6),
  ] },
  { id: 'police_armory', name: 'Arsenal policial', entries: [
    e('pistol_9mm', 2), e('revolver_38', 1.5), e('shotgun', 0.6), e('ammo_9mm', 5, 6, 15), e('ammo_38', 4, 6, 12), e('ammo_12g', 2, 2, 6), e('police_vest', 1.5), e('baton', 2), e('radio', 1.5), e('military_helmet', 0.3),
  ] },
  { id: 'prison', name: 'Prisão (celas e pátio)', entries: [
    e('spoiled_food', 6), e('rag', 6, 1, 3), e('cigarettes', 6, 1, 3), e('pipe', 3), e('scrap_metal', 3), e('spear', 1), e('crackers', 3), e('bandage', 1.5), e('baton', 1.5),
  ] },
  { id: 'military', name: 'Área militar', entries: [ e('cigarettes', 3, 1, 4), 
    e('canteen', 3), e('combat_knife', 2), e('cargo_pants', 3), e('combat_boots', 3), e('military_bag', 1.2), e('military_helmet', 1), e('police_vest', 1), e('ammo_308', 2, 2, 8), e('ammo_9mm', 3, 5, 12), e('first_aid_kit', 1.5), e('bandage', 4, 1, 3), e('radio', 1.5), e('gas_mask', 1), e('canned_beans', 3, 1, 2), e('map_county', 1.5),
  ] },
  { id: 'military_armory', name: 'Paiol militar', entries: [
    e('hunting_rifle', 1.5), e('shotgun', 1), e('pistol_9mm', 1.5), e('ammo_308', 5, 5, 15), e('ammo_12g', 3, 4, 10), e('ammo_9mm', 4, 10, 20), e('military_helmet', 2), e('police_vest', 2), e('combat_knife', 2),
  ] },
  { id: 'farm', name: 'Casa de fazenda', entries: [
    e('canned_beans', 5, 1, 2), e('apple', 5, 1, 4), e('raw_meat', 3), e('dirty_water', 4), e('water_bottle', 3), e('seeds', 4, 1, 3), e('flannel_shirt', 3), e('jeans', 3), e('hatchet', 1), e('shovel', 1.5), e('rope', 2), e('book_farming', 1), e('car_keys', 1), e('gas_can', 0.6), e('lighter', 2),
  ] },
  { id: 'farm_tools', name: 'Celeiro / loja agro', entries: [
    e('salt', 3), e('fishing_rod', 1), 
    e('shovel', 3), e('hatchet', 2), e('saw', 2), e('hammer', 2), e('nails', 4, 5, 20), e('plank', 4, 1, 3), e('rope', 4), e('tarp', 3), e('seeds', 5, 1, 4), e('gas_can', 1), e('leather_gloves', 2), e('book_farming', 1.5),
  ] },
  { id: 'farm_field', name: 'Plantação / pomar', entries: [ e('apple', 8, 1, 4), e('seeds', 4, 1, 2), e('raw_meat', 1), e('spoiled_food', 3) ] },
  { id: 'forest', name: 'Floresta / trilha', entries: [ e('firewood', 7, 1, 3),  e('log', 6), e('rope', 1.5), e('raw_meat', 2), e('apple', 2), e('dirty_water', 3), e('rag', 1.5), e('spear', 0.4) ] },
  { id: 'creek', name: 'Riacho / lago', entries: [ e('fishing_rod', 0.8),  e('dirty_water', 10, 1, 3), e('raw_meat', 2), e('log', 2) ] },
  { id: 'camp', name: 'Acampamento', entries: [ e('beer', 2, 1, 2), e('whiskey', 1),  e('firewood', 5, 1, 3), e('fishing_rod', 1.5),  e('canned_beans', 4), e('canteen_empty', 3), e('tarp', 3), e('rope', 3), e('hiking_bag', 1.5), e('flashlight', 2), e('lighter', 3), e('hunting_knife', 1), e('book_survival', 0.8), e('winter_coat', 1.5) ] },
  { id: 'ranger', name: 'Posto da guarda florestal', entries: [ e('fishing_rod', 2), e('firewood', 3, 1, 2),  e('radio', 2), e('map_county', 3), e('flashlight', 3), e('first_aid_kit', 1), e('hatchet', 2), e('rope', 3), e('canned_beans', 3), e('book_survival', 1.5), e('hunting_rifle', 0.4), e('ammo_308', 1, 2, 5) ] },
  { id: 'warehouse', name: 'Armazém', entries: [ e('beer', 2, 2, 4),  e('canned_beans', 4, 1, 4), e('water_bottle', 4, 1, 3), e('tarp', 3), e('rope', 3), e('plank', 4, 1, 4), e('nails', 3, 10, 30), e('metal_sheet', 2), e('scrap_metal', 4, 1, 3), e('hiking_bag', 1), e('crowbar', 1) ] },
  { id: 'building_supply', name: 'Materiais de construção', entries: [ e('plank', 8, 2, 6), e('nails', 8, 10, 40), e('metal_sheet', 4, 1, 2), e('hammer', 3), e('saw', 3), e('screwdriver', 2), e('wire', 3, 1, 3), e('tarp', 3), e('rope', 2), e('book_carpentry', 1.5) ] },
  { id: 'industrial', name: 'Fábrica', entries: [ e('scrap_metal', 8, 1, 4), e('metal_sheet', 3), e('wire', 4, 1, 3), e('electronic_parts', 3, 1, 3), e('wrench', 2), e('pipe', 3), e('leather_gloves', 2), e('engine_parts', 1.5) ] },
  { id: 'electrical', name: 'Subestação', entries: [ e('wire', 8, 1, 4), e('electronic_parts', 6, 1, 4), e('screwdriver', 2), e('book_electrical', 1.5), e('leather_gloves', 2) ] },
  { id: 'scrapyard', name: 'Ferro-velho', entries: [ e('scrap_metal', 10, 2, 5), e('tire', 3), e('car_battery', 1.5), e('engine_parts', 3, 1, 2), e('metal_sheet', 3), e('wrench', 1.5), e('pipe', 3) ] },
  { id: 'garage', name: 'Garagem / pátio', entries: [ e('beer', 2, 1, 2),  e('wrench', 3), e('screwdriver', 3), e('engine_parts', 3), e('tire', 2), e('car_battery', 1), e('gas_can', 1.2), e('car_keys', 2), e('book_mechanics', 1), e('crowbar', 1.5), e('rope', 2), e('scrap_metal', 3) ] },
  { id: 'workshop', name: 'Oficina mecânica', entries: [ e('beer', 2, 1, 3), e('cigarettes', 2, 1, 2),  e('wrench', 4), e('screwdriver', 3), e('engine_parts', 5, 1, 2), e('tire', 3), e('car_battery', 2), e('gas_can', 1.5), e('car_keys', 1.5), e('book_mechanics', 2), e('scrap_metal', 3) ] },
  { id: 'gas_station', name: 'Posto de gasolina', entries: [ e('beer', 4, 1, 3),  e('gas_can', 2.5), e('soda', 5), e('chocolate', 4), e('crackers', 4), e('cigarettes', 4), e('lighter', 3), e('map_county', 2), e('engine_parts', 1), e('water_bottle', 3) ] },
  { id: 'school', name: 'Escola', entries: [ e('school_bag', 4), e('crackers', 3), e('soda', 3), e('book_first_aid', 0.8), e('book_electrical', 0.4), e('baseball_bat', 2), e('rag', 3), e('bandage', 1.5), e('tshirt', 3) ] },
  { id: 'office', name: 'Escritório / administração', entries: [ e('whiskey', 1.5), e('cigarettes', 2, 1, 2),  e('crackers', 3), e('soda', 3), e('map_county', 2), e('radio', 0.5), e('flashlight', 1.5), e('electronic_parts', 2), e('wire', 1), e('painkillers', 1.5), e('car_keys', 1) ] },
  { id: 'restaurant', name: 'Restaurante / refeitório', entries: [ e('beer', 4, 1, 2), e('whiskey', 1.5),  e('salt', 4, 1, 2),  e('canned_soup', 5, 1, 2), e('canned_beans', 4), e('spoiled_food', 8, 1, 2), e('raw_meat', 2), e('kitchen_knife', 4), e('water_bottle', 3), e('soda', 4), e('lighter', 2) ] },
  { id: 'church', name: 'Igreja / capela', entries: [ e('water_bottle', 3), e('canned_beans', 3), e('crackers', 3), e('rag', 4), e('bandage', 2), e('lighter', 2), e('family_photo', 2) ] },
  { id: 'sewer', name: 'Esgoto', entries: [ e('dirty_water', 6), e('scrap_metal', 4), e('pipe', 3), e('rag', 3), e('spoiled_food', 2) ] },
];

/** Roupas de proteção (jaquetas, luvas e botinas de trabalho) espalhadas pelos lugares onde fariam sentido. */
export const PROTECTIVE_GEAR_LOOT: Record<string, LootEntry[]> = {
  residential: [e('denim_jacket', 2), e('work_gloves', 1.5), e('work_boots', 1)],
  residential_hunter: [e('work_jacket', 1.5), e('work_boots', 2)],
  street: [e('denim_jacket', 0.8)],
  farm: [e('work_jacket', 2), e('work_gloves', 2), e('work_boots', 2), e('denim_jacket', 1.5)],
  farm_tools: [e('work_gloves', 3), e('work_boots', 1.5), e('work_jacket', 1.5)],
  building_supply: [e('work_gloves', 4), e('work_jacket', 2), e('work_boots', 2)],
  industrial: [e('work_jacket', 2), e('work_boots', 2), e('work_gloves', 2)],
  warehouse: [e('work_gloves', 2), e('work_boots', 1.5)],
  garage: [e('biker_jacket', 0.5), e('work_gloves', 2), e('denim_jacket', 1.5)],
  workshop: [e('biker_jacket', 0.6), e('work_gloves', 2), e('work_jacket', 1.5)],
  police: [e('biker_jacket', 0.4)],
};
for (const t of LOOT_TABLES) for (const x of PROTECTIVE_GEAR_LOOT[t.id] ?? []) if (!t.entries.some((y) => y.itemId === x.itemId)) t.entries.push(x);

/** Binóculos, rojões e despertadores: o que serve para vigiar e desviar hordas. */
export const HORDE_GEAR_LOOT: Record<string, LootEntry[]> = {
  residential: [e('firecrackers', 1.2), e('alarm_clock', 2)],
  residential_hunter: [e('binoculars', 2)],
  police: [e('binoculars', 1)],
  military: [e('binoculars', 1.5)],
  ranger: [e('binoculars', 2)],
  camp: [e('binoculars', 1), e('firecrackers', 1)],
  store: [e('firecrackers', 1.5), e('alarm_clock', 1)],
  supermarket: [e('firecrackers', 1)],
  gas_station: [e('firecrackers', 1)],
  office: [e('alarm_clock', 1.5)],
  school: [e('alarm_clock', 1)],
};
for (const t of LOOT_TABLES) for (const x of HORDE_GEAR_LOOT[t.id] ?? []) if (!t.entries.some((y) => y.itemId === x.itemId)) t.entries.push(x);

/** Silenciadores (raros, onde há armas) e galões vazios (onde há carros). */
export const SUPPRESSOR_LOOT: Record<string, LootEntry[]> = {
  police_armory: [e('suppressor_9mm', 0.8)],
  military_armory: [e('suppressor_308', 0.8), e('suppressor_9mm', 0.6)],
  military: [e('suppressor_9mm', 0.2)],
  residential_hunter: [e('suppressor_improvised_308', 0.4)],
  garage: [e('gas_can_empty', 2)],
  workshop: [e('gas_can_empty', 2), e('suppressor_improvised_9mm', 0.3)],
  gas_station: [e('gas_can_empty', 3)],
  scrapyard: [e('gas_can_empty', 1.5)],
};
for (const t of LOOT_TABLES) for (const x of SUPPRESSOR_LOOT[t.id] ?? []) if (!t.entries.some((y) => y.itemId === x.itemId)) t.entries.push(x);
