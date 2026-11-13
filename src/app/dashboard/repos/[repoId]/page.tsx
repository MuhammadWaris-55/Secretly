import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { db } from "@/core/db/client";
import { findings, repos, scans } from "@/core/db/schema";
import { getSecretRemediation } from "@/core/playbooks/secret-remediation";
import { getSession } from "@/lib/session";

const statusLabels = {
  open: "Open",
  fixed: "Fixed",
  ignored: "Ignored",
  false_positive: "False positive",
};

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

  // Older workers used the database insert time for a new finding's lastSeenAt.
  const [latestScan] = await db
    .select({ startedAt: scans.startedAt })
    .from(scans)
    .where(
      and(eq(scans.repoId, id.data), eq(scans.userId, session.user.id), eq(scans.status, "done")),
    )
    .orderBy(desc(scans.finishedAt), desc(scans.createdAt))
    .limit(1);
  const latestScanStart = latestScan?.startedAt ?? repo.lastScannedAt;

  const entries = await db
    .select({
      id: findings.id,
      ruleId: findings.ruleId,
      filePath: findings.filePath,
      line: findings.line,
      commitSha: findings.commitSha,
      maskedPreview: findings.maskedPreview,
      inHead: findings.inHead,
      lastSeenAt: findings.lastSeenAt,
      status: findings.status,
    })
    .from(findings)
    .innerJoin(repos, eq(findings.repoId, repos.id))
    .where(ownerFilter)
    .orderBy(desc(findings.lastSeenAt), findings.id);

  return (
    <>
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Findings</h1>
        <p className="break-all text-muted-foreground">{repo.fullName}</p>
      </header>
      {entries.length === 0 ? (
        <p className="rounded-lg border p-5 text-sm">
          {repo.lastScannedAt
            ? "No secrets detected in the last completed scan."
            : "Findings will appear here after the first completed scan."}
        </p>
      ) : (
        <ul className="space-y-3">
          {entries.map((finding) => {
            const guide = getSecretRemediation(finding.ruleId);
            const location =
              latestScanStart && finding.lastSeenAt >= latestScanStart
                ? finding.inHead
                  ? "Detected in current code"
                  : "Detected in Git history only"
                : "Previously detected";

            return (
              <li key={finding.id} className="space-y-3 rounded-lg border p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold">{guide.title}</h2>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{location}</Badge>
                    <Badge variant="outline">{statusLabels[finding.status]}</Badge>
                  </div>
                </div>
                <p className="text-sm break-all text-muted-foreground">
                  <code>
                    {finding.filePath}:{finding.line}
                  </code>{" "}
                  · Commit <code>{finding.commitSha.slice(0, 7)}</code>
                </p>
                <p className="text-sm">
                  Masked preview{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">{finding.maskedPreview}</code>
                </p>
                <details className="border-t pt-3 text-sm">
                  <summary className="cursor-pointer font-medium">How to fix</summary>
                  <ol className="mt-2 list-decimal space-y-2 pl-5">
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
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <Link
        href="/dashboard"
        className="self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Back to dashboard
      </Link>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading findings…</p>}>
        <RepositoryFindings params={params} />
      </Suspense>
    </main>
  );
}
