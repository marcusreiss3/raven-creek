/**
 * Projetos da comunidade: obras coletivas, longas, que mudam o mundo para todos.
 *  • materiais são entregues no local (qualquer jogador contribui);
 *  • o trabalho é feito em turnos demorados no local (o personagem fica ocupado);
 *  • o trabalho só avança na proporção dos materiais já entregues;
 *  • depois de pronto, a obra se desgasta com o tempo e com hordas — abaixo de `minIntegrity` o efeito some até ser reparada.
 */
export type ProjectDef = {
  id: string; name: string; locationId: string; description: string; effect: string;
  materials: { itemId: string; qty: number }[];
  laborMinutes: number; skill: string; tools: string[];
  requires?: string[];
  /** Locais que precisam estar sem infectados para concluir (ex.: limpar o hospital). */
  clearLocations?: string[];
  /** Produção por hora (projetos de produção) num reservatório comunitário no local. */
  production?: { itemId: string; perHour: number; max: number; containerName: string };
};

export const POWER_REGIONS = ['raven_creek', 'willow', 'industrial'];
export const HOSPITAL_LOCATIONS = ['rc_hospital_entrance', 'rc_hospital_lobby', 'rc_hospital_corridor', 'rc_hospital_ward', 'rc_hospital_surgery', 'rc_hospital_pharmacy', 'rc_hospital_morgue'];
export const MAIN_STREET_ZONE = ['rc_main_street', 'rc_commercial', 'rc_alley', 'rc_city_hall', 'rc_restaurant'];

