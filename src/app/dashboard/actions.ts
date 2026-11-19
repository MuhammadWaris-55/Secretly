"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/core/db/client";
import { account, repos, user } from "@/core/db/schema";
import { listPublicRepos } from "@/core/github/public-repos";
import { getSession } from "@/lib/session";
import { z } from "zod";
import { requestScan, type ScanRequestResult } from "@/core/jobs/request-scan";
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
      const imported = await db.transaction(async (tx) => {
        const [owner] = await tx
          .select({ id: user.id })
          .from(user)
          .where(eq(user.id, userId))
          .for("key share");
        if (!owner) return false;
        await tx
          .insert(repos)
          .values(found.map((repo) => ({ userId, fullName: repo.fullName })))
          .onConflictDoNothing(); // already-known repos keep their scan state
        return true;
      });
      if (!imported) return { ok: false, message: "Please sign in again." };
    }
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/account");
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

export type StartScanResult = ScanRequestResult;

export async function startScan(input: unknown): Promise<StartScanResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Please sign in again." };

  const parsed = startScanInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };

  let result: StartScanResult;
  try {
    result = await requestScan(session.user.id, parsed.data.repoId, await getProducerBoss());
  } catch {
    return { ok: false, message: "Could not queue the scan. Please try again." };
  }
  revalidatePath("/dashboard");
  return result;
}
