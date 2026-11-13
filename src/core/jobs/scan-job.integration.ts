import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { isUniqueViolation } from "@/core/db/errors";
import { findings, repos, scans } from "@/core/db/schema";
import { CloneError, RepoTooLargeError } from "@/core/scanner/errors";
import { scanRepo, type RepoScanResult } from "@/core/scanner/scan-repo";
import { createWorkerBoss, ensureQueues } from "./boss";
import { SCAN_FAILED_AFTER_RETRIES, ScanAttemptError } from "./failure";
import { SCAN_DEAD_LETTER_QUEUE, SCAN_QUEUE, scanJobSchema } from "./queues";

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

afterEach(async () => {
  scan.mockReset();
  for (const id of createdRepos.splice(0)) {
    await database.db.delete(repos).where(eq(repos.id, id));
  }
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
