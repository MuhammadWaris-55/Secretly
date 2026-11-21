CREATE TABLE "worker_runtime" (
	"id" text PRIMARY KEY NOT NULL,
	"last_busy_at" timestamp with time zone DEFAULT now() NOT NULL,
	"was_busy" boolean DEFAULT false NOT NULL
);
