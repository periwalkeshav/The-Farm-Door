CREATE TYPE "public"."recipe_status" AS ENUM('DRAFT', 'PUBLISHED');--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "recipes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"image_id" integer,
	"prep_minutes" integer,
	"cook_minutes" integer,
	"serves" integer,
	"ingredients" text DEFAULT '' NOT NULL,
	"method" text DEFAULT '' NOT NULL,
	"product_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"status" "recipe_status" DEFAULT 'DRAFT' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipes_status_idx" ON "recipes" USING btree ("status","published_at");