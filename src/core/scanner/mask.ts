const MASK_LENGTH = 12;

/**
 * Builds the only representation of a secret that is ever stored or shown.
 * Shows at most 4 leading characters, fewer for shorter secrets. The mask has a
 * fixed length, so the preview doesn't reveal how long the secret was.
 */
export function maskSecret(secret: string): string {
  const visible = secret.length >= 20 ? 4 : secret.length >= 12 ? 2 : 0;
  return secret.slice(0, visible) + "*".repeat(MASK_LENGTH);
}
