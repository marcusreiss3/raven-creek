/** Conteúdo de criação de personagem: atributos, habilidades, profissões e características. */

export const ATTRIBUTES = {
  strength: { name: 'Força', desc: 'Capacidade de carga, dano corpo a corpo, empurrões.' },
  agility: { name: 'Agilidade', desc: 'Pontos de ação no combate, esquiva, furtividade.' },
  endurance: { name: 'Resistência', desc: 'Estamina, resistência a doenças e à perda de sangue.' },
  perception: { name: 'Percepção', desc: 'Precisão, chance de achar itens, detectar emboscadas.' },
  intellect: { name: 'Intelecto', desc: 'Aprendizado de habilidades, leitura, medicina.' },
} as const;
export type AttributeKey = keyof typeof ATTRIBUTES;
export const ATTRIBUTE_MIN = 1;
export const ATTRIBUTE_MAX = 8;
export const ATTRIBUTE_POINTS = 22; // soma total distribuída (5 atributos)

export const SKILLS: Record<string, { name: string; attribute: AttributeKey; category: string }> = {
  pistol: { name: 'Pistolas', attribute: 'perception', category: 'combate' },
  rifle: { name: 'Rifles', attribute: 'perception', category: 'combate' },
  shotgun: { name: 'Espingardas', attribute: 'strength', category: 'combate' },
  blade: { name: 'Armas cortantes', attribute: 'agility', category: 'combate' },
  blunt: { name: 'Armas contundentes', attribute: 'strength', category: 'combate' },
  medicine: { name: 'Medicina', attribute: 'intellect', category: 'sobrevivência' },
  carpentry: { name: 'Carpintaria', attribute: 'strength', category: 'ofício' },
  mechanics: { name: 'Mecânica', attribute: 'intellect', category: 'ofício' },
  electrical: { name: 'Eletricidade', attribute: 'intellect', category: 'ofício' },
  farming: { name: 'Agricultura', attribute: 'endurance', category: 'ofício' },
  cooking: { name: 'Culinária', attribute: 'intellect', category: 'ofício' },
  stealth: { name: 'Furtividade', attribute: 'agility', category: 'sobrevivência' },
  athletics: { name: 'Atletismo', attribute: 'endurance', category: 'físico' },
  survival: { name: 'Sobrevivência', attribute: 'perception', category: 'sobrevivência' },
  scavenging: { name: 'Busca de suprimentos', attribute: 'perception', category: 'sobrevivência' },
};

export type Profession = {
  id: string; name: string; description: string;
  skills: Record<string, number>; recipes: string[]; items: { itemId: string; qty: number }[];
  perks: string[]; // descrições exibidas
  modifiers?: Record<string, number>; // multiplicadores aplicados pelas regras
};

