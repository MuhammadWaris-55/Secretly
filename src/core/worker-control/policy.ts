export const ACTIVE_CHECK_MS = 15_000;
export const RECOVERY_CHECK_MS = 10 * 60_000;

export function workerDecision(input: {
  now: number;
  lastBusyAt: number;
  idleMs: number;
  activeScans: boolean;
  wasBusy: boolean;
  nextEmailAt: number | null;
}) {
  const busy = input.activeScans || (input.nextEmailAt !== null && input.nextEmailAt <= input.now);
  const lastBusyAt = busy || input.wasBusy ? input.now : input.lastBusyAt;
  const desired = busy || input.now - lastBusyAt < input.idleMs ? 1 : 0;
  const nextCheckMs =
    desired === 1
      ? ACTIVE_CHECK_MS
      : Math.max(1000, Math.min(RECOVERY_CHECK_MS, (input.nextEmailAt ?? Infinity) - input.now));
  return { desired: desired as 0 | 1, busy, lastBusyAt, nextCheckMs };
}
