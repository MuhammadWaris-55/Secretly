import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isUniqueViolation } from "@/core/db/errors";
import {
  account,
  emailAlertSubscriptions,
  findings,
  repos,
  scanEmails,
  scans,
  session,
  user,
  workerRuntime,
} from "@/core/db/schema";
import { CloneError, RepoTooLargeError } from "@/core/scanner/errors";
import { scanRepo, type RepoScanResult } from "@/core/scanner/scan-repo";
import { createProducerBoss, createWorkerBoss, ensureQueues } from "./boss";
import { SCAN_FAILED_AFTER_RETRIES, ScanAttemptError } from "./failure";
import { SCAN_DEAD_LETTER_QUEUE, SCAN_QUEUE, scanJobSchema } from "./queues";
import type { WorkerControlConfig } from "@/core/worker-control/config";

vi.mock("@/core/scanner/scan-repo", () => ({ scanRepo: vi.fn() }));

const hmacKey = "integration-test-hmac-key-not-for-production";
const scan = vi.mocked(scanRepo);
const createdRepos: string[] = [];
const owner = "integration-user";
const repoName = "example/integration";
const repoRef = {
  owner: "example",
  name: "integration",
  fullName: repoName,
  cloneUrl: "https://github.com/example/integration.git",
};
const headSha = "a".repeat(40);

let database: typeof import("@/core/db/client");
let jobs: typeof import("./scan-job");

beforeAll(async () => {
  const url = new URL(
    process.env.TEST_DATABASE_URL ?? "postgresql://127.0.0.1:55432/secretly_test",
  );
  if (
    !["postgresql:", "postgres:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/secretly_test" ||
    url.search
  ) {
    throw new Error("TEST_DATABASE_URL must point to a local, disposable secretly_test database.");
  }
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error("Set TEST_DATABASE_URL before running the Postgres integration suite.");
  }
  vi.stubEnv("DATABASE_URL", url.href);
  vi.stubEnv("DIRECT_URL", url.href);
  vi.stubEnv("HMAC_KEY", hmacKey);
  database = await import("@/core/db/client");
  await migrate(database.db, { migrationsFolder: "drizzle" });
  jobs = await import("./scan-job");
}, 15_000);

