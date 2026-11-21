import { readWorkerControlConfig } from "@/core/worker-control/config";
import { reconcileWorker } from "@/core/worker-control/reconcile";
import { ACTIVE_CHECK_MS } from "@/core/worker-control/policy";
import { WorkerScaleError } from "@/core/worker-control/vercel";

type Controller = {
  timer?: ReturnType<typeof setTimeout>;
  running: boolean;
  again: boolean;
  lastStarted: number;
};
const globalForController = globalThis as unknown as { scannerController?: Controller };

/** Timers run on the Render Node server. Do not enable this on serverless hosting. */
export function wakeWorkerController(urgent = false): void {
  const config = readWorkerControlConfig(process.env);
  if (!config) return;
  const controller = (globalForController.scannerController ??= {
    running: false,
    again: false,
    lastStarted: 0,
  });
  // Refreshing the dashboard every three seconds must not turn into API polling.
  if (!urgent && Date.now() - controller.lastStarted < ACTIVE_CHECK_MS) return;
  if (controller.running) {
    controller.again = true;
    return;
  }
  clearTimeout(controller.timer);
  controller.timer = setTimeout(() => void tick(), 0);
  controller.timer.unref();

  async function tick() {
    controller.running = true;
    controller.lastStarted = Date.now();
    controller.again = false;
    let nextMs = ACTIVE_CHECK_MS;
    try {
      nextMs = await reconcileWorker(config!);
    } catch (error) {
      // No provider bodies, URLs, tokens or database errors reach the logs.
      console.error(
        "Scanner capacity check failed",
        error instanceof WorkerScaleError ? { status: error.status } : {},
      );
    } finally {
      controller.running = false;
      controller.timer = setTimeout(() => void tick(), controller.again ? 3000 : nextMs);
      controller.timer.unref();
    }
  }
}
