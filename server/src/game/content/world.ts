/**
 * Mundo inicial: regiões, 113 nós navegáveis, conexões e templates de cenário.
 * Coordenadas em metros. Vários locais reutilizam o mesmo cenário (sceneKey), mas cada um tem
 * estado próprio (reserva de loot, itens, contêineres, zumbis, base, veículos).
 */

export const REGIONS = [
  { id: 'raven_creek', name: 'Cidade de Raven Creek', description: 'Centro urbano tomado pelo silêncio e pelos mortos.', x: 0, y: 0 },
  { id: 'willow', name: 'Zona Residencial Willow Heights', description: 'Subúrbio de casas iguais e quintais abandonados.', x: -1500, y: 900 },
  { id: 'prison', name: 'Prisão Estadual de Raven Creek', description: 'Muros altos, portões abertos. Ninguém sabe quem saiu.', x: 4200, y: -2600 },
  { id: 'farmland', name: 'Fazendas de Miller Valley', description: 'Campos dourados, silos e cercas quebradas.', x: -4600, y: -3000 },
  { id: 'blackpine', name: 'Floresta Blackpine', description: 'Pinheiros densos, trilhas e cabanas isoladas.', x: 2600, y: 3600 },
  { id: 'industrial', name: 'Distrito Industrial', description: 'Galpões, fábricas paradas e pátios de caminhões.', x: 3100, y: 900 },
  { id: 'fort_ashby', name: 'Posto Militar Fort Ashby', description: 'A última linha de defesa. Caiu em três dias.', x: 8200, y: 2200 },
  { id: 'route9', name: 'Rodovia 9 e arredores', description: 'Asfalto rachado, carros abandonados e postos esquecidos.', x: 2000, y: -800 },
];

type Loc = {
  id: string; regionId: string; name: string; category: string; sceneKey: string; arenaKey: string; musicKey: string;
  x: number; y: number; indoor: boolean; danger: number; lootTableId: string | null; buildable: boolean; tags: string[]; description: string;
  data?: Record<string, unknown>;
};
type Conn = { fromId: string; toId: string; distance: number; roadType: 'indoor' | 'trail' | 'dirt' | 'asphalt'; travelSceneKey: string };

export const LOCATIONS: Loc[] = [];
export const CONNECTIONS: Conn[] = [];

/** Arena tática de cada tipo de lugar (geometria em combat/maps.ts, arte em client/public/assets/arenas). */
export const ARENA_BY_CATEGORY: Record<string, string> = {
  hospital: 'hospital_corridor', clinic: 'hospital_corridor', street: 'street', commercial: 'street', alley: 'alley', house: 'house', apartment: 'house',
  basement: 'house', garage: 'warehouse', shed: 'farm', prison: 'prison_yard', prison_inside: 'police', forest: 'forest', camp: 'camp', lake: 'camp',
  parking: 'parking', road: 'road', bridge: 'bridge', tunnel: 'sewer', supermarket: 'supermarket', store: 'pharmacy', pharmacy: 'pharmacy', farm: 'farm',
  field: 'farm', barn: 'farm', industrial: 'warehouse', warehouse: 'warehouse', military: 'military', police: 'police', school: 'police',
  church: 'church', restaurant: 'restaurant', gas_station: 'gas_station', workshop: 'warehouse', office: 'police', sewer: 'sewer', cabin: 'house', yard: 'street',
};
const MUSIC_BY_REGION: Record<string, string> = {
  raven_creek: 'city_abandoned', willow: 'explore_calm', prison: 'danger', farmland: 'explore_calm', blackpine: 'forest', industrial: 'city_abandoned', fort_ashby: 'danger', route9: 'road',
};

function L(id: string, regionId: string, name: string, category: string, sceneKey: string, x: number, y: number, o: Partial<Loc> = {}) {
  LOCATIONS.push({
    id, regionId, name, category, sceneKey, x, y,
    arenaKey: o.arenaKey ?? ARENA_BY_CATEGORY[category] ?? 'street',
    musicKey: o.musicKey ?? (category === 'hospital' ? 'hospital' : MUSIC_BY_REGION[regionId] ?? 'explore_calm'),
    indoor: o.indoor ?? false, danger: o.danger ?? 0.35, lootTableId: o.lootTableId ?? null, buildable: o.buildable ?? false,
    tags: o.tags ?? [], description: o.description ?? '', data: o.data ?? {},
  });
}
const loc = (id: string) => { const l = LOCATIONS.find((x) => x.id === id); if (!l) throw new Error('Local inexistente: ' + id); return l; };
function C(a: string, b: string, roadType: Conn['roadType'], travelSceneKey?: string, distance?: number) {
  const A = loc(a), B = loc(b);
  const d = distance ?? Math.max(15, Math.round(Math.hypot(A.x - B.x, A.y - B.y)));
  const scene = travelSceneKey ?? (roadType === 'indoor' ? B.sceneKey : roadType === 'asphalt' ? 'road_asphalt_01' : roadType === 'dirt' ? 'road_dirt_01' : 'forest_road_03');
  CONNECTIONS.push({ fromId: a, toId: b, distance: d, roadType, travelSceneKey: scene });
}

