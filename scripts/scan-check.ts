import { env } from "@/core/env";
import { scanRepo } from "@/core/scanner/scan-repo";

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error("Usage: npm run scan:check -- <https://github.com/owner/repo>");

  const started = Date.now();
  const result = await scanRepo(input, env.HMAC_KEY);

  console.log(
    `Scanned ${result.repo.fullName} @ ${result.headSha?.slice(0, 7) ?? "(empty repo)"} ` +
      `in ${Date.now() - started}ms: ${result.findings.length} finding(s)`,
  );
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
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exit(1);
});
