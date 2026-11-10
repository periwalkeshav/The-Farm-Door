ALTER TABLE "categories" ADD COLUMN "name_hi" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "description_hi" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "name_hi" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "description_hi" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "name_hi" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "subtitle_hi" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "description_hi" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "ingredients_hi" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "usage_instructions_hi" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "storage_instructions_hi" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "title_hi" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "summary_hi" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "ingredients_hi" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "method_hi" text DEFAULT '' NOT NULL;