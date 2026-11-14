import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const scanStatus = pgEnum("scan_status", ["queued", "running", "done", "failed"]);
export const findingStatus = pgEnum("finding_status", [
  "open",
  "fixed",
  "ignored",
  "false_positive",
]);
// Generic type/source so the later breach layer (emails, passwords) can reuse findings.
export const findingType = pgEnum("finding_type", ["secret"]);
export const findingSource = pgEnum("finding_source", ["github"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

export const repos = pgTable(
  "repos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    fullName: text("full_name").notNull(), // "owner/repo"
    lastScannedSha: text("last_scanned_sha"),
    lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("repos_user_full_name_uq").on(t.userId, t.fullName),
    index("repos_user_id_idx").on(t.userId),
  ],
);

export const scans = pgTable(
  "scans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => repos.id, { onDelete: "cascade" }),
    status: scanStatus("status").notNull().default("queued"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    findingsCount: integer("findings_count").notNull().default(0),
    // Sanitized failure reason only. Never put raw findings or secrets here.
    error: text("error"),
    ...timestamps,
  },
  (t) => [
    index("scans_repo_id_idx").on(t.repoId),
    index("scans_user_status_idx").on(t.userId, t.status),
    // At most one queued or running scan per repo, enforced by the database.
    uniqueIndex("scans_one_active_per_repo_uq")
      .on(t.repoId)
      .where(sql`${t.status} in ('queued', 'running')`),
  ],
);

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => repos.id, { onDelete: "cascade" }),
    type: findingType("type").notNull().default("secret"),
    source: findingSource("source").notNull().default("github"),
    ruleId: text("rule_id").notNull(), // the secret type, e.g. "aws-access-key"
    filePath: text("file_path").notNull(),
    commitSha: text("commit_sha").notNull(),
    commitDate: timestamp("commit_date", { withTimezone: true }).notNull(),
    line: integer("line").notNull(),
    maskedPreview: text("masked_preview").notNull(),
    fingerprint: text("fingerprint").notNull(), // HMAC-SHA256, never the raw secret
    inHead: boolean("in_head").notNull().default(false), // still in current code?
    status: findingStatus("status").notNull().default("open"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenScanId: uuid("last_seen_scan_id").references(() => scans.id, { onDelete: "set null" }),
    fixedAt: timestamp("fixed_at", { withTimezone: true }),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
  },
  (t) => [
    // The same secret in the same repo never creates a duplicate row.
    uniqueIndex("findings_repo_fingerprint_uq").on(t.repoId, t.fingerprint),
    index("findings_repo_status_idx").on(t.repoId, t.status),
  ],
);

export type Repo = typeof repos.$inferSelect;
export type NewRepo = typeof repos.$inferInsert;
export type Scan = typeof scans.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type NewFinding = typeof findings.$inferInsert;
export const emailAlertSubscriptions = pgTable("email_alert_subscriptions", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  subscribedAt: timestamp("subscribed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scanEmails = pgTable(
  "scan_emails",
  {
    scanId: uuid("scan_id")
      .primaryKey()
      .references(() => scans.id, { onDelete: "cascade" }),
    count: integer("count").notNull(),
    previews: jsonb("previews").$type<string[]>().notNull(),
    ...timestamps,
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("scan_emails_next_attempt_idx").on(t.nextAttemptAt)],
);

export * from "./auth-schema";
