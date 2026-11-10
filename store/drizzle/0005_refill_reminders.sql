CREATE TABLE "refill_reminders" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "refill_reminders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_id" integer NOT NULL,
	"email" text NOT NULL,
	"interval_days" integer NOT NULL,
	"next_remind_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refill_reminders" ADD CONSTRAINT "refill_reminders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "refill_reminders_order_idx" ON "refill_reminders" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "refill_reminders_due_idx" ON "refill_reminders" USING btree ("cancelled_at","next_remind_at");