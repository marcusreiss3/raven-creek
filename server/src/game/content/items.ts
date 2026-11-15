/** Definições iniciais de itens. Editáveis depois pelo painel (tabela item_defs). */
export const REGIONS = ['head', 'neck', 'torso', 'abdomen', 'left_arm', 'right_arm', 'left_hand', 'right_hand', 'left_leg', 'right_leg', 'left_foot', 'right_foot'] as const;
export type Region = typeof REGIONS[number];
export const REGION_NAMES: Record<Region, string> = {
  head: 'Cabeça', neck: 'Pescoço', torso: 'Tórax', abdomen: 'Abdômen', left_arm: 'Braço esquerdo', right_arm: 'Braço direito',
  left_hand: 'Mão esquerda', right_hand: 'Mão direita', left_leg: 'Perna esquerda', right_leg: 'Perna direita', left_foot: 'Pé esquerdo', right_foot: 'Pé direito',
};
export const EQUIP_SLOTS = ['head', 'face', 'shirt', 'jacket', 'vest', 'pants', 'boots', 'gloves', 'back', 'primary', 'secondary'] as const;
export type EquipSlot = typeof EQUIP_SLOTS[number];

type Def = {
  id: string; name: string; category: string; weight: number; volume?: number; stackable?: boolean; maxStack?: number;
  durabilityMax?: number; rarity?: string; equipSlot?: EquipSlot | null; icon?: string; description?: string; props?: Record<string, any>;
};

const arms = { left_arm: 1, right_arm: 1 } as const;
const legs = { left_leg: 1, right_leg: 1 } as const;
function prot(regions: Record<string, number>, v: number) { const o: Record<string, number> = {}; for (const r of Object.keys(regions)) o[r] = v; return o; }