export const PROFESSIONS: Profession[] = [
  { id: 'police', name: 'Policial', description: 'Treinado em armas curtas e em manter a calma sob pressão.',
    skills: { pistol: 3, blunt: 1, athletics: 1 }, recipes: [], items: [{ itemId: 'pistol_9mm', qty: 1 }, { itemId: 'ammo_9mm', qty: 15 }, { itemId: 'flashlight', qty: 1 }, { itemId: 'baton', qty: 1 }],
    perks: ['Começa com a pistola de serviço carregada', 'Pistolas nível 3', 'Estresse sobe 20% mais devagar em combate'], modifiers: { combatStress: 0.8 } },
  { id: 'soldier', name: 'Militar', description: 'Disciplina, rifles e resistência física.',
    skills: { rifle: 3, athletics: 1, survival: 1 }, recipes: [], items: [{ itemId: 'service_rifle', qty: 1 }, { itemId: 'ammo_308', qty: 10 }, { itemId: 'canteen', qty: 1 }, { itemId: 'combat_knife', qty: 1 }],
    perks: ['Começa com o fuzil de serviço carregado', 'Rifles nível 3', 'Recarga custa 1 PA a menos'], modifiers: { reloadApDiscount: 1 } },
  { id: 'doctor', name: 'Médico', description: 'Diagnóstico preciso e tratamentos muito mais eficazes.',
    skills: { medicine: 4 }, recipes: ['suture_kit_improvised'], items: [{ itemId: 'bandage', qty: 2 }, { itemId: 'antiseptic', qty: 1 }],
    perks: ['Começa no hospital', 'Medicina nível 4', 'Pode diagnosticar infecções ocultas', 'Bônus em amputações de emergência'], modifiers: { diagnose: 1, treatment: 1.3 } },
  { id: 'nurse', name: 'Enfermeiro', description: 'Prática diária com curativos e cuidados.',
    skills: { medicine: 3, cooking: 1 }, recipes: ['suture_kit_improvised'], items: [{ itemId: 'bandage', qty: 3 }],
    perks: ['Medicina nível 3', 'Curativos duram 30% mais'], modifiers: { treatment: 1.15, bandageDurability: 1.3 } },
  { id: 'firefighter', name: 'Bombeiro', description: 'Forte, resistente e acostumado a machados.',
    skills: { blunt: 1, blade: 1, athletics: 2 }, recipes: [], items: [{ itemId: 'hatchet', qty: 1 }],
    perks: ['Atletismo nível 2', 'Queimaduras causam metade da dor'], modifiers: { burnPain: 0.5 } },
  { id: 'mechanic', name: 'Mecânico', description: 'Conhece motores por dentro e por fora.',
    skills: { mechanics: 4, blunt: 1 }, recipes: ['repair_tire'], items: [{ itemId: 'wrench', qty: 1 }],
    perks: ['Mecânica nível 4', 'Grande bônus para dar partida em veículos sem chave'], modifiers: { hotwire: 1.4 } },
  { id: 'carpenter', name: 'Marceneiro', description: 'Constrói mais rápido e desperdiça menos.',
    skills: { carpentry: 4 }, recipes: ['wood_plank', 'barricade_kit', 'storage_box'], items: [{ itemId: 'hammer', qty: 1 }, { itemId: 'nails', qty: 20 }],
    perks: ['Carpintaria nível 4', 'Construções 30% mais rápidas', '20% menos material'], modifiers: { buildSpeed: 1.3, buildMaterial: 0.8 } },
  { id: 'engineer', name: 'Engenheiro', description: 'Projetos, eletricidade e estruturas.',
    skills: { electrical: 3, carpentry: 1, mechanics: 1 }, recipes: ['generator_wiring'], items: [{ itemId: 'screwdriver', qty: 1 }],
    perks: ['Eletricidade nível 3', 'Estruturas construídas têm +25% de resistência'], modifiers: { structureHp: 1.25 } },
  { id: 'farmer', name: 'Agricultor', description: 'Planta, colhe e sabe se virar no campo.',
    skills: { farming: 4, survival: 1 }, recipes: ['garden_bed'], items: [{ itemId: 'seeds', qty: 3 }],
    perks: ['Agricultura nível 4', 'Encontra mais comida em fazendas'], modifiers: { farmLoot: 1.3 } },
  { id: 'cook', name: 'Cozinheiro', description: 'Transforma o pouco em refeição.',
    skills: { cooking: 4, blade: 1 }, recipes: ['cooked_meal', 'boiled_water'], items: [{ itemId: 'kitchen_knife', qty: 1 }],
    perks: ['Culinária nível 4', 'Refeições preparadas rendem 30% mais'], modifiers: { mealBonus: 1.3 } },
  { id: 'hunter', name: 'Caçador', description: 'Rastreia, espreita e acerta de longe.',
    skills: { rifle: 2, survival: 2, stealth: 1 }, recipes: ['cooked_meal'], items: [{ itemId: 'hunting_knife', qty: 1 }],
    perks: ['Sobrevivência nível 2', 'Viagens por trilha 15% mais rápidas'], modifiers: { trailSpeed: 1.15 } },
  { id: 'athlete', name: 'Atleta', description: 'Corre longe e se recupera rápido.',
    skills: { athletics: 4 }, recipes: [], items: [{ itemId: 'water_bottle', qty: 1 }],
    perks: ['Atletismo nível 4', 'Estamina recupera 25% mais rápido', '+1 PA para movimento'], modifiers: { staminaRegen: 1.25, moveAp: 1 } },
  { id: 'teacher', name: 'Professor', description: 'Aprende rápido com livros e ensina outros.',
    skills: { cooking: 1, medicine: 1 }, recipes: [], items: [{ itemId: 'book_first_aid', qty: 1 }],
    perks: ['+30% de XP ao ler livros', '+10% de XP geral'], modifiers: { bookXp: 1.3, xp: 1.1 } },
  { id: 'electrician', name: 'Eletricista', description: 'Fios, geradores e iluminação.',
    skills: { electrical: 4 }, recipes: ['generator_wiring', 'lamp'], items: [{ itemId: 'screwdriver', qty: 1 }],
    perks: ['Eletricidade nível 4', 'Geradores consomem 20% menos'], modifiers: { generatorFuel: 0.8 } },
  { id: 'unemployed', name: 'Desempregado', description: 'Sem especialização, mas com mais pontos para características.',
    skills: {}, recipes: [], items: [],
    perks: ['+6 pontos de características', '+5% de XP em todas as habilidades'], modifiers: { xp: 1.05, traitPoints: 6 } },
];

export type Trait = { id: string; name: string; cost: number; description: string; exclusive?: string[] };
/** cost > 0 = positivo (gasta pontos), cost < 0 = negativo (concede pontos). */
export const TRAITS: Trait[] = [
  { id: 'tough', name: 'Resistente', cost: 6, description: 'Ferimentos causam 15% menos dor e sangram 10% menos.' },
  { id: 'keen_eye', name: 'Visão aguçada', cost: 4, description: '+10% de chance de achados e +5 de precisão à distância.' },
  { id: 'light_sleeper', name: 'Sono leve', cost: 2, description: 'Acorda com ameaças; dorme 20% mais rápido.' },
  { id: 'fast_learner', name: 'Aprende rápido', cost: 6, description: '+20% de XP em todas as habilidades.' },
  { id: 'iron_gut', name: 'Estômago de ferro', cost: 3, description: 'Metade da chance de intoxicação alimentar.', exclusive: ['weak_stomach'] },
  { id: 'runner', name: 'Corredor', cost: 4, description: 'Viagens a pé 10% mais rápidas.' },
  { id: 'organized', name: 'Organizado', cost: 4, description: '+3 de capacidade de carga.' },
  { id: 'brave', name: 'Corajoso', cost: 3, description: 'Estresse de combate reduzido pela metade.', exclusive: ['cowardly'] },
  { id: 'smoker', name: 'Fumante', cost: -3, description: 'Viciado em nicotina: sem cigarro, estresse sobe e a mira piora. Estamina máxima -10%.' },
  { id: 'heavy_drinker', name: 'Bebe demais', cost: -3, description: 'Viciado em álcool: sem beber, vêm tremores (mira bem pior) e estresse.' },
  { id: 'clumsy', name: 'Desastrado', cost: -4, description: 'Vasculhar faz mais barulho (+40% de encontros).' },
  { id: 'weak_stomach', name: 'Estômago sensível', cost: -3, description: 'Dobro da chance de intoxicação alimentar.', exclusive: ['iron_gut'] },
  { id: 'cowardly', name: 'Medroso', cost: -3, description: 'Estresse de combate 50% maior.', exclusive: ['brave'] },
  { id: 'short_sighted', name: 'Míope', cost: -4, description: '-10 de precisão à distância e -10% de achados.' },
  { id: 'hemophobic', name: 'Hemofóbico', cost: -3, description: 'Tratar ferimentos causa estresse e é mais lento.' },
  { id: 'slow_healer', name: 'Cicatrização lenta', cost: -5, description: 'Ferimentos cicatrizam 30% mais devagar.' },
  { id: 'heavy_eater', name: 'Come muito', cost: -3, description: 'Fome sobe 30% mais rápido.' },
  { id: 'out_of_shape', name: 'Sedentário', cost: -4, description: 'Estamina regenera 25% mais devagar.' },
  { id: 'insomniac', name: 'Insone', cost: -2, description: 'Sono recupera 30% mais devagar.' },
];
export const TRAIT_BASE_POINTS = 4;

