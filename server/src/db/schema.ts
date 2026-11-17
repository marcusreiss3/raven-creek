import {
  pgTable, serial, text, integer, real, boolean, timestamp, jsonb, primaryKey, index, uniqueIndex, pgEnum,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['player', 'gm', 'moderator', 'admin']);

// ───────────────────────────── Contas ─────────────────────────────
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('player'),
  tokenVersion: integer('token_version').notNull().default(0),
  bannedUntil: timestamp('banned_until', { withTimezone: true }),
  mutedUntil: timestamp('muted_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
}, (t) => [uniqueIndex('users_username_lower').on(t.username)]);

export const userBlocks = pgTable('user_blocks', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blockedUserId: integer('blocked_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.blockedUserId] })]);

export const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  reporterUserId: integer('reporter_user_id').notNull().references(() => users.id),
  targetUserId: integer('target_user_id').notNull().references(() => users.id),
  messageId: integer('message_id'),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedBy: integer('resolved_by'),
});

// ───────────────────────────── Mundo ─────────────────────────────
export const regions = pgTable('regions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  x: real('x').notNull().default(0),
  y: real('y').notNull().default(0),
});

export const assets = pgTable('assets', {
  key: text('key').primaryKey(),
  kind: text('kind').notNull(), // scene | arena | portrait | icon | audio
  path: text('path').notNull(),
  label: text('label').notNull(),
  width: integer('width'),
  height: integer('height'),
  isPlaceholder: boolean('is_placeholder').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const locations = pgTable('locations', {
  id: text('id').primaryKey(),
  regionId: text('region_id').notNull().references(() => regions.id),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  category: text('category').notNull(), // hospital, house, prison, forest, road, store...
  sceneKey: text('scene_key').notNull(),
  arenaKey: text('arena_key').notNull().default('street'),
  musicKey: text('music_key').notNull().default('explore_calm'),
  x: real('x').notNull(),
  y: real('y').notNull(),
  indoor: boolean('indoor').notNull().default(false),
  danger: real('danger').notNull().default(0.3), // 0..1
  lootTableId: text('loot_table_id'),
  buildable: boolean('buildable').notNull().default(false),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
});

export const connections = pgTable('connections', {
  id: serial('id').primaryKey(),
  fromId: text('from_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
  toId: text('to_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
  distance: real('distance').notNull(), // metros
  roadType: text('road_type').notNull(), // indoor | trail | dirt | asphalt
  travelSceneKey: text('travel_scene_key').notNull().default('road_asphalt_01'),
  blocked: boolean('blocked').notNull().default(false),
  blockedReason: text('blocked_reason'),
}, (t) => [index('conn_from').on(t.fromId), index('conn_to').on(t.toId)]);

export const locationLoot = pgTable('location_loot', {
  locationId: text('location_id').primaryKey().references(() => locations.id, { onDelete: 'cascade' }),
  reserve: real('reserve').notNull(),
  maxReserve: real('max_reserve').notNull(),
  regenPerHour: real('regen_per_hour').notNull(),
  timesSearched: integer('times_searched').notNull().default(0),
  lastRegenAt: timestamp('last_regen_at', { withTimezone: true }).notNull().defaultNow(),
  zombies: integer('zombies').notNull().default(0),
});

export const containers = pgTable('containers', {
  id: serial('id').primaryKey(),
  locationId: text('location_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: text('kind').notNull(), // cabinet | chest | corpse | base_storage
  baseId: integer('base_id'),
  capacity: real('capacity').notNull().default(40),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
}, (t) => [index('containers_loc').on(t.locationId)]);

// ───────────────────────────── Personagens ─────────────────────────────
export type Needs = {
  hunger: number; thirst: number; sleepiness: number; stamina: number; energy: number;
  stress: number; bodyTemp: number; blood: number; boredom: number; vitality: number;
  painkillerUntil?: number; antibioticUntil?: number; unconscious?: boolean; lastDrain?: string;
  /** Caído: morre quando o prazo vence, a menos que alguém use um kit de primeiros socorros (ver services/death.ts). */
  downedUntil?: number; downedCause?: string;
  /** Vícios: fissura (nicotine/alcohol), dependência e embriaguez — ver rules/addiction.ts. */
  nicotine?: number; alcohol?: number; nicotineDep?: number; alcoholDep?: number; drunk?: number;
};

export type SkillMap = Record<string, { xp: number; level: number }>;

export const characters = pgTable('characters', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  age: integer('age').notNull(),
  appearance: text('appearance').notNull().default(''),
  backstory: text('backstory').notNull().default(''),
  profession: text('profession').notNull(),
  traits: jsonb('traits').$type<string[]>().notNull().default([]),
  attributes: jsonb('attributes').$type<Record<string, number>>().notNull(),
  portrait: text('portrait'),
  portraitAdjust: jsonb('portrait_adjust').$type<{ scale: number; x: number; y: number }>().notNull().default({ scale: 1, x: 0, y: 0 }),
  alive: boolean('alive').notNull().default(true),
  locationId: text('location_id').notNull().references(() => locations.id),
  state: text('state').notNull().default('idle'), // idle | busy | traveling | combat | unconscious | dead
  activity: text('activity').notNull().default('idle'), // idle | resting | sleeping
  busyUntil: timestamp('busy_until', { withTimezone: true }),
  busyAction: jsonb('busy_action').$type<Record<string, unknown> | null>(),
  combatId: integer('combat_id'),
  followingId: integer('following_id'),
  vehicleId: integer('vehicle_id'),
  needs: jsonb('needs').$type<Needs>().notNull(),
  skills: jsonb('skills').$type<SkillMap>().notNull().default({}),
  knownRecipes: jsonb('known_recipes').$type<string[]>().notNull().default([]),
  amputations: jsonb('amputations').$type<string[]>().notNull().default([]),
  xpLedger: jsonb('xp_ledger').$type<Record<string, { t: number; xp: number; k?: string }[]>>().notNull().default({}),
  radioFrequency: real('radio_frequency'),
  protectedUntil: timestamp('protected_until', { withTimezone: true }),
  /** Ficha aprovada pela administração. Fichas criadas com "exigir aprovação" ligado nascem pendentes (false). */
  approved: boolean('approved').notNull().default(true),
  lastPvpAt: timestamp('last_pvp_at', { withTimezone: true }),
  lastTickAt: timestamp('last_tick_at', { withTimezone: true }).notNull().defaultNow(),
  tutorialStep: integer('tutorial_step').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  diedAt: timestamp('died_at', { withTimezone: true }),
  deathCause: text('death_cause'),
  epitaph: text('epitaph'),
}, (t) => [index('char_loc').on(t.locationId), index('char_user').on(t.userId)]);

export const wounds = pgTable('wounds', {
  id: serial('id').primaryKey(),
  characterId: integer('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  region: text('region').notNull(),
  type: text('type').notNull(),
  severity: real('severity').notNull(), // 0..1
  bleeding: real('bleeding').notNull(), // % de sangue por minuto real
  pain: real('pain').notNull(), // 0..100
  contamination: real('contamination').notNull().default(0), // 0..1
  healing: real('healing').notNull().default(0), // 0..1 (1 = curado)
  bandaged: boolean('bandaged').notNull().default(false),
  bandageDirt: real('bandage_dirt').notNull().default(0),
  disinfected: boolean('disinfected').notNull().default(false),
  splinted: boolean('splinted').notNull().default(false),
  sutured: boolean('sutured').notNull().default(false),
  infected: boolean('infected').notNull().default(false),
  treatments: jsonb('treatments').$type<string[]>().notNull().default([]),
  source: text('source').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  healedAt: timestamp('healed_at', { withTimezone: true }),
}, (t) => [index('wounds_char').on(t.characterId)]);

export const conditions = pgTable('conditions', {
  id: serial('id').primaryKey(),
  characterId: integer('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  stage: integer('stage').notNull().default(0),
  progress: real('progress').notNull().default(0), // 0..1
  durationHours: real('duration_hours').notNull(),
  discovered: boolean('discovered').notNull().default(false),
  sourceWoundId: integer('source_wound_id'),
  sourceRegion: text('source_region'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
}, (t) => [index('cond_char').on(t.characterId)]);

// ───────────────────────────── Itens ─────────────────────────────
export const itemDefs = pgTable('item_defs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(), // food water medical weapon ammo building vehicle misc clothing book container tool
  description: text('description').notNull().default(''),
  weight: real('weight').notNull(),
  volume: real('volume').notNull().default(1),
  stackable: boolean('stackable').notNull().default(false),
  maxStack: integer('max_stack').notNull().default(1),
  durabilityMax: integer('durability_max').notNull().default(0),
  rarity: text('rarity').notNull().default('common'),
  equipSlot: text('equip_slot'),
  icon: text('icon').notNull().default('generic'),
  props: jsonb('props').$type<Record<string, any>>().notNull().default({}),
});

export const items = pgTable('items', {
  id: serial('id').primaryKey(),
  defId: text('def_id').notNull().references(() => itemDefs.id),
  quantity: integer('quantity').notNull().default(1),
  durability: integer('durability').notNull().default(0),
  ownerType: text('owner_type').notNull(), // character | location | container | vehicle
  ownerId: text('owner_id').notNull(),
  slot: text('slot'), // slot equipado (head, torso, hands...) ou null
  data: jsonb('data').$type<Record<string, any>>().notNull().default({}),
  version: integer('version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('items_owner').on(t.ownerType, t.ownerId)]);

export const lootTables = pgTable('loot_tables', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  entries: jsonb('entries').$type<LootEntry[]>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export type LootEntry = { itemId: string; weight: number; min: number; max: number; night?: number; requiresTag?: string; cost?: number };

export const recipes = pgTable('recipes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  skill: text('skill').notNull(),
  minLevel: integer('min_level').notNull().default(0),
  requiresKnowledge: boolean('requires_knowledge').notNull().default(false),
  inputs: jsonb('inputs').$type<{ itemId: string; qty: number }[]>().notNull(),
  tools: jsonb('tools').$type<string[]>().notNull().default([]),
  output: jsonb('output').$type<{ itemId: string; qty: number }>().notNull(),
  seconds: integer('seconds').notNull().default(10),
  xp: real('xp').notNull().default(5),
});

// ───────────────────────────── Chat ─────────────────────────────
export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  channel: text('channel').notNull(), // local | ooc | radio | faction | pm | admin | system | travel
  kind: text('kind').notNull().default('say'), // say | me | ooc | system | roll | narration | emote
  locationId: text('location_id'),
  frequency: real('frequency'),
  factionId: integer('faction_id'),
  travelGroup: text('travel_group'),
  toUserId: integer('to_user_id'),
  userId: integer('user_id'),
  characterId: integer('character_id'),
  authorName: text('author_name').notNull().default(''),
  content: text('content').notNull(),
  deleted: boolean('deleted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('chat_loc').on(t.channel, t.locationId, t.createdAt)]);

// ───────────────────────────── Viagens ─────────────────────────────
export const travels = pgTable('travels', {
  id: serial('id').primaryKey(),
  characterId: integer('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  groupId: text('group_id').notNull(),
  fromId: text('from_id').notNull(),
  toId: text('to_id').notNull(),
  connectionId: integer('connection_id').notNull(),
  mode: text('mode').notNull(), // walk | vehicle
  vehicleId: integer('vehicle_id'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  durationMs: integer('duration_ms').notNull(),
  elapsedMs: integer('elapsed_ms').notNull().default(0),
  lastProgressAt: timestamp('last_progress_at', { withTimezone: true }).notNull(),
  status: text('status').notNull(), // active | paused | awaiting_decision | combat | arrived | returned
  encounter: jsonb('encounter').$type<{ atMs: number; eventId: string; triggered: boolean; resolved: boolean } | null>(),
  sceneKey: text('scene_key').notNull(),
  isLeader: boolean('is_leader').notNull().default(true),
}, (t) => [index('travel_status').on(t.status)]);

// ───────────────────────────── Combate ─────────────────────────────
export const combats = pgTable('combats', {
  id: serial('id').primaryKey(),
  locationId: text('location_id').notNull(),
  status: text('status').notNull().default('active'),
  reason: text('reason').notNull().default(''),
  state: jsonb('state').$type<any>().notNull(),
  phaseDeadline: timestamp('phase_deadline', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  version: integer('version').notNull().default(0),
});

export const zombieTypes = pgTable('zombie_types', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  behavior: text('behavior').notNull(), // shambler | runner | brute | wanderer | lurker
  stats: jsonb('stats').$type<ZombieStats>().notNull(),
  spawnWeight: real('spawn_weight').notNull().default(1),
  nightMultiplier: real('night_multiplier').notNull().default(1),
  allowedCategories: jsonb('allowed_categories').$type<string[]>().notNull().default([]),
  enabled: boolean('enabled').notNull().default(true),
});
export type ZombieStats = {
  body: number; headThreshold: number; ap: number; perception: number; hearing: number;
  hitChance: number; biteChance: number; scratchChance: number; lacerationChance: number;
  bluntChance: number; damage: number; doorBash: number; knockback?: boolean;
};

// ───────────────────────────── Veículos ─────────────────────────────
export const vehicles = pgTable('vehicles', {
  id: serial('id').primaryKey(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  locationId: text('location_id'),
  seats: integer('seats').notNull(),
  storage: real('storage').notNull(),
  fuel: real('fuel').notNull(),
  fuelMax: real('fuel_max').notNull(),
  engine: real('engine').notNull(), // 0..100
  tires: real('tires').notNull(),
  battery: real('battery').notNull(),
  body: real('body').notNull(),
  speed: real('speed').notNull(), // m/s em asfalto
  consumption: real('consumption').notNull(), // litros por km
  noise: real('noise').notNull(),
  hasKey: boolean('has_key').notNull().default(false),
  running: boolean('running').notNull().default(false),
  driverId: integer('driver_id'),
  ownerCharacterId: integer('owner_character_id'),
  factionId: integer('faction_id'),
});

// ───────────────────────────── Facções e bases ─────────────────────────────
export const factions = pgTable('factions', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  emblem: text('emblem').notNull().default('banner'),
  color: text('color').notNull().default('#b45309'),
  createdBy: integer('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('faction_name').on(t.name)]);

export const factionMembers = pgTable('faction_members', {
  factionId: integer('faction_id').notNull().references(() => factions.id, { onDelete: 'cascade' }),
  characterId: integer('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  rank: text('rank').notNull().default('member'), // leader | officer | member | recruit
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.factionId, t.characterId] }), uniqueIndex('one_faction_per_char').on(t.characterId)]);

export const factionInvites = pgTable('faction_invites', {
  factionId: integer('faction_id').notNull().references(() => factions.id, { onDelete: 'cascade' }),
  characterId: integer('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  invitedBy: integer('invited_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.factionId, t.characterId] })]);

export const bases = pgTable('bases', {
  id: serial('id').primaryKey(),
  locationId: text('location_id').notNull().references(() => locations.id),
  name: text('name').notNull(),
  ownerCharacterId: integer('owner_character_id'),
  factionId: integer('faction_id'),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('one_base_per_location').on(t.locationId)]);

export const baseStructures = pgTable('base_structures', {
  id: serial('id').primaryKey(),
  baseId: integer('base_id').notNull().references(() => bases.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  hp: real('hp').notNull(),
  maxHp: real('max_hp').notNull(),
  builtBy: integer('built_by'),
  completeAt: timestamp('complete_at', { withTimezone: true }),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
});

// ───────────────────────────── Projetos da comunidade ─────────────────────────────
export const communityProjects = pgTable('community_projects', {
  id: text('id').primaryKey(),
  status: text('status').notNull().default('active'), // locked | active | complete
  delivered: jsonb('delivered').$type<Record<string, number>>().notNull().default({}),
  laborMinutes: real('labor_minutes').notNull().default(0),
  integrity: real('integrity').notNull().default(0),
  contributions: jsonb('contributions').$type<Record<string, { name: string; items: number; minutes: number }>>().notNull().default({}),
  controllerFactionId: integer('controller_faction_id'),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ───────────────────────────── Fogueiras ─────────────────────────────
export const campfires = pgTable('campfires', {
  locationId: text('location_id').primaryKey().references(() => locations.id, { onDelete: 'cascade' }),
  fuelUntil: timestamp('fuel_until', { withTimezone: true }).notNull(),
  litBy: integer('lit_by'),
  litAt: timestamp('lit_at', { withTimezone: true }).notNull().defaultNow(),
});

// ───────────────────────────── Companheiros (cachorros) ─────────────────────────────
export const companions = pgTable('companions', {
  id: serial('id').primaryKey(),
  kind: text('kind').notNull().default('dog'),
  name: text('name').notNull(),
  ownerCharacterId: integer('owner_character_id').references(() => characters.id, { onDelete: 'set null' }),
  locationId: text('location_id').notNull(),
  status: text('status').notNull().default('stray'), // stray | owned | dead
  health: real('health').notNull().default(100),
  hunger: real('hunger').notNull().default(40),
  loyalty: real('loyalty').notNull().default(0),
  trust: real('trust').notNull().default(0),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastTickAt: timestamp('last_tick_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('companions_owner').on(t.ownerCharacterId), index('companions_loc').on(t.locationId)]);

export const hordes = pgTable('hordes', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  size: integer('size').notNull(),
  locationId: text('location_id').notNull(),
  targetLocationId: text('target_location_id'),
  nextMoveAt: timestamp('next_move_at', { withTimezone: true }).notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ───────────────────────────── Configuração, eventos, jobs, logs ─────────────────────────────
export const gameConfig = pgTable('game_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<any>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: integer('updated_by'),
});

export const eventDefs = pgTable('event_defs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  scope: text('scope').notNull(), // explore | travel | world
  kind: text('kind').notNull(), // combat | message | loot | stress | structure_damage | horde | alt_path | roadblock | vehicle | wound
  weight: real('weight').notNull().default(1),
  cooldownMinutes: real('cooldown_minutes').notNull().default(0),
  conditions: jsonb('conditions').$type<EventConditions>().notNull().default({}),
  effects: jsonb('effects').$type<Record<string, any>>().notNull().default({}),
  text: text('text').notNull(),
  requiresDecision: boolean('requires_decision').notNull().default(false),
  enabled: boolean('enabled').notNull().default(true),
});
export type EventConditions = { categories?: string[]; roadTypes?: string[]; timeOfDay?: ('day' | 'night' | 'dawn' | 'dusk')[]; weather?: string[]; minDanger?: number; vehicleOnly?: boolean; footOnly?: boolean };

export const eventLog = pgTable('event_log', {
  id: serial('id').primaryKey(),
  eventId: text('event_id').notNull(),
  locationId: text('location_id'),
  characterId: integer('character_id'),
  triggeredBy: integer('triggered_by'),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const scheduledEvents = pgTable('scheduled_events', {
  id: serial('id').primaryKey(),
  eventId: text('event_id').notNull(),
  locationId: text('location_id').notNull(),
  runAt: timestamp('run_at', { withTimezone: true }).notNull(),
  createdBy: integer('created_by').notNull(),
  done: boolean('done').notNull().default(false),
  note: text('note').notNull().default(''),
});

export const jobs = pgTable('jobs', {
  id: serial('id').primaryKey(),
  kind: text('kind').notNull(), // explore_complete | build_complete | craft_complete | rest_complete
  characterId: integer('character_id'),
  runAt: timestamp('run_at', { withTimezone: true }).notNull(),
  payload: jsonb('payload').$type<Record<string, any>>().notNull().default({}),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('jobs_due').on(t.status, t.runAt)]);

export const adminLogs = pgTable('admin_logs', {
  id: serial('id').primaryKey(),
  actorUserId: integer('actor_user_id').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gameLogs = pgTable('game_logs', {
  id: serial('id').primaryKey(),
  characterId: integer('character_id'),
  kind: text('kind').notNull(), // explore | combat | wound | travel | pvp | theft | death | build | system
  message: text('message').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('glogs_char').on(t.characterId, t.createdAt)]);

// ───────────────────────────── Mistérios (bilhetes pelo mapa) ─────────────────────────────
export const mysteryFragments = pgTable('mystery_fragments', {
  fragmentId: text('fragment_id').primaryKey(),
  mysteryId: text('mystery_id').notNull(),
  foundBy: integer('found_by'),
  foundByName: text('found_by_name').notNull(),
  foundAt: timestamp('found_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('mfrag_mystery').on(t.mysteryId)]);

export const mysteries = pgTable('mysteries', {
  id: text('id').primaryKey(),
  status: text('status').notNull().default('open'), // open | revealed | claimed
  revealedAt: timestamp('revealed_at', { withTimezone: true }),
  claimedBy: text('claimed_by'),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
});

// ───────────────────────────── Mural de recados ─────────────────────────────
export const muralPosts = pgTable('mural_posts', {
  id: serial('id').primaryKey(),
  locationId: text('location_id').notNull(),
  characterId: integer('character_id'),
  userId: integer('user_id'),
  authorName: text('author_name').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('mural_loc').on(t.locationId, t.createdAt)]);

// ───────────────────────────── Mortos que levantam ─────────────────────────────
export const risen = pgTable('risen', {
  id: serial('id').primaryKey(),
  characterId: integer('character_id'),
  name: text('name').notNull(),
  portrait: text('portrait'),
  locationId: text('location_id').notNull(),
  corpseContainerId: integer('corpse_container_id'),
  status: text('status').notNull().default('pending'), // pending | active | destroyed | killed
  risesAt: timestamp('rises_at', { withTimezone: true }).notNull(),
  combatId: integer('combat_id'),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('risen_loc').on(t.locationId, t.status)]);

// ───────────────────────────── Dia 1 (prólogo jogável pelo celular) ─────────────────────────────
export const prologueSessions = pgTable('prologue_sessions', {
  id: serial('id').primaryKey(),
  status: text('status').notNull().default('running'), // running | ended
  speed: real('speed').notNull().default(1),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  /** cursor da linha do tempo global, sinal, energia, etc. */
  data: jsonb('data').$type<{ timeline: number; signal: number; powerOut: boolean; act: number; [k: string]: unknown }>().notNull().default({ timeline: 0, signal: 4, powerOut: false, act: 1 }),
});

export const prologueGroups = pgTable('prologue_groups', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').notNull().references(() => prologueSessions.id, { onDelete: 'cascade' }),
  track: text('track').notNull(),
  beatId: text('beat_id').notNull(),
  /** índice da próxima mensagem da batida atual a entregar */
  step: integer('step').notNull().default(0),
  phase: text('phase').notNull().default('say'), // say | ask | combat | wait | hub_wait | ended | merged
  nextAt: timestamp('next_at', { withTimezone: true }).notNull().defaultNow(),
  /** pergunta aberta: id, tipo, opções, prazo, votos por personagem */
  ask: jsonb('ask').$type<Record<string, any> | null>(),
  locationId: text('location_id').notNull(),
  flags: jsonb('flags').$type<Record<string, boolean>>().notNull().default({}),
  combatId: integer('combat_id'),
  /** ponto de encontro aberto para receber outros grupos */
  hubOpen: boolean('hub_open').notNull().default(false),
  status: text('status').notNull().default('active'), // active | merged | ended
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('pg_session').on(t.sessionId)]);

export const prologueMembers = pgTable('prologue_members', {
  characterId: integer('character_id').primaryKey().references(() => characters.id, { onDelete: 'cascade' }),
  sessionId: integer('session_id').notNull().references(() => prologueSessions.id, { onDelete: 'cascade' }),
  groupId: integer('group_id').notNull(),
  userId: integer('user_id').notNull(),
  status: text('status').notNull().default('active'), // active | dead | ended
  flags: jsonb('flags').$type<Record<string, boolean>>().notNull().default({}),
  marks: jsonb('marks').$type<string[]>().notNull().default([]),
  battery: real('battery').notNull().default(80),
  light: boolean('light').notNull().default(false),
  deathCause: text('death_cause'),
}, (t) => [index('pm_session').on(t.sessionId)]);

/** Raven Rede no Dia 1: curtidas e comentários dos jogadores nas postagens (as postagens são as mesmas para todos). */
export const prologueSocial = pgTable('prologue_social', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').notNull().references(() => prologueSessions.id, { onDelete: 'cascade' }),
  postKey: text('post_key').notNull(),
  characterId: integer('character_id').notNull(),
  kind: text('kind').notNull(), // like | comment
  text: text('text'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('ps_post').on(t.sessionId, t.postKey)]);

export const prologueEvents = pgTable('prologue_events', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').notNull().references(() => prologueSessions.id, { onDelete: 'cascade' }),
  characterId: integer('character_id').notNull(),
  kind: text('kind').notNull(), // msg | ask | answer | roll | news | social | alert | scene | system | call | signal | mark | death
  thread: text('thread').notNull().default('sistema'),
  payload: jsonb('payload').$type<Record<string, any>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('pe_char').on(t.characterId, t.id)]);
