import { env } from "@/core/env";
import { withClonedRepo } from "@/core/scanner/clone";
import { scanGitHistory } from "@/core/scanner/gitleaks";
import { parseRepoUrl } from "@/core/scanner/repo-url";

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error("Usage: npm run scan:check -- <https://github.com/owner/repo>");

  const repo = parseRepoUrl(input);
  const started = Date.now();
  const findings = await withClonedRepo(repo, (repoDir) => scanGitHistory(repoDir, env.HMAC_KEY));

  console.log(
    `Scanned ${repo.fullName} in ${Date.now() - started}ms: ${findings.length} finding(s)`,
  );
  if (findings.length > 0) {
    console.table(
      findings.map((f) => ({
        rule: f.ruleId,
        file: f.filePath,
        commit: f.commitSha.slice(0, 7),
        line: f.line,
        preview: f.maskedPreview,
      })),
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exit(1);
});
