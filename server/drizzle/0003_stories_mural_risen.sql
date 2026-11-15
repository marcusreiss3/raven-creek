CREATE TABLE "mural_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" text NOT NULL,
	"character_id" integer,
	"user_id" integer,
	"author_name" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mysteries" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"revealed_at" timestamp with time zone,
	"claimed_by" text,
	"claimed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mystery_fragments" (
	"fragment_id" text PRIMARY KEY NOT NULL,
	"mystery_id" text NOT NULL,
	"found_by" integer,
	"found_by_name" text NOT NULL,
	"found_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risen" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer,
	"name" text NOT NULL,
	"portrait" text,
	"location_id" text NOT NULL,
	"corpse_container_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"rises_at" timestamp with time zone NOT NULL,
	"combat_id" integer,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "mural_loc" ON "mural_posts" USING btree ("location_id","created_at");--> statement-breakpoint
CREATE INDEX "mfrag_mystery" ON "mystery_fragments" USING btree ("mystery_id");--> statement-breakpoint
CREATE INDEX "risen_loc" ON "risen" USING btree ("location_id","status");