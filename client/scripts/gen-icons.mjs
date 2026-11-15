// Gera src/components/gameIcons.ts a partir do pacote @iconify-json/game-icons (CC BY 3.0, game-icons.net).
// Uso: npm i -D @iconify-json/game-icons && node scripts/gen-icons.mjs [caminho/para/icons.json]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const src = process.argv[2] ?? require.resolve('@iconify-json/game-icons/icons.json');
const json = JSON.parse(fs.readFileSync(src, 'utf8'));

/** nome no jogo → ícone do game-icons.net */
const MAP = {
  // necessidades e estados do corpo
  health: 'heart-beats', blood: 'blood', hunger: 'knife-fork', thirst: 'water-drop', energy: 'lightning-trio', stamina: 'run', sleep: 'night-sleep',
  pain: 'back-pain', stress: 'brain', temperature: 'thermometer-scale', nicotine: 'cigarette', alcohol: 'brandy-bottle', drunk: 'beer-stein',
  protection: 'checked-shield', infection: 'virus', bleeding: 'bleeding-wound', fracture: 'broken-bone', heart: 'heart-organ', body: 'heart-organ',
  // ações e painéis
  search: 'magnifying-glass', observe: 'binoculars', rest: 'sleepy', 'sleep-bag': 'sleeping-bag', wake: 'sunrise', inventory: 'knapsack',
  fire: 'campfire', hunt: 'crosshair', fish: 'fishing-pole', follow: 'footsteps', travel: 'walking-boot', map: 'treasure-map', journal: 'notebook',
  crafting: 'hammer-nails', skills: 'upgrade', base: 'barricade', projects: 'crane', faction: 'tattered-banner', character: 'person', settings: 'cog',
  radio: 'walkie-talkie', mural: 'stabbed-note', safe: 'locked-chest', note: 'folded-paper', dog: 'sitting-dog', zombie: 'shambling-zombie',
  risen: 'raise-zombie', skull: 'death-skull', container: 'wooden-crate', corpse: 'dead-head', ground: 'open-chest', vehicle: 'city-car',
  combat: 'knife-thrust', danger: 'hazard-sign', power: 'light-bulb', smoke: 'dust-cloud', logout: 'exit-door', admin: 'gears', memorial: 'tombstone',
  chat: 'chat-bubble', aim: 'crosshair', shove: 'fist', reload: 'reload-gun-barrel', aid: 'heart-plus', 'switch-weapon': 'switch-weapon', distract: 'sound-waves', taunt: 'shouting', sneak: 'footsteps', throw: 'thrown-spear', defend: 'shield', flee: 'exit-door', 'end-turn': 'hourglass', door: 'door', duel: 'crossed-swords', 'sound-on': 'sound-on', 'sound-off': 'sound-off', dice: 'rolling-dices', narrator: 'quill-ink', present: 'person', offline: 'night-sleep', team: 'police-badge', whisper: 'conversation', clock: 'sands-of-time', route: 'direction-sign', exit: 'exit-door', tutorial: 'notebook', lock: 'padlock', pin: 'position-marker', pause: 'pause-button', play: 'play-button', check: 'check-mark', compass: 'compass', trail: 'trail', sign: 'wooden-sign', 'power-off': 'light-bulb', wrench: 'monkey-wrench', materials: 'hand-truck', target: 'human-target',
  // criação de personagem: ofícios e atributos
  'prof-police': 'police-badge', 'prof-soldier': 'brodie-helmet', 'prof-doctor': 'stethoscope', 'prof-nurse': 'first-aid-kit', 'prof-firefighter': 'fire-axe',
  'prof-mechanic': 'auto-repair', 'prof-carpenter': 'hand-saw', 'prof-engineer': 'gears', 'prof-farmer': 'farmer', 'prof-cook': 'chef-toque',
  'prof-hunter': 'deer-track', 'prof-athlete': 'running-shoe', 'prof-teacher': 'teacher', 'prof-electrician': 'electrical-socket', 'prof-unemployed': 'bindle',
  'attr-strength': 'biceps', 'attr-agility': 'sprint', 'attr-endurance': 'lungs', 'attr-perception': 'eye-target', 'attr-intellect': 'brain',
  'random': 'rolling-dices', 'clip': 'paper-clip', 'photo': 'photo-camera', 'pencil': 'pencil', 'balance': 'scales', 'id-card': 'id-card',
  // estações, clima e hora
  spring: 'sprout', summer: 'sun', autumn: 'falling-leaf', winter: 'snowflake-2',
  clear: 'sun', cloudy: 'fluffy-cloud', rain: 'raining', storm: 'lightning-storm', fog: 'fog', snow: 'snowing', night: 'moon', dawn: 'sunrise', dusk: 'sunrise',
  // categorias de item
  'cat-food': 'opened-food-can', 'cat-water': 'water-bottle', 'cat-medical': 'bandage-roll', 'cat-weapon': 'machete', 'cat-ammo': 'bullets',
  'cat-clothing': 'leather-vest', 'cat-tool': 'spanner', 'cat-building': 'planks', 'cat-book': 'book-cover', 'cat-container': 'backpack',
  'cat-vehicle': 'car-wheel', 'cat-misc': 'swap-bag', 'cat-combate': 'knife-thrust',
  // itens específicos
  raw_fish: 'fish-corpse', cooked_fish: 'fish-cooked', cooked_meat: 'steak', smoked_meat: 'meat', salted_meat: 'meat', raw_meat: 'meat', salt: 'salt-shaker',
  fishing_rod: 'fishing-pole', canned_beans: 'opened-food-can', canned_soup: 'opened-food-can', crackers: 'bread-slice', apple: 'shiny-apple',
  spoiled_food: 'apple-maggot', cooked_meal: 'hot-meal', chocolate: 'chocolate-bar', seeds: 'plant-seed', water_bottle: 'water-bottle',
  dirty_water: 'water-bottle', soda: 'soda-can', canteen: 'water-bottle', canteen_empty: 'water-bottle', rag: 'rolled-cloth', bandage: 'bandage-roll',
  antiseptic: 'potion-ball', painkillers: 'pill', antibiotics: 'medicine-pills', splint: 'arm-bandage', suture_kit: 'sewing-needle',
  first_aid_kit: 'first-aid-kit', surgical_supplies: 'scalpel', kitchen_knife: 'kitchen-knives', combat_knife: 'trench-knife', hunting_knife: 'bowie-knife',
  hatchet: 'hatchet', fire_axe: 'fire-axe', baseball_bat: 'baseball-bat', baton: 'baton', crowbar: 'crowbar', pipe: 'lead-pipe', spear: 'barbed-spear',
  pistol_9mm: 'pistol-gun', revolver_38: 'revolver', hunting_rifle: 'winchester-rifle', shotgun: 'shotgun', ammo_9mm: 'bullets', ammo_38: 'bullets',
  ammo_308: 'heavy-bullets', ammo_12g: 'shotgun-rounds', tshirt: 't-shirt', flannel_shirt: 'shirt', leather_jacket: 'leather-vest', winter_coat: 'hoodie',
  police_vest: 'kevlar-vest', jeans: 'trousers', cargo_pants: 'trousers', sneakers: 'running-shoe', combat_boots: 'leather-boot', leather_gloves: 'gloves',
  motorcycle_helmet: 'full-motorcycle-helmet', military_helmet: 'brodie-helmet', surgical_mask: 'gas-mask', gas_mask: 'gas-mask', scarf: 'rolled-cloth',
  school_bag: 'school-bag', hiking_bag: 'backpack', military_bag: 'knapsack', hammer: 'claw-hammer', saw: 'hand-saw', screwdriver: 'screwdriver',
  wrench: 'monkey-wrench', shovel: 'spade', flashlight: 'flashlight', lighter: 'lighter', radio_item: 'walkie-talkie', map_county: 'treasure-map',
  cigarettes: 'cigarette', beer: 'beer-bottle', whiskey: 'brandy-bottle', family_photo: 'portrait', wedding_ring: 'diamond-ring', plank: 'planks',
  log: 'log', firewood: 'wood-pile', nails: 'nails', metal_sheet: 'metal-bar', scrap_metal: 'gears', rope: 'rope-coil', tarp: 'barracks-tent',
  electronic_parts: 'circuitry', wire: 'wire-coil', gas_can: 'jerrycan', car_battery: 'car-battery', tire: 'car-wheel', engine_parts: 'gear-stick',
  car_keys: 'car-key',
  // categorias de local (mapa)
  'loc-hospital': 'hospital-cross', 'loc-clinic': 'hospital-cross', 'loc-police': 'police-badge', 'loc-store': 'shopping-cart', 'loc-supermarket': 'shopping-cart',
  'loc-commercial': 'shopping-cart', 'loc-pharmacy': 'medicine-pills', 'loc-school': 'school-bag', 'loc-gas_station': 'gas-pump', 'loc-restaurant': 'hot-meal',
  'loc-workshop': 'auto-repair', 'loc-office': 'office-chair', 'loc-church': 'church', 'loc-parking': 'city-car', 'loc-apartment': 'block-house',
  'loc-house': 'house', 'loc-yard': 'wooden-fence', 'loc-garage': 'home-garage', 'loc-basement': 'stairs', 'loc-shed': 'wood-cabin', 'loc-road': 'road',
  'loc-bridge': 'stone-bridge', 'loc-tunnel': 'cave-entrance', 'loc-prison': 'prisoner', 'loc-prison_inside': 'prisoner', 'loc-farm': 'barn', 'loc-barn': 'barn',
  'loc-field': 'wheat', 'loc-forest': 'pine-tree', 'loc-camp': 'camping-tent', 'loc-cabin': 'wood-cabin', 'loc-lake': 'wave-crest', 'loc-industrial': 'factory',
  'loc-warehouse': 'cargo-crate', 'loc-military': 'military-fort', 'loc-street': 'direction-sign', 'loc-alley': 'brick-wall', 'loc-sewer': 'pipes',
  // emblemas de facção
  'emblem:wolf': 'wolf-head', 'emblem:raven': 'raven', 'emblem:axes': 'crossed-axes', 'emblem:anchor': 'anchor', 'emblem:skull': 'skull-crossed-bones',
  'emblem:radiation': 'radioactive', 'emblem:biohazard': 'biohazard', 'emblem:fist': 'fist', 'emblem:eagle': 'eagle-emblem', 'emblem:wire': 'barbed-wire',
  'emblem:crown': 'crowned-skull', 'emblem:flame': 'flame', 'emblem:pine': 'pine-tree', 'emblem:wheat': 'wheat', 'emblem:cross': 'hospital-cross', 'emblem:banner': 'tattered-banner',
  // Dia 1: ícones das escolhas (d1-…) e da interface do celular
  ...Object.fromEntries(["ambulance", "baby-face", "bacon", "bandage-roll", "bed", "book-pile", "breaking-chain", "brick-wall", "brodie-helmet", "bus", "camping-tent", "cancel", "candle-light", "car-wheel", "card-play", "cardboard-box", "chart", "check-mark", "checklist", "church", "city-car", "claw-hammer", "coffee-cup", "conversation", "cooking-pot", "cow", "crosshair", "damaged-house", "deer", "donut", "door", "eye-target", "family-house", "farm-tractor", "fire", "fire-axe", "fire-extinguisher", "flashlight", "full-folder", "gas-pump", "hamburger", "hand", "hand-saw", "hatchet", "hazard-sign", "headphones", "heart-beats", "help", "hole", "hoodie", "hospital-cross", "hot-meal", "hourglass", "house", "hut", "jeep", "key", "kitchen-knives", "ladder", "laptop", "light-bulb", "lightning-arc", "log", "megaphone", "microphone", "modern-city", "money-stack", "notebook", "oak", "open-folder", "open-palm", "opened-food-can", "padlock", "padlock-open", "paper", "person", "pill", "pine-tree", "pistol-gun", "plug", "police-car", "processor", "punch", "quill-ink", "radio-tower", "rotary-phone", "run", "school-bag", "shaking-hands", "shield", "silence", "siren", "sitting-dog", "smartphone", "soda-can", "sofa", "spyglass", "stethoscope", "stop-sign", "stopwatch", "suitcase", "talk", "traffic-cone", "trash-can", "treasure-map", "truck", "tv", "walk", "walkie-talkie", "window", "wolf-trap", "wooden-chair", "wrench"].map((n) => [`d1-${n}`, n])),
  'd1ui-vote': 'vote', 'd1ui-phone-call': 'rotary-phone', 'd1ui-smartphone': 'smartphone', 'd1ui-secret': 'silence', 'd1ui-result': 'check-mark', 'd1ui-timer': 'stopwatch', 'd1ui-news': 'newspaper', 'd1ui-media': 'photo-camera', 'd1ui-mark': 'stabbed-note', 'd1ui-death': 'death-skull', 'd1ui-signal': 'radio-tower', 'd1ui-battery-low': 'battery-25', 'd1ui-alert': 'siren',
};
const missing = []; const bodies = {}; const names = {};
for (const [k, id] of Object.entries(MAP)) {
  const real = json.icons[id] ? id : json.aliases?.[id]?.parent;
  if (!real || !json.icons[real]) { missing.push(`${k} → ${id}`); continue; }
  // só o traçado: tira o atributo de cor (o componente usa currentColor)
  bodies[real] = (json.icons[real].body.match(/ d="([^"]+)"/) ?? [])[1];
  names[k] = real;
}
if (missing.length) { console.error('Ícones inexistentes:\n' + missing.join('\n')); process.exit(1); }
const file = `// Gerado por scripts/gen-icons.mjs — não editar à mão.
// Ícones de https://game-icons.net (Lorc, Delapouite e colaboradores), licença CC BY 3.0. Créditos em public/assets/CREDITS-icons.md.
/** traçado SVG (viewBox 0 0 512 512) de cada ícone usado */
export const ICON_PATHS: Record<string, string> = {
${Object.entries(bodies).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n')}
};
/** nome usado no jogo → ícone */
export const GAME_ICONS: Record<string, string> = ${JSON.stringify(names)};
`;
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../src/components/gameIcons.ts'), file);
console.log(Object.keys(names).length, 'nomes,', Object.keys(bodies).length, 'ícones');
