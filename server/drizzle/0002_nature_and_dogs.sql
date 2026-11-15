CREATE TABLE "campfires" (
	"location_id" text PRIMARY KEY NOT NULL,
	"fuel_until" timestamp with time zone NOT NULL,
	"lit_by" integer,
	"lit_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companions" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'dog' NOT NULL,
	"name" text NOT NULL,
	"owner_character_id" integer,
	"location_id" text NOT NULL,
	"status" text DEFAULT 'stray' NOT NULL,
	"health" real DEFAULT 100 NOT NULL,
	"hunger" real DEFAULT 40 NOT NULL,
	"loyalty" real DEFAULT 0 NOT NULL,
	"trust" real DEFAULT 0 NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_tick_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campfires" ADD CONSTRAINT "campfires_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companions" ADD CONSTRAINT "companions_owner_character_id_characters_id_fk" FOREIGN KEY ("owner_character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companions_owner" ON "companions" USING btree ("owner_character_id");--> statement-breakpoint
CREATE INDEX "companions_loc" ON "companions" USING btree ("location_id");