// ════════════════════ CIDADE DE RAVEN CREEK ════════════════════
const R = 'raven_creek';
L('rc_main_street', R, 'Rua Principal', 'street', 'street_city_01', 0, 0, { danger: 0.45, lootTableId: 'street', description: 'A avenida central, coberta de vidro quebrado e carros batidos. O ponto de partida de todo sobrevivente.', tags: ['spawn'] });
L('rc_commercial', R, 'Centro Comercial', 'commercial', 'commercial_01', 160, -60, { danger: 0.5, lootTableId: 'store', description: 'Vitrines estilhaçadas e lojas saqueadas pela metade.' });
L('rc_police', R, 'Delegacia — Recepção', 'police', 'police_lobby', -180, -120, { indoor: true, danger: 0.55, lootTableId: 'police', description: 'Mesas reviradas, papéis espalhados e um cheiro metálico no ar.' });
L('rc_police_cells', R, 'Delegacia — Celas', 'police', 'police_cells', -200, -150, { indoor: true, danger: 0.6, lootTableId: 'police' });
L('rc_police_armory', R, 'Delegacia — Arsenal', 'police', 'armory_01', -215, -130, { indoor: true, danger: 0.65, lootTableId: 'police_armory', tags: ['locked'] });
L('rc_market', R, 'Mercado da Esquina', 'store', 'store_interior_01', 90, 110, { indoor: true, danger: 0.4, lootTableId: 'store' });
L('rc_market_storage', R, 'Mercado — Depósito', 'store', 'store_storage', 100, 130, { indoor: true, danger: 0.45, lootTableId: 'supermarket' });
L('rc_pharmacy', R, 'Farmácia Wells', 'pharmacy', 'pharmacy_01', 210, 40, { indoor: true, danger: 0.55, lootTableId: 'pharmacy' });
L('rc_hospital_entrance', R, 'Hospital St. Mary — Entrada', 'hospital', 'hospital_exterior', 420, 260, { danger: 0.65, lootTableId: 'street', description: 'Ambulâncias abandonadas e macas tombadas bloqueiam a entrada.' });
L('rc_hospital_lobby', R, 'Hospital — Recepção', 'hospital', 'hospital_lobby', 440, 280, { indoor: true, danger: 0.65, lootTableId: 'hospital' });
L('rc_hospital_corridor', R, 'Hospital — Corredor Leste', 'hospital', 'hospital_corridor', 470, 290, { indoor: true, danger: 0.7, lootTableId: 'hospital', description: 'Lâmpadas piscando, marcas de mãos ensanguentadas na parede.' });
L('rc_hospital_ward', R, 'Hospital — Enfermaria', 'hospital', 'hospital_ward', 490, 310, { indoor: true, danger: 0.75, lootTableId: 'hospital' });
L('rc_hospital_surgery', R, 'Hospital — Centro Cirúrgico', 'hospital', 'hospital_surgery', 510, 290, { indoor: true, danger: 0.75, lootTableId: 'hospital_surgery' });
L('rc_hospital_pharmacy', R, 'Hospital — Farmácia Interna', 'hospital', 'pharmacy_01', 480, 270, { indoor: true, danger: 0.7, lootTableId: 'pharmacy' });
L('rc_hospital_morgue', R, 'Hospital — Necrotério', 'hospital', 'hospital_morgue', 470, 320, { indoor: true, danger: 0.85, lootTableId: 'hospital' });
L('rc_school', R, 'Escola Lincoln — Pátio', 'school', 'school_exterior', -320, 220, { danger: 0.45, lootTableId: 'school' });
L('rc_school_classrooms', R, 'Escola — Salas de Aula', 'school', 'school_classroom', -340, 240, { indoor: true, danger: 0.45, lootTableId: 'school' });
L('rc_school_gym', R, 'Escola — Ginásio', 'school', 'school_gym', -300, 260, { indoor: true, danger: 0.55, lootTableId: 'school', buildable: true, description: 'O ginásio foi abrigo de emergência. Catres e cobertores por toda parte.' });
L('rc_school_cafeteria', R, 'Escola — Refeitório', 'school', 'cafeteria_01', -350, 200, { indoor: true, danger: 0.45, lootTableId: 'restaurant' });
L('rc_gas_station', R, 'Posto Gulf', 'gas_station', 'gas_station_01', 300, -280, { danger: 0.4, lootTableId: 'gas_station' });
L('rc_restaurant', R, 'Lanchonete da Mabel', 'restaurant', 'restaurant_01', 60, -140, { indoor: true, danger: 0.4, lootTableId: 'restaurant' });
L('rc_workshop', R, 'Oficina do Hank', 'workshop', 'workshop_01', 260, -200, { indoor: true, danger: 0.35, lootTableId: 'workshop', buildable: true });
L('rc_city_hall', R, 'Prefeitura', 'office', 'city_hall_01', -60, -260, { indoor: true, danger: 0.45, lootTableId: 'office' });
L('rc_church', R, 'Igreja de São Jorge', 'church', 'church_01', -220, 380, { indoor: true, danger: 0.3, lootTableId: 'church', buildable: true });
L('rc_clinic', R, 'Clínica Familiar', 'clinic', 'clinic_01', 330, 120, { indoor: true, danger: 0.5, lootTableId: 'clinic' });
L('rc_supermarket', R, 'Supermercado FoodMax', 'supermarket', 'supermarket_01', -120, 160, { indoor: true, danger: 0.6, lootTableId: 'supermarket' });
L('rc_supermarket_back', R, 'FoodMax — Estoque', 'supermarket', 'store_storage', -140, 180, { indoor: true, danger: 0.6, lootTableId: 'supermarket' });
L('rc_parking', R, 'Estacionamento do FoodMax', 'parking', 'parking_01', -100, 120, { danger: 0.5, lootTableId: 'street' });
L('rc_sewer', R, 'Galerias de Esgoto', 'sewer', 'sewer_01', 30, 60, { indoor: true, danger: 0.55, lootTableId: 'sewer', description: 'Escuro, úmido, apertado. Uma rota pouco usada pelos mortos — e pelos vivos.' });
L('rc_alley', R, 'Beco atrás da Rua Principal', 'alley', 'alley_01', 40, 30, { danger: 0.45, lootTableId: 'street' });
L('rc_apartments', R, 'Edifício Harbor — Hall', 'apartment', 'apartment_hall', -60, 330, { indoor: true, danger: 0.5, lootTableId: 'residential' });
L('rc_apartment_3b', R, 'Apartamento 3B', 'apartment', 'apartment_interior_01', -55, 345, { indoor: true, danger: 0.45, lootTableId: 'residential', buildable: true });
L('rc_apartment_5a', R, 'Apartamento 5A', 'apartment', 'apartment_interior_02', -65, 350, { indoor: true, danger: 0.45, lootTableId: 'residential', buildable: true });

