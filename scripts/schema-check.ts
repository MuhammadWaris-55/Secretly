import { eq } from "drizzle-orm";
import { db, pool } from "@/core/db/client";
import { findings, repos } from "@/core/db/schema";

// Drizzle may wrap driver errors, so check both places for the Postgres code.
function pgErrorCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } };
  return e.cause?.code ?? e.code;
}

async function main() {
  const [repo] = await db
    .insert(repos)
    .values({ userId: "schema-check-user", fullName: "demo/schema-check" })
    .returning();
  if (!repo) throw new Error("Repo insert returned no row");

  try {
    const finding = {
      repoId: repo.id,
      ruleId: "aws-access-key",
      filePath: ".env",
      commitSha: "0000000000000000000000000000000000000000",
      commitDate: new Date(),
      line: 1,
      maskedPreview: "AKIA************",
      fingerprint: "schema-check-fingerprint",
    };

    await db.insert(findings).values(finding);
    console.log("1. First insert: ok");

    try {
      await db.insert(findings).values(finding);
      console.log("2. Duplicate insert: NOT rejected (BAD)");
      process.exitCode = 1;
    } catch (error) {
      const code = pgErrorCode(error);
      if (code === "23505") {
        console.log("2. Duplicate insert: rejected by unique constraint (good)");
      } else {
        console.log(`2. Duplicate failed with an unexpected error code: ${code}`);
        process.exitCode = 1;
      }
    }

    await db.delete(repos).where(eq(repos.id, repo.id));
    const left = await db.select().from(findings).where(eq(findings.repoId, repo.id));
    if (left.length === 0) {
      console.log("3. Deleting the repo removed its findings (good)");
    } else {
      console.log(`3. ${left.length} finding(s) survived the repo delete (BAD)`);
      process.exitCode = 1;
    }
  } finally {
    // Safety net so a failed run never leaves test rows behind.
    await db.delete(repos).where(eq(repos.id, repo.id));
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Schema check failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
