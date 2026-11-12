import { PgBoss } from "pg-boss";
import {
  SCAN_DEAD_LETTER_QUEUE,
  SCAN_QUEUE,
  SCAN_QUEUE_POLICY,
  SCAN_QUEUE_SETTINGS,
} from "./queues";

interface BossOptions {
  connectionString: string;
  onError: (error: Error) => void;
}

/** Worker side: runs schema migrations and queue maintenance. Only the worker does this. */
export function createWorkerBoss({ connectionString, onError }: BossOptions): PgBoss {
  const boss = new PgBoss({ connectionString, max: 5 });
  boss.on("error", onError);
  return boss;
}

/** Web side: send-only. No migrations, no maintenance, one connection. */
export function createProducerBoss({ connectionString, onError }: BossOptions): PgBoss {
  const boss = new PgBoss({
    connectionString,
    max: 1,
    supervise: false,
    schedule: false,
    migrate: false,
  });
  boss.on("error", onError);
  return boss;
}

/** Idempotent. Safe to call on every worker start. */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  // The dead-letter queue must exist before the main queue can reference it.
  if (!(await boss.getQueue(SCAN_DEAD_LETTER_QUEUE))) {
    await boss.createQueue(SCAN_DEAD_LETTER_QUEUE);
  }

  if (await boss.getQueue(SCAN_QUEUE)) {
    // A queue's policy can't change after creation, so only the settings are updated.
    await boss.updateQueue(SCAN_QUEUE, SCAN_QUEUE_SETTINGS);
  } else {
    await boss.createQueue(SCAN_QUEUE, { policy: SCAN_QUEUE_POLICY, ...SCAN_QUEUE_SETTINGS });
  }
}
