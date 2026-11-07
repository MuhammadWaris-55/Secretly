import { describe, expect, it } from "vitest";
import type { ScanFinding } from "./report";
import { markInHead } from "./scan-repo";

function finding(fingerprint: string): ScanFinding {
  return {
    ruleId: "generic-api-key",
    filePath: "src/a.ts",
    commitSha: "a".repeat(40),
    commitDate: new Date("2024-01-01T00:00:00Z"),
    line: 1,
    maskedPreview: "Zx9Q************",
    fingerprint,
  };
}

describe("markInHead", () => {
  it("marks findings whose fingerprint is in the current code", () => {
    const result = markInHead([finding("in-code"), finding("history-only")], new Set(["in-code"]));
    expect(result.map((f) => f.inHead)).toEqual([true, false]);
  });

  it("marks everything history-only when the current code has no secrets", () => {
    expect(markInHead([finding("x")], new Set())[0]?.inHead).toBe(false);
  });

  it("does not mutate its input", () => {
    const input = [finding("x")];
    markInHead(input, new Set(["x"]));
    expect(input[0]).not.toHaveProperty("inHead");
  });
});
