CREATE TABLE "prologue_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"kind" text NOT NULL,
	"thread" text DEFAULT 'sistema' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prologue_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"track" text NOT NULL,
	"beat_id" text NOT NULL,
	"step" integer DEFAULT 0 NOT NULL,
	"phase" text DEFAULT 'say' NOT NULL,
	"next_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ask" jsonb,
	"location_id" text NOT NULL,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"combat_id" integer,
	"hub_open" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prologue_members" (
	"character_id" integer PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"marks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"battery" real DEFAULT 80 NOT NULL,
	"light" boolean DEFAULT false NOT NULL,
	"death_cause" text
);
--> statement-breakpoint
CREATE TABLE "prologue_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"speed" real DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"data" jsonb DEFAULT '{"timeline":0,"signal":4,"powerOut":false,"act":1}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prologue_events" ADD CONSTRAINT "prologue_events_session_id_prologue_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."prologue_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prologue_groups" ADD CONSTRAINT "prologue_groups_session_id_prologue_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."prologue_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prologue_members" ADD CONSTRAINT "prologue_members_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prologue_members" ADD CONSTRAINT "prologue_members_session_id_prologue_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."prologue_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pe_char" ON "prologue_events" USING btree ("character_id","id");--> statement-breakpoint
CREATE INDEX "pg_session" ON "prologue_groups" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "pm_session" ON "prologue_members" USING btree ("session_id");