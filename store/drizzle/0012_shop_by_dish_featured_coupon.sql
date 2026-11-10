ALTER TABLE "collections" ADD COLUMN "show_in_shop_by" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "is_featured" boolean DEFAULT false NOT NULL;