beforeEach(async () => {
  await database.db
    .insert(user)
    .values({ id: owner, name: "Fixture", email: "fixture@example.invalid", emailVerified: true });
  await database.db
    .insert(account)
    .values({ id: owner, accountId: "42", providerId: "github", userId: owner });
  vi.stubGlobal("fetch", async (input: string) =>
    Response.json({
      full_name: new URL(input).pathname.slice("/repos/".length),
      owner: { id: 42 },
      private: false,
      fork: false,
      size: 1,
    }),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  scan.mockReset();
  for (const id of createdRepos.splice(0)) {
    await database.db.delete(repos).where(eq(repos.id, id));
  }
  await database.db.delete(user).where(eq(user.id, owner));
  await database.db.delete(workerRuntime);
});

describe("automatic scanner capacity with Postgres", () => {
  const config: WorkerControlConfig = {
    WORKER_VERCEL_TOKEN: "test-only-access-token",
    WORKER_VERCEL_PROJECT_ID: "prj_test",
    WORKER_VERCEL_TEAM_ID: "team_test",
    WORKER_VERCEL_REGION: "iad1",
    WORKER_IDLE_SECONDS: 300,
  };
  async function idleRuntime() {
    await database.db.insert(workerRuntime).values({ id: "scan-worker", lastBusyAt: new Date(0) });
  }
  function provider(initial: number, onScale?: (count: number) => Promise<void>) {
    let count = initial;
    const changes: number[] = [];
    vi.stubGlobal("fetch", async (_input: URL, options?: RequestInit) => {
      if (options?.method === "PUT") {
        const next = (JSON.parse(String(options.body)) as Record<string, number>).iad1!;
        if (onScale) await onScale(next);
        changes.push(next);
        count = next;
        return Response.json({ ok: true });
      }
      return Response.json({
        daemons: [
          {
            name: "scan-worker",
            scope: { type: "target", value: "production" },
            config: { instances: { iad1: count } },
            instances: { items: [] },
          },
        ],
      });
    });
    return changes;
  }

  it("starts for queued jobs, stays on during execution/retries, and stops only after the warm window", async () => {
    const { reconcileWorker } = await import("@/core/worker-control/reconcile");
    await idleRuntime();
    const changes = provider(0);
    const { scanId } = await fixture();
    await reconcileWorker(config);
    await database.db.update(scans).set({ status: "running" }).where(eq(scans.id, scanId));
    await reconcileWorker(config);
    expect(changes).toEqual([1]);
    await database.db.update(scans).set({ status: "done" }).where(eq(scans.id, scanId));
    await reconcileWorker(config);
    expect(changes).toEqual([1]);
    await database.db.update(workerRuntime).set({ lastBusyAt: new Date(0) });
    await reconcileWorker(config);
    expect(changes).toEqual([1, 0]);
  });

  it("recovers a scan committed while a stop request is in flight, without overlapping scale commands", async () => {
    const { reconcileWorker } = await import("@/core/worker-control/reconcile");
    await idleRuntime();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const changes = provider(1, async (count) => {
      if (count === 0) {
        entered.resolve();
        await release.promise;
      }
    });
    const stopping = reconcileWorker(config);
    try {
      await entered.promise;
      await fixture();
      expect(await reconcileWorker(config)).toBe(1000);
    } finally {
      release.resolve();
      await stopping;
    }
    await reconcileWorker(config);
    expect(changes).toEqual([0, 1]);
  });

  it("wakes for an email retry even with no active scans", async () => {
    const { reconcileWorker } = await import("@/core/worker-control/reconcile");
    await idleRuntime();
    const { scanId } = await fixture();
    await database.db.update(scans).set({ status: "done" }).where(eq(scans.id, scanId));
    await database.db
      .insert(scanEmails)
      .values({ scanId, count: 1, previews: [], nextAttemptAt: new Date(Date.now() + 60_000) });
    const changes = provider(1);
    expect(await reconcileWorker(config)).toBeGreaterThan(0);
    expect(changes).toEqual([0]);
    await database.db.update(scanEmails).set({ nextAttemptAt: new Date(0) });
    await reconcileWorker(config);
    expect(changes).toEqual([0, 1]);
  });

  it("releases the lock after an API failure so a later recovery attempt can wake the worker", async () => {
    const { reconcileWorker } = await import("@/core/worker-control/reconcile");
    await idleRuntime();
    await fixture();
    vi.stubGlobal("fetch", async () => new Response(null, { status: 503 }));
    await expect(reconcileWorker(config)).rejects.toThrow();
    const changes = provider(0);
    await reconcileWorker(config);
    expect(changes).toEqual([1]);
  });
});

afterAll(async () => {
  await database?.pool.end();
  vi.unstubAllEnvs();
});

async function enqueue(repoId: string, userId = owner) {
  const [row] = await database.db.insert(scans).values({ repoId, userId }).returning();
  if (!row) throw new Error("Scan fixture insert failed");
  return row.id;
}

async function fixture(fullName = repoName) {
  const id = randomUUID();
  await database.db.insert(repos).values({ id, userId: owner, fullName });
  createdRepos.push(id);
  return { repoId: id, scanId: await enqueue(id) };
}

async function readScan(scanId: string) {
  const [row] = await database.db.select().from(scans).where(eq(scans.id, scanId));
  return row;
}

function finding(fingerprint: string, day: number, inHead = true) {
  return {
    fingerprint,
    inHead,
    ruleId: "test-rule",
    filePath: "example.txt",
    commitSha: headSha,
    commitDate: new Date(Date.UTC(2026, 0, day)),
    line: 1,
    maskedPreview: "************",
  };
}

it("deletes an account and its application data while preserving another repository's scan", async () => {
  const { repoId, scanId } = await fixture();
  const other = await fixture("example/other-account");
  await database.db.update(repos).set({ userId: "another-user" }).where(eq(repos.id, other.repoId));
  await database.db.update(scans).set({ userId: "another-user" }).where(eq(scans.id, other.scanId));
  const db = database.db;
  try {
    const now = new Date();
    await db.insert(session).values({
      id: owner,
      token: randomUUID(),
      userId: owner,
      expiresAt: new Date(now.getTime() + 60_000),
      updatedAt: now,
    });
    await db.insert(emailAlertSubscriptions).values({ userId: owner });
    await db.insert(findings).values({ repoId, lastSeenScanId: scanId, ...finding("delete", 1) });
    await db.insert(scanEmails).values({ scanId, count: 1, previews: ["************"] });

    const { deleteAccount } = await import("@/core/db/delete-account");
    await deleteAccount(owner);
    await deleteAccount(owner);

    expect(await db.select().from(user).where(eq(user.id, owner))).toEqual([]);
    expect(await db.select().from(account).where(eq(account.userId, owner))).toEqual([]);
    expect(await db.select().from(session).where(eq(session.userId, owner))).toEqual([]);
    expect(
      await db
        .select()
        .from(emailAlertSubscriptions)
        .where(eq(emailAlertSubscriptions.userId, owner)),
    ).toEqual([]);
    expect(await db.select().from(repos).where(eq(repos.id, repoId))).toEqual([]);
    expect(await db.select().from(findings).where(eq(findings.repoId, repoId))).toEqual([]);
    expect(await db.select().from(scanEmails).where(eq(scanEmails.scanId, scanId))).toEqual([]);
    expect(await readScan(scanId)).toBeUndefined();
    expect(await readScan(other.scanId)).toMatchObject({
      userId: "another-user",
      status: "queued",
    });
    await jobs.processScanJob(scanId, hmacKey);
    expect(scan).not.toHaveBeenCalled();
  } finally {
    await db.delete(user).where(eq(user.id, owner));
  }
});

it("serializes overlapping deliveries and skips a completed scan", async () => {
  const { scanId } = await fixture();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<RepoScanResult>();
  scan.mockImplementationOnce(() => {
    entered.resolve();
    return release.promise;
  });
  const first = jobs.processScanJob(scanId, hmacKey);
  let second: Promise<void> | undefined;
  try {
    await Promise.race([entered.promise, first]);
    second = jobs.processScanJob(scanId, hmacKey);
    await expect
      .poll(async () => {
        const result = await database.db.execute(sql`
          select exists (
            select 1 from pg_stat_activity
            where datname = current_database()
              and wait_event = 'advisory'
              and query like 'select pg_advisory_lock(%'
          ) as waiting
        `);
        return result.rows[0]?.waiting;
      })
      .toBe(true);
    expect(scan).toHaveBeenCalledTimes(1);
  } finally {
    release.resolve({ repo: repoRef, headSha, findings: [] });
    await Promise.all([first, second]);
  }
  await jobs.processScanJob(scanId, hmacKey);
  expect(scan).toHaveBeenCalledExactlyOnceWith("https://github.com/example/integration", hmacKey);
  expect(await readScan(scanId)).toMatchObject({ status: "done", findingsCount: 0 });
});

it("retries transient failures, deduplicates findings, and preserves user-set statuses", async () => {
  const { repoId, scanId } = await fixture();
  scan.mockRejectedValueOnce(new CloneError("timeout")).mockResolvedValueOnce({
    repo: repoRef,
    headSha,
    findings: [finding("fixed", 2), finding("fixed", 1), finding("ignored", 1)],
  });
  await expect(jobs.processScanJob(scanId, hmacKey)).rejects.toBeInstanceOf(ScanAttemptError);
  expect(await readScan(scanId)).toMatchObject({ status: "running", error: null });
  await jobs.processScanJob(scanId, hmacKey);
  expect(await readScan(scanId)).toMatchObject({ status: "done", findingsCount: 2 });
  const listFindings = () =>
    database.db
      .select()
      .from(findings)
      .where(eq(findings.repoId, repoId))
      .orderBy(findings.fingerprint);
  const initial = await listFindings();
  expect(initial.map((row) => row.lastSeenScanId)).toEqual([scanId, scanId]);
  expect(initial.map((row) => row.commitDate)).toEqual([
    finding("fixed", 1).commitDate,
    finding("ignored", 1).commitDate,
  ]);
  const { setOwnedFindingStatus } = await import("@/core/db/finding-status");
  for (const row of initial) {
    const status = row.fingerprint === "fixed" ? "fixed" : "ignored";
    expect(await setOwnedFindingStatus(owner, repoId, row.id, status)).toBe(true);
    await database.db
      .update(findings)
      .set({ lastSeenAt: new Date(0) })
      .where(eq(findings.id, row.id));
  }
  const rescanId = await enqueue(repoId);
  scan.mockResolvedValueOnce({
    repo: repoRef,
    headSha,
    findings: [finding("fixed", 3, false), finding("ignored", 3, false)],
  });
  await jobs.processScanJob(rescanId, hmacKey);
  const refreshed = await listFindings();
  expect(refreshed.map((row) => row.lastSeenScanId)).toEqual([rescanId, rescanId]);
  expect(refreshed.map((row) => row.id)).toEqual(initial.map((row) => row.id));
  expect(refreshed.map(({ status, inHead }) => ({ status, inHead }))).toEqual([
    { status: "fixed", inHead: false },
    { status: "ignored", inHead: false },
  ]);
  expect(refreshed.every((row) => row.lastSeenAt.getTime() > 0)).toBe(true);
  expect(await readScan(rescanId)).toMatchObject({ status: "done", findingsCount: 2 });
});

it("restricts status changes to the owner and matching repository, and supports reopening", async () => {
  const { repoId } = await fixture();
  const other = await fixture("example/other");
  const [row] = await database.db
    .insert(findings)
    .values({ repoId, ...finding("status-change", 1) })
    .returning();
  if (!row) throw new Error("Expected a finding");

  const { setOwnedFindingStatus } = await import("@/core/db/finding-status");
  const readFinding = async () => {
    const [current] = await database.db.select().from(findings).where(eq(findings.id, row.id));
    return current;
  };
  expect(await setOwnedFindingStatus("another-user", repoId, row.id, "fixed")).toBe(false);
  expect(await setOwnedFindingStatus(owner, other.repoId, row.id, "fixed")).toBe(false);
  expect(await readFinding()).toMatchObject({ status: "open", fixedAt: null });
  expect(await setOwnedFindingStatus(owner, repoId, row.id, "fixed")).toBe(true);
  const fixed = await readFinding();
  expect(fixed).toMatchObject({ status: "fixed", fixedAt: expect.any(Date) });
  expect(await setOwnedFindingStatus(owner, repoId, row.id, "fixed")).toBe(true);
  expect((await readFinding())?.fixedAt).toEqual(fixed?.fixedAt);
  expect(await setOwnedFindingStatus(owner, repoId, row.id, "false_positive")).toBe(true);
  expect(await readFinding()).toMatchObject({ status: "false_positive", fixedAt: null });
  expect(await setOwnedFindingStatus(owner, repoId, row.id, "open")).toBe(true);
  expect(await readFinding()).toMatchObject({ status: "open", fixedAt: null });
});

it("queues one email for new fingerprints and suppresses delivery after unsubscribe", async () => {
  const { repoId, scanId } = await fixture();
  try {
    await database.db.insert(emailAlertSubscriptions).values({ userId: owner });
    const result = { repo: repoRef, headSha, findings: [finding("new", 1), finding("new", 2)] };
    scan.mockResolvedValue(result);
    await jobs.processScanJob(scanId, hmacKey);
    await jobs.processScanJob(await enqueue(repoId), hmacKey);
    expect(await database.db.select().from(scanEmails)).toMatchObject([
      { scanId, count: 1, previews: ["************"] },
    ]);

    const { deliverNextAlert } = await import("./alert-email");
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    try {
      const config = {
        apiKey: "test-key",
        from: "alerts@example.invalid",
        baseUrl: "https://secretly.example",
      };
      await deliverNextAlert(config);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]?.[1]).toMatchObject({
        headers: { "Idempotency-Key": `scan-alert/${scanId}` },
      });
      await deliverNextAlert(config);
      expect(fetch).toHaveBeenCalledTimes(1);
      await database.db
        .delete(emailAlertSubscriptions)
        .where(eq(emailAlertSubscriptions.userId, owner));
      await database.db
        .update(scanEmails)
        .set({ nextAttemptAt: new Date(0) })
        .where(eq(scanEmails.scanId, scanId));
      await deliverNextAlert(config);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(await database.db.select().from(scanEmails)).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  } finally {
    await database.db.delete(user).where(eq(user.id, owner));
  }
});

