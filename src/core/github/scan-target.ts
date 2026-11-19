import { z } from "zod";
import { MAX_REPO_BYTES } from "@/core/scanner/clone";
import { RepoUnavailableError, RepoTooLargeError } from "@/core/scanner/errors";
import { parseRepoUrl } from "@/core/scanner/repo-url";

const metadata = z.object({
  full_name: z.string(),
  owner: z.object({ id: z.number().int().positive() }),
  private: z.boolean(),
  fork: z.boolean(),
  size: z.number().int().nonnegative(),
});

export async function verifyScanTarget(fullName: string, ownerId: string): Promise<void> {
  const repo = parseRepoUrl(`https://github.com/${fullName}`);
  const response = await fetch(`https://api.github.com/repos/${repo.fullName}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "Secretly-scan-worker" },
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404 || (response.status >= 300 && response.status < 400)) {
    throw new RepoUnavailableError();
  }
  if (!response.ok) throw new Error("GitHub repository lookup failed");
  const data = metadata.parse(await response.json());
  if (
    data.private ||
    data.fork ||
    String(data.owner.id) !== ownerId ||
    data.full_name.toLowerCase() !== repo.fullName.toLowerCase()
  ) {
    throw new RepoUnavailableError();
  }
  if (data.size * 1024 > MAX_REPO_BYTES) throw new RepoTooLargeError(MAX_REPO_BYTES);
}
