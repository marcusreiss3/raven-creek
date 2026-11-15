CREATE TABLE "community_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"delivered" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"labor_minutes" real DEFAULT 0 NOT NULL,
	"integrity" real DEFAULT 0 NOT NULL,
	"contributions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"controller_faction_id" integer,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
