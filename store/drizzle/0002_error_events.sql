CREATE TABLE "error_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "error_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"fingerprint" text NOT NULL,
	"source" text NOT NULL,
	"message" text NOT NULL,
	"digest" text DEFAULT '' NOT NULL,
	"route" text DEFAULT '' NOT NULL,
	"path" text DEFAULT '' NOT NULL,
	"method" text DEFAULT '' NOT NULL,
	"stack" text DEFAULT '' NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_alerted_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "error_events_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE INDEX "error_events_open_idx" ON "error_events" USING btree ("resolved_at","last_seen_at");