C('rc_main_street', 'rc_commercial', 'asphalt', 'street_city_02'); C('rc_main_street', 'rc_police', 'asphalt', 'street_city_01'); C('rc_police', 'rc_police_cells', 'indoor');
C('rc_police', 'rc_police_armory', 'indoor'); C('rc_main_street', 'rc_market', 'asphalt', 'street_city_02'); C('rc_market', 'rc_market_storage', 'indoor');
C('rc_commercial', 'rc_pharmacy', 'asphalt', 'street_city_02'); C('rc_commercial', 'rc_clinic', 'asphalt', 'street_city_02'); C('rc_clinic', 'rc_hospital_entrance', 'asphalt', 'street_city_01');
C('rc_hospital_entrance', 'rc_hospital_lobby', 'indoor'); C('rc_hospital_lobby', 'rc_hospital_corridor', 'indoor'); C('rc_hospital_corridor', 'rc_hospital_ward', 'indoor');
C('rc_hospital_corridor', 'rc_hospital_surgery', 'indoor'); C('rc_hospital_corridor', 'rc_hospital_pharmacy', 'indoor'); C('rc_hospital_ward', 'rc_hospital_morgue', 'indoor');
C('rc_main_street', 'rc_school', 'asphalt', 'street_city_01'); C('rc_school', 'rc_school_classrooms', 'indoor'); C('rc_school', 'rc_school_gym', 'indoor'); C('rc_school', 'rc_school_cafeteria', 'indoor');
C('rc_commercial', 'rc_gas_station', 'asphalt'); C('rc_main_street', 'rc_restaurant', 'asphalt', 'street_city_02'); C('rc_gas_station', 'rc_workshop', 'asphalt');
C('rc_main_street', 'rc_city_hall', 'asphalt', 'street_city_01'); C('rc_school', 'rc_church', 'asphalt', 'street_city_01'); C('rc_main_street', 'rc_parking', 'asphalt', 'street_city_02');
C('rc_parking', 'rc_supermarket', 'indoor'); C('rc_supermarket', 'rc_supermarket_back', 'indoor'); C('rc_main_street', 'rc_alley', 'asphalt', 'alley_01');
C('rc_alley', 'rc_sewer', 'indoor', 'sewer_01'); C('rc_sewer', 'rc_market_storage', 'indoor', 'sewer_01', 120); C('rc_parking', 'rc_apartments', 'asphalt', 'street_city_01');
C('rc_apartments', 'rc_apartment_3b', 'indoor'); C('rc_apartments', 'rc_apartment_5a', 'indoor'); C('rc_restaurant', 'rc_commercial', 'asphalt', 'street_city_02');

