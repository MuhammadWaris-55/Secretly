import { once } from "node:events";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { createWorkerBoss, ensureQueues } from "@/core/jobs/boss";
import { SCAN_FAILED_AFTER_RETRIES } from "@/core/jobs/failure";
import {
  SCAN_DEAD_LETTER_QUEUE,
  SCAN_QUEUE,
  SCAN_QUEUE_SETTINGS,
  scanJobSchema,
} from "@/core/jobs/queues";
import { logger } from "./logger";

const DRAIN_MS = SCAN_QUEUE_SETTINGS.expireInSeconds * 1000;
const SHUTDOWN_LIMIT_MS = DRAIN_MS + 5000;

async function main(): Promise<void> {
  const port = z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .parse(process.env.PORT ?? "3001");
  const { env } = await import("@/core/env");
  const { pool } = await import("@/core/db/client");
  const { failScan, processScanJob } = await import("@/core/jobs/scan-job");
  const { deliverNextAlert } = await import("@/core/jobs/alert-email");
  const emailConfig = process.env.RESEND_API_KEY
    ? z.object({ apiKey: z.string().min(1), from: z.string().min(1), baseUrl: z.httpUrl() }).parse({
        apiKey: process.env.RESEND_API_KEY,
        from: process.env.EMAIL_FROM,
        baseUrl: process.env.BETTER_AUTH_URL,
      })
    : undefined;
  const emailStop = new AbortController();
  let emailTask: Promise<void> | undefined;

  async function pollEmail(config: NonNullable<typeof emailConfig>) {
    while (!emailStop.signal.aborted) {
      try {
        await deliverNextAlert(config);
      } catch {
        logger.error("Could not process email alerts");
      }
      await delay(5000, undefined, { signal: emailStop.signal }).catch(() => undefined);
    }
  }

  const boss = createWorkerBoss({
    connectionString: env.DIRECT_URL,
    onError: () => logger.error("Queue connection or maintenance error"),
  });
  pool.on("error", () => logger.error("Application database pool error"));

  let ready = false;
  let stopping = false;
  const health = createServer((request, response) => {
    if (request.method !== "GET" || request.url !== "/healthz") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(ready ? 200 : 503, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(ready ? "ready\n" : "unavailable\n");
  });

  async function start(): Promise<void> {
    health.listen(port, "0.0.0.0");
    await once(health, "listening");
    if (stopping) return;
    await boss.start();
    if (stopping) return;
    await ensureQueues(boss);
    if (stopping) return;

    await boss.work<unknown>(SCAN_DEAD_LETTER_QUEUE, async (jobs) => {
      for (const job of jobs) {
        const parsed = scanJobSchema.safeParse(job.data);
        if (!parsed.success) {
          logger.warn("Discarding an invalid dead-letter payload");
          continue;
        }
        const { scanId } = parsed.data;
        try {
          await failScan(scanId, SCAN_FAILED_AFTER_RETRIES);
          logger.warn({ scanId }, "Scan retries exhausted");
        } catch {
          logger.error({ scanId }, "Could not finalize dead-lettered scan");
          throw new Error("Could not finalize dead-lettered scan");
        }
      }
    });
    if (stopping) return;

    await boss.work<unknown>(SCAN_QUEUE, async (jobs) => {
      for (const job of jobs) {
        const parsed = scanJobSchema.safeParse(job.data);
        if (!parsed.success) {
          logger.warn("Discarding an invalid scan payload");
          continue;
        }
        const { scanId } = parsed.data;
        try {
          await processScanJob(scanId, env.HMAC_KEY);
        } catch {
          logger.warn({ scanId }, "Scan attempt failed");
          throw new Error("Scan attempt failed");
        }
      }
    });
    if (!stopping) {
      if (emailConfig) emailTask = pollEmail(emailConfig);
      ready = true;
      logger.info({ port }, "Scan worker ready");
    }
  }

  const startup = start();

  async function shutdown(): Promise<void> {
    if (stopping) return;
    stopping = true;
    ready = false;
    emailStop.abort();
    logger.info("Scan worker stopping");
    const deadline = setTimeout(() => {
      logger.error("Scan worker shutdown deadline exceeded");
      process.exit(1);
    }, SHUTDOWN_LIMIT_MS);
    try {
      await startup.catch(() => undefined);
      await boss.stop({ graceful: true, timeout: DRAIN_MS });
      await emailTask;
    } finally {
      try {
        await Promise.all([
          pool.end(),
          new Promise<void>((resolve) => health.close(() => resolve())),
        ]);
      } finally {
        clearTimeout(deadline);
      }
    }
    logger.info("Scan worker stopped");
  }

  function stop(): void {
    void shutdown().catch(() => {
      logger.error("Scan worker shutdown failed");
      process.exit(1);
    });
  }

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await startup;
  } catch {
    logger.error("Scan worker startup failed");
    process.exitCode = 1;
    stop();
  }
}

void main().catch(() => {
  logger.error("Invalid scan worker configuration");
  process.exitCode = 1;
});
