CREATE TYPE "public"."loyalty_reason" AS ENUM('EARNED', 'REDEEMED', 'REDEEM_RETURNED', 'REFUND_REVERSAL', 'REFERRAL', 'ADJUSTMENT');--> statement-breakpoint
CREATE TABLE "loyalty_ledger" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "loyalty_ledger_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"customer_id" integer NOT NULL,
	"order_id" integer,
	"points" integer NOT NULL,
	"reason" "loyalty_reason" NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"staff_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "referrer_customer_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "points_redeemed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "points_discount_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loyalty_customer_idx" ON "loyalty_ledger" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "loyalty_order_idx" ON "loyalty_ledger" USING btree ("order_id","reason");--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_referrer_customer_id_customers_id_fk" FOREIGN KEY ("referrer_customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_referrer_idx" ON "coupons" USING btree ("referrer_customer_id");