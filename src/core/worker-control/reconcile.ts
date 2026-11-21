import { Client } from "pg";
import { env } from "@/core/env";
import type { WorkerControlConfig } from "./config";
import { workerDecision } from "./policy";
import { setWorkerCapacity } from "./vercel";

/** All controllers serialize scale decisions on the same direct Postgres session. */
export async function reconcileWorker(config: WorkerControlConfig): Promise<number> {
  const client = new Client({
    connectionString: env.DIRECT_URL,
    connectionTimeoutMillis: 5000,
    query_timeout: 25_000,
  });
  client.on("error", () => {});
  try {
    await client.connect();
    await client.query("BEGIN");
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_xact_lock(hashtextextended('secretly-worker-control', 0)) AS locked",
    );
    if (!lock.rows[0]?.locked) {
      await client.query("ROLLBACK");
      return 1000;
    }
    await client.query(
      "INSERT INTO worker_runtime (id) VALUES ('scan-worker') ON CONFLICT DO NOTHING",
    );
    const state = await client.query<{ last_busy_at: Date; was_busy: boolean; now: Date }>(
      "SELECT last_busy_at, was_busy, now() AS now FROM worker_runtime WHERE id = 'scan-worker' FOR UPDATE",
    );
    const row = state.rows[0];
    if (!row) throw new Error("Missing worker runtime state");
    const work = await client.query<{ active: boolean; next_email_at: Date | null }>(`
      SELECT EXISTS(SELECT 1 FROM scans WHERE status IN ('queued', 'running')) AS active,
        (SELECT min(next_attempt_at) FROM scan_emails
          WHERE created_at >= now() - interval '23 hours') AS next_email_at
    `);
    const workload = work.rows[0];
    if (!workload) throw new Error("Missing worker workload");
    const decision = workerDecision({
      now: row.now.getTime(),
      lastBusyAt: row.last_busy_at.getTime(),
      idleMs: config.WORKER_IDLE_SECONDS * 1000,
      activeScans: workload.active,
      wasBusy: row.was_busy,
      nextEmailAt: workload.next_email_at?.getTime() ?? null,
    });
    await setWorkerCapacity(config, decision.desired);
    await client.query(
      "UPDATE worker_runtime SET last_busy_at = $1, was_busy = $2 WHERE id = 'scan-worker'",
      [new Date(decision.lastBusyAt), decision.busy],
    );
    await client.query("COMMIT");
    return decision.nextCheckMs;
  } finally {
    // Closing rolls back any failed decision and releases the advisory lock.
    await client.end();
  }
}
