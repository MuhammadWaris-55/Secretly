CREATE TABLE "email_alert_subscriptions" (
	"user_id" text PRIMARY KEY NOT NULL,
	"subscribed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_emails" (
	"scan_id" uuid PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"previews" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_alert_subscriptions" ADD CONSTRAINT "email_alert_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_emails" ADD CONSTRAINT "scan_emails_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scan_emails_next_attempt_idx" ON "scan_emails" USING btree ("next_attempt_at");