export const ITEM_DEFS: Def[] = [
  // ── Comida
  { id: 'raw_fish', name: 'Peixe cru', category: 'food', weight: 0.4, stackable: true, maxStack: 6, rarity: 'uncommon', icon: 'fish', description: 'Recém-pescado. Estraga rápido.', props: { hunger: -12, raw: true, perishable: true, perishHours: 18 } },
  { id: 'cooked_fish', name: 'Peixe assado', category: 'food', weight: 0.35, stackable: true, maxStack: 6, rarity: 'uncommon', icon: 'fish', props: { hunger: -26, thirst: 2, stress: -4, perishable: true, perishHours: 48 } },
  { id: 'cooked_meat', name: 'Carne assada', category: 'food', weight: 0.45, stackable: true, maxStack: 6, rarity: 'uncommon', icon: 'meat', props: { hunger: -34, thirst: 3, stress: -5, perishable: true, perishHours: 60 } },
  { id: 'smoked_meat', name: 'Carne defumada', category: 'food', weight: 0.35, stackable: true, maxStack: 8, rarity: 'uncommon', icon: 'meat', description: 'Defumada devagar na fogueira. Dura dias.', props: { hunger: -28, thirst: 6, perishable: true, perishHours: 240 } },
  { id: 'salted_meat', name: 'Carne salgada', category: 'food', weight: 0.4, stackable: true, maxStack: 8, rarity: 'uncommon', icon: 'meat', description: 'Conservada no sal. Dá sede, mas dura muito.', props: { hunger: -28, thirst: 10, perishable: true, perishHours: 480 } },
  { id: 'salt', name: 'Sal', category: 'misc', weight: 0.3, stackable: true, maxStack: 10, rarity: 'uncommon', icon: 'box', description: 'Pacote de sal grosso. Conserva carne.' },
  { id: 'fishing_rod', name: 'Vara de pescar', category: 'tool', weight: 0.8, durabilityMax: 40, rarity: 'uncommon', icon: 'tool', description: 'Necessária para pescar em lagos e riachos.', props: { fishing: true } },
  { id: 'canned_beans', name: 'Feijão enlatado', category: 'food', weight: 0.45, stackable: true, maxStack: 6, rarity: 'common', icon: 'can', props: { hunger: -28, thirst: 3, needsOpener: false } },
  { id: 'canned_soup', name: 'Sopa enlatada', category: 'food', weight: 0.4, stackable: true, maxStack: 6, rarity: 'common', icon: 'can', props: { hunger: -22, thirst: -6 } },
  { id: 'cereal', name: 'Caixa de cereal', category: 'food', weight: 0.35, stackable: true, maxStack: 4, rarity: 'common', icon: 'box', props: { hunger: -18, thirst: 4 } },
  { id: 'crackers', name: 'Bolachas', category: 'food', weight: 0.2, stackable: true, maxStack: 8, rarity: 'common', icon: 'box', props: { hunger: -10, thirst: 4 } },
  { id: 'apple', name: 'Maçã', category: 'food', weight: 0.15, stackable: true, maxStack: 10, rarity: 'common', icon: 'fruit', props: { hunger: -8, thirst: -4, perishable: true, perishHours: 96 } },
  { id: 'raw_meat', name: 'Carne crua', category: 'food', weight: 0.5, stackable: true, maxStack: 4, rarity: 'uncommon', icon: 'meat', props: { hunger: -20, raw: true, perishable: true, perishHours: 24 } },
  { id: 'spoiled_food', name: 'Comida estragada', category: 'food', weight: 0.3, stackable: true, maxStack: 6, rarity: 'common', icon: 'rot', props: { hunger: -12, spoiled: true, stress: 4 } },
  { id: 'cooked_meal', name: 'Refeição preparada', category: 'food', weight: 0.5, stackable: true, maxStack: 4, rarity: 'uncommon', icon: 'meal', props: { hunger: -40, thirst: -4, stress: -8, perishable: true, perishHours: 72 } },
  { id: 'chocolate', name: 'Barra de chocolate', category: 'food', weight: 0.1, stackable: true, maxStack: 10, rarity: 'uncommon', icon: 'bar', props: { hunger: -7, stress: -10 } },
  { id: 'seeds', name: 'Pacote de sementes', category: 'food', weight: 0.05, stackable: true, maxStack: 20, rarity: 'uncommon', icon: 'seed', props: { plantable: true } },
  // ── Água
  { id: 'water_bottle', name: 'Garrafa de água', category: 'water', weight: 0.5, stackable: true, maxStack: 6, rarity: 'common', icon: 'bottle', props: { thirst: -35 } },
  { id: 'dirty_water', name: 'Água suja', category: 'water', weight: 0.5, stackable: true, maxStack: 6, rarity: 'common', icon: 'bottle_dirty', props: { thirst: -30, dirty: true } },
  { id: 'soda', name: 'Refrigerante', category: 'water', weight: 0.35, stackable: true, maxStack: 6, rarity: 'common', icon: 'can', props: { thirst: -20, hunger: -3, stress: -4 } },
  { id: 'canteen', name: 'Cantil cheio', category: 'water', weight: 1, stackable: false, rarity: 'uncommon', icon: 'canteen', props: { thirst: -45, refill: 'canteen_empty' } },
  { id: 'canteen_empty', name: 'Cantil vazio', category: 'water', weight: 0.3, rarity: 'uncommon', icon: 'canteen', props: { container: true } },
  // ── Medicina
  { id: 'rag', name: 'Trapo', category: 'medical', weight: 0.05, stackable: true, maxStack: 10, rarity: 'common', icon: 'rag', props: { use: 'bandage', quality: 0.6, dirty: 0.25 } },
  { id: 'bandage', name: 'Bandagem', category: 'medical', weight: 0.05, stackable: true, maxStack: 10, rarity: 'common', icon: 'bandage', props: { use: 'bandage', quality: 1 } },
  { id: 'antiseptic', name: 'Antisséptico', category: 'medical', weight: 0.15, stackable: true, maxStack: 4, rarity: 'uncommon', icon: 'bottle_med', props: { use: 'disinfect' } },
  { id: 'painkillers', name: 'Analgésicos', category: 'medical', weight: 0.05, stackable: true, maxStack: 10, rarity: 'uncommon', icon: 'pills', props: { use: 'painkiller', painRelief: 35, hours: 3 } },
  { id: 'antibiotics', name: 'Antibióticos', category: 'medical', weight: 0.05, stackable: true, maxStack: 6, rarity: 'rare', icon: 'pills', props: { use: 'antibiotic' } },
  { id: 'splint', name: 'Tala', category: 'medical', weight: 0.4, stackable: true, maxStack: 3, rarity: 'uncommon', icon: 'splint', props: { use: 'splint' } },
  { id: 'suture_kit', name: 'Kit de sutura', category: 'medical', weight: 0.15, stackable: true, maxStack: 3, rarity: 'rare', icon: 'suture', props: { use: 'suture', minSkill: 2 } },
  { id: 'first_aid_kit', name: 'Kit de primeiros socorros', category: 'medical', weight: 1, rarity: 'rare', icon: 'medkit', durabilityMax: 5, props: { use: 'medkit' } },
  { id: 'surgical_supplies', name: 'Suprimentos cirúrgicos', category: 'medical', weight: 0.6, stackable: true, maxStack: 2, rarity: 'very_rare', icon: 'surgery', props: { use: 'surgery' } },
  // ── Armas brancas
  { id: 'kitchen_knife', name: 'Faca de cozinha', category: 'weapon', weight: 0.3, durabilityMax: 30, rarity: 'common', equipSlot: 'primary', icon: 'knife', props: { weaponType: 'melee', skill: 'blade', damage: 8, range: 1, apCost: 2, staminaCost: 4, hitBonus: 5, woundType: 'cut', noise: 1, twoHanded: false } },
  { id: 'combat_knife', name: 'Faca de combate', category: 'weapon', weight: 0.4, durabilityMax: 80, rarity: 'uncommon', equipSlot: 'primary', icon: 'knife', props: { weaponType: 'melee', skill: 'blade', damage: 11, range: 1, apCost: 2, staminaCost: 4, hitBonus: 8, woundType: 'puncture', noise: 1, twoHanded: false } },
  { id: 'hunting_knife', name: 'Faca de caça', category: 'weapon', weight: 0.4, durabilityMax: 60, rarity: 'uncommon', equipSlot: 'primary', icon: 'knife', props: { weaponType: 'melee', skill: 'blade', damage: 10, range: 1, apCost: 2, staminaCost: 4, hitBonus: 6, woundType: 'cut', noise: 1, twoHanded: false } },
  { id: 'hatchet', name: 'Machadinha', category: 'weapon', weight: 1.2, durabilityMax: 60, rarity: 'uncommon', equipSlot: 'primary', icon: 'axe', props: { weaponType: 'melee', skill: 'blade', damage: 16, range: 1, apCost: 3, staminaCost: 8, hitBonus: 0, woundType: 'laceration', noise: 2, twoHanded: false, tool: ['axe'] } },
  { id: 'fire_axe', name: 'Machado de incêndio', category: 'weapon', weight: 3, durabilityMax: 90, rarity: 'rare', equipSlot: 'primary', icon: 'axe', props: { weaponType: 'melee', skill: 'blade', damage: 26, range: 1, apCost: 4, staminaCost: 14, hitBonus: -5, woundType: 'laceration', noise: 2, twoHanded: true, knockback: true, tool: ['axe'] } },
  { id: 'baseball_bat', name: 'Taco de beisebol', category: 'weapon', weight: 1, durabilityMax: 50, rarity: 'common', equipSlot: 'primary', icon: 'bat', props: { weaponType: 'melee', skill: 'blunt', damage: 13, range: 1, apCost: 3, staminaCost: 8, hitBonus: 5, woundType: 'bruise', noise: 2, twoHanded: true, knockback: true } },
  { id: 'baton', name: 'Cassetete', category: 'weapon', weight: 0.6, durabilityMax: 80, rarity: 'uncommon', equipSlot: 'primary', icon: 'bat', props: { weaponType: 'melee', skill: 'blunt', damage: 9, range: 1, apCost: 2, staminaCost: 5, hitBonus: 8, woundType: 'bruise', noise: 1, twoHanded: false } },
  { id: 'crowbar', name: 'Pé de cabra', category: 'weapon', weight: 1.5, durabilityMax: 120, rarity: 'uncommon', equipSlot: 'primary', icon: 'crowbar', props: { weaponType: 'melee', skill: 'blunt', damage: 14, range: 1, apCost: 3, staminaCost: 9, hitBonus: 0, woundType: 'bruise', noise: 2, twoHanded: false, tool: ['crowbar'] } },
  { id: 'pipe', name: 'Cano de metal', category: 'weapon', weight: 1.4, durabilityMax: 70, rarity: 'common', equipSlot: 'primary', icon: 'pipe', props: { weaponType: 'melee', skill: 'blunt', damage: 12, range: 1, apCost: 3, staminaCost: 9, hitBonus: 0, woundType: 'bruise', noise: 2, twoHanded: false } },
  { id: 'spear', name: 'Lança improvisada', category: 'weapon', weight: 1.2, durabilityMax: 25, rarity: 'uncommon', equipSlot: 'primary', icon: 'spear', props: { weaponType: 'melee', skill: 'blade', damage: 12, range: 2, apCost: 3, staminaCost: 7, hitBonus: 0, woundType: 'puncture', noise: 1, twoHanded: true } },
  // ── Armas de fogo
  { id: 'pistol_9mm', name: 'Pistola 9mm', category: 'weapon', weight: 0.9, durabilityMax: 300, rarity: 'rare', equipSlot: 'primary', icon: 'pistol', props: { weaponType: 'ranged', skill: 'pistol', damage: 22, range: 8, apCost: 2, staminaCost: 1, hitBonus: 0, woundType: 'gunshot', noise: 14, ammoType: 'ammo_9mm', magSize: 15, twoHanded: false } },
  { id: 'revolver_38', name: 'Revólver .38', category: 'weapon', weight: 1, durabilityMax: 400, rarity: 'rare', equipSlot: 'primary', icon: 'pistol', props: { weaponType: 'ranged', skill: 'pistol', damage: 26, range: 7, apCost: 2, staminaCost: 1, hitBonus: 2, woundType: 'gunshot', noise: 15, ammoType: 'ammo_38', magSize: 6, twoHanded: false } },
  { id: 'hunting_rifle', name: 'Rifle de caça', category: 'weapon', weight: 3.5, durabilityMax: 400, rarity: 'very_rare', equipSlot: 'primary', icon: 'rifle', props: { weaponType: 'ranged', skill: 'rifle', damage: 40, range: 14, apCost: 3, staminaCost: 2, hitBonus: 10, woundType: 'gunshot', noise: 20, ammoType: 'ammo_308', magSize: 5, twoHanded: true } },
  { id: 'service_rifle', name: 'Fuzil de serviço', category: 'weapon', weight: 4, durabilityMax: 500, rarity: 'very_rare', equipSlot: 'primary', icon: 'rifle', props: { weaponType: 'ranged', skill: 'rifle', damage: 34, range: 12, apCost: 2, staminaCost: 2, hitBonus: 8, woundType: 'gunshot', noise: 20, ammoType: 'ammo_308', magSize: 10, twoHanded: true } },
  { id: 'shotgun', name: 'Espingarda calibre 12', category: 'weapon', weight: 3.2, durabilityMax: 350, rarity: 'very_rare', equipSlot: 'primary', icon: 'shotgun', props: { weaponType: 'ranged', skill: 'shotgun', damage: 34, range: 5, apCost: 3, staminaCost: 3, hitBonus: 15, woundType: 'gunshot', noise: 22, ammoType: 'ammo_12g', magSize: 2, twoHanded: true, spread: true, knockback: true } },
  // ── Munição
  { id: 'ammo_9mm', name: 'Munição 9mm', category: 'ammo', weight: 0.012, stackable: true, maxStack: 60, rarity: 'uncommon', icon: 'ammo', props: { caliber: '9mm' } },
  { id: 'ammo_38', name: 'Munição .38', category: 'ammo', weight: 0.012, stackable: true, maxStack: 60, rarity: 'uncommon', icon: 'ammo', props: { caliber: '.38' } },
  { id: 'ammo_308', name: 'Munição .308', category: 'ammo', weight: 0.025, stackable: true, maxStack: 40, rarity: 'rare', icon: 'ammo', props: { caliber: '.308' } },
  { id: 'ammo_12g', name: 'Cartuchos calibre 12', category: 'ammo', weight: 0.04, stackable: true, maxStack: 30, rarity: 'rare', icon: 'shell', props: { caliber: '12' } },
  // ── Roupas e proteção (proteção = chance de impedir que um golpe vire ferimento aberto)
  { id: 'tshirt', name: 'Camiseta', category: 'clothing', weight: 0.15, rarity: 'common', equipSlot: 'shirt', durabilityMax: 20, icon: 'shirt', props: { protection: { torso: 0.05, abdomen: 0.05 }, insulation: 0.1, rippable: 2 } },
  { id: 'flannel_shirt', name: 'Camisa de flanela', category: 'clothing', weight: 0.3, rarity: 'common', equipSlot: 'shirt', durabilityMax: 30, icon: 'shirt', props: { protection: { torso: 0.08, abdomen: 0.08, ...prot(arms, 0.08) }, insulation: 0.25, rippable: 3 } },
  { id: 'leather_jacket', name: 'Jaqueta de couro', category: 'clothing', weight: 1.4, rarity: 'uncommon', equipSlot: 'jacket', durabilityMax: 60, icon: 'jacket', props: { protection: { torso: 0.35, abdomen: 0.3, ...prot(arms, 0.4), neck: 0.1 }, insulation: 0.4 } },
  { id: 'winter_coat', name: 'Casaco de inverno', category: 'clothing', weight: 1.6, rarity: 'uncommon', equipSlot: 'jacket', durabilityMax: 40, icon: 'jacket', props: { protection: { torso: 0.2, abdomen: 0.2, ...prot(arms, 0.2) }, insulation: 0.8 } },
  { id: 'police_vest', name: 'Colete balístico', category: 'clothing', weight: 3, rarity: 'very_rare', equipSlot: 'vest', durabilityMax: 100, icon: 'vest', props: { protection: { torso: 0.75, abdomen: 0.6 }, ballistic: { torso: 0.7, abdomen: 0.55 }, insulation: 0.1 } },
  { id: 'jeans', name: 'Calça jeans', category: 'clothing', weight: 0.6, rarity: 'common', equipSlot: 'pants', durabilityMax: 40, icon: 'pants', props: { protection: prot(legs, 0.15), insulation: 0.2 } },
  { id: 'cargo_pants', name: 'Calça militar', category: 'clothing', weight: 0.7, rarity: 'uncommon', equipSlot: 'pants', durabilityMax: 60, icon: 'pants', props: { protection: prot(legs, 0.25), insulation: 0.3 } },
  { id: 'sneakers', name: 'Tênis', category: 'clothing', weight: 0.6, rarity: 'common', equipSlot: 'boots', durabilityMax: 30, icon: 'boots', props: { protection: { left_foot: 0.2, right_foot: 0.2 }, travelSpeed: 1.03 } },
  { id: 'combat_boots', name: 'Coturno', category: 'clothing', weight: 1.2, rarity: 'uncommon', equipSlot: 'boots', durabilityMax: 80, icon: 'boots', props: { protection: { left_foot: 0.55, right_foot: 0.55 }, insulation: 0.15 } },
  { id: 'leather_gloves', name: 'Luvas de couro', category: 'clothing', weight: 0.2, rarity: 'uncommon', equipSlot: 'gloves', durabilityMax: 40, icon: 'gloves', props: { protection: { left_hand: 0.45, right_hand: 0.45 }, insulation: 0.1 } },
  { id: 'motorcycle_helmet', name: 'Capacete de moto', category: 'clothing', weight: 1.3, rarity: 'uncommon', equipSlot: 'head', durabilityMax: 60, icon: 'helmet', props: { protection: { head: 0.65 }, ballistic: { head: 0.15 }, perceptionPenalty: 1 } },
  { id: 'military_helmet', name: 'Capacete militar', category: 'clothing', weight: 1.5, rarity: 'very_rare', equipSlot: 'head', durabilityMax: 100, icon: 'helmet', props: { protection: { head: 0.7 }, ballistic: { head: 0.45 } } },
  { id: 'surgical_mask', name: 'Máscara cirúrgica', category: 'clothing', weight: 0.02, rarity: 'common', equipSlot: 'face', durabilityMax: 10, icon: 'mask', props: { protection: {}, respiratory: 0.4 } },
  { id: 'gas_mask', name: 'Máscara de gás', category: 'clothing', weight: 0.8, rarity: 'rare', equipSlot: 'face', durabilityMax: 50, icon: 'mask', props: { protection: { neck: 0.05 }, respiratory: 0.9 } },
  { id: 'scarf', name: 'Cachecol grosso', category: 'clothing', weight: 0.2, rarity: 'common', equipSlot: 'face', durabilityMax: 20, icon: 'scarf', props: { protection: { neck: 0.3 }, insulation: 0.2 } },
  // ── Mochilas
  { id: 'school_bag', name: 'Mochila escolar', category: 'container', weight: 0.5, rarity: 'common', equipSlot: 'back', icon: 'bag', props: { capacity: 6 } },
  { id: 'hiking_bag', name: 'Mochila de trilha', category: 'container', weight: 0.9, rarity: 'uncommon', equipSlot: 'back', icon: 'bag', props: { capacity: 12 } },
  { id: 'military_bag', name: 'Mochila militar', category: 'container', weight: 1.2, rarity: 'rare', equipSlot: 'back', icon: 'bag', props: { capacity: 18 } },
  // ── Ferramentas
  { id: 'hammer', name: 'Martelo', category: 'tool', weight: 0.8, durabilityMax: 100, rarity: 'common', equipSlot: 'primary', icon: 'hammer', props: { tool: ['hammer'], weaponType: 'melee', skill: 'blunt', damage: 9, range: 1, apCost: 2, staminaCost: 6, hitBonus: 2, woundType: 'bruise', noise: 2 } },
  { id: 'saw', name: 'Serrote', category: 'tool', weight: 0.7, durabilityMax: 80, rarity: 'uncommon', icon: 'saw', props: { tool: ['saw'] } },
  { id: 'screwdriver', name: 'Chave de fenda', category: 'tool', weight: 0.2, durabilityMax: 80, rarity: 'common', icon: 'screwdriver', props: { tool: ['screwdriver'] } },
  { id: 'wrench', name: 'Chave inglesa', category: 'tool', weight: 0.9, durabilityMax: 150, rarity: 'common', equipSlot: 'primary', icon: 'wrench', props: { tool: ['wrench'], weaponType: 'melee', skill: 'blunt', damage: 10, range: 1, apCost: 2, staminaCost: 6, hitBonus: 2, woundType: 'bruise', noise: 2 } },
  { id: 'shovel', name: 'Pá', category: 'tool', weight: 2, durabilityMax: 80, rarity: 'common', equipSlot: 'primary', icon: 'shovel', props: { tool: ['shovel'], weaponType: 'melee', skill: 'blunt', damage: 14, range: 1, apCost: 3, staminaCost: 10, hitBonus: -3, woundType: 'bruise', noise: 2, twoHanded: true } },
  { id: 'flashlight', name: 'Lanterna', category: 'tool', weight: 0.3, durabilityMax: 100, rarity: 'common', icon: 'flashlight', props: { light: true } },
  { id: 'lighter', name: 'Isqueiro', category: 'tool', weight: 0.05, durabilityMax: 50, rarity: 'common', icon: 'lighter', props: { fire: true } },
  { id: 'radio', name: 'Rádio portátil', category: 'tool', weight: 0.6, durabilityMax: 200, rarity: 'rare', icon: 'radio', props: { radio: true } },
  { id: 'map_county', name: 'Mapa do condado', category: 'misc', weight: 0.05, rarity: 'uncommon', icon: 'map', props: { map: true } },
  { id: 'cigarettes', name: 'Cigarro', category: 'misc', weight: 0.01, stackable: true, maxStack: 20, rarity: 'uncommon', icon: 'cig', description: 'Acalma os nervos. Precisa de isqueiro. Quem fuma vicia — e cigarro vira moeda.', props: { stress: -15, smokable: true } },
  { id: 'beer', name: 'Lata de cerveja', category: 'water', weight: 0.4, stackable: true, maxStack: 6, rarity: 'common', icon: 'can', description: 'Quente, mas ainda é cerveja.', props: { thirst: -6, stress: -8, alcohol: 15 } },
  { id: 'whiskey', name: 'Garrafa de uísque', category: 'water', weight: 1, durabilityMax: 6, rarity: 'uncommon', icon: 'bottle', description: 'Seis doses. Aquece, acalma, anestesia — e vicia.', props: { thirst: 3, stress: -14, alcohol: 22, doses: true } },
  { id: 'note', name: 'Bilhete', category: 'misc', weight: 0.01, rarity: 'rare', icon: 'note', description: 'Um pedaço de papel escrito à mão. Leia no inventário.', props: { rp: true, note: true } },
  { id: 'family_photo', name: 'Foto de família', category: 'misc', weight: 0.01, rarity: 'common', icon: 'photo', props: { rp: true } },
  { id: 'wedding_ring', name: 'Aliança', category: 'misc', weight: 0.01, rarity: 'uncommon', icon: 'ring', props: { rp: true } },
  // ── Construção
  { id: 'plank', name: 'Tábua', category: 'building', weight: 1, stackable: true, maxStack: 20, rarity: 'common', icon: 'plank', props: { fuelMinutes: 45 } },
  { id: 'log', name: 'Tora', category: 'building', weight: 4, stackable: true, maxStack: 5, rarity: 'common', icon: 'log', props: { fuelMinutes: 120 } },
  { id: 'firewood', name: 'Lenha', category: 'building', weight: 1.2, stackable: true, maxStack: 12, rarity: 'common', icon: 'log', description: 'Galhos e pedaços de madeira secos. Queima bem.', props: { fuelMinutes: 60 } },
  { id: 'nails', name: 'Pregos', category: 'building', weight: 0.01, stackable: true, maxStack: 200, rarity: 'common', icon: 'nails' },
  { id: 'metal_sheet', name: 'Chapa metálica', category: 'building', weight: 2, stackable: true, maxStack: 10, rarity: 'uncommon', icon: 'metal' },
  { id: 'scrap_metal', name: 'Sucata', category: 'building', weight: 0.5, stackable: true, maxStack: 30, rarity: 'common', icon: 'scrap' },
  { id: 'rope', name: 'Corda', category: 'building', weight: 0.4, stackable: true, maxStack: 10, rarity: 'common', icon: 'rope' },
  { id: 'tarp', name: 'Lona', category: 'building', weight: 0.8, stackable: true, maxStack: 5, rarity: 'uncommon', icon: 'tarp' },
  { id: 'electronic_parts', name: 'Componentes eletrônicos', category: 'building', weight: 0.1, stackable: true, maxStack: 30, rarity: 'uncommon', icon: 'chip' },
  { id: 'wire', name: 'Fio elétrico', category: 'building', weight: 0.2, stackable: true, maxStack: 20, rarity: 'uncommon', icon: 'wire' },
  // ── Veículos
  { id: 'gas_can', name: 'Galão de combustível (10 L)', category: 'vehicle', weight: 8, rarity: 'rare', icon: 'gas', props: { fuel: 10 } },
  { id: 'car_battery', name: 'Bateria automotiva', category: 'vehicle', weight: 12, rarity: 'rare', icon: 'battery', props: { battery: 100 } },
  { id: 'tire', name: 'Pneu', category: 'vehicle', weight: 9, rarity: 'uncommon', icon: 'tire', props: { tires: 25 } },
  { id: 'engine_parts', name: 'Peças de motor', category: 'vehicle', weight: 2, stackable: true, maxStack: 10, rarity: 'uncommon', icon: 'gear', props: { engine: 15 } },
  { id: 'car_keys', name: 'Chaves de carro', category: 'vehicle', weight: 0.05, rarity: 'uncommon', icon: 'key', props: { carKey: true } },
  // ── Livros
  { id: 'book_carpentry', name: 'Manual de carpintaria', category: 'book', weight: 0.5, rarity: 'uncommon', icon: 'book', props: { skill: 'carpentry', xp: 60, maxLevel: 4, recipes: ['wood_plank', 'barricade_kit', 'storage_box'] } },
  { id: 'book_first_aid', name: 'Guia de primeiros socorros', category: 'book', weight: 0.4, rarity: 'uncommon', icon: 'book', props: { skill: 'medicine', xp: 60, maxLevel: 4, recipes: ['suture_kit_improvised'] } },
  { id: 'book_mechanics', name: 'Revista de mecânica', category: 'book', weight: 0.3, rarity: 'uncommon', icon: 'book', props: { skill: 'mechanics', xp: 60, maxLevel: 4, recipes: ['repair_tire'] } },
  { id: 'book_farming', name: 'Almanaque do agricultor', category: 'book', weight: 0.4, rarity: 'uncommon', icon: 'book', props: { skill: 'farming', xp: 60, maxLevel: 4, recipes: ['garden_bed'] } },
  { id: 'book_electrical', name: 'Apostila de eletricidade', category: 'book', weight: 0.4, rarity: 'rare', icon: 'book', props: { skill: 'electrical', xp: 60, maxLevel: 4, recipes: ['generator_wiring', 'lamp'] } },
  { id: 'book_survival', name: 'Manual de sobrevivência', category: 'book', weight: 0.4, rarity: 'rare', icon: 'book', props: { skill: 'survival', xp: 60, maxLevel: 4, recipes: ['boiled_water', 'spear_craft'] } },
];

