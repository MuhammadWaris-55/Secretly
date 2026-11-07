import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { withClonedRepo } from "@/core/scanner/clone";
import { parseRepoUrl } from "@/core/scanner/repo-url";

const execFileAsync = promisify(execFile);

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error("Usage: npm run clone:check -- <https://github.com/owner/repo>");

  const repo = parseRepoUrl(input);
  let usedDir = "";
  const started = Date.now();

  try {
    const commits = await withClonedRepo(repo, async (dir) => {
      usedDir = dir;
      const { stdout } = await execFileAsync("git", ["-C", dir, "rev-list", "--count", "HEAD"]);
      return stdout.trim();
    });
    console.log(`Cloned ${repo.fullName}: ${commits} commits in ${Date.now() - started}ms`);
  } catch (error) {
    console.log("Failed:", error instanceof Error ? `${error.name}: ${error.message}` : error);
  }

  // The clone lives in <tmp>/secretly-xxxx/repo; the parent folder is what we delete.
  console.log(
    "Temp directory removed:",
    usedDir === "" ? "n/a (never created a repo dir)" : !existsSync(usedDir),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
