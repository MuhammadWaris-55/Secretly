import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ScanRepoButton } from "@/components/scan-repo-button";
import { SignOutButton } from "@/components/sign-out-button";
import { SyncReposButton } from "@/components/sync-repos-button";
import { Badge } from "@/components/ui/badge";
import { db } from "@/core/db/client";
import { repos, scans } from "@/core/db/schema";
import { getSession } from "@/lib/session";

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
    .orderBy(scans.repoId, desc(scans.createdAt));
  const scanByRepo = new Map(latestScans.map((scan) => [scan.repoId, scan]));

  return (
    <>
      <p className="text-muted-foreground">
        Signed in as {session.user.name} ({session.user.email})
      </p>
      <div className="flex flex-wrap gap-3">
        <SyncReposButton />
        <SignOutButton />
        <Link
          href="/dashboard/email-alerts"
          className="self-center text-sm underline underline-offset-4"
        >
          Email alerts
        </Link>
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Your repositories ({myRepos.length})</h2>
        {myRepos.length === 0 ? (
          <p className="text-muted-foreground">None yet. Click “Find my repositories”.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {myRepos.map((repo) => {
              const scan = scanByRepo.get(repo.id);
              const busy = scan?.status === "queued" || scan?.status === "running";
              return (
                <li key={repo.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0 space-y-1">
                    <p className="break-all">{repo.fullName}</p>
                    <Link
                      href={`/dashboard/repos/${repo.id}`}
                      aria-label={`View findings for ${repo.fullName}`}
                      className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    >
                      View findings
                    </Link>
                  </div>
                  <span className="flex items-start gap-2">
                    <Badge variant={scan?.status === "failed" ? "destructive" : "secondary"}>
                      {describeScan(scan)}
                    </Badge>
                    <ScanRepoButton repoId={repo.id} busy={busy} />
                  </span>
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
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading...</p>}>
        <Account />
      </Suspense>
    </main>
  );
}
