import { describe, expect, it } from "vitest";
import { maskSecret } from "./mask";

const LONG_SECRET = "Zx9Qm2Lp7Vc4Rt8Yb3Nk6Hd1Fs5Jw0Ae";

describe("maskSecret", () => {
  it("shows only the first 4 characters of a long secret", () => {
    const masked = maskSecret(LONG_SECRET);
    expect(masked.startsWith("Zx9Q")).toBe(true);
    expect(masked).not.toContain(LONG_SECRET.slice(4, 10));
  });

  it("shows fewer characters for shorter secrets", () => {
    expect(maskSecret("abcdefghijklmn").startsWith("ab*")).toBe(true);
  });

  it("shows nothing for very short secrets", () => {
    expect(maskSecret("short")).toBe("*".repeat(12));
  });

  it("does not reveal the secret's length", () => {
    expect(maskSecret("a".repeat(30)).length).toBe(maskSecret("b".repeat(80)).length);
  });
});
