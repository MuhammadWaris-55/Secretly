import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildChildEnv } from "./child-env";
import { CloneError } from "./errors";

const execFileAsync = promisify(execFile);

/** Returns the checked-out commit SHA, or null for an empty repository (no commits). */
export async function getHeadSha(repoDir: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", repoDir, "rev-parse", "--verify", "--quiet", "HEAD^{commit}"],
      {
        env: buildChildEnv(),
        timeout: 30_000,
        windowsHide: true,
      },
    );
    const sha = stdout.trim();
    if (/^[0-9a-f]{40}$/.test(sha)) return sha;
  } catch (error) {
    if ((error as { code?: unknown }).code === 1) {
      // An unborn HEAD is only a clean empty result if the clone has no other refs.
      const refs = await execFileAsync(
        "git",
        ["-C", repoDir, "for-each-ref", "--count=1", "--format=%(objectname)"],
        {
          env: buildChildEnv(),
          timeout: 30_000,
          windowsHide: true,
        },
      ).catch(() => {
        throw new CloneError("failed");
      });
      if (!refs.stdout.trim()) return null;
    }
  }
  throw new CloneError("failed");
}
