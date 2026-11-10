CREATE TYPE "public"."net_unit" AS ENUM('g', 'ml');--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "category_id" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "net_unit" "net_unit" DEFAULT 'g' NOT NULL;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;