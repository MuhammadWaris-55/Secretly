import { env } from "@/core/env";
import { createWorkerBoss, ensureQueues } from "@/core/jobs/boss";

async function main(): Promise<void> {
  const boss = createWorkerBoss({
    connectionString: env.DIRECT_URL,
    onError: (error) => console.error("pg-boss error:", error.message),
  });
  try {
    await boss.start();
    await ensureQueues(boss);
    console.log("pg-boss schema and queues are ready.");
  } finally {
    await boss.stop();
  }
}

main().catch((error: unknown) => {
  console.error("Setup failed:", error instanceof Error ? error.message : "unknown error");
  process.exit(1);
});
