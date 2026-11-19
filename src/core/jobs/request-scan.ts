import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { fromDrizzle, type PgBoss } from "pg-boss";
import { db } from "@/core/db/client";
import { repos, scans, user } from "@/core/db/schema";
import { SCAN_QUEUE } from "./queues";

const MAX_ACTIVE = 2;
const MAX_PER_HOUR = 10;

export type ScanRequestResult = { ok: true } | { ok: false; message: string };

export async function requestScan(
  userId: string,
  repoId: string,
  boss: Pick<PgBoss, "send">,
): Promise<ScanRequestResult> {
  return db.transaction(async (tx) => {
    // All producers lock the same owner before reading their allowance, including across web replicas.
    const [owned] = await tx
      .select({ id: repos.id })
      .from(user)
      .innerJoin(repos, eq(repos.userId, user.id))
      .where(and(eq(user.id, userId), eq(repos.id, repoId)))
      .for("update", { of: user });
    if (!owned) return { ok: false, message: "Repository not found." };

    const active = await tx
      .select({ repoId: scans.repoId })
      .from(scans)
      .where(and(eq(scans.userId, userId), inArray(scans.status, ["queued", "running"])));
    if (active.some((scan) => scan.repoId === repoId)) {
      return { ok: false, message: "A scan is already queued or running for this repository." };
    }
    if (active.length >= MAX_ACTIVE) {
      return { ok: false, message: "Two scans are already active. Try again when one finishes." };
    }
    const recent = await tx
      .select({ id: scans.id })
      .from(scans)
      .where(and(eq(scans.userId, userId), gte(scans.createdAt, sql`now() - interval '1 hour'`)))
      .limit(MAX_PER_HOUR);
    if (recent.length >= MAX_PER_HOUR) {
      return { ok: false, message: "You can start 10 scans per hour. Try again later." };
    }

    const [scan] = await tx.insert(scans).values({ userId, repoId }).returning({ id: scans.id });
    if (!scan) throw new Error("Scan insert failed");
    const jobId = await boss.send(
      SCAN_QUEUE,
      { scanId: scan.id },
      {
        singletonKey: repoId,
        db: fromDrizzle(tx, sql),
      },
    );
    if (!jobId) throw new Error("Queue refused scan");
    return { ok: true };
  });
}