// ════════════════════ WILLOW HEIGHTS (residencial) ════════════════════
const W = 'willow';
L('res_avenue', W, 'Avenida Willow', 'street', 'suburb_street_01', -1500, 900, { danger: 0.3, lootTableId: 'street' });
L('res_cul_de_sac', W, 'Rua sem saída Maple', 'street', 'suburb_street_01', -1750, 1100, { danger: 0.3, lootTableId: 'street' });
L('res_playground', W, 'Praça do Bairro', 'yard', 'playground_01', -1350, 1050, { danger: 0.25, lootTableId: 'street' });
const houses: [string, string, string, number, number, string[]][] = [
  ['01', 'Casa térrea dos Hendricks', 'house_interior_01', -1600, 820, ['yard']],
  ['02', 'Sobrado dos Carter', 'house_interior_02', -1450, 780, ['upstairs', 'garage']],
  ['03', 'Casa térrea azul', 'house_interior_03', -1380, 860, []],
  ['04', 'Sobrado com porão', 'house_interior_04', -1550, 980, ['basement']],
  ['05', 'Casa de esquina', 'house_interior_05', -1420, 990, ['shed']],
  ['06', 'Casa do Dr. Ellis', 'house_interior_01', -1680, 1000, []],
  ['07', 'Casa de madeira', 'house_interior_02', -1780, 1180, []],
  ['08', 'Sobrado reformado', 'house_interior_03', -1700, 1220, ['garage']],
  ['09', 'Casa com piscina', 'house_interior_04', -1820, 1050, ['yard']],
  ['10', 'Casa do caçador', 'house_interior_05', -1880, 1150, ['basement']],
];
for (const [n, name, scene, x, y, subs] of houses) {
  const id = `res_house_${n}`;
  const twoStory = name.startsWith('Sobrado');
  L(id, W, name, 'house', scene, x, y, {
    indoor: true, danger: 0.3, lootTableId: n === '06' ? 'residential_doctor' : n === '10' ? 'residential_hunter' : 'residential', buildable: true,
    tags: [twoStory ? 'two_story' : 'single_story'], data: { variant: twoStory ? 'Casa de dois andares' : 'Casa térrea', doors: 2, windows: twoStory ? 6 : 4 },
    description: twoStory ? 'Uma casa de dois andares com escadas rangendo.' : 'Uma casa térrea com móveis cobertos de poeira.',
  });
  const hub = Number(n) >= 6 ? 'res_cul_de_sac' : 'res_avenue';
  C(hub, id, 'asphalt', 'suburb_street_01');
  for (const s of subs) {
    const sid = `${id}_${s}`;
    const cfg: Record<string, [string, string, string, string]> = {
      yard: ['Quintal', 'yard', 'backyard_01', 'residential'], upstairs: ['Andar de cima', 'house', 'house_two_story_upstairs', 'residential'],
      garage: ['Garagem', 'garage', 'garage_01', 'garage'], basement: ['Porão', 'basement', 'basement_01', 'residential'], shed: ['Galpão do quintal', 'shed', 'shed_01', 'garage'],
    };
    const [label, cat, sc, lt] = cfg[s];
    L(sid, W, `${name} — ${label}`, cat, sc, x + 12, y + 12, { indoor: s !== 'yard', danger: s === 'basement' ? 0.45 : 0.3, lootTableId: lt, buildable: s === 'garage' || s === 'shed' });
    C(id, sid, 'indoor', sc, 15);
  }
}
C('res_avenue', 'res_playground', 'asphalt', 'suburb_street_01'); C('res_avenue', 'res_cul_de_sac', 'asphalt', 'suburb_street_01');

