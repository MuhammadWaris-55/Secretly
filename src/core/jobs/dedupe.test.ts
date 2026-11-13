import { describe, expect, it } from "vitest";
import { dedupeByFingerprint } from "./dedupe";

function item(fingerprint: string, commitDate: string, commitSha = "abc") {
  return { fingerprint, commitDate: new Date(commitDate), commitSha };
}

describe("dedupeByFingerprint", () => {
  it("keeps the earliest commit for a repeated fingerprint", () => {
    const result = dedupeByFingerprint([
      item("fp1", "2026-03-01T00:00:00Z", "later"),
      item("fp1", "2026-01-01T00:00:00Z", "earliest"),
      item("fp1", "2026-02-01T00:00:00Z", "middle"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.commitSha).toBe("earliest");
  });

  it("keeps different fingerprints separate", () => {
    const result = dedupeByFingerprint([
      item("fp1", "2026-01-01T00:00:00Z"),
      item("fp2", "2026-01-01T00:00:00Z"),
    ]);
    expect(result.map((r) => r.fingerprint).sort()).toEqual(["fp1", "fp2"]);
  });

  it("returns an empty list for no findings", () => {
    expect(dedupeByFingerprint([])).toEqual([]);
  });
});
