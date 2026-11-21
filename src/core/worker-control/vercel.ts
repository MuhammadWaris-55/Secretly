import { z } from "zod";
import type { WorkerControlConfig } from "./config";

const DAEMON = "scan-worker";
const counts = z.union([
  z.number().int().nonnegative(),
  z.record(z.string(), z.number().int().nonnegative()),
]);
const responseSchema = z.object({
  daemons: z.array(
    z.object({
      name: z.string(),
      scope: z.object({ type: z.string(), value: z.string() }),
      config: z.object({ instances: counts, configuredInstances: counts.optional() }),
      instances: z.object({ items: z.array(z.object({ region: z.string() })) }),
    }),
  ),
});

export class WorkerScaleError extends Error {
  constructor(public readonly status?: number) {
    super("Could not update scanner capacity");
  }
}

function endpoint(config: WorkerControlConfig, suffix: string): URL {
  const url = new URL(
    `https://api.vercel.com/v1/projects/${config.WORKER_VERCEL_PROJECT_ID}/daemons${suffix}`,
  );
  url.searchParams.set("teamId", config.WORKER_VERCEL_TEAM_ID);
  return url;
}

/** Zero every known region so a leftover dashboard override cannot run extra workers. */
export async function setWorkerCapacity(
  config: WorkerControlConfig,
  desired: 0 | 1,
): Promise<void> {
  const url = endpoint(config, "");
  url.searchParams.set("scopeType", "target");
  url.searchParams.set("scopeValue", "production");
  const headers = { Authorization: `Bearer ${config.WORKER_VERCEL_TOKEN}` };
  const response = await fetch(url, {
    headers,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new WorkerScaleError(response.status);
  }
  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success) throw new WorkerScaleError();
  const daemon = parsed.data.daemons.find(
    (item) =>
      item.name === DAEMON && item.scope.type === "target" && item.scope.value === "production",
  );
  if (!daemon) throw new WorkerScaleError(404);
  // A numeric count has no region information. Fail closed rather than guessing.
  if (
    typeof daemon.config.instances === "number" ||
    typeof daemon.config.configuredInstances === "number"
  )
    throw new WorkerScaleError();
  const current = daemon.config.instances;
  const regions = new Set([
    config.WORKER_VERCEL_REGION,
    ...Object.keys(current),
    ...Object.keys(daemon.config.configuredInstances ?? {}),
    ...daemon.instances.items.map((item) => item.region),
  ]);
  const target = Object.fromEntries(
    [...regions].map((region) => [region, region === config.WORKER_VERCEL_REGION ? desired : 0]),
  );
  if ([...regions].every((region) => (current[region] ?? 0) === target[region])) return;

  const scaleUrl = endpoint(config, `/${DAEMON}/instances`);
  scaleUrl.searchParams.set("target", "production");
  const scaled = await fetch(scaleUrl, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(target),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (!scaled.ok) {
    await scaled.body?.cancel();
    throw new WorkerScaleError(scaled.status);
  }
  if (!(await scaled.json())?.ok) throw new WorkerScaleError();
}
