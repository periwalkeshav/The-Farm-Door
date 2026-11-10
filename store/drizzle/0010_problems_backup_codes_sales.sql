CREATE TYPE "public"."problem_kind" AS ENUM('DAMAGED', 'WRONG_ITEM', 'EXPIRED', 'MISSING', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."problem_status" AS ENUM('OPEN', 'REPLACEMENT_SENT', 'REFUNDED', 'CLOSED');--> statement-breakpoint
CREATE TABLE "problem_photos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "problem_photos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"report_id" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "problem_reports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "problem_reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_id" integer NOT NULL,
	"kind" "problem_kind" NOT NULL,
	"description" text NOT NULL,
	"order_item_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"status" "problem_status" DEFAULT 'OPEN' NOT NULL,
	"resolution_note" text DEFAULT '' NOT NULL,
	"staff_note" text DEFAULT '' NOT NULL,
	"replacement_order_id" integer,
	"refund_paise" integer,
	"resolved_at" timestamp with time zone,
	"resolved_by_staff_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sales_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"percent_off_bp" integer NOT NULL,
	"scope" "coupon_scope" DEFAULT 'ALL' NOT NULL,
	"product_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"category_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_percent_range" CHECK ("sales"."percent_off_bp" between 100 and 9000),
	CONSTRAINT "sales_window_order" CHECK ("sales"."ends_at" > "sales"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "staff_recovery_codes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "staff_recovery_codes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"staff_user_id" integer NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "medium" "bytea";--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "small" "bytea";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "replacement_for_order_id" integer;--> statement-breakpoint
ALTER TABLE "problem_photos" ADD CONSTRAINT "problem_photos_report_id_problem_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."problem_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_reports" ADD CONSTRAINT "problem_reports_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_reports" ADD CONSTRAINT "problem_reports_replacement_order_id_orders_id_fk" FOREIGN KEY ("replacement_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_reports" ADD CONSTRAINT "problem_reports_resolved_by_staff_id_staff_users_id_fk" FOREIGN KEY ("resolved_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_recovery_codes" ADD CONSTRAINT "staff_recovery_codes_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "problem_photos_report_idx" ON "problem_photos" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "problem_reports_status_idx" ON "problem_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "problem_reports_order_idx" ON "problem_reports" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "sales_window_idx" ON "sales" USING btree ("is_active","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "staff_recovery_codes_staff_idx" ON "staff_recovery_codes" USING btree ("staff_user_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_replacement_for_order_id_orders_id_fk" FOREIGN KEY ("replacement_for_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;