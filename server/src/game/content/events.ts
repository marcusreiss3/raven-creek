import type { EventConditions } from '../../db/schema.js';

type E = { id: string; name: string; scope: 'explore' | 'travel' | 'world'; kind: string; weight: number; cooldownMinutes?: number; conditions?: EventConditions; effects?: Record<string, any>; text: string; requiresDecision?: boolean };

/** Tabela central de eventos. Pesos, condições e efeitos são editáveis no painel. */
export const EVENT_DEFS: E[] = [
  // ── Exploração
  { id: 'exp_hidden_zombie', name: 'Infectado escondido', scope: 'explore', kind: 'combat', weight: 4, text: 'Uma porta range. Algo se arrasta no escuro do cômodo ao lado…', effects: { zombies: { min: 1, max: 1 }, types: ['walker', 'decayed'] } },
  { id: 'exp_alarm', name: 'Alarme disparando', scope: 'explore', kind: 'combat', weight: 1.2, conditions: { categories: ['store', 'supermarket', 'pharmacy', 'police', 'school', 'industrial', 'commercial'] }, text: 'Você esbarra em algo e um alarme estridente ecoa pela rua!', effects: { zombies: { min: 2, max: 4 }, stress: 15, dangerBump: 0.05 } },
  { id: 'exp_wounded_survivor', name: 'Sobrevivente ferido', scope: 'explore', kind: 'message', weight: 1, text: 'Você encontra marcas recentes de sangue e uma mochila abandonada às pressas.', effects: { loot: { itemId: 'bandage', qty: 2 } } },
  { id: 'exp_rare_vehicle', name: 'Veículo encontrado', scope: 'explore', kind: 'vehicle', weight: 0.6, conditions: { categories: ['garage', 'street', 'parking', 'gas_station', 'farm', 'road', 'workshop', 'house'] }, text: 'Atrás do prédio há um veículo coberto por uma lona. Ainda parece inteiro.' },
  { id: 'exp_equipment_break', name: 'Ferramenta danificada', scope: 'explore', kind: 'wound', weight: 1, text: 'Você força uma gaveta emperrada e se corta num caco de vidro.', effects: { wound: { type: 'scratch', region: 'random_hand' } } },
  { id: 'exp_rats', name: 'Ratos', scope: 'explore', kind: 'stress', weight: 1.2, conditions: { categories: ['sewer', 'warehouse', 'house', 'basement'] }, text: 'Dezenas de ratos fogem por entre seus pés. Seu coração dispara.', effects: { stress: 10 } },
  { id: 'exp_power_failure', name: 'Falha elétrica', scope: 'explore', kind: 'stress', weight: 0.6, conditions: { categories: ['hospital', 'prison', 'industrial', 'military'] }, text: 'As últimas luzes de emergência piscam e se apagam.', effects: { stress: 8 } },
  // ── Viagem
  { id: 'trv_zombies_road', name: 'Zumbis na estrada', scope: 'travel', kind: 'combat', weight: 8, requiresDecision: true, text: 'Silhuetas cambaleiam no caminho à frente. Elas ainda não te viram.', effects: { zombies: { min: 1, max: 3 }, types: ['walker', 'wanderer'] } },
  { id: 'trv_runner', name: 'Corredor no encalço', scope: 'travel', kind: 'combat', weight: 2, requiresDecision: true, conditions: { timeOfDay: ['night', 'dusk'] }, text: 'Um grito agudo corta a noite. Passos rápidos se aproximam!', effects: { zombies: { min: 1, max: 1 }, types: ['runner'] } },
  { id: 'trv_abandoned_car', name: 'Veículo abandonado', scope: 'travel', kind: 'vehicle', weight: 1.5, conditions: { roadTypes: ['asphalt', 'dirt'] }, text: 'Um carro abandonado no acostamento, portas abertas. Você anota a posição.' },
  { id: 'trv_roadblock', name: 'Bloqueio de passagem', scope: 'travel', kind: 'roadblock', weight: 1.5, requiresDecision: true, conditions: { roadTypes: ['asphalt', 'dirt'] }, text: 'Carros batidos e arame farpado bloqueiam a passagem.' },
  { id: 'trv_stranger', name: 'Sobrevivente desconhecido', scope: 'travel', kind: 'message', weight: 1, text: 'Ao longe, alguém observa você por um binóculo e desaparece entre as árvores.', effects: { stress: 5 } },
  { id: 'trv_animal', name: 'Animal', scope: 'travel', kind: 'wound', weight: 0.8, conditions: { roadTypes: ['trail', 'dirt'] }, text: 'Um cão faminto surge do mato e morde sua perna antes de fugir.', effects: { wound: { type: 'scratch', region: 'random_leg' }, disease: { kind: 'zoonotic', chance: 0.25 } } },
  { id: 'trv_accident', name: 'Acidente', scope: 'travel', kind: 'accident', weight: 1, conditions: { vehicleOnly: true }, text: 'Um buraco escondido! O veículo dá um tranco violento.', effects: { vehicleDamage: 12, wound: { type: 'bruise', region: 'torso' } } },
  { id: 'trv_sounds', name: 'Sons misteriosos', scope: 'travel', kind: 'stress', weight: 1.5, text: 'Batidas metálicas ecoam de algum lugar. Depois, silêncio absoluto.', effects: { stress: 8 } },
  { id: 'trv_shortcut', name: 'Caminho alternativo', scope: 'travel', kind: 'alt_path', weight: 1, conditions: { footOnly: true }, text: 'Você nota uma trilha mais curta entre os terrenos.', effects: { timeMultiplier: 0.75 } },
  // ── Mundo (rolados periodicamente em locais ocupados)
  { id: 'wld_distant_noise', name: 'Ruídos distantes', scope: 'world', kind: 'message', weight: 3, cooldownMinutes: 10, text: 'Tiros distantes ecoam pelo vale. Alguém está em apuros.' },
  { id: 'wld_horde_rumor', name: 'Gemidos ao longe', scope: 'world', kind: 'horde', weight: 0.6, cooldownMinutes: 60, conditions: { minDanger: 0.3 }, text: 'Um coro grave de gemidos cresce no horizonte. Uma horda está em movimento.' },
  { id: 'wld_fire', name: 'Incêndio', scope: 'world', kind: 'structure_damage', weight: 0.4, cooldownMinutes: 120, text: 'Fumaça! Um curto-circuito começou um pequeno incêndio.', effects: { structureDamage: 15 } },
  { id: 'wld_storm', name: 'Tempestade chegando', scope: 'world', kind: 'weather', weight: 0.5, cooldownMinutes: 120, text: 'O céu escurece rápido. Uma tempestade se aproxima.', effects: { weather: 'storm' } },
  { id: 'wld_supply_drop', name: 'Suprimentos deixados', scope: 'world', kind: 'loot', weight: 0.4, cooldownMinutes: 180, text: 'Alguém deixou uma caixa de suprimentos com um bilhete: "para quem precisar".', effects: { loot: { itemId: 'canned_beans', qty: 2 } } },
  { id: 'wld_faction_signal', name: 'Sinal de rádio', scope: 'world', kind: 'message', weight: 0.6, cooldownMinutes: 60, text: 'Estática no rádio… uma voz repete coordenadas antes de cortar.' },
];
