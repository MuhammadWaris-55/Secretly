import { z } from "zod";
import { GitleaksError } from "./errors";
import { fingerprintSecret } from "./fingerprint";
import { maskSecret } from "./mask";

/** A finding in the only shape the rest of the app ever sees: no raw secret. */
export interface ScanFinding {
  ruleId: string;
  filePath: string;
  commitSha: string;
  commitDate: Date;
  line: number;
  maskedPreview: string;
  fingerprint: string;
}

// Only the fields we need. Zod drops every other key (Match, Email, Author, Message...),
// so they can't be copied into our output by accident.
const reportSchema = z.array(
  z.object({
    RuleID: z.string(),
    File: z.string(),
    Commit: z.string(),
    StartLine: z.number().int(),
    Date: z.string(),
    Secret: z.string().min(1),
  }),
);

/**
 * Converts Gitleaks' JSON report into safe findings. The raw secret exists only inside
 * this function: it is masked and fingerprinted, then dropped.
 *
 * Errors are deliberately generic. JSON.parse messages quote part of the input, which
 * could contain a secret, so we never let them escape.
 */
export function parseGitleaksReport(raw: string, hmacKey: string): ScanFinding[] {
  const trimmed = raw.trim();
  // Gitleaks may print "[]", "null" or nothing at all when there are no findings.
  if (trimmed === "" || trimmed === "null") return [];

  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    throw new GitleaksError("bad_report");
  }

  const parsed = reportSchema.safeParse(json);
  if (!parsed.success) throw new GitleaksError("bad_report");

  // The database allows one row per (repo, fingerprint), so the same secret appearing in
  // many commits or files collapses into one finding. We keep the earliest commit,
  // because that's when it was first leaked.
  const byFingerprint = new Map<string, ScanFinding>();
  for (const entry of parsed.data) {
    const commitDate = new Date(entry.Date);
    if (Number.isNaN(commitDate.getTime())) throw new GitleaksError("bad_report");

    const finding: ScanFinding = {
      ruleId: entry.RuleID,
      filePath: entry.File,
      commitSha: entry.Commit,
      commitDate,
      line: entry.StartLine,
      maskedPreview: maskSecret(entry.Secret),
      fingerprint: fingerprintSecret(entry.Secret, hmacKey),
    };

    const existing = byFingerprint.get(finding.fingerprint);
    if (!existing || finding.commitDate < existing.commitDate) {
      byFingerprint.set(finding.fingerprint, finding);
    }
  }

  return [...byFingerprint.values()].sort(
    (a, b) =>
      a.commitDate.getTime() - b.commitDate.getTime() || a.filePath.localeCompare(b.filePath),
  );
}

const fingerprintReportSchema = z.array(z.object({ Secret: z.string().min(1) }));

/**
 * For the working-tree scan we only need to know WHICH secrets are present, so this
 * returns fingerprints and nothing else. Same rules as above: the raw secret never
 * leaves this function, and errors stay generic.
 */
export function parseFingerprints(raw: string, hmacKey: string): Set<string> {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "null") return new Set();

  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    throw new GitleaksError("bad_report");
  }

  const parsed = fingerprintReportSchema.safeParse(json);
  if (!parsed.success) throw new GitleaksError("bad_report");

  return new Set(parsed.data.map((entry) => fingerprintSecret(entry.Secret, hmacKey)));
}