it("fails permanent errors immediately and leaves the final state intact on redelivery", async () => {
  const { scanId } = await fixture();
  scan.mockRejectedValueOnce(new RepoTooLargeError(100));
  await jobs.processScanJob(scanId, hmacKey);
  const failed = await readScan(scanId);
  expect(failed).toMatchObject({
    status: "failed",
    error: "This repository is too large to scan.",
  });
  await jobs.failScan(scanId, SCAN_FAILED_AFTER_RETRIES);
  await jobs.processScanJob(scanId, hmacKey);
  expect(await readScan(scanId)).toEqual(failed);
  expect(scan).toHaveBeenCalledTimes(1);
});

it("can finalize an exhausted retry and queue a fresh scan afterward", async () => {
  const { repoId, scanId } = await fixture();
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) throw new Error("Missing Postgres test connection");
  const boss = createWorkerBoss({ connectionString, onError: () => {} });
  try {
    await boss.start();
    await ensureQueues(boss);
    const id = await boss.send(SCAN_QUEUE, { scanId }, { singletonKey: repoId, retryLimit: 0 });
    expect(id).toBeTruthy();
    const [job] = await boss.fetch(SCAN_QUEUE);
    if (!job) throw new Error("Expected a queued scan job");
    expect(job.id).toBe(id);
    scan.mockRejectedValueOnce(new CloneError("failed"));
    const attempt = jobs.processScanJob(scanJobSchema.parse(job.data).scanId, hmacKey);
    await expect(attempt).rejects.toBeInstanceOf(ScanAttemptError);
    await boss.fail(SCAN_QUEUE, job.id, { message: "Scan attempt failed" });
    const [deadLetter] = await boss.fetch(SCAN_DEAD_LETTER_QUEUE);
    if (!deadLetter) throw new Error("Expected a dead-letter job");
    const payload = scanJobSchema.parse(deadLetter.data);
    expect(payload.scanId).toBe(scanId);
    await jobs.failScan(payload.scanId, SCAN_FAILED_AFTER_RETRIES);
    await boss.complete(SCAN_DEAD_LETTER_QUEUE, deadLetter.id);
  } finally {
    await boss.stop();
  }
  expect(await readScan(scanId)).toMatchObject({
    status: "failed",
    error: SCAN_FAILED_AFTER_RETRIES,
  });
  expect(await readScan(await enqueue(repoId))).toMatchObject({ status: "queued" });
}, 15_000);