// ════════════════════ PRISÃO ESTADUAL ════════════════════
const P = 'prison';
L('pr_road', P, 'Acesso à Prisão', 'road', 'road_asphalt_02', 3900, -2350, { danger: 0.5, lootTableId: 'street' });
L('pr_parking', P, 'Prisão — Estacionamento', 'parking', 'parking_01', 4050, -2480, { danger: 0.6, lootTableId: 'street' });
L('pr_entrance', P, 'Prisão — Entrada Principal', 'prison', 'prison_exterior', 4150, -2550, { danger: 0.7, lootTableId: 'street' });
L('pr_reception', P, 'Prisão — Recepção', 'prison_inside', 'prison_reception', 4180, -2570, { indoor: true, danger: 0.7, lootTableId: 'office' });
L('pr_admin_hall', P, 'Prisão — Corredor Administrativo', 'prison_inside', 'prison_corridor', 4210, -2590, { indoor: true, danger: 0.75, lootTableId: 'office' });
L('pr_guard_room', P, 'Prisão — Sala dos Guardas', 'prison_inside', 'prison_guard_room', 4230, -2570, { indoor: true, danger: 0.75, lootTableId: 'police' });
L('pr_armory', P, 'Prisão — Arsenal', 'prison_inside', 'armory_01', 4250, -2560, { indoor: true, danger: 0.8, lootTableId: 'police_armory', tags: ['locked'] });
L('pr_yard', P, 'Prisão — Pátio', 'prison', 'prison_yard', 4260, -2650, { danger: 0.9, lootTableId: 'prison', description: 'O pátio onde os detentos se amontoaram no fim. Muitos ainda estão aqui.' });
L('pr_cafeteria', P, 'Prisão — Refeitório', 'prison_inside', 'cafeteria_01', 4240, -2620, { indoor: true, danger: 0.8, lootTableId: 'restaurant' });
L('pr_infirmary', P, 'Prisão — Enfermaria', 'prison_inside', 'hospital_ward', 4220, -2630, { indoor: true, danger: 0.75, lootTableId: 'clinic' });
L('pr_block_a', P, 'Prisão — Bloco A', 'prison_inside', 'prison_cell_block', 4290, -2680, { indoor: true, danger: 0.9, lootTableId: 'prison' });
L('pr_block_b', P, 'Prisão — Bloco B', 'prison_inside', 'prison_cell_block', 4300, -2620, { indoor: true, danger: 0.9, lootTableId: 'prison' });
L('pr_solitary', P, 'Prisão — Solitária', 'prison_inside', 'prison_solitary', 4320, -2700, { indoor: true, danger: 0.85, lootTableId: 'prison' });
L('pr_tower', P, 'Prisão — Torre de Vigilância', 'prison', 'prison_tower', 4330, -2560, { danger: 0.5, lootTableId: 'police', buildable: true });
L('pr_storage', P, 'Prisão — Depósito', 'prison_inside', 'warehouse_01', 4200, -2660, { indoor: true, danger: 0.7, lootTableId: 'warehouse' });
C('pr_road', 'pr_parking', 'asphalt'); C('pr_parking', 'pr_entrance', 'asphalt', 'prison_exterior'); C('pr_entrance', 'pr_reception', 'indoor');
C('pr_reception', 'pr_admin_hall', 'indoor'); C('pr_admin_hall', 'pr_guard_room', 'indoor'); C('pr_guard_room', 'pr_armory', 'indoor');
C('pr_admin_hall', 'pr_cafeteria', 'indoor'); C('pr_admin_hall', 'pr_infirmary', 'indoor'); C('pr_cafeteria', 'pr_yard', 'indoor', 'prison_yard');
C('pr_yard', 'pr_block_a', 'indoor'); C('pr_yard', 'pr_block_b', 'indoor'); C('pr_block_a', 'pr_solitary', 'indoor'); C('pr_yard', 'pr_tower', 'indoor', 'prison_yard', 80);
C('pr_cafeteria', 'pr_storage', 'indoor');

