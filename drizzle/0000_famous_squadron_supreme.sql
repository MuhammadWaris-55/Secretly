CREATE TYPE "public"."finding_source" AS ENUM('github');--> statement-breakpoint
CREATE TYPE "public"."finding_status" AS ENUM('open', 'fixed', 'ignored', 'false_positive');--> statement-breakpoint
CREATE TYPE "public"."finding_type" AS ENUM('secret');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"type" "finding_type" DEFAULT 'secret' NOT NULL,
	"source" "finding_source" DEFAULT 'github' NOT NULL,
	"rule_id" text NOT NULL,
	"file_path" text NOT NULL,
	"commit_sha" text NOT NULL,
	"commit_date" timestamp with time zone NOT NULL,
	"line" integer NOT NULL,
	"masked_preview" text NOT NULL,
	"fingerprint" text NOT NULL,
	"in_head" boolean DEFAULT false NOT NULL,
	"status" "finding_status" DEFAULT 'open' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fixed_at" timestamp with time zone,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "repos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"full_name" text NOT NULL,
	"last_scanned_sha" text,
	"last_scanned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"repo_id" uuid NOT NULL,
	"status" "scan_status" DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"findings_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "findings_repo_fingerprint_uq" ON "findings" USING btree ("repo_id","fingerprint");--> statement-breakpoint
CREATE INDEX "findings_repo_status_idx" ON "findings" USING btree ("repo_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "repos_user_full_name_uq" ON "repos" USING btree ("user_id","full_name");--> statement-breakpoint
CREATE INDEX "repos_user_id_idx" ON "repos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scans_repo_id_idx" ON "scans" USING btree ("repo_id");--> statement-breakpoint
CREATE INDEX "scans_user_status_idx" ON "scans" USING btree ("user_id","status");