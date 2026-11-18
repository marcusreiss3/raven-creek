/**
 * Configuração de balanceamento padrão. É gravada na tabela game_config (chave "game") pelo seed
 * e editada pelo painel administrativo. Nenhuma regra do jogo deve ler percentuais fixos fora daqui
 * (ou das tabelas de loot/eventos/zumbis).
 * Unidades: "por hora" e "por minuto" referem-se SEMPRE a tempo real, salvo indicação.
 */
export const defaultGameConfig = {
  difficulty: 'normal',
  time: {
    /** Minutos de jogo por minuto real (relógio/clima). Não afeta viagens nem ferimentos. */
    timeScale: 6,
    /** Hora do jogo em que o servidor começou. */
    startHour: 8,
  },
  needs: {
    hungerPerHour: 12,
    thirstPerHour: 15,
    sleepinessPerHour: 3,
    sleepRecoveryPerHour: 30,
    staminaRegenPerMinute: 8,
    staminaRegenRestingMultiplier: 2,
    /** Energia: parado/andando 20 por hora; descansando ~30 min de 0 a 100; dormindo ~25 min (cama ~17 min). */
    energyRegenPerHour: 20,
    energyRegenRestingMultiplier: 10,
    energyRegenSleepingMultiplier: 12,
    stressDecayPerHour: 4,
    /** Dormindo, o estresse cai este tanto de vezes mais rápido. */
    stressSleepMultiplier: 4,
    /** Velocidade do "tempo do corpo" enquanto o jogador está desconectado: fome, sede, sono, ferimentos,
     *  sangramento, infecção, doenças, cicatrização e energia. 0 = o corpo fica congelado offline e só evolui
     *  (em velocidade normal) enquanto o jogador está conectado. Viagens NÃO são afetadas. */
    offlineBodyTimeMultiplier: 0,
    /** Desconectado, a energia (só ela) volta como descansando/dormindo, nesta fração da velocidade (0,5 = demora o dobro). */
    offlineEnergyMultiplier: 0.5,
    starvationDamageThreshold: 85,
    dehydrationDamageThreshold: 85,
    bloodRegenPerHour: 3,
    encumbranceFatigueMultiplier: 1.5,
  },
  exploration: {
    energyCost: 14,
    staminaCost: 6,
    baseSeconds: 25,
    nightWithoutLightTimeMultiplier: 1.6,
    nightWithoutLightFindMultiplier: 0.5,
    baseFinds: 1.4,
    /** Chance base de barulho atrair infectados ao vasculhar (multiplicada pelo perigo do local). */
    noiseEncounterBase: 0.55,
    nightEncounterMultiplier: 1.5,
    /** Chance de um evento de exploração (tabela "explore") acontecer em vez/além de achados. */
    eventChance: 0.18,
    /** Quanto da reserva é consumida por achado comum/incomum/raro. */
    reserveCost: { common: 4, uncommon: 7, rare: 12, very_rare: 20 },
    minReserveRatioToFind: 0.05,
    repeatSearchPenaltyPerSearch: 0.08,
  },
  loot: {
    defaultMaxReserve: 100,
    defaultRegenPerHour: 1.5,
  },
  travel: {
    walkSpeed: 1.4,
    /** Multiplica a duração de todas as viagens (1 = tempo "realista" a pé). */
    durationMultiplier: 0.35,
    minSeconds: 8,
    roadTypeSpeed: { indoor: 1, asphalt: 1, dirt: 0.9, trail: 0.75 },
    weatherSpeed: { clear: 1, cloudy: 1, rain: 0.88, storm: 0.7, fog: 0.85, snow: 0.7 },
    nightSpeed: 0.85,
    encumbranceSpeedPenalty: 0.5,
    lowStaminaSpeed: 0.85,
    encounterChancePerKm: 0.5,
    encounterChanceMin: 0.1,
    encounterChanceMax: 0.75,
    vehicleAllowedRoads: ['asphalt', 'dirt'],
    detourTimeMultiplier: 0.4,
    /** Distância (m) para dois viajantes se avistarem na estrada (mesma estrada ou estradas que se cruzam num local). */
    meetRadiusM: 150,
  },
  carry: {
    baseCapacity: 12,
    strengthBonus: 1.5,
  },
  wounds: {
    bandageBleedReduction: 0.85,
    bandageDirtPerHour: 0.08,
    contaminationPerHourUntreated: 0.05,
    infectionContaminationThreshold: 0.6,
    woundInfectionChancePerHour: 0.08,
    healingPerHourBase: 0.6,
    /** Dormindo o corpo cicatriza bem mais rápido (cama na base multiplica de novo); descansando, um pouco. */
    sleepHealingMultiplier: 2.5,
    restHealingMultiplier: 1.5,
    fractureHealingWithoutSplint: 0.15,
    /** Abaixo disto de sangue o personagem desmaia; abaixo de deathBlood morre. */
    faintBlood: 40,
    deathBlood: 20,
    painFaint: 95,
    medicalSkillTreatBonus: 0.06,
  },
  infection: {
    biteChance: 0.75,
    lacerationChance: 0.12,
    scratchChance: 0.03,
    /** Horas reais desde a mordida até a morte. */
    hoursToDeath: 36,
    regionSpeed: { head: 2, neck: 1.8, torso: 1.2, abdomen: 1.2, left_arm: 1, right_arm: 1, left_hand: 0.9, right_hand: 0.9, left_leg: 1, right_leg: 1, left_foot: 0.85, right_foot: 0.85 },
    stages: [0.2, 0.45, 0.7, 0.9],
    reanimate: true,
    amputation: {
      enabled: true,
      /** Janela (minutos reais) após a mordida em que a amputação pode impedir a infecção. */
      windowMinutes: 45,
      cureChanceInsideWindow: 0.7,
      cureChanceOutsideWindow: 0,
      baseSuccess: 0.45,
      medicalSkillBonus: 0.07,
      doctorBonus: 0.15,
    },
  },
  diseases: {
    foodPoisoningFromSpoiled: 0.35,
    foodPoisoningFromRaw: 0.25,
    waterborneFromDirty: 0.3,
    respiratoryChancePerHourCold: 0.03,
    hypothermiaThreshold: 35.5,
    durationsHours: { food_poisoning: 6, wound_infection: 24, waterborne: 10, respiratory: 18, zoonotic: 14, hypothermia: 3 },
  },
  skills: {
    xpCurveBase: 60,
    xpCurveExponent: 1.55,
    maxLevel: 10,
    /** XP por hora em uma habilidade a partir da qual os ganhos decaem. */
    hourlySoftCap: 120,
    sameActionDecay: 0.6,
  },
  combat: {
    turnSeconds: 40,
    playerAp: 4,
    /** Multiplica a chance de um infectado agarrar quem sai do alcance dele. */
    grabChanceMultiplier: 0.75,
    /** Estamina gasta por casa andada. Abaixo de 30 perde 1 PA; abaixo de 15, 2 PA. */
    moveStaminaCost: 2.5,
    idleTimeoutAction: 'defend',
    maxTimeoutsBeforeAutoFlee: 3,
    noiseReinforcementChance: 0.35,
    baseMeleeHit: 70,
    baseRangedHit: 60,
    rangePenaltyPerTile: 4,
    coverBonus: 25,
    defendBonus: 20,
    headshotAimCost: 1,
    unarmedDamage: 5,
    maxZombiesStart: 6,
    /** Sob proteção de novato (pvp.newbieProtectionHours): multiplica a chance de um golpe de infectado virar mordida. O resto vira arranhão. */
    newbieBiteMultiplier: 0.5,
    /** Tiros ecoam nos locais vizinhos; intervalo mínimo (s) entre avisos vindos do mesmo local. Negativo desliga. */
    gunshotEchoCooldownSeconds: 40,
  },
  pvp: {
    enabled: true,
    newbieProtectionHours: 24,
    protectOffline: true,
    cooldownMinutes: 30,
    allowJoinAsReinforcement: true,
  },
  permadeath: {
    enabled: true,
    /** Horas até o corpo se decompor (o servidor limita a 3). */
    corpseHours: 3,
    maxAliveCharactersPerUser: 1,
    /** Em vez de morrer na hora, o personagem cai e pode ser reanimado com um kit de primeiros socorros dentro deste prazo (sorteado entre o mínimo e o máximo). Infecção zumbi não tem volta. */
    downedEnabled: true,
    downedMinSeconds: 60,
    downedMaxSeconds: 180,
  },
  /** Livros: ler leva tempo e deixa o personagem ocupado (sem poder fazer mais nada). */
  books: {
    readMinutes: 6,
  },
  /** Desmontar peças de veículos: nível mínimo de Mecânica por peça. */
  vehicleParts: {
    tireLevel: 1,
    batteryLevel: 1,
    fuelLevel: 1,
    engineLevel: 3,
  },
  /** Infectados que vivem nos locais: emboscada ao chegar, ataques a quem fica parado e retorno com o tempo. */
  zombies: {
    /** Chance base de emboscada ao chegar num local com infectados (multiplicada por perigo, quantidade, noite...). */
    arrivalAmbushBase: 0.16,
    /** Chance base, a cada checagem (world.eventRollEveryMinutes), de infectados acharem quem está parado no local. */
    idleAttackPerCheck: 0.05,
    nightMultiplier: 1.5,
    /** Descansando/dormindo: menos atento. */
    restingMultiplier: 1.3,
    /** Personagens sob proteção de novato são achados com menos frequência. */
    newbieMultiplier: 0.4,
    /** Cada ponto de defesa das estruturas da base reduz a chance (5% por ponto, até 90%). */
    baseDefenseReduction: 0.05,
    /** Furtividade: cada nível reduz a chance (até 60%). */
    stealthReduction: 0.06,
    /** Infectados que voltam a vagar por hora (× perigo do local), até perigo × maxPerDanger. */
    respawnPerHour: 0.6,
    maxPerDanger: 10,
    /** Defesa de base a partir da qual os infectados param de voltar ao local (barricada 10 + porta reforçada 14). */
    baseBlockRespawnDefense: 24,
  },
  /** Projetos da comunidade (obras coletivas). */
  projects: {
    /** Duração de um turno de trabalho/reparo (minutos reais). */
    workSessionMinutes: 20,
    workEnergy: 16,
    workStamina: 12,
    /** Cada nível na habilidade da obra rende +8% de trabalho por turno. */
    skillBonusPerLevel: 0.08,
    /** Abaixo deste estado (%) a obra para de funcionar. */
    minIntegrity: 40,
    /** Desgaste natural por hora (%). */
    wearPerHour: 0.35,
    /** Quanto um turno de reparo devolve (%). */
    repairPerSession: 8,
    /** Dano de uma horda que passa pela obra, por infectado (%). */
    hordeDamagePerZombie: 1.2,
    /** Tempo para uma facção tomar o controle da subestação (minutos). */
    claimMinutes: 30,
    xpPerSession: 14,
  },
  /** Estações do ano (contadas em dias de jogo). */
  seasons: {
    daysPerSeason: 10,
    /** Estação em que o mundo começou (dia 1). */
    start: 'autumn',
    temperatureOffset: { spring: -1, summer: 6, autumn: -4, winter: -15 },
    weather: {
      spring: { clear: 3, cloudy: 3, rain: 3, storm: 0.6, fog: 1.4 },
      summer: { clear: 6, cloudy: 2, rain: 1, storm: 1, fog: 0.3 },
      autumn: { clear: 3, cloudy: 4, rain: 2.5, storm: 0.6, fog: 2 },
      winter: { clear: 2, cloudy: 3, snow: 4, storm: 0.4, fog: 1.5 },
    },
    /** Plantações (hortas de base e comunitária) por estação. */
    cropMultiplier: { spring: 1.2, summer: 1.3, autumn: 0.6, winter: 0 },
    /** Velocidade com que a comida estraga. */
    spoilMultiplier: { spring: 1, summer: 1.5, autumn: 0.8, winter: 0.35 },
    huntMultiplier: { spring: 1.1, summer: 1, autumn: 1.2, winter: 0.6 },
    fishMultiplier: { spring: 1.2, summer: 1, autumn: 0.9, winter: 0.45 },
  },
  /** Fogueiras, caça e pesca. */
  nature: {
    fireMaxMinutes: 480,
    fireWarmth: 20,
    /** Fumaça: multiplicador da chance de infectados acharem quem está no local. */
    smokeThreatMultiplier: 1.5,
    huntMinutes: 15, huntEnergy: 18,
    fishMinutes: 20, fishEnergy: 10,
  },
  /** Vícios: dependência (≥ addictedAt vicia), fissura por hora, estresse na abstinência e quanto cada uso vicia. */
  addiction: { addictedAt: 40, traitFloor: 70, depDecayPerHour: 0.25, nicotineCravingPerHour: 9, alcoholCravingPerHour: 6, withdrawalStressPerHour: { nicotine: 3, alcohol: 4 }, smokeDependence: 6, drinkDependenceFactor: 0.3, drunkDecayPerHour: 12 },
  /** Bilhetes/mistérios e mural de recados. */
  mysteries: { findChance: 0.15, safeAttemptsPerHour: 4, muralMaxLength: 280, muralCooldownSeconds: 45, muralMaxPerLocation: 40 },
  /** Mortos que levantam: minutos até o corpo se erguer (infecção é quase imediata) e quão mais resistentes ficam. */
  risen: { enabled: true, delayMinutes: 10, infectionDelayMinutes: 1, bodyMultiplier: 1.6, apBonus: 1 },
  /** Cachorros. */
  dogs: {
    strayChanceOnExplore: 0.04,
    maxStrays: 3,
    hungerPerHour: 3,
    threatMultiplier: 0.6,
    findBonus: 0.2,
    combatAssistChance: 0.35,
  },
  hordes: {
    enabled: true,
    moveEveryMinutes: 30,
    /** Binóculo: vê hordas a até N trechos. Rádio: vê todas. Sem nada: só as que estão a 1 trecho (pelos gemidos). */
    binocularHops: 2,
    lureCooldownMinutes: 20,
    hideMinutes: 40,
    spawnChancePerHour: 0.15,
    maxActive: 3,
    structureDamagePerZombie: 0.8,
  },
  world: {
    weatherChangeEveryGameHours: 4,
    weatherWeights: { clear: 4, cloudy: 3, rain: 2, storm: 0.6, fog: 1.2 },
    eventRollEveryMinutes: 3,
    worldEventChance: 0.12,
  },
  chat: {
    allowPrivateMessages: true,
    historySize: 60,
    rateLimitPerTenSeconds: 8,
  },
  build: {
    claimRequiresNoZombies: false,
  },
};

export type GameConfig = typeof defaultGameConfig;
