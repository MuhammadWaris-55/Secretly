import { describe, expect, it } from "vitest";
import { SCAN_DEAD_LETTER_QUEUE, SCAN_QUEUE, scanJobSchema } from "./queues";

describe("scanJobSchema", () => {
  it("accepts a scan id", () => {
    const scanId = "3f2b8c1e-5d4a-4f6b-9a7c-1e2d3c4b5a69";
    expect(scanJobSchema.parse({ scanId })).toEqual({ scanId });
  });

  it("rejects an id that is not a uuid", () => {
    expect(scanJobSchema.safeParse({ scanId: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects extra fields so a payload can never carry a repo URL", () => {
    const result = scanJobSchema.safeParse({
      scanId: "3f2b8c1e-5d4a-4f6b-9a7c-1e2d3c4b5a69",
      repoUrl: "https://example.com/x.git",
    });
    expect(result.success).toBe(false);
  });
});

describe("queue names", () => {
  it("keeps the dead-letter queue separate from the main queue", () => {
    expect(SCAN_DEAD_LETTER_QUEUE).not.toBe(SCAN_QUEUE);
  });
});
