import { withClonedRepo, type CloneOptions } from "./clone";
import { getHeadSha } from "./git";
import { scanGitHistory, scanWorkingTree, type GitleaksOptions } from "./gitleaks";
import { parseRepoUrl, type RepoRef } from "./repo-url";
import type { ScanFinding } from "./report";

export interface RepoFinding extends ScanFinding {
  /** true: the secret is still in the current code. false: it only exists in history. */
  inHead: boolean;
}

export interface RepoScanResult {
  repo: RepoRef;
  /** The commit that was scanned, or null for an empty repo. */
  headSha: string | null;
  findings: RepoFinding[];
}

export interface ScanRepoOptions {
  clone?: CloneOptions;
  gitleaks?: GitleaksOptions;
}

/** Pure: flags each finding by whether its fingerprint is present in the current code. */
export function markInHead(
  findings: ScanFinding[],
  headFingerprints: ReadonlySet<string>,
): RepoFinding[] {
  return findings.map((finding) => ({
    ...finding,
    inHead: headFingerprints.has(finding.fingerprint),
  }));
}

/**
 * The whole scan: validate the URL, clone into a temp dir, scan history and current
 * code, delete the clone. Returns masked, fingerprinted findings only.
 */
export async function scanRepo(
  input: string,
  hmacKey: string,
  options: ScanRepoOptions = {},
): Promise<RepoScanResult> {
  const repo = parseRepoUrl(input);

  return withClonedRepo(
    repo,
    async (repoDir) => {
      const headSha = await getHeadSha(repoDir);
      if (headSha === null) return { repo, headSha, findings: [] }; // empty repo: nothing to scan

      const history = await scanGitHistory(repoDir, hmacKey, options.gitleaks);
      const headFingerprints = await scanWorkingTree(repoDir, hmacKey, options.gitleaks);

      return { repo, headSha, findings: markInHead(history, headFingerprints) };
    },
    options.clone,
  );
}