it("enforces one queued or running scan per repository", async () => {
  const { repoId, scanId } = await fixture();
  await expect(enqueue(repoId)).rejects.toSatisfy(isUniqueViolation);
  await database.db.update(scans).set({ status: "running" }).where(eq(scans.id, scanId));
  await expect(enqueue(repoId)).rejects.toSatisfy(isUniqueViolation);
  expect(await fixture("example/another-repo")).toHaveProperty("scanId");
});

it("atomically admits owned scans and enforces shared active and rolling hourly limits", async () => {
  const { requestScan } = await import("./request-scan");
  const userId = randomUUID();
  const connectionString = process.env.TEST_DATABASE_URL!;
  const boss = createWorkerBoss({ connectionString, onError: () => {} });
  await database.db
    .insert(user)
    .values({ id: userId, name: "Quota", email: userId + "@example.invalid" });
  try {
    await boss.start();
    await ensureQueues(boss);
    const owned = await database.db
      .insert(repos)
      .values(["one", "two", "three"].map((name) => ({ fullName: "quota/" + name, userId })))
      .returning({ id: repos.id });
    const repoId = owned[0]!.id;
    await expect(requestScan(owner, repoId, boss)).resolves.toMatchObject({
      ok: false,
      message: "Repository not found.",
    });
    await expect(requestScan(userId, repoId, { send: async () => null })).rejects.toThrow();
    expect(await database.db.select().from(scans).where(eq(scans.userId, userId))).toHaveLength(0);

    const results = await Promise.all(owned.map((repo) => requestScan(userId, repo.id, boss)));
    expect(results.filter((result) => result.ok)).toHaveLength(2);
    const pending = await database.db.select().from(scans).where(eq(scans.userId, userId));
    expect(pending).toHaveLength(2);
    const enqueued = await boss.fetch<{ scanId: string }>(SCAN_QUEUE, { batchSize: 3 });
    expect(enqueued.map((job) => job.data.scanId).sort()).toEqual(
      pending.map((scan) => scan.id).sort(),
    );
    await boss.complete(
      SCAN_QUEUE,
      enqueued.map((job) => job.id),
    );
    await expect(requestScan(userId, pending[0]!.repoId, boss)).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("this repository"),
    });
    await database.db.update(scans).set({ status: "done" }).where(eq(scans.userId, userId));
    await database.db
      .insert(scans)
      .values(Array.from({ length: 7 }, () => ({ userId, repoId, status: "done" as const })));
    const lastSlot = await Promise.all(owned.map((repo) => requestScan(userId, repo.id, boss)));
    expect(lastSlot.filter((result) => result.ok)).toHaveLength(1);
    expect(
      lastSlot.filter((result) => !result.ok && result.message.includes("per hour")),
    ).toHaveLength(2);
    const [last] = await boss.fetch(SCAN_QUEUE);
    await boss.complete(SCAN_QUEUE, last!.id);
    await database.db
      .update(scans)
      .set({ status: "done", createdAt: sql`now() - interval '61 minutes'` })
      .where(eq(scans.userId, userId));
    await expect(requestScan(userId, repoId, boss)).resolves.toEqual({ ok: true });
    const [fresh] = await boss.fetch(SCAN_QUEUE);
    await boss.complete(SCAN_QUEUE, fresh!.id);
  } finally {
    await boss.stop();
    await database.db.delete(repos).where(eq(repos.userId, userId));
    await database.db.delete(user).where(eq(user.id, userId));
  }
}, 30_000);

