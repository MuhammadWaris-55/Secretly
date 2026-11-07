import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildChildEnv } from "./child-env";

const execFileAsync = promisify(execFile);

/** Returns the checked-out commit SHA, or null for an empty repository (no commits). */
export async function getHeadSha(repoDir: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoDir, "rev-parse", "HEAD"], {
      env: buildChildEnv(),
      timeout: 30_000,
      windowsHide: true,
    });
    const sha = stdout.trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}