export const RECIPES = [
  { id: 'rip_cloth', name: 'Rasgar roupa em trapos', skill: 'survival', minLevel: 0, requiresKnowledge: false, inputs: [{ itemId: 'tshirt', qty: 1 }], tools: [], output: { itemId: 'rag', qty: 3 }, seconds: 5, xp: 1 },
  { id: 'wood_plank', name: 'Serrar tábuas', skill: 'carpentry', minLevel: 0, requiresKnowledge: false, inputs: [{ itemId: 'log', qty: 1 }], tools: ['saw'], output: { itemId: 'plank', qty: 3 }, seconds: 20, xp: 6 },
  { id: 'barricade_kit', name: 'Kit de barricada', skill: 'carpentry', minLevel: 1, requiresKnowledge: true, inputs: [{ itemId: 'plank', qty: 3 }, { itemId: 'nails', qty: 6 }], tools: ['hammer'], output: { itemId: 'metal_sheet', qty: 0 }, seconds: 0, xp: 0 },
  { id: 'storage_box', name: 'Caixa de armazenamento', skill: 'carpentry', minLevel: 1, requiresKnowledge: true, inputs: [], tools: [], output: { itemId: 'plank', qty: 0 }, seconds: 0, xp: 0 },
  { id: 'splint_craft', name: 'Improvisar tala', skill: 'medicine', minLevel: 0, requiresKnowledge: false, inputs: [{ itemId: 'plank', qty: 1 }, { itemId: 'rag', qty: 2 }], tools: [], output: { itemId: 'splint', qty: 1 }, seconds: 10, xp: 4 },
  { id: 'suture_kit_improvised', name: 'Kit de sutura improvisado', skill: 'medicine', minLevel: 2, requiresKnowledge: true, inputs: [{ itemId: 'rag', qty: 1 }, { itemId: 'antiseptic', qty: 1 }, { itemId: 'wire', qty: 1 }], tools: [], output: { itemId: 'suture_kit', qty: 1 }, seconds: 20, xp: 10 },
  { id: 'cook_meat', name: 'Assar carne', skill: 'cooking', minLevel: 0, requiresKnowledge: false, inputs: [{ itemId: 'raw_meat', qty: 1 }], tools: ['campfire'], output: { itemId: 'cooked_meat', qty: 1 }, seconds: 20, xp: 4 },
  { id: 'cook_fish', name: 'Assar peixe', skill: 'cooking', minLevel: 0, requiresKnowledge: false, inputs: [{ itemId: 'raw_fish', qty: 1 }], tools: ['campfire'], output: { itemId: 'cooked_fish', qty: 1 }, seconds: 15, xp: 3 },
  { id: 'smoke_meat', name: 'Defumar carne', skill: 'survival', minLevel: 2, requiresKnowledge: false, inputs: [{ itemId: 'raw_meat', qty: 2 }, { itemId: 'firewood', qty: 1 }], tools: ['campfire'], output: { itemId: 'smoked_meat', qty: 2 }, seconds: 40, xp: 8 },
  { id: 'salt_meat', name: 'Salgar carne', skill: 'cooking', minLevel: 1, requiresKnowledge: false, inputs: [{ itemId: 'raw_meat', qty: 1 }, { itemId: 'salt', qty: 1 }], tools: [], output: { itemId: 'salted_meat', qty: 1 }, seconds: 15, xp: 4 },
  { id: 'salt_fish', name: 'Salgar peixe', skill: 'cooking', minLevel: 1, requiresKnowledge: false, inputs: [{ itemId: 'raw_fish', qty: 2 }, { itemId: 'salt', qty: 1 }], tools: [], output: { itemId: 'salted_meat', qty: 1 }, seconds: 15, xp: 4 },
  { id: 'chop_firewood', name: 'Rachar lenha', skill: 'survival', minLevel: 0, requiresKnowledge: false, inputs: [{ itemId: 'log', qty: 1 }], tools: ['axe'], output: { itemId: 'firewood', qty: 3 }, seconds: 20, xp: 3 },
  { id: 'fishing_rod_craft', name: 'Improvisar vara de pescar', skill: 'survival', minLevel: 0, requiresKnowledge: false, inputs: [{ itemId: 'plank', qty: 1 }, { itemId: 'rope', qty: 1 }, { itemId: 'nails', qty: 1 }], tools: ['blade'], output: { itemId: 'fishing_rod', qty: 1 }, seconds: 30, xp: 4 },
  { id: 'cooked_meal', name: 'Preparar refeição', skill: 'cooking', minLevel: 0, requiresKnowledge: false, inputs: [{ itemId: 'raw_meat', qty: 1 }], tools: ['campfire'], output: { itemId: 'cooked_meal', qty: 1 }, seconds: 25, xp: 6 },
  { id: 'hearty_stew', name: 'Ensopado para o grupo', skill: 'cooking', minLevel: 1, requiresKnowledge: true, inputs: [{ itemId: 'canned_beans', qty: 1 }, { itemId: 'canned_soup', qty: 1 }], tools: ['campfire'], output: { itemId: 'cooked_meal', qty: 2 }, seconds: 30, xp: 8 },
  { id: 'boiled_water', name: 'Ferver água', skill: 'survival', minLevel: 0, requiresKnowledge: false, inputs: [{ itemId: 'dirty_water', qty: 1 }], tools: ['campfire'], output: { itemId: 'water_bottle', qty: 1 }, seconds: 20, xp: 3 },
  { id: 'spear_craft', name: 'Fazer lança', skill: 'survival', minLevel: 1, requiresKnowledge: false, inputs: [{ itemId: 'plank', qty: 1 }, { itemId: 'rope', qty: 1 }], tools: ['blade'], output: { itemId: 'spear', qty: 1 }, seconds: 20, xp: 6 },
  { id: 'repair_tire', name: 'Remendar pneu', skill: 'mechanics', minLevel: 1, requiresKnowledge: true, inputs: [{ itemId: 'scrap_metal', qty: 1 }, { itemId: 'rope', qty: 1 }], tools: ['wrench'], output: { itemId: 'tire', qty: 1 }, seconds: 30, xp: 8 },
  { id: 'generator_wiring', name: 'Montar fiação de gerador', skill: 'electrical', minLevel: 2, requiresKnowledge: true, inputs: [{ itemId: 'wire', qty: 3 }, { itemId: 'electronic_parts', qty: 4 }], tools: ['screwdriver'], output: { itemId: 'electronic_parts', qty: 0 }, seconds: 0, xp: 0 },
  { id: 'lamp', name: 'Montar luminária', skill: 'electrical', minLevel: 1, requiresKnowledge: true, inputs: [{ itemId: 'wire', qty: 1 }, { itemId: 'electronic_parts', qty: 1 }], tools: ['screwdriver'], output: { itemId: 'flashlight', qty: 1 }, seconds: 25, xp: 6 },
  { id: 'garden_bed', name: 'Preparar canteiro', skill: 'farming', minLevel: 0, requiresKnowledge: true, inputs: [], tools: [], output: { itemId: 'seeds', qty: 0 }, seconds: 0, xp: 0 },
].filter((r) => r.output.qty > 0); // receitas sem saída de item são "conhecimentos" de construção (ver structures.ts)

/** Receitas-conhecimento: liberam construções em vez de gerar itens. */
export const KNOWLEDGE_IDS = ['barricade_kit', 'storage_box', 'generator_wiring', 'garden_bed'];