it("does not scan repositories owned by a different user", async () => {
  const { repoId, scanId } = await fixture();
  await jobs.failScan(scanId, "Fixture setup");
  const mismatch = await enqueue(repoId, "another-user");
  await jobs.processScanJob(mismatch, hmacKey);
  expect(await readScan(mismatch)).toMatchObject({
    status: "failed",
    error: "Repository not found.",
  });
  expect(scan).not.toHaveBeenCalled();
});

it("notifies a warm worker immediately instead of waiting for its idle poll", async () => {
  const connectionString = process.env.TEST_DATABASE_URL!;
  const options = { connectionString, onError: () => {} };
  const worker = createWorkerBoss(options);
  const producer = createProducerBoss(options);
  const queue = `notify-test-${randomUUID()}`;
  const delivered = Promise.withResolvers<void>();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    await worker.start();
    await worker.createQueue(queue, { notify: true });
    await producer.start();
    await worker.work(
      queue,
      { pollingIntervalSeconds: 60, notifyPollingIntervalSeconds: 60 },
      async () => delivered.resolve(),
    );
    // Let the initial empty fetch finish; the next poll would be a minute away.
    await new Promise((resolve) => setTimeout(resolve, 500));
    const timeout = new Promise<never>((_resolve, reject) => {
      deadline = setTimeout(() => reject(new Error("LISTEN/NOTIFY did not wake the worker")), 3000);
    });
    await producer.send(queue, { test: true });
    await Promise.race([delivered.promise, timeout]);
  } finally {
    clearTimeout(deadline);
    await worker.offWork(queue);
    await worker.deleteQueue(queue);
    await producer.stop();
    await worker.stop();
  }
}, 10_000);

it.each([
  ["transferred", { owner: { id: 99 } }],
  ["private", { private: true }],
  ["forked", { fork: true }],
  ["renamed", { full_name: "other/name" }],
  ["oversized", { size: 512001 }],
])("skips cloning a %s repository", async (_reason, change) => {
  const { scanId } = await fixture();
  vi.stubGlobal("fetch", async () =>
    Response.json({
      full_name: repoName,
      owner: { id: 42 },
      private: false,
      fork: false,
      size: 1,
      ...change,
    }),
  );
  await jobs.processScanJob(scanId, hmacKey);
  expect(await readScan(scanId)).toMatchObject({ status: "failed" });
  expect(scan).not.toHaveBeenCalled();
});
