/** Construções de base. Materiais/tempo são ajustados por profissão, habilidade e ferramentas. */
export const STRUCTURES: Record<string, {
  name: string; description: string; materials: { itemId: string; qty: number }[]; tools: string[]; skill: string; minLevel: number;
  knowledge?: string; seconds: number; energy: number; maxHp: number; defense: number; maxCount: number; effects?: Record<string, number>;
}> = {
  barricade: { name: 'Barricada', description: 'Bloqueia acessos. Principal defesa contra hordas.', materials: [{ itemId: 'plank', qty: 3 }, { itemId: 'nails', qty: 6 }], tools: ['hammer'], skill: 'carpentry', minLevel: 0, seconds: 40, energy: 10, maxHp: 60, defense: 10, maxCount: 6 },
  door_reinforcement: { name: 'Porta reforçada', description: 'Reforço metálico na porta principal.', materials: [{ itemId: 'metal_sheet', qty: 1 }, { itemId: 'nails', qty: 8 }, { itemId: 'plank', qty: 1 }], tools: ['hammer'], skill: 'carpentry', minLevel: 1, seconds: 60, energy: 12, maxHp: 100, defense: 14, maxCount: 2 },
  window_boards: { name: 'Janelas pregadas', description: 'Tábuas sobre as janelas. Reduz detecção e invasões.', materials: [{ itemId: 'plank', qty: 2 }, { itemId: 'nails', qty: 4 }], tools: ['hammer'], skill: 'carpentry', minLevel: 0, seconds: 30, energy: 8, maxHp: 35, defense: 6, maxCount: 6 },
  storage: { name: 'Caixa de armazenamento', description: 'Aumenta a capacidade do estoque da base em 40.', materials: [{ itemId: 'plank', qty: 4 }, { itemId: 'nails', qty: 8 }], tools: ['hammer'], skill: 'carpentry', minLevel: 1, knowledge: 'storage_box', seconds: 45, energy: 8, maxHp: 40, defense: 0, maxCount: 5, effects: { storage: 40 } },
  bed: { name: 'Cama improvisada', description: 'Dormir aqui recupera sono e energia mais rápido.', materials: [{ itemId: 'plank', qty: 2 }, { itemId: 'tarp', qty: 1 }], tools: [], skill: 'carpentry', minLevel: 0, seconds: 30, energy: 6, maxHp: 20, defense: 0, maxCount: 8, effects: { sleep: 1.5 } },
  rain_collector: { name: 'Coletor de água', description: 'Gera água suja ao longo do tempo (mais com chuva).', materials: [{ itemId: 'tarp', qty: 1 }, { itemId: 'plank', qty: 2 }, { itemId: 'rope', qty: 1 }], tools: [], skill: 'carpentry', minLevel: 1, seconds: 40, energy: 8, maxHp: 25, defense: 0, maxCount: 3, effects: { water: 1 } },
  garden: { name: 'Plantação', description: 'Produz alimentos periodicamente. Exige sementes.', materials: [{ itemId: 'seeds', qty: 2 }], tools: ['shovel'], skill: 'farming', minLevel: 0, knowledge: 'garden_bed', seconds: 50, energy: 12, maxHp: 20, defense: 0, maxCount: 4, effects: { food: 1 } },
  generator: { name: 'Gerador', description: 'Fornece energia para iluminação (consome combustível).', materials: [{ itemId: 'scrap_metal', qty: 6 }, { itemId: 'wire', qty: 3 }, { itemId: 'electronic_parts', qty: 4 }], tools: ['screwdriver', 'wrench'], skill: 'electrical', minLevel: 2, knowledge: 'generator_wiring', seconds: 90, energy: 16, maxHp: 50, defense: 0, maxCount: 1, effects: { power: 1 } },
  lights: { name: 'Iluminação', description: 'Elimina a penalidade noturna dentro da base (exige gerador).', materials: [{ itemId: 'wire', qty: 2 }, { itemId: 'electronic_parts', qty: 2 }], tools: ['screwdriver'], skill: 'electrical', minLevel: 1, seconds: 40, energy: 6, maxHp: 15, defense: 0, maxCount: 2, effects: { light: 1 } },
  watchtower: { name: 'Posto de observação', description: 'Avisa sobre hordas com antecedência e dá bônus de defesa.', materials: [{ itemId: 'plank', qty: 6 }, { itemId: 'nails', qty: 12 }, { itemId: 'rope', qty: 1 }], tools: ['hammer', 'saw'], skill: 'carpentry', minLevel: 2, seconds: 90, energy: 16, maxHp: 60, defense: 8, maxCount: 1, effects: { warning: 1 } },
};

export const VEHICLE_TYPES: Record<string, { name: string; seats: number; storage: number; fuelMax: number; speed: number; consumption: number; noise: number }> = {
  compact: { name: 'Carro popular', seats: 4, storage: 30, fuelMax: 40, speed: 13, consumption: 0.08, noise: 12 },
  pickup: { name: 'Caminhonete', seats: 3, storage: 80, fuelMax: 70, speed: 12, consumption: 0.13, noise: 15 },
  van: { name: 'Van', seats: 7, storage: 100, fuelMax: 65, speed: 11, consumption: 0.12, noise: 14 },
  motorcycle: { name: 'Motocicleta', seats: 2, storage: 8, fuelMax: 14, speed: 15, consumption: 0.04, noise: 16 },
  truck: { name: 'Caminhão', seats: 2, storage: 200, fuelMax: 150, speed: 9, consumption: 0.3, noise: 20 },
  armored: { name: 'Blindado da polícia', seats: 6, storage: 60, fuelMax: 90, speed: 10, consumption: 0.25, noise: 18 },
};
