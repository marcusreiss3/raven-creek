CREATE TABLE "prologue_social" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"post_key" text NOT NULL,
	"character_id" integer NOT NULL,
	"kind" text NOT NULL,
	"text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prologue_social" ADD CONSTRAINT "prologue_social_session_id_prologue_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."prologue_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ps_post" ON "prologue_social" USING btree ("session_id","post_key");