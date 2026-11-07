import { describe, expect, it } from "vitest";
import { GitleaksError } from "./errors";
import { fingerprintSecret } from "./fingerprint";
import { parseFingerprints, parseGitleaksReport } from "./report";

const FAKE_SECRET = "Zx9Qm2Lp7Vc4Rt8Yb3Nk6Hd1Fs5Jw0Ae";
const KEY = "test-only-hmac-key-0000000000000000";

function entry(overrides: Record<string, unknown> = {}) {
  return {
    RuleID: "generic-api-key",
    File: "src/config.ts",
    Commit: "a".repeat(40),
    StartLine: 12,
    Date: "2024-05-01T10:00:00Z",
    Secret: FAKE_SECRET,
    Match: `apiKey = "${FAKE_SECRET}"`,
    Email: "dev@example.com",
    Author: "Dev",
    Message: "add config",
    ...overrides,
  };
}

describe("parseGitleaksReport", () => {
  it("converts an entry into a masked, fingerprinted finding", () => {
    const [finding] = parseGitleaksReport(JSON.stringify([entry()]), KEY);
    expect(finding).toEqual({
      ruleId: "generic-api-key",
      filePath: "src/config.ts",
      commitSha: "a".repeat(40),
      commitDate: new Date("2024-05-01T10:00:00Z"),
      line: 12,
      maskedPreview: expect.stringMatching(/^Zx9Q\*+$/),
      fingerprint: fingerprintSecret(FAKE_SECRET, KEY),
    });
  });

  it("never lets the raw secret, match text or author details into the output", () => {
    const output = JSON.stringify(parseGitleaksReport(JSON.stringify([entry()]), KEY));
    expect(output).not.toContain(FAKE_SECRET);
    expect(output).not.toContain("dev@example.com");
    expect(output).not.toContain("add config");
  });

  it("collapses the same secret across commits, keeping the earliest", () => {
    const report = [
      entry({ Commit: "b".repeat(40), Date: "2024-06-01T00:00:00Z" }),
      entry({ Commit: "c".repeat(40), Date: "2024-03-01T00:00:00Z" }),
    ];
    const findings = parseGitleaksReport(JSON.stringify(report), KEY);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.commitSha).toBe("c".repeat(40));
  });

  it("keeps different secrets as separate findings", () => {
    const report = [entry(), entry({ Secret: `${FAKE_SECRET}other` })];
    expect(parseGitleaksReport(JSON.stringify(report), KEY)).toHaveLength(2);
  });

  it.each(["", "null", "[]"])("treats %j as no findings", (raw) => {
    expect(parseGitleaksReport(raw, KEY)).toEqual([]);
  });

  it("throws a generic error on invalid JSON, without echoing the input", () => {
    const broken = `[{"Secret":"${FAKE_SECRET}"`;
    expect(() => parseGitleaksReport(broken, KEY)).toThrow(GitleaksError);
    try {
      parseGitleaksReport(broken, KEY);
    } catch (error) {
      expect((error as Error).message).not.toContain(FAKE_SECRET);
    }
  });

  it("throws on an unexpected report shape", () => {
    expect(() => parseGitleaksReport(JSON.stringify([{ RuleID: 5 }]), KEY)).toThrow(GitleaksError);
  });

  it("throws on an invalid date", () => {
    const report = [entry({ Date: "not a date" })];
    expect(() => parseGitleaksReport(JSON.stringify(report), KEY)).toThrow(GitleaksError);
  });
});

describe("parseFingerprints", () => {
  it("returns the HMAC fingerprint of each secret and nothing else", () => {
    const report = [{ Secret: FAKE_SECRET, File: "a.ts", Commit: "", Date: "" }];
    const result = parseFingerprints(JSON.stringify(report), KEY);
    expect([...result]).toEqual([fingerprintSecret(FAKE_SECRET, KEY)]);
    expect(JSON.stringify([...result])).not.toContain(FAKE_SECRET);
  });

  it("deduplicates identical secrets", () => {
    const report = [{ Secret: FAKE_SECRET }, { Secret: FAKE_SECRET }];
    expect(parseFingerprints(JSON.stringify(report), KEY).size).toBe(1);
  });

  it.each(["", "null", "[]"])("treats %j as no secrets", (raw) => {
    expect(parseFingerprints(raw, KEY).size).toBe(0);
  });

  it("throws a generic error on invalid JSON", () => {
    expect(() => parseFingerprints("{nope", KEY)).toThrow(GitleaksError);
  });
});
