import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/core/db/client";
import { findings, repos, scans } from "@/core/db/schema";
import { scanRepo } from "@/core/scanner/scan-repo";
import { dedupeByFingerprint } from "./dedupe";
import { ScanAttemptError, classifyScanError } from "./failure";

const INSERT_BATCH_SIZE = 500;

/** Marks an unfinished scan as failed. A scan that already finished is never touched. */
export async function failScan(scanId: string, message: string): Promise<void> {
  await db
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
  // Claim: queued -> running in one statement. A finished or missing scan is skipped.
  const [claimed] = await db
    .update(scans)
    .set({ status: "running", startedAt: new Date() })
    .where(and(eq(scans.id, scanId), inArray(scans.status, ["queued", "running"])))
    .returning({ repoId: scans.repoId, userId: scans.userId });
  if (!claimed) return;

  try {
    // The repo must belong to the same user as the scan.
    const [repo] = await db
      .select({ id: repos.id, fullName: repos.fullName })
      .from(repos)
      .where(and(eq(repos.id, claimed.repoId), eq(repos.userId, claimed.userId)))
      .limit(1);
    if (!repo) {
      await failScan(scanId, "Repository not found.");
      return;
    }

    const result = await scanRepo(`https://github.com/${repo.fullName}`, hmacKey);
    const unique = dedupeByFingerprint(result.findings);
    const now = new Date();

    // Findings, repo info and the scan's final state are saved together or not at all.
    await db.transaction(async (tx) => {
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
            })),
          )
          .onConflictDoUpdate({
            target: [findings.repoId, findings.fingerprint],
            // Refresh what a re-scan can learn. Never touch status: a finding the user
            // marked fixed or ignored must stay that way.
            set: { lastSeenAt: now, inHead: sql`excluded.in_head` },
          });
      }

      await tx
        .update(repos)
        .set({ lastScannedSha: result.headSha, lastScannedAt: now })
        .where(eq(repos.id, repo.id));

      await tx
        .update(scans)
        .set({ status: "done", finishedAt: now, findingsCount: unique.length, error: null })
        .where(eq(scans.id, scanId));
    });
  } catch (error) {
    const failure = classifyScanError(error);
    if (failure.permanent) {
      await failScan(scanId, failure.message);
      return;
    }
    throw new ScanAttemptError(error);
  }
}
