import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvValidationError } from "@/core/env-validation-error";
import { readWorkerControlConfig, type WorkerControlConfig } from "./config";
import { setWorkerCapacity, WorkerScaleError } from "./vercel";

const config: WorkerControlConfig = {
  WORKER_VERCEL_TOKEN: "test-only-access-token",
  WORKER_VERCEL_PROJECT_ID: "prj_test",
  WORKER_VERCEL_TEAM_ID: "team_test",
  WORKER_VERCEL_REGION: "iad1",
  WORKER_IDLE_SECONDS: 300,
};
function snapshot(instances: Record<string, number> = {}) {
  return {
    daemons: [
      {
        name: "scan-worker",
        scope: { type: "target", value: "production" },
        config: { instances, configuredInstances: { fra1: 0 } },
        instances: { items: [{ region: "fra1" }] },
      },
    ],
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("optional controller configuration", () => {
  it("is disabled by default so local work cannot change production capacity", () => {
    expect(readWorkerControlConfig({})).toBeNull();
  });
  it("rejects incomplete opt-in configuration without exposing values", () => {
    expect(() => readWorkerControlConfig({ WORKER_AUTOSCALE: "true" })).toThrow(EnvValidationError);
  });
});

describe("Vercel daemon capacity", () => {
  it("starts one production instance and zeros other regions", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(snapshot({ fra1: 1 })))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    await setWorkerCapacity(config, 1);
    const [url, options] = fetcher.mock.calls[1]!;
    expect(String(url)).toContain(
      "/daemons/scan-worker/instances?teamId=team_test&target=production",
    );
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body)).toEqual({ iad1: 1, fra1: 0 });
  });
  it("avoids a scale request when already at the desired capacity", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(snapshot({ iad1: 1 })));
    vi.stubGlobal("fetch", fetcher);
    await setWorkerCapacity(config, 1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("stops all known regions", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(snapshot({ iad1: 1, fra1: 1 })))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    await setWorkerCapacity(config, 0);
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({ iad1: 0, fra1: 0 });
  });
  it("never confuses a preview daemon with production", async () => {
    const data = snapshot();
    data.daemons[0]!.scope.value = "preview";
    const fetcher = vi.fn().mockResolvedValue(Response.json(data));
    vi.stubGlobal("fetch", fetcher);
    await expect(setWorkerCapacity(config, 1)).rejects.toThrow(WorkerScaleError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("surfaces provider failures without retaining provider bodies or credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("sensitive provider response", { status: 403 })),
    );
    await expect(setWorkerCapacity(config, 1)).rejects.toMatchObject({
      status: 403,
      message: "Could not update scanner capacity",
    });
  });
  it("rejects unsuccessful scale acknowledgements", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(snapshot()))
        .mockResolvedValueOnce(Response.json({ ok: false })),
    );
    await expect(setWorkerCapacity(config, 1)).rejects.toThrow(WorkerScaleError);
  });
});