// ════════════════════ FAZENDAS ════════════════════
const F = 'farmland';
L('fm_road', F, 'Estrada Rural Miller', 'road', 'farm_road_01', -4200, -2700, { danger: 0.2, lootTableId: 'street' });
L('fm_miller_farm', F, 'Fazenda Miller — Sede', 'farm', 'farmhouse_01', -4500, -2900, { indoor: true, danger: 0.25, lootTableId: 'farm', buildable: true, description: 'Uma casa de fazenda sólida, com cerca e poço. Ideal para uma base.' });
L('fm_miller_barn', F, 'Fazenda Miller — Celeiro', 'barn', 'barn_01', -4560, -2950, { indoor: true, danger: 0.3, lootTableId: 'farm_tools', buildable: true });
L('fm_miller_field', F, 'Fazenda Miller — Plantação', 'field', 'field_01', -4650, -2850, { danger: 0.2, lootTableId: 'farm_field' });
L('fm_silo', F, 'Silo de grãos', 'farm', 'silo_01', -4580, -3050, { danger: 0.3, lootTableId: 'farm' });
L('fm_orchard', F, 'Pomar dos Cooper', 'field', 'orchard_01', -4900, -3200, { danger: 0.2, lootTableId: 'farm_field' });
L('fm_cooper_farm', F, 'Fazenda Cooper — Pátio', 'farm', 'farm_road_01', -5000, -3350, { danger: 0.25, lootTableId: 'farm_tools' });
L('fm_cooper_house', F, 'Fazenda Cooper — Casa', 'farm', 'farmhouse_01', -5040, -3380, { indoor: true, danger: 0.3, lootTableId: 'farm', buildable: true });
L('fm_farm_store', F, 'Loja Agropecuária', 'store', 'farm_store_01', -4000, -2600, { indoor: true, danger: 0.35, lootTableId: 'farm_tools' });
L('fm_creek', F, 'Riacho Miller', 'lake', 'creek_01', -4750, -3100, { danger: 0.15, lootTableId: 'creek' });
C('fm_road', 'fm_miller_farm', 'dirt'); C('fm_miller_farm', 'fm_miller_barn', 'trail', 'farm_road_01'); C('fm_miller_farm', 'fm_miller_field', 'trail', 'field_01');
C('fm_miller_barn', 'fm_silo', 'trail', 'farm_road_01'); C('fm_miller_field', 'fm_orchard', 'trail', 'orchard_01'); C('fm_orchard', 'fm_cooper_farm', 'dirt');
C('fm_cooper_farm', 'fm_cooper_house', 'indoor', 'farmhouse_01', 30); C('fm_road', 'fm_farm_store', 'dirt'); C('fm_silo', 'fm_creek', 'trail', 'creek_01');

// ════════════════════ FLORESTA BLACKPINE ════════════════════
const B = 'blackpine';
L('fo_trailhead', B, 'Entrada da Trilha Blackpine', 'forest', 'forest_trail_01', 2300, 3200, { danger: 0.25, lootTableId: 'forest' });
L('fo_pine_trail', B, 'Trilha dos Pinheiros', 'forest', 'forest_road_03', 2550, 3500, { danger: 0.3, lootTableId: 'forest' });
L('fo_ranger_station', B, 'Posto da Guarda Florestal', 'cabin', 'ranger_station', 2700, 3400, { indoor: true, danger: 0.3, lootTableId: 'ranger', buildable: true });
L('fo_campsite', B, 'Acampamento do Lago', 'camp', 'campsite_01', 2850, 3750, { danger: 0.35, lootTableId: 'camp' });
L('fo_lake', B, 'Lago Blackpine', 'lake', 'lake_01', 3000, 3900, { danger: 0.2, lootTableId: 'creek' });
L('fo_hunting_cabin', B, 'Cabana de Caça', 'cabin', 'cabin_01', 2450, 3900, { indoor: true, danger: 0.3, lootTableId: 'residential_hunter', buildable: true });
L('fo_deep_woods', B, 'Mata Fechada', 'forest', 'deep_woods_01', 2650, 4150, { danger: 0.45, lootTableId: 'forest' });
L('fo_grove', B, 'Bosque de Bétulas', 'forest', 'grove_01', 2200, 3700, { danger: 0.25, lootTableId: 'forest' });
C('fo_trailhead', 'fo_pine_trail', 'trail'); C('fo_pine_trail', 'fo_ranger_station', 'trail'); C('fo_pine_trail', 'fo_campsite', 'trail');
C('fo_campsite', 'fo_lake', 'trail', 'lake_01'); C('fo_pine_trail', 'fo_grove', 'trail'); C('fo_grove', 'fo_hunting_cabin', 'trail');
C('fo_hunting_cabin', 'fo_deep_woods', 'trail', 'deep_woods_01'); C('fo_deep_woods', 'fo_campsite', 'trail', 'deep_woods_01');

