import { and, asc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/core/db/client";
import { emailAlertSubscriptions, repos, scanEmails, scans, user } from "@/core/db/schema";
import { renderAlert } from "./render-alert";

export async function deliverNextAlert(config: { apiKey: string; from: string; baseUrl: string }) {
  await db.transaction(async (tx) => {
    // Keep retries inside Resend's 24-hour idempotency window.
    await tx.delete(scanEmails).where(sql`${scanEmails.createdAt} < now() - interval '23 hours'`);
    const [pending] = await tx
      .select()
      .from(scanEmails)
      .where(sql`${scanEmails.nextAttemptAt} <= now()`)
      .orderBy(asc(scanEmails.nextAttemptAt), asc(scanEmails.scanId))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!pending) return;

    const [recipient] = await tx
      .select({ email: user.email, repoId: repos.id })
      .from(scanEmails)
      .innerJoin(scans, eq(scans.id, scanEmails.scanId))
      .innerJoin(repos, and(eq(repos.id, scans.repoId), eq(repos.userId, scans.userId)))
      .innerJoin(user, eq(user.id, scans.userId))
      .innerJoin(emailAlertSubscriptions, eq(emailAlertSubscriptions.userId, user.id))
      .where(
        and(
          eq(scans.id, pending.scanId),
          eq(user.emailVerified, true),
          gte(scanEmails.createdAt, emailAlertSubscriptions.subscribedAt),
        ),
      )
      .for("share", { of: [user, emailAlertSubscriptions] });

    if (recipient) {
      const alert = renderAlert(config.baseUrl, recipient.repoId, pending.count, pending.previews);
      let accepted = false;
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `scan-alert/${pending.scanId}`,
          },
          body: JSON.stringify({ from: config.from, to: [recipient.email], ...alert }),
          signal: AbortSignal.timeout(10_000),
          redirect: "error",
        });
        accepted = response.ok;
        await response.body?.cancel();
      } catch {
        // Provider response details and the recipient never reach logs.
      }
      if (!accepted) {
        await tx
          .update(scanEmails)
          .set({ nextAttemptAt: sql`now() + interval '5 minutes'` })
          .where(eq(scanEmails.scanId, pending.scanId));
        return;
      }
    }

    await tx.delete(scanEmails).where(eq(scanEmails.scanId, pending.scanId));
  });
}
