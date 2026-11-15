CREATE TYPE "public"."role" AS ENUM('player', 'gm', 'moderator', 'admin');--> statement-breakpoint
CREATE TABLE "admin_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_user_id" integer NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"path" text NOT NULL,
	"label" text NOT NULL,
	"width" integer,
	"height" integer,
	"is_placeholder" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "base_structures" (
	"id" serial PRIMARY KEY NOT NULL,
	"base_id" integer NOT NULL,
	"kind" text NOT NULL,
	"hp" real NOT NULL,
	"max_hp" real NOT NULL,
	"built_by" integer,
	"complete_at" timestamp with time zone,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bases" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" text NOT NULL,
	"name" text NOT NULL,
	"owner_character_id" integer,
	"faction_id" integer,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"age" integer NOT NULL,
	"appearance" text DEFAULT '' NOT NULL,
	"backstory" text DEFAULT '' NOT NULL,
	"profession" text NOT NULL,
	"traits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attributes" jsonb NOT NULL,
	"portrait" text,
	"portrait_adjust" jsonb DEFAULT '{"scale":1,"x":0,"y":0}'::jsonb NOT NULL,
	"alive" boolean DEFAULT true NOT NULL,
	"location_id" text NOT NULL,
	"state" text DEFAULT 'idle' NOT NULL,
	"activity" text DEFAULT 'idle' NOT NULL,
	"busy_until" timestamp with time zone,
	"busy_action" jsonb,
	"combat_id" integer,
	"following_id" integer,
	"vehicle_id" integer,
	"needs" jsonb NOT NULL,
	"skills" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"known_recipes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"amputations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"xp_ledger" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"radio_frequency" real,
	"protected_until" timestamp with time zone,
	"last_pvp_at" timestamp with time zone,
	"last_tick_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tutorial_step" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"died_at" timestamp with time zone,
	"death_cause" text,
	"epitaph" text
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"kind" text DEFAULT 'say' NOT NULL,
	"location_id" text,
	"frequency" real,
	"faction_id" integer,
	"travel_group" text,
	"to_user_id" integer,
	"user_id" integer,
	"character_id" integer,
	"author_name" text DEFAULT '' NOT NULL,
	"content" text NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "combats" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"state" jsonb NOT NULL,
	"phase_deadline" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conditions" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"kind" text NOT NULL,
	"stage" integer DEFAULT 0 NOT NULL,
	"progress" real DEFAULT 0 NOT NULL,
	"duration_hours" real NOT NULL,
	"discovered" boolean DEFAULT false NOT NULL,
	"source_wound_id" integer,
	"source_region" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	"distance" real NOT NULL,
	"road_type" text NOT NULL,
	"travel_scene_key" text DEFAULT 'road_asphalt_01' NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"blocked_reason" text
);
--> statement-breakpoint
CREATE TABLE "containers" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"base_id" integer,
	"capacity" real DEFAULT 40 NOT NULL,
	"expires_at" timestamp with time zone,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_defs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"scope" text NOT NULL,
	"kind" text NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"cooldown_minutes" real DEFAULT 0 NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"effects" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"text" text NOT NULL,
	"requires_decision" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"location_id" text,
	"character_id" integer,
	"triggered_by" integer,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faction_invites" (
	"faction_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"invited_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "faction_invites_faction_id_character_id_pk" PRIMARY KEY("faction_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "faction_members" (
	"faction_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"rank" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "faction_members_faction_id_character_id_pk" PRIMARY KEY("faction_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "factions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"emblem" text DEFAULT '☣' NOT NULL,
	"color" text DEFAULT '#b45309' NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "game_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hordes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"size" integer NOT NULL,
	"location_id" text NOT NULL,
	"target_location_id" text,
	"next_move_at" timestamp with time zone NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_defs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"weight" real NOT NULL,
	"volume" real DEFAULT 1 NOT NULL,
	"stackable" boolean DEFAULT false NOT NULL,
	"max_stack" integer DEFAULT 1 NOT NULL,
	"durability_max" integer DEFAULT 0 NOT NULL,
	"rarity" text DEFAULT 'common' NOT NULL,
	"equip_slot" text,
	"icon" text DEFAULT 'generic' NOT NULL,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"def_id" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"durability" integer DEFAULT 0 NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" text NOT NULL,
	"slot" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"character_id" integer,
	"run_at" timestamp with time zone NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_loot" (
	"location_id" text PRIMARY KEY NOT NULL,
	"reserve" real NOT NULL,
	"max_reserve" real NOT NULL,
	"regen_per_hour" real NOT NULL,
	"times_searched" integer DEFAULT 0 NOT NULL,
	"last_regen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"zombies" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" text PRIMARY KEY NOT NULL,
	"region_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"scene_key" text NOT NULL,
	"arena_key" text DEFAULT 'street' NOT NULL,
	"music_key" text DEFAULT 'explore_calm' NOT NULL,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"indoor" boolean DEFAULT false NOT NULL,
	"danger" real DEFAULT 0.3 NOT NULL,
	"loot_table_id" text,
	"buildable" boolean DEFAULT false NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loot_tables" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"entries" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"skill" text NOT NULL,
	"min_level" integer DEFAULT 0 NOT NULL,
	"requires_knowledge" boolean DEFAULT false NOT NULL,
	"inputs" jsonb NOT NULL,
	"tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"output" jsonb NOT NULL,
	"seconds" integer DEFAULT 10 NOT NULL,
	"xp" real DEFAULT 5 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"x" real DEFAULT 0 NOT NULL,
	"y" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporter_user_id" integer NOT NULL,
	"target_user_id" integer NOT NULL,
	"message_id" integer,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" integer
);
--> statement-breakpoint
CREATE TABLE "scheduled_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"location_id" text NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"created_by" integer NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "travels" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"group_id" text NOT NULL,
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	"connection_id" integer NOT NULL,
	"mode" text NOT NULL,
	"vehicle_id" integer,
	"started_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"elapsed_ms" integer DEFAULT 0 NOT NULL,
	"last_progress_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"encounter" jsonb,
	"scene_key" text NOT NULL,
	"is_leader" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"user_id" integer NOT NULL,
	"blocked_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_user_id_blocked_user_id_pk" PRIMARY KEY("user_id","blocked_user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'player' NOT NULL,
	"token_version" integer DEFAULT 0 NOT NULL,
	"banned_until" timestamp with time zone,
	"muted_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"location_id" text,
	"seats" integer NOT NULL,
	"storage" real NOT NULL,
	"fuel" real NOT NULL,
	"fuel_max" real NOT NULL,
	"engine" real NOT NULL,
	"tires" real NOT NULL,
	"battery" real NOT NULL,
	"body" real NOT NULL,
	"speed" real NOT NULL,
	"consumption" real NOT NULL,
	"noise" real NOT NULL,
	"has_key" boolean DEFAULT false NOT NULL,
	"running" boolean DEFAULT false NOT NULL,
	"driver_id" integer,
	"owner_character_id" integer,
	"faction_id" integer
);
--> statement-breakpoint
CREATE TABLE "wounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"region" text NOT NULL,
	"type" text NOT NULL,
	"severity" real NOT NULL,
	"bleeding" real NOT NULL,
	"pain" real NOT NULL,
	"contamination" real DEFAULT 0 NOT NULL,
	"healing" real DEFAULT 0 NOT NULL,
	"bandaged" boolean DEFAULT false NOT NULL,
	"bandage_dirt" real DEFAULT 0 NOT NULL,
	"disinfected" boolean DEFAULT false NOT NULL,
	"splinted" boolean DEFAULT false NOT NULL,
	"sutured" boolean DEFAULT false NOT NULL,
	"infected" boolean DEFAULT false NOT NULL,
	"treatments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"healed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "zombie_types" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"behavior" text NOT NULL,
	"stats" jsonb NOT NULL,
	"spawn_weight" real DEFAULT 1 NOT NULL,
	"night_multiplier" real DEFAULT 1 NOT NULL,
	"allowed_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "base_structures" ADD CONSTRAINT "base_structures_base_id_bases_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bases" ADD CONSTRAINT "bases_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_from_id_locations_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_to_id_locations_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_invites" ADD CONSTRAINT "faction_invites_faction_id_factions_id_fk" FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_invites" ADD CONSTRAINT "faction_invites_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_members" ADD CONSTRAINT "faction_members_faction_id_factions_id_fk" FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_members" ADD CONSTRAINT "faction_members_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_def_id_item_defs_id_fk" FOREIGN KEY ("def_id") REFERENCES "public"."item_defs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_loot" ADD CONSTRAINT "location_loot_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travels" ADD CONSTRAINT "travels_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_user_id_users_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wounds" ADD CONSTRAINT "wounds_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_base_per_location" ON "bases" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "char_loc" ON "characters" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "char_user" ON "characters" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_loc" ON "chat_messages" USING btree ("channel","location_id","created_at");--> statement-breakpoint
CREATE INDEX "cond_char" ON "conditions" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "conn_from" ON "connections" USING btree ("from_id");--> statement-breakpoint
CREATE INDEX "conn_to" ON "connections" USING btree ("to_id");--> statement-breakpoint
CREATE INDEX "containers_loc" ON "containers" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_faction_per_char" ON "faction_members" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "faction_name" ON "factions" USING btree ("name");--> statement-breakpoint
CREATE INDEX "glogs_char" ON "game_logs" USING btree ("character_id","created_at");--> statement-breakpoint
CREATE INDEX "items_owner" ON "items" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "jobs_due" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "travel_status" ON "travels" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "wounds_char" ON "wounds" USING btree ("character_id");