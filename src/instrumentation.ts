export async function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.WORKER_AUTOSCALE === "true") {
    const { wakeWorkerController } = await import("@/lib/worker-controller");
    wakeWorkerController();
  }
}
