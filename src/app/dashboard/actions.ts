"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/core/db/client";
import { account, repos } from "@/core/db/schema";
import { listPublicRepos } from "@/core/github/public-repos";
import { getSession } from "@/lib/session";
import { z } from "zod";
import { scans } from "@/core/db/schema";
import { isUniqueViolation } from "@/core/db/errors";
import { SCAN_QUEUE, scanJobSchema } from "@/core/jobs/queues";
import { getProducerBoss } from "@/lib/boss";

export type SyncResult = { ok: true; count: number } | { ok: false; message: string };

export async function syncRepos(): Promise<SyncResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Please sign in again." };
  const userId = session.user.id;

  const githubAccount = and(eq(account.userId, userId), eq(account.providerId, "github"));
  const [row] = await db
    .select({ token: account.accessToken })
    .from(account)
    .where(githubAccount)
    .limit(1);

  if (!row?.token) {
    return {
      ok: false,
      message: "Sign out and sign in with GitHub again to refresh your repositories.",
    };
  }

  try {
    const found = await listPublicRepos(row.token);
    if (found.length > 0) {
      await db
        .insert(repos)
        .values(found.map((repo) => ({ userId, fullName: repo.fullName })))
        .onConflictDoNothing(); // already-known repos keep their scan state
    }
    revalidatePath("/dashboard");
    return { ok: true, count: found.length };
  } catch {
    return {
      ok: false,
      message: "Could not list your repositories. Sign out and sign in to try again.",
    };
  } finally {
    // We never keep a working GitHub credential, even when listing failed.
    await db
      .update(account)
      .set({
        accessToken: null,
        refreshToken: null,
        idToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
      })
      .where(githubAccount);
  }
}

const startScanInput = z.object({ repoId: z.string().uuid() });

export type StartScanResult = { ok: true } | { ok: false; message: string };

export async function startScan(input: unknown): Promise<StartScanResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Please sign in again." };

  const parsed = startScanInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };

  const userId = session.user.id;
  const { repoId } = parsed.data;

  // Authorization: the repo must belong to the signed-in user.
  const [repo] = await db
    .select({ id: repos.id })
    .from(repos)
    .where(and(eq(repos.id, repoId), eq(repos.userId, userId)))
    .limit(1);
  if (!repo) return { ok: false, message: "Repository not found." };

  let scanId: string;
  try {
    const [row] = await db.insert(scans).values({ userId, repoId }).returning({ id: scans.id });
    if (!row) throw new Error("insert returned no row");
    scanId = row.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, message: "A scan is already queued or running for this repository." };
    }
    return { ok: false, message: "Could not start the scan. Please try again." };
  }

  try {
    const boss = await getProducerBoss();
    const payload = scanJobSchema.parse({ scanId });
    const jobId = await boss.send(SCAN_QUEUE, payload, { singletonKey: repoId });
    if (jobId === null) throw new Error("queue refused the job");
  } catch {
    // Never leave a scan queued with no job behind it.
    await db
      .update(scans)
      .set({ status: "failed", finishedAt: new Date(), error: "Could not queue the scan." })
      .where(eq(scans.id, scanId));
    return { ok: false, message: "Could not queue the scan. Please try again." };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}
