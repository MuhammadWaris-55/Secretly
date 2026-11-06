import { describe, expect, it } from "vitest";
import { fingerprintSecret } from "./fingerprint";

const SECRET = "Zx9Qm2Lp7Vc4Rt8Yb3Nk6Hd1Fs5Jw0Ae";
const KEY = "test-only-hmac-key-0000000000000000";

describe("fingerprintSecret", () => {
  it("is deterministic", () => {
    expect(fingerprintSecret(SECRET, KEY)).toBe(fingerprintSecret(SECRET, KEY));
  });

  it("returns 64 hex characters and never contains the secret", () => {
    const fp = fingerprintSecret(SECRET, KEY);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(fp).not.toContain(SECRET);
  });

  it("differs for different secrets and different keys", () => {
    expect(fingerprintSecret(SECRET, KEY)).not.toBe(fingerprintSecret(`${SECRET}x`, KEY));
    expect(fingerprintSecret(SECRET, KEY)).not.toBe(fingerprintSecret(SECRET, `${KEY}x`));
  });
});
