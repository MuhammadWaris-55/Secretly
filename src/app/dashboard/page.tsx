import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Suspense } from "react";
import { RepositoryScanRow } from "@/components/repository-scan-row";
import { SignOutButton } from "@/components/sign-out-button";
import { SyncReposButton } from "@/components/sync-repos-button";
import { db } from "@/core/db/client";
import { repos, scans } from "@/core/db/schema";
import { getSession } from "@/lib/session";
import { wakeWorkerController } from "@/lib/worker-controller";
import { ScanStatusRefresh } from "./scan-status-refresh";

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
      id: scans.id,
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
            {myRepos.map((repo) => (
              <RepositoryScanRow key={repo.id} repo={repo} scan={scanByRepo.get(repo.id)} />
            ))}
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
