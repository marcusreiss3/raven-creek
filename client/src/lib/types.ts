export type Needs = {
  hunger: number; thirst: number; sleepiness: number; stamina: number; energy: number; stress: number; bodyTemp: number; blood: number;
  vitality: number; health: number; pain: number; staminaMax: number; unconscious?: boolean; painkillerUntil?: number; antibioticUntil?: number;
  nicotine?: number; alcohol?: number; nicotineDep?: number; alcoholDep?: number; drunk?: number;
};
export type Item = {
  id: number; defId: string; name: string; category: string; quantity: number; weight: number; durability: number; durabilityMax: number;
  slot: string | null; equipSlot: string | null; icon: string; rarity: string; description: string; props: Record<string, any>; data: { ammo?: number }; freshness?: number; note?: { mystery: string; title: string; text: string } | null;
  canDismantle?: boolean; rippable?: number;
};
export type Wound = {
  id: number; region: string; regionName: string; type: string; typeName: string; severity: number; bleeding: number; pain: number; healing: number;
  bandaged: boolean; bandageDirt: number; disinfected: boolean; splinted: boolean; sutured: boolean; infected: boolean; contaminated: boolean; createdAt: string; source: string;
};
export type NearbyTraveler = SceneChar & { toName: string; fromName: string; travelStatus: string; mode: string; distance: number; groupId: string; sameRoad: boolean };
export type Travel = { id: number; status: 'active' | 'paused' | 'awaiting_decision' | 'combat'; companions?: SceneChar[]; nearby?: NearbyTraveler[]; isLeader?: boolean; leaderId?: number | null; fromId: string; toId: string; fromName?: string; toName?: string; durationMs: number; elapsedMs: number; mode: string; sceneKey: string; groupId: string; encounter: { eventId: string; kind: string; text: string } | null };
export type SelfState = {
  id: number; name: string; firstName: string; lastName: string; age: number; appearance: string; backstory: string;
  ageStage?: { name: string; description: string } | null;
  profession: { id: string; name: string; perks: string[] }; traits: { id: string; name: string; cost: number; description: string }[];
  attributes: Record<string, number>; portrait: string | null; portraitAdjust: { scale: number; x: number; y: number }; alive: boolean; deathCause: string | null;
  locationId: string; locationName: string; state: string; activity: string; busyUntil: string | null; busyAction: { type: string; label: string; startedAt: number } | null;
  combatId: number | null; followingId: number | null; vehicleId: number | null; radioFrequency: number | null; tutorialStep: number; protectedUntil: string | null;
  /** Está jogando o Dia 1 (prólogo pelo celular). */
  prologue?: boolean;
  needs: Needs; mods: { moveMult: number; accuracyMult: number; meleeMult: number; canUseTwoHanded: boolean; usableHands: number; notes: string[] };
  amputations: string[]; wounds: Wound[]; conditions: { id: number; kind: string; name: string; stage: number; symptoms: string; progress?: number; hidden: boolean }[];
  skills: { id: string; name: string; category: string; level: number; progress: number }[]; knownRecipes: string[];
  inventory: Item[]; carry: { weight: number; capacity: number; ratio: number }; armor: Record<string, { p: number; b: number }>;
  travel: Travel | null; faction: { id: number; name: string; emblem: string; color: string; rank: string } | null; factionInvites: { factionId: number; name: string }[];
  logs: { id: number; kind: string; message: string; at: string }[]; clock: Clock;
  dog: Dog | null;
};
export type DogVariant = 'caramelo' | 'pastor' | 'preto';
export type Dog = { id: number; name: string; look: string; variant: DogVariant; health: number; hunger: number; loyalty: number; awayUntil?: string | null; scavengeReadyAt?: string | null; treatReadyAt?: string | null; petReadyAt?: string | null };
export type SceneDog = { id: number; name: string; ownerId: number | null; status: string; look: string; variant: DogVariant; health: number; trust: number; away?: boolean };
export type Clock = { total: number; day: number; hour: number; minute: number; phase: 'dawn' | 'day' | 'dusk' | 'night'; weather: string; temperature: number; isDark?: boolean; season?: 'spring' | 'summer' | 'autumn' | 'winter'; seasonDay?: number; daysPerSeason?: number };
export type SceneChar = { id: number; name: string; portrait: string | null; portraitAdjust: { scale: number; x: number; y: number }; state: string; activity: string; appearance: string; online: boolean; userId: number; followingId: number | null; inCombat: boolean; visibleCondition: string };
export type Scene = {
  location: { id: string; name: string; description: string; category: string; regionId: string; sceneKey: string; musicKey: string; indoor: boolean; buildable: boolean; tags: string[]; data: Record<string, unknown> };
  looted: string; threat: string; characters: SceneChar[];
  powered?: boolean; project?: { id: string; name: string } | null;
  ground: { id: number; defId: string; name: string; quantity: number; icon: string; category?: string }[];
  containers: { id: number; name: string; kind: string; baseId: number | null }[];
  vehicles: { id: number; name: string; type: string; seats: number; running: boolean; driverId: number | null; condition: number }[];
  base: null | { id: number; name: string; ownerCharacterId: number | null; factionId: number | null; faction: { name: string; emblem: string; color: string } | null; structures: { id: number; kind: string; hp: number; maxHp: number; building: boolean; completeAt: string | null }[] };
  combats: { id: number; reason: string }[];
  exits: { connectionId: number; toId: string; name: string; distance: number; roadType: string; blocked: boolean; blockedReason: string | null; regionChange: boolean; category: string }[];
  time: { hour: number; minute: number; day: number; phase: string; weather: string; temperature: number; season?: string; seasonDay?: number };
  campfire?: { lit: boolean; minutesLeft: number; canHaveFire: boolean }; smokeNearby?: string[]; canHunt?: boolean; canFish?: boolean; dogs?: SceneDog[];
  risen?: { id: number; name: string; portrait: string | null; inCombat: boolean; carrying: number }[];
  pendingCorpses?: { containerId: number; name: string; risesAt: string }[];
  safes?: { mysteryId: string; name: string; digits: number; keycard?: string }[];
  muralCount?: number;
};
export type MuralPost = { id: number; authorName: string; content: string; createdAt: string; characterId: number | null };
export type MysteryView = {
  id: string; title: string; teaser: string; total: number; found: number; status: 'open' | 'revealed' | 'claimed'; claimedBy: string | null; kind: 'safe' | 'stash' | 'keycard';
  pieces?: string; claimText?: string | null;
  fragments: ({ id: string; found: true; icon?: string; title: string; text: string; foundBy: string; foundAt: string } | { id: string; found: false; icon?: string; hint: string })[];
};
export type ChatMsg = { id: number; channel: string; kind: string; locationId: string | null; frequency: number | null; characterId: number | null; userId: number | null; authorName: string; content: string; deleted: boolean; createdAt: string; toUserId: number | null };
export type CombatUnit = {
  id: string; side: 'player' | 'zombie'; team: number; name: string; x: number; y: number; ap: number; maxAp: number; out: null | 'fled' | 'dead' | 'down';
  characterId?: number; portrait?: string | null; defending?: boolean; endedTurn?: boolean; prone?: boolean; crawling?: boolean; behavior?: string; zombieType?: string; condition?: string;
  weapon: null | { name: string; ammo?: number; magSize?: number; range: number; apCost: number; ranged: boolean; twoHanded: boolean; skill?: string }; stamina?: number; autoFlee?: boolean;
  sneaking?: boolean; overloaded?: boolean; tauntedBy?: string; hasLighter?: boolean; dog?: string;
  /** infectados: direção do olhar, alcance da visão e quem estão caçando */
  face?: [number, number]; sight?: number; hunting?: string;
};
export type CombatView = {
  id: number; status: string; reason: string; deadline: string; round: number; phase: string; pvp: boolean; width: number; height: number; tiles: string[];
  exits: { x: number; y: number }[]; result: { outcome: string; summary: string } | null; mapKey: string; units: CombatUnit[];
  alarm?: { x: number; y: number } | null; fuses?: { x: number; y: number }[];
  log: { round: number; text: string; unit?: string; kind?: string; from?: { x: number; y: number }; to?: { x: number; y: number } }[];
};
export type Content = {
  attributes: Record<string, { name: string; desc: string }>; attributePoints: number; attributeMin: number; attributeMax: number;
  professions: { id: string; name: string; description: string; perks: string[]; skills: Record<string, number>; items?: { itemId: string; qty: number }[]; traitPoints: number }[];
  traits: { id: string; name: string; cost: number; description: string; exclusive?: string[] }[]; traitBasePoints: number;
  /** Nome de cada item pelo id (para receitas e obras mostrarem o nome, não o código). */
  itemNames?: Record<string, string>; ageStages?: { minAge: number; name: string; description: string }[];
  skills: Record<string, { name: string; attribute: string; category: string }>; regions: Record<string, string>;
  structures: { id: string; name: string; description: string; materials: { itemId: string; qty: number }[]; tools: string[]; skill: string; minLevel: number; knowledge?: string; seconds: number; energy: number; maxCount: number }[];
  recipes: { id: string; name: string; skill: string; minLevel: number; requiresKnowledge: boolean; inputs: { itemId: string; qty: number }[]; tools: string[]; output: { itemId: string; qty: number } }[];
};
export type User = { id: number; username: string; role: 'player' | 'gm' | 'moderator' | 'admin'; settings?: Record<string, any> };

export type MapLocation = { id: string; name: string; regionId: string; category: string; x: number; y: number; indoor: boolean; danger: number; description: string; buildable: boolean };
export type MapConnection = { id: number; fromId: string; toId: string; distance: number; roadType: string; blocked: boolean };
export type WorldMap = {
  regions: { id: string; name: string; description: string; x: number; y: number }[];
  locations: MapLocation[]; connections: MapConnection[];
  bases: { locationId: string; name: string; factionId: number | null; faction: { id: number; name: string; emblem: string; color: string } | null }[];
  projects: { id: string; name: string; locationId: string }[];
};
