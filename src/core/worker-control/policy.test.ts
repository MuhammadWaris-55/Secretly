import { describe, expect, it } from "vitest";
import { ACTIVE_CHECK_MS, RECOVERY_CHECK_MS, workerDecision } from "./policy";

const idle = {
  now: 1_000_000,
  lastBusyAt: 0,
  idleMs: 300_000,
  activeScans: false,
  wasBusy: false,
  nextEmailAt: null,
};

describe("worker idle policy", () => {
  it("stops when idle and reduces database checks while stopped", () => {
    expect(workerDecision(idle)).toMatchObject({ desired: 0, nextCheckMs: RECOVERY_CHECK_MS });
  });
  it("never stops with an unfinished scan, including delayed scan retries", () => {
    expect(workerDecision({ ...idle, activeScans: true })).toMatchObject({
      desired: 1,
      lastBusyAt: idle.now,
      nextCheckMs: ACTIVE_CHECK_MS,
    });
  });
  it("allows a full warm window after noticing that work finished", () => {
    const finished = workerDecision({ ...idle, wasBusy: true });
    expect(finished.desired).toBe(1);
    expect(
      workerDecision({ ...idle, lastBusyAt: finished.lastBusyAt, now: idle.now + 299_999 }).desired,
    ).toBe(1);
    expect(
      workerDecision({ ...idle, lastBusyAt: finished.lastBusyAt, now: idle.now + 300_000 }).desired,
    ).toBe(0);
  });
  it("wakes for due emails without needing another scan", () => {
    expect(workerDecision({ ...idle, nextEmailAt: idle.now }).desired).toBe(1);
  });
  it("can sleep between delayed email retries and checks again when the retry is due", () => {
    expect(workerDecision({ ...idle, nextEmailAt: idle.now + 60_000 })).toMatchObject({
      desired: 0,
      nextCheckMs: 60_000,
    });
  });
});