/**
 * Velhice: a partir dos 60 o corpo cobra o preço. Cada faixa entra na lista de traços do personagem
 * como um traço oculto (age_*), para que todos os cálculos que já usam charMod passem a considerar a idade.
 */
export const AGE_STAGES = [
  { id: 'age_60', minAge: 60, name: 'Idade pesando', description: 'Estamina máxima -10%, fôlego volta 10% mais devagar, ferimentos cicatrizam 10% mais devagar, anda 5% mais devagar.',
    mods: { staminaMax: 0.9, staminaRegenTrait: 0.9, healing: 0.9, walkSpeed: 0.95 } },
  { id: 'age_70', minAge: 70, name: 'Velhice', description: 'Estamina máxima -20%, fôlego volta 20% mais devagar, ferimentos cicatrizam 25% mais devagar, anda 12% mais devagar, -5 de precisão à distância, -2 de carga, sono rende 10% menos.',
    mods: { staminaMax: 0.8, staminaRegenTrait: 0.8, healing: 0.75, walkSpeed: 0.88, rangedAcc: -5, carryBonus: -2, sleepRecovery: 0.9 } },
  { id: 'age_80', minAge: 80, name: 'Velhice avançada', description: 'Estamina máxima -30%, fôlego volta 30% mais devagar, ferimentos cicatrizam 40% mais devagar e doem 15% mais, anda 20% mais devagar, -10 de precisão à distância, -4 de carga, sono rende 20% menos, 5% menos achados.',
    mods: { staminaMax: 0.7, staminaRegenTrait: 0.7, healing: 0.6, pain: 1.15, walkSpeed: 0.8, rangedAcc: -10, carryBonus: -4, sleepRecovery: 0.8, findChance: 0.95 } },
] as const;
export function ageStageFor(age: number) { return [...AGE_STAGES].reverse().find((s) => age >= s.minAge) ?? null; }
/** Lista de traços com a faixa de idade certa (remove a antiga, põe a atual). */
export function withAgeTrait(traits: string[], age: number): string[] {
  const st = ageStageFor(age); const base = traits.filter((t) => !t.startsWith('age_'));
  return st ? [...base, st.id] : base;
}

export function professionById(id: string) { return PROFESSIONS.find((p) => p.id === id); }
export function traitById(id: string) { return TRAITS.find((t) => t.id === id); }

/** Multiplicador agregado de um modificador entre profissão e traços. */
export function charMod(profession: string, traits: string[], key: string, fallback = 1): number {
  const p = professionById(profession);
  let v = p?.modifiers?.[key] ?? fallback;
  const traitMods: Record<string, Record<string, number>> = {
    tough: { pain: 0.85, bleed: 0.9 }, keen_eye: { findChance: 1.1, rangedAcc: 5 }, light_sleeper: { sleepRecovery: 1.2 },
    fast_learner: { xpTrait: 1.2 }, iron_gut: { foodPoison: 0.5 }, weak_stomach: { foodPoison: 2 }, runner: { walkSpeed: 1.1 },
    organized: { carryBonus: 3 }, brave: { combatStressTrait: 0.5 }, cowardly: { combatStressTrait: 1.5 }, smoker: { staminaMax: 0.9 },
    clumsy: { noise: 1.4 }, short_sighted: { rangedAcc: -10, findChance: 0.9 }, slow_healer: { healing: 0.7 }, heavy_eater: { hunger: 1.3 },
    out_of_shape: { staminaRegenTrait: 0.75 }, insomniac: { sleepRecovery: 0.7 }, hemophobic: { treatStress: 1 },
    ...Object.fromEntries(AGE_STAGES.map((s) => [s.id, s.mods as Record<string, number>])),
  };
  for (const t of traits) {
    const m = traitMods[t]?.[key];
    if (m === undefined) continue;
    if (key === 'rangedAcc' || key === 'carryBonus') v = (v === fallback ? 0 : v) + m; else v *= m;
  }
  return v;
}
