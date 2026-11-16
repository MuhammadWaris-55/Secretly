import { and, desc, eq, sql } from "drizzle-orm";
import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { db } from "@/core/db/client";
import { findings, repos, scans } from "@/core/db/schema";
import { getSecretRemediation } from "@/core/playbooks/secret-remediation";
import { getSession } from "@/lib/session";
import { FindingStatusControl } from "./finding-status-control";

type Props = { params: Promise<{ repoId: string }> };

async function RepositoryFindings({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/");

  const id = z.uuid().safeParse((await params).repoId);
  if (!id.success) notFound();

  const ownerFilter = and(eq(repos.id, id.data), eq(repos.userId, session.user.id));
  const [repo] = await db
    .select({ fullName: repos.fullName, lastScannedAt: repos.lastScannedAt })
    .from(repos)
    .where(ownerFilter);
  if (!repo) notFound();

  const latestScan = db
    .select({ id: scans.id, startedAt: scans.startedAt })
    .from(scans)
    .where(
      and(eq(scans.repoId, id.data), eq(scans.userId, session.user.id), eq(scans.status, "done")),
    )
    .orderBy(desc(scans.finishedAt), desc(scans.createdAt), desc(scans.id))
    .limit(1)
    .as("latest_scan");

  const entries = await db
    .select({
      id: findings.id,
      ruleId: findings.ruleId,
      filePath: findings.filePath,
      line: findings.line,
      commitSha: findings.commitSha,
      maskedPreview: findings.maskedPreview,
      inHead: findings.inHead,
      seenInLatestScan: sql<boolean>`coalesce(
        case when ${findings.lastSeenScanId} is not null
          then ${findings.lastSeenScanId} = ${latestScan.id}
          else ${findings.lastSeenAt} >= coalesce(${latestScan.startedAt}, ${repos.lastScannedAt})
        end, false)`,
      status: findings.status,
    })
    .from(findings)
    .innerJoin(repos, eq(findings.repoId, repos.id))
    .leftJoin(latestScan, sql`true`)
    .where(ownerFilter)
    .orderBy(desc(findings.lastSeenAt), findings.id);

  return (
    <>
      <header className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Findings</h1>
        <p className="text-sm wrap-anywhere text-muted-foreground">{repo.fullName}</p>
      </header>
      {entries.length === 0 ? (
        <p className="secretly-workspace-panel p-5 text-sm">
          {repo.lastScannedAt
            ? "No secrets detected in the last completed scan."
            : "Findings will appear here after the first completed scan."}
        </p>
      ) : (
        <ul className="space-y-4">
          {entries.map((finding) => {
            const guide = getSecretRemediation(finding.ruleId);
            const location = finding.seenInLatestScan
              ? finding.inHead
                ? "Detected in current code"
                : "Detected in Git history only"
              : "Previously detected";

            return (
              <li key={finding.id} className="secretly-workspace-panel space-y-4 p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold tracking-tight">{guide.title}</h2>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant="secondary"
                      className="secretly-scan-state"
                      data-state={
                        finding.seenInLatestScan && finding.inHead ? "findings" : undefined
                      }
                    >
                      {location}
                    </Badge>
                  </div>
                </div>
                <dl className="secretly-workspace-inset grid gap-3 p-3.5 text-sm sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-xs text-[#bdc3b5]">Location</dt>
                    <dd className="mt-1 wrap-anywhere">
                      <code>
                        {finding.filePath}:{finding.line}
                      </code>
                    </dd>
                    <dd className="mt-1 text-xs text-[#bdc3b5]">
                      Commit <code>{finding.commitSha.slice(0, 7)}</code>
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-[#bdc3b5]">Masked preview</dt>
                    <dd className="mt-1 wrap-anywhere text-[#d9ef93]">
                      <code>{finding.maskedPreview}</code>
                    </dd>
                  </div>
                </dl>
                <details className="group text-sm">
                  <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm font-semibold [&::-webkit-details-marker]:hidden">
                    <ChevronRight
                      size={16}
                      aria-hidden="true"
                      className="group-open:rotate-90 motion-safe:transition-transform"
                    />{" "}
                    How to fix
                  </summary>
                  <ol className="mt-3 list-decimal space-y-2 pl-6 leading-relaxed text-muted-foreground">
                    <li>{guide.rotate}</li>
                    <li>
                      Remove the credential from the code and load its replacement from a secret
                      manager or environment variable. If you need to remove it from Git history,
                      coordinate the rewrite with your collaborators.
                    </li>
                    <li>
                      Run another scan from the dashboard to check whether the credential is still
                      detected in the code or history.
                    </li>
                  </ol>
                </details>
                <FindingStatusControl
                  repoId={id.data}
                  findingId={finding.id}
                  status={finding.status}
                />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export default function RepositoryFindingsPage({ params }: Props) {
  return (
    <main className="secretly-workspace-width flex max-w-3xl flex-col gap-7 py-10 sm:py-14">
      <Link
        href="/dashboard"
        className="secretly-workspace-link inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground"
      >
        <ArrowLeft size={15} aria-hidden="true" /> Back to repositories
      </Link>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading findings…</p>}>
        <RepositoryFindings params={params} />
      </Suspense>
    </main>
  );
}