export const PROJECTS: ProjectDef[] = [
  {
    id: 'substation', name: 'Religar a Subestação', locationId: 'in_substation', skill: 'electrical', tools: ['screwdriver', 'wrench'],
    description: 'Trocar cabos queimados, remontar transformadores e reativar a subestação que alimentava a cidade.',
    effect: 'Luz à noite na cidade, no subúrbio e no distrito industrial: sem penalidade noturna para viajar, vasculhar e ser encontrado por infectados. A facção que controla a subestação pode ligar e desligar a energia.',
    materials: [{ itemId: 'wire', qty: 30 }, { itemId: 'electronic_parts', qty: 20 }, { itemId: 'scrap_metal', qty: 40 }, { itemId: 'metal_sheet', qty: 12 }, { itemId: 'car_battery', qty: 4 }],
    laborMinutes: 2400,
  },
  {
    id: 'radio_tower', name: 'Antena de Rádio da Prefeitura', locationId: 'rc_city_hall', skill: 'electrical', tools: ['screwdriver'], requires: ['substation'],
    description: 'Erguer de novo a antena no telhado da prefeitura e ligar o transmissor à rede elétrica.',
    effect: 'A rádio KRVN volta ao ar na frequência 88.1: alertas de hordas para quem tiver rádio e avisos de tudo o que muda no condado.',
    materials: [{ itemId: 'wire', qty: 20 }, { itemId: 'electronic_parts', qty: 25 }, { itemId: 'metal_sheet', qty: 10 }, { itemId: 'rope', qty: 8 }, { itemId: 'radio', qty: 2 }],
    laborMinutes: 1500,
  },
  {
    id: 'hospital', name: 'Reabrir o Hospital St. Mary', locationId: 'rc_hospital_surgery', skill: 'medicine', tools: ['hammer'],
    clearLocations: HOSPITAL_LOCATIONS,
    description: 'Limpar todas as alas do hospital, lacrar acessos, esterilizar o centro cirúrgico e montar uma enfermaria funcional.',
    effect: 'Quem descansa ou dorme no hospital cicatriza 60% mais rápido, o centro cirúrgico fica seguro para tratamentos e os infectados quase não voltam às alas do hospital. Para concluir, todas as alas precisam estar sem infectados.',
    materials: [{ itemId: 'antiseptic', qty: 12 }, { itemId: 'bandage', qty: 25 }, { itemId: 'surgical_supplies', qty: 6 }, { itemId: 'plank', qty: 25 }, { itemId: 'nails', qty: 30 }, { itemId: 'tarp', qty: 4 }],
    laborMinutes: 1800,
  },
  {
    id: 'bridge', name: 'Fortificar a Ponte do Rio Raven', locationId: 'hw_bridge', skill: 'carpentry', tools: ['hammer'],
    description: 'Bloquear a ponte com carros, sacos de areia e barricadas, deixando só uma passagem estreita vigiada.',
    effect: 'Hordas não conseguem atravessar a ponte e surgem com metade da frequência no condado.',
    materials: [{ itemId: 'plank', qty: 45 }, { itemId: 'nails', qty: 45 }, { itemId: 'scrap_metal', qty: 30 }, { itemId: 'metal_sheet', qty: 14 }, { itemId: 'rope', qty: 12 }, { itemId: 'barricade_kit', qty: 6 }],
    laborMinutes: 1800,
  },
  {
    id: 'main_street_wall', name: 'Muralha da Rua Principal', locationId: 'rc_main_street', skill: 'carpentry', tools: ['hammer'],
    description: 'Fechar as entradas do centro com muros improvisados de madeira, chapa e carros virados.',
    effect: 'No centro (Rua Principal, Centro Comercial, Beco, Prefeitura e Lanchonete) os infectados voltam 75% mais devagar e encontram as pessoas com metade da frequência.',
    materials: [{ itemId: 'plank', qty: 60 }, { itemId: 'nails', qty: 60 }, { itemId: 'scrap_metal', qty: 35 }, { itemId: 'metal_sheet', qty: 12 }, { itemId: 'barricade_kit', qty: 8 }],
    laborMinutes: 2100,
  },
  {
    id: 'water_well', name: 'Poço Artesiano da Fazenda Miller', locationId: 'fm_miller_farm', skill: 'mechanics', tools: ['wrench'],
    description: 'Consertar a bomba manual do poço artesiano e montar filtros de areia e carvão.',
    effect: 'Produz 4 garrafas de água limpa por hora no reservatório comunitário da fazenda (até 60).',
    materials: [{ itemId: 'scrap_metal', qty: 18 }, { itemId: 'pipe', qty: 6 }, { itemId: 'rope', qty: 6 }, { itemId: 'wire', qty: 6 }, { itemId: 'plank', qty: 12 }],
    laborMinutes: 1200,
    production: { itemId: 'water_bottle', perHour: 4, max: 60, containerName: 'Reservatório comunitário' },
  },
  {
    id: 'community_garden', name: 'Horta Comunitária', locationId: 'fm_miller_field', skill: 'farming', tools: ['shovel'],
    description: 'Preparar canteiros, cercar a plantação e montar irrigação por gravidade.',
    effect: 'Produz 3 maçãs por hora no celeiro comunitário da plantação (até 50).',
    materials: [{ itemId: 'seeds', qty: 12 }, { itemId: 'plank', qty: 18 }, { itemId: 'tarp', qty: 3 }, { itemId: 'water_bottle', qty: 12 }, { itemId: 'rope', qty: 6 }],
    laborMinutes: 900,
    production: { itemId: 'apple', perHour: 3, max: 50, containerName: 'Celeiro comunitário' },
  },
  {
    id: 'fuel_pump', name: 'Bomba Manual do Posto Gulf', locationId: 'rc_gas_station', skill: 'mechanics', tools: ['wrench', 'screwdriver'],
    description: 'Adaptar uma bomba manual ao tanque subterrâneo do posto para tirar o combustível que restou.',
    effect: 'Enche 1 galão de combustível a cada 2 horas no depósito do posto (até 10).',
    materials: [{ itemId: 'scrap_metal', qty: 22 }, { itemId: 'engine_parts', qty: 5 }, { itemId: 'wire', qty: 8 }, { itemId: 'pipe', qty: 4 }, { itemId: 'gas_can', qty: 3 }],
    laborMinutes: 1500,
    production: { itemId: 'gas_can', perHour: 0.5, max: 10, containerName: 'Depósito de combustível' },
  },
];

export const projectDef = (id: string) => PROJECTS.find((p) => p.id === id);
