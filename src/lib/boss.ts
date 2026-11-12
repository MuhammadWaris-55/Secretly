import type { PgBoss } from "pg-boss";
import { env } from "@/core/env";
import { createProducerBoss } from "@/core/jobs/boss";

const globalForBoss = globalThis as unknown as { bossPromise?: Promise<PgBoss> };

async function startProducer(): Promise<PgBoss> {
  const boss = createProducerBoss({
    connectionString: env.DIRECT_URL,
    onError: (error) => console.error("pg-boss error:", error.message),
  });
  await boss.start();
  return boss;
}

export function getProducerBoss(): Promise<PgBoss> {
  globalForBoss.bossPromise ??= startProducer().catch((error: unknown) => {
    globalForBoss.bossPromise = undefined;
    throw error;
  });
  return globalForBoss.bossPromise;
}
