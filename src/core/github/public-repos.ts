import { Octokit } from "@octokit/rest";

const MAX_REPOS = 30;

export interface PublicRepo {
  fullName: string; // "owner/repo"
  pushedAt: Date | null;
  sizeKb: number; // GitHub's reported size, for the size cap when scanning
}

interface RawRepo {
  full_name: string;
  fork: boolean;
  private: boolean;
  pushed_at?: string | null;
  size: number;
}

export class GithubError extends Error {
  readonly reason: "unauthorized" | "failed";

  constructor(reason: GithubError["reason"]) {
    super(`GitHub request failed: ${reason}`);
    this.name = "GithubError";
    this.reason = reason;
  }
}

/** Skips forks and private repos, then keeps the most recently pushed ones. */
export function pickRepos(items: readonly RawRepo[], limit = MAX_REPOS): PublicRepo[] {
  return items
    .filter((repo) => !repo.fork && !repo.private)
    .map((repo) => ({
      fullName: repo.full_name,
      pushedAt: repo.pushed_at ? new Date(repo.pushed_at) : null,
      sizeKb: repo.size,
    }))
    .sort((a, b) => (b.pushedAt?.getTime() ?? 0) - (a.pushedAt?.getTime() ?? 0))
    .slice(0, limit);
}

/** Lists the signed-in user's own public repos. The token needs no repo scope for this. */
export async function listPublicRepos(token: string): Promise<PublicRepo[]> {
  const octokit = new Octokit({ auth: token });
  const collected: RawRepo[] = [];

  try {
    const pages = octokit.paginate.iterator(octokit.rest.repos.listForAuthenticatedUser, {
      visibility: "public",
      affiliation: "owner",
      sort: "pushed",
      direction: "desc",
      per_page: 100,
    });
    for await (const page of pages) {
      collected.push(...page.data);
      // Results arrive newest-first, so once we have enough non-forks we can stop early.
      if (pickRepos(collected).length >= MAX_REPOS) break;
    }
  } catch (error) {
    // Never forward the original error object.
    const status = (error as { status?: number }).status;
    throw new GithubError(status === 401 ? "unauthorized" : "failed");
  }

  return pickRepos(collected);
}
