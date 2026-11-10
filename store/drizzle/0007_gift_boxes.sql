ALTER TYPE "public"."stock_movement_reason" ADD VALUE 'ASSEMBLY';--> statement-breakpoint
CREATE TABLE "kit_components" (
	"kit_item_id" integer NOT NULL,
	"component_item_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "kit_components_kit_item_id_component_item_id_pk" PRIMARY KEY("kit_item_id","component_item_id"),
	CONSTRAINT "kit_component_qty_positive" CHECK ("kit_components"."quantity" > 0),
	CONSTRAINT "kit_not_self" CHECK ("kit_components"."kit_item_id" <> "kit_components"."component_item_id")
);
--> statement-breakpoint
ALTER TABLE "kit_components" ADD CONSTRAINT "kit_components_kit_item_id_inventory_items_id_fk" FOREIGN KEY ("kit_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_components" ADD CONSTRAINT "kit_components_component_item_id_inventory_items_id_fk" FOREIGN KEY ("component_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;