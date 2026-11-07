import { env } from "@/core/env";
import { scanRepo } from "@/core/scanner/scan-repo";

interface Summary {
  repo: string;
  ms: number;
  findings: number;
  inHead: number;
  status: string;
}

async function main() {
  const inputs = process.argv.slice(2);
  if (inputs.length === 0) {
    throw new Error("Usage: npm run scan:check -- <repo-url> [<repo-url> ...]");
  }

  const summaries: Summary[] = [];
  const ruleCounts = new Map<string, number>();

  // One repo at a time: scans are CPU and disk heavy, and sequential output is easier to read.
  for (const input of inputs) {
    const started = Date.now();
    try {
      const result = await scanRepo(input, env.HMAC_KEY);
      const ms = Date.now() - started;

      console.log(`\n${result.repo.fullName} @ ${result.headSha?.slice(0, 7) ?? "(empty)"}`);
      if (result.findings.length > 0) {
        console.table(
          result.findings.map((f) => ({
            rule: f.ruleId,
            file: f.filePath,
            commit: f.commitSha.slice(0, 7),
            line: f.line,
            preview: f.maskedPreview,
            inHead: f.inHead,
          })),
        );
      }

      for (const f of result.findings) {
        ruleCounts.set(f.ruleId, (ruleCounts.get(f.ruleId) ?? 0) + 1);
      }
      summaries.push({
        repo: result.repo.fullName,
        ms,
        findings: result.findings.length,
        inHead: result.findings.filter((f) => f.inHead).length,
        status: "ok",
      });
    } catch (error) {
      summaries.push({
        repo: input,
        ms: Date.now() - started,
        findings: 0,
        inHead: 0,
        status: error instanceof Error ? error.name : "error",
      });
    }
  }

  console.log("\nSummary");
  console.table(summaries);

  if (ruleCounts.size > 0) {
    console.log("Findings per rule (noisy rules show up here first)");
    console.table(
      [...ruleCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([rule, count]) => ({ rule, count })),
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exit(1);
});
