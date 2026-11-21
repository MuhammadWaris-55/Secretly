import { desc, eq } from "drizzle-orm";
import { ArrowUpRight, GitFork } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Suspense } from "react";
import { ScanRepoButton } from "@/components/scan-repo-button";
import { SignOutButton } from "@/components/sign-out-button";
import { SyncReposButton } from "@/components/sync-repos-button";
import { Badge } from "@/components/ui/badge";
import { db } from "@/core/db/client";
import { repos, scans } from "@/core/db/schema";
import { getSession } from "@/lib/session";
import { wakeWorkerController } from "@/lib/worker-controller";
import { ScanStatusRefresh } from "./scan-status-refresh";

type ScanState = { status: "queued" | "running" | "done" | "failed"; findingsCount: number };

function describeScan(scan: ScanState | undefined): string {
  if (!scan) return "Not scanned";
  if (scan.status === "done") {
    if (scan.findingsCount === 0) return "No secrets detected";
    return scan.findingsCount === 1 ? "1 finding" : `${scan.findingsCount} findings`;
  }
  return scan.status.charAt(0).toUpperCase() + scan.status.slice(1);
}

async function Account() {
  const session = await getSession();
  if (!session) redirect("/");
  const userId = session.user.id;

  const myRepos = await db
    .select({ id: repos.id, fullName: repos.fullName })
    .from(repos)
    .where(eq(repos.userId, userId))
    .orderBy(repos.fullName);

  // Newest scan per repo, for this user only.
  const latestScans = await db
    .selectDistinctOn([scans.repoId], {
      repoId: scans.repoId,
      status: scans.status,
      findingsCount: scans.findingsCount,
    })
    .from(scans)
    .where(eq(scans.userId, userId))
    .orderBy(scans.repoId, desc(scans.createdAt), desc(scans.id));
  const scanByRepo = new Map(latestScans.map((scan) => [scan.repoId, scan]));
  const hasActiveScans = myRepos.some(({ id }) => {
    const status = scanByRepo.get(id)?.status;
    return status === "queued" || status === "running";
  });
  if (hasActiveScans) after(() => wakeWorkerController());

  return (
    <>
      <ScanStatusRefresh active={hasActiveScans} />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Repositories</h1>
          <p className="mt-2 text-sm wrap-anywhere text-muted-foreground">
            Signed in as {session.user.name}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <SyncReposButton />
          <SignOutButton />
        </div>
      </header>
      <section className="flex flex-col gap-3" aria-labelledby="repo-list-heading">
        <h2 id="repo-list-heading" className="text-lg font-semibold tracking-tight">
          Your public repositories{" "}
          <span className="ml-1 text-sm text-muted-foreground tabular-nums">{myRepos.length}</span>
        </h2>
        <p className="text-xs text-muted-foreground">
          Scans update automatically. The first scan after inactivity may take a little longer while
          the scanner starts.
        </p>
        {myRepos.length === 0 ? (
          <p className="secretly-workspace-panel p-5 text-sm text-muted-foreground">
            Click “Find my repositories” to get started.
          </p>
        ) : (
          <ul className="secretly-workspace-panel divide-y overflow-hidden">
            {myRepos.map((repo) => {
              const scan = scanByRepo.get(repo.id);
              const busy = scan?.status === "queued" || scan?.status === "running";
              const state =
                scan?.status === "done" && scan.findingsCount > 0 ? "findings" : scan?.status;
              return (
                <li
                  key={repo.id}
                  className="secretly-workspace-row flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4 text-sm sm:flex-nowrap sm:px-5"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <GitFork
                      size={16}
                      className="mt-0.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 space-y-1">
                      <p className="font-semibold wrap-anywhere">{repo.fullName}</p>
                      <Link
                        href={`/dashboard/repos/${repo.id}`}
                        aria-label={`View findings for ${repo.fullName}`}
                        className="secretly-workspace-link inline-flex items-center gap-1 text-xs text-muted-foreground"
                      >
                        View findings <ArrowUpRight size={12} aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div
                      role="status"
                      aria-label={`Scan status for ${repo.fullName}`}
                      className="flex min-h-7 items-center"
                    >
                      <Badge
                        key={state ?? "unscanned"}
                        variant="secondary"
                        data-state={state}
                        className="secretly-scan-state"
                      >
                        {busy && (
                          <span
                            aria-hidden="true"
                            className={
                              scan.status === "running"
                                ? "size-2 rounded-full border border-current border-r-transparent motion-safe:animate-spin"
                                : "size-1.5 rounded-full bg-current opacity-60"
                            }
                          />
                        )}
                        {describeScan(scan)}
                      </Badge>
                    </div>
                    <ScanRepoButton repoId={repo.id} busy={busy} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

export default function DashboardPage() {
  return (
    <main className="secretly-workspace-width flex flex-col gap-8 py-10 sm:py-14">
      <Suspense fallback={<p className="text-muted-foreground">Loading...</p>}>
        <Account />
      </Suspense>
    </main>
  );
}