// ════════════════════ DISTRITO INDUSTRIAL ════════════════════
const I = 'industrial';
L('in_gate', I, 'Portão do Distrito Industrial', 'industrial', 'industrial_gate', 2800, 800, { danger: 0.4, lootTableId: 'street' });
L('in_warehouse_a', I, 'Armazém A — Logística Kessler', 'warehouse', 'warehouse_01', 3000, 750, { indoor: true, danger: 0.45, lootTableId: 'warehouse', buildable: true });
L('in_warehouse_b', I, 'Armazém B — Materiais de Construção', 'warehouse', 'warehouse_01', 3050, 950, { indoor: true, danger: 0.45, lootTableId: 'building_supply', buildable: true });
L('in_factory_floor', I, 'Fábrica Ashcroft — Chão de Fábrica', 'industrial', 'factory_floor', 3250, 850, { indoor: true, danger: 0.55, lootTableId: 'industrial' });
L('in_factory_office', I, 'Fábrica Ashcroft — Escritório', 'office', 'office_01', 3280, 820, { indoor: true, danger: 0.45, lootTableId: 'office' });
L('in_truck_depot', I, 'Pátio de Caminhões', 'parking', 'truck_depot', 3150, 1100, { danger: 0.45, lootTableId: 'garage' });
L('in_scrapyard', I, 'Ferro-velho do Dutch', 'industrial', 'scrapyard_01', 3400, 1150, { danger: 0.4, lootTableId: 'scrapyard', buildable: true });
L('in_substation', I, 'Subestação Elétrica', 'industrial', 'substation_01', 3450, 700, { danger: 0.4, lootTableId: 'electrical' });
C('in_gate', 'in_warehouse_a', 'asphalt', 'industrial_gate'); C('in_gate', 'in_warehouse_b', 'asphalt', 'industrial_gate'); C('in_warehouse_a', 'in_factory_floor', 'asphalt', 'industrial_gate');
C('in_factory_floor', 'in_factory_office', 'indoor'); C('in_warehouse_b', 'in_truck_depot', 'asphalt', 'truck_depot'); C('in_truck_depot', 'in_scrapyard', 'dirt', 'scrapyard_01');
C('in_factory_floor', 'in_substation', 'asphalt', 'industrial_gate');

// ════════════════════ FORT ASHBY (militar) ════════════════════
const M = 'fort_ashby';
L('mil_checkpoint', M, 'Posto de Controle da Rodovia', 'military', 'military_checkpoint', 7600, 2000, { danger: 0.6, lootTableId: 'military', description: 'Sacos de areia, cones e um blindado tombado. Placas: ZONA DE QUARENTENA.' });
L('mil_gate', M, 'Fort Ashby — Portão', 'military', 'military_base_01', 8000, 2150, { danger: 0.7, lootTableId: 'military' });
L('mil_barracks', M, 'Fort Ashby — Alojamentos', 'military', 'barracks_01', 8150, 2250, { indoor: true, danger: 0.75, lootTableId: 'military', buildable: true });
L('mil_motor_pool', M, 'Fort Ashby — Garagem de Viaturas', 'military', 'motor_pool', 8250, 2150, { danger: 0.7, lootTableId: 'garage' });
L('mil_armory', M, 'Fort Ashby — Paiol', 'military', 'armory_01', 8300, 2300, { indoor: true, danger: 0.85, lootTableId: 'military_armory', tags: ['locked'] });
L('mil_medical_tent', M, 'Fort Ashby — Tenda Médica', 'military', 'medical_tent', 8100, 2350, { danger: 0.75, lootTableId: 'hospital' });
L('mil_command', M, 'Fort Ashby — Centro de Comando', 'military', 'command_room', 8350, 2200, { indoor: true, danger: 0.8, lootTableId: 'office' });
C('mil_checkpoint', 'mil_gate', 'asphalt', 'military_checkpoint'); C('mil_gate', 'mil_barracks', 'asphalt', 'military_base_01'); C('mil_gate', 'mil_motor_pool', 'asphalt', 'military_base_01');
C('mil_barracks', 'mil_armory', 'asphalt', 'military_base_01'); C('mil_barracks', 'mil_medical_tent', 'asphalt', 'military_base_01'); C('mil_motor_pool', 'mil_command', 'asphalt', 'military_base_01');

