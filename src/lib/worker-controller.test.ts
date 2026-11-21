import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { reconcileWorker } from "@/core/worker-control/reconcile";
import { wakeWorkerController } from "./worker-controller";

vi.mock("@/core/worker-control/reconcile", () => ({ reconcileWorker: vi.fn() }));
const reconcile = vi.mocked(reconcileWorker);
const globalForTest = globalThis as unknown as {
  scannerController?: { timer?: ReturnType<typeof setTimeout> };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("WORKER_AUTOSCALE", "true");
  vi.stubEnv("WORKER_VERCEL_TOKEN", "test-only-access-token");
  vi.stubEnv("WORKER_VERCEL_PROJECT_ID", "prj_test");
  vi.stubEnv("WORKER_VERCEL_TEAM_ID", "team_test");
  vi.stubEnv("WORKER_VERCEL_REGION", "iad1");
  reconcile.mockResolvedValue(600_000);
});
afterEach(() => {
  clearTimeout(globalForTest.scannerController?.timer);
  delete globalForTest.scannerController;
  reconcile.mockReset();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

it("does nothing when capacity management is disabled", async () => {
  vi.stubEnv("WORKER_AUTOSCALE", "false");
  wakeWorkerController(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(reconcile).not.toHaveBeenCalled();
});

it("coalesces dashboard refreshes and wakes immediately for a newly queued scan", async () => {
  wakeWorkerController();
  await vi.advanceTimersByTimeAsync(0);
  for (let index = 0; index < 10; index++) {
    wakeWorkerController();
    await vi.advanceTimersByTimeAsync(1000);
  }
  expect(reconcile).toHaveBeenCalledTimes(1);
  wakeWorkerController(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(reconcile).toHaveBeenCalledTimes(2);
});

it("rechecks work arriving during an in-flight stop without concurrent controllers", async () => {
  const pending = Promise.withResolvers<number>();
  reconcile.mockReturnValueOnce(pending.promise);
  wakeWorkerController();
  await vi.advanceTimersByTimeAsync(0);
  wakeWorkerController(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(reconcile).toHaveBeenCalledTimes(1);
  pending.resolve(600_000);
  await vi.advanceTimersByTimeAsync(3000);
  expect(reconcile).toHaveBeenCalledTimes(2);
});

it("retries after a temporary failure without another visitor", async () => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    reconcile.mockRejectedValueOnce(new Error("provider details must stay private"));
    wakeWorkerController();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(output).toHaveBeenCalledWith("Scanner capacity check failed", {});
  } finally {
    output.mockRestore();
  }
});
