import { and, eq, exists, sql } from "drizzle-orm";
import { db } from "./client";
import { findings, repos, type Finding } from "./schema";

export async function setOwnedFindingStatus(
  userId: string,
  repoId: string,
  findingId: string,
  status: Finding["status"],
): Promise<boolean> {
  const ownedRepo = db
    .select({ id: repos.id })
    .from(repos)
    .where(and(eq(repos.id, findings.repoId), eq(repos.userId, userId)));

  const [updated] = await db
    .update(findings)
    .set({
      status,
      fixedAt: status === "fixed" ? sql`coalesce(${findings.fixedAt}, now())` : null,
    })
    .where(and(eq(findings.id, findingId), eq(findings.repoId, repoId), exists(ownedRepo)))
    .returning({ id: findings.id });

  return Boolean(updated);
}
