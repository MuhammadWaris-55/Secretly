/**
 * One secret can appear in many commits and files. The database allows one finding
 * per (repo, fingerprint), and Postgres rejects an upsert that touches the same row
 * twice, so we keep one finding per fingerprint: the earliest commit.
 */
export function dedupeByFingerprint<T extends { fingerprint: string; commitDate: Date }>(
  items: readonly T[],
): T[] {
  const earliest = new Map<string, T>();
  for (const item of items) {
    const current = earliest.get(item.fingerprint);
    if (!current || item.commitDate.getTime() < current.commitDate.getTime()) {
      earliest.set(item.fingerprint, item);
    }
  }
  return [...earliest.values()];
}