// ════════════════════ RODOVIA 9 E CONEXÕES REGIONAIS ════════════════════
const H = 'route9';
L('hw_route9_west', H, 'Rodovia 9 — Trecho Oeste', 'road', 'highway_01', -2200, -1200, { danger: 0.35, lootTableId: 'street' });
L('hw_crossroads', H, 'Encruzilhada da Rodovia 9', 'road', 'crossroads_01', 900, -600, { danger: 0.35, lootTableId: 'street' });
L('hw_route9_east', H, 'Rodovia 9 — Trecho Leste', 'road', 'highway_01', 5200, 1400, { danger: 0.4, lootTableId: 'street' });
L('hw_bridge', H, 'Ponte do Rio Raven', 'bridge', 'bridge_01', 2000, -400, { danger: 0.4, lootTableId: 'street', description: 'Uma ponte estreita de aço. Dois carros batidos deixam só uma faixa livre.' });
L('hw_tunnel', H, 'Túnel Hollow', 'tunnel', 'tunnel_01', 6400, 1800, { indoor: true, danger: 0.6, lootTableId: 'street', description: 'Escuridão total por 300 metros. Lanterna recomendada.' });
L('hw_service_station', H, 'Estação de Serviço Route 9', 'gas_station', 'service_station_01', 3600, 400, { indoor: true, danger: 0.4, lootTableId: 'gas_station', buildable: true });
L('hw_rest_stop', H, 'Parada de Descanso', 'parking', 'rest_stop_01', -1000, -900, { danger: 0.3, lootTableId: 'street' });
L('hw_motel', H, 'Motel Starlight', 'house', 'motel_01', -1150, -1000, { indoor: true, danger: 0.4, lootTableId: 'residential', buildable: true });
L('hw_dirt_north', H, 'Estrada de Terra Norte', 'road', 'dirt_road_01', 1400, 2200, { danger: 0.3, lootTableId: 'forest' });
L('hw_chapel', H, 'Capela Rural', 'church', 'chapel_01', -3000, -2000, { indoor: true, danger: 0.25, lootTableId: 'church', buildable: true });

// Conexões entre regiões (viagens longas)
C('rc_main_street', 'hw_crossroads', 'asphalt', 'road_asphalt_01');
C('rc_main_street', 'res_avenue', 'asphalt', 'road_asphalt_02');
C('rc_church', 'res_playground', 'asphalt', 'suburb_street_01');
C('hw_crossroads', 'hw_bridge', 'asphalt', 'road_asphalt_01');
C('hw_bridge', 'in_gate', 'asphalt', 'road_asphalt_02');
C('hw_bridge', 'pr_road', 'asphalt', 'road_asphalt_02');
C('in_gate', 'hw_service_station', 'asphalt', 'road_asphalt_01');
C('hw_service_station', 'hw_route9_east', 'asphalt', 'road_asphalt_01');
C('hw_route9_east', 'hw_tunnel', 'asphalt', 'tunnel_01');
C('hw_tunnel', 'mil_checkpoint', 'asphalt', 'road_asphalt_02');
C('hw_crossroads', 'hw_rest_stop', 'asphalt', 'road_asphalt_01');
C('hw_rest_stop', 'hw_motel', 'asphalt', 'road_asphalt_02', 160);
C('hw_rest_stop', 'hw_route9_west', 'asphalt', 'road_asphalt_01');
C('hw_route9_west', 'hw_chapel', 'dirt', 'road_dirt_01');
C('hw_chapel', 'fm_road', 'dirt', 'road_dirt_01');
C('rc_hospital_entrance', 'hw_dirt_north', 'dirt', 'road_dirt_01');
C('hw_dirt_north', 'fo_trailhead', 'dirt', 'forest_road_03');
C('in_scrapyard', 'fo_trailhead', 'dirt', 'road_dirt_01');
C('rc_workshop', 'hw_crossroads', 'asphalt', 'road_asphalt_02');
C('res_cul_de_sac', 'hw_route9_west', 'dirt', 'road_dirt_01');

/** Catálogo de cenários. As imagens ficam em client/public/assets/scenes/<key>.webp (1920×1080 recomendado). */
export const SCENE_KEYS = Array.from(new Set([
  ...LOCATIONS.map((l) => l.sceneKey), ...CONNECTIONS.map((c) => c.travelSceneKey),
  'road_asphalt_01', 'road_asphalt_02', 'road_dirt_01', 'forest_road_03', 'main_menu', 'death_screen',
])).sort();

export const ARENA_KEYS = ['hospital_corridor', 'street', 'house', 'prison_yard', 'forest', 'parking', 'road', 'supermarket', 'base'];

export const MUSIC_KEYS = ['main_menu', 'explore_calm', 'city_abandoned', 'hospital', 'forest', 'road', 'danger', 'combat', 'horde', 'wounded', 'death', 'base'];
export const SFX_KEYS = ['rain', 'wind', 'footsteps', 'door_open', 'door_close', 'ui_click', 'ui_open', 'ui_error', 'zombie_groan', 'zombie_attack', 'gunshot_pistol', 'gunshot_rifle', 'gunshot_shotgun', 'melee_hit', 'melee_miss', 'pain', 'bandage', 'eat', 'drink', 'engine_start', 'engine_fail', 'chat_message', 'notification', 'heartbeat'];
