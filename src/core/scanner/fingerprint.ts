import { createHmac } from "node:crypto";

/**
 * HMAC-SHA256 of the secret, as hex. Lets us recognize the same secret across scans
 * without storing it. The key is passed in (from env) so this module stays pure.
 */
export function fingerprintSecret(secret: string, key: string): string {
  return createHmac("sha256", key).update(secret, "utf8").digest("hex");
}
