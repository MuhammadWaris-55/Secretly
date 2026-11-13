import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { db } from "@/core/db/client";
import { findings, repos, scans } from "@/core/db/schema";
import { env } from "@/core/env";
import { scanRepo } from "@/core/scanner/scan-repo";
import { dedupeByFingerprint } from "./dedupe";
import { ScanAttemptError, classifyScanError } from "./failure";

const INSERT_BATCH_SIZE = 500;

/** Marks an unfinished scan as failed. A scan that already finished is never touched. */
export async function failScan(
  scanId: string,
  message: string,
  database: Pick<typeof db, "update"> = db,
): Promise<void> {
  await database
    .update(scans)
    .set({ status: "failed", finishedAt: new Date(), error: message })
    .where(and(eq(scans.id, scanId), inArray(scans.status, ["queued", "running"])));
}

/**
 * Runs one scan job. Safe to run again after a crash: it only claims scans that are
 * queued or running, and findings are upserted by (repo, fingerprint).
 * Throws only for failures worth retrying.
 */
export async function processScanJob(scanId: string, hmacKey: string): Promise<void> {
  // Use a direct session so transaction pooling cannot detach the lock between queries.
  const client = new Client({ connectionString: env.DIRECT_URL, connectionTimeoutMillis: 5000 });
  // An idle disconnect can happen while Gitleaks runs. Subsequent queries then fail and retry.
  client.on("error", () => {});
  try {
    await client.connect();
    // Closing the session releases the lock on every path, including worker crashes.
    await client.query("select pg_advisory_lock(hashtextextended($1, 0))", [scanId.toLowerCase()]);
    await runScan(drizzle(client), scanId, hmacKey);
  } finally {
    await client.end();
  }
}

async function runScan(database: NodePgDatabase, scanId: string, hmacKey: string): Promise<void> {
  const [claimed] = await database
    .update(scans)
    .set({ status: "running", startedAt: new Date() })
    .where(and(eq(scans.id, scanId), inArray(scans.status, ["queued", "running"])))
    .returning({ repoId: scans.repoId, userId: scans.userId });
  if (!claimed) return;

  try {
    // The repo must belong to the same user as the scan.
    const [repo] = await database
      .select({ id: repos.id, fullName: repos.fullName })
      .from(repos)
      .where(and(eq(repos.id, claimed.repoId), eq(repos.userId, claimed.userId)))
      .limit(1);
    if (!repo) {
      await failScan(scanId, "Repository not found.", database);
      return;
    }

    const result = await scanRepo(`https://github.com/${repo.fullName}`, hmacKey);
    const unique = dedupeByFingerprint(result.findings);
    const now = new Date();

    // Findings, repo info and the scan's final state are saved together or not at all.
    await database.transaction(async (tx) => {
      const [finished] = await tx
        .update(scans)
        .set({ status: "done", finishedAt: now, findingsCount: unique.length, error: null })
        .where(and(eq(scans.id, scanId), eq(scans.status, "running")))
        .returning({ id: scans.id });
      if (!finished) return;
      for (let start = 0; start < unique.length; start += INSERT_BATCH_SIZE) {
        const batch = unique.slice(start, start + INSERT_BATCH_SIZE);
        await tx
          .insert(findings)
          .values(
            batch.map((finding) => ({
              repoId: repo.id,
              ruleId: finding.ruleId,
              filePath: finding.filePath,
              commitSha: finding.commitSha,
              commitDate: finding.commitDate,
              line: finding.line,
              maskedPreview: finding.maskedPreview,
              fingerprint: finding.fingerprint,
              inHead: finding.inHead,
              lastSeenAt: now,
              lastSeenScanId: scanId,
            })),
          )
          .onConflictDoUpdate({
            target: [findings.repoId, findings.fingerprint],
            // Refresh what a re-scan can learn. Never touch status: a finding the user
            // marked fixed or ignored must stay that way.
            set: { lastSeenAt: now, lastSeenScanId: scanId, inHead: sql`excluded.in_head` },
          });
      }

      await tx
        .update(repos)
        .set({ lastScannedSha: result.headSha, lastScannedAt: now })
        .where(eq(repos.id, repo.id));
    });
  } catch (error) {
    const failure = classifyScanError(error);
    if (failure.permanent) {
      await failScan(scanId, failure.message, database);
      return;
    }
    throw new ScanAttemptError(error);
  }
}
