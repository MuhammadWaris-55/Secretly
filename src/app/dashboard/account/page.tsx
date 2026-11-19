import { eq } from "drizzle-orm";
import { ArrowRight, Bell, ChevronDown, FolderGit2, KeyRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { db } from "@/core/db/client";
import { emailAlertSubscriptions, repos, user } from "@/core/db/schema";
import { getSession } from "@/lib/session";
import { DeleteAccountForm } from "./delete-account-form";

async function AccountSettings() {
  const session = await getSession();
  if (!session) redirect("/");

  const [profile] = await db
    .select({
      name: user.name,
      email: user.email,
      verified: user.emailVerified,
      joined: user.createdAt,
      subscribed: emailAlertSubscriptions.userId,
      repoCount: db.$count(repos, eq(repos.userId, user.id)),
    })
    .from(user)
    .leftJoin(emailAlertSubscriptions, eq(emailAlertSubscriptions.userId, user.id))
    .where(eq(user.id, session.user.id));
  if (!profile) redirect("/");

  const displayName = profile.name.trim() || profile.email;
  const joined = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(profile.joined);

  return (
    <>
      <section className="secretly-workspace-panel overflow-hidden" aria-labelledby="profile-name">
        <header className="flex items-center gap-4 bg-[#22261e] p-5 text-[#f4f5ee] sm:p-6">
          <span
            aria-hidden="true"
            className="grid size-14 shrink-0 place-items-center rounded-xl bg-[#dfedb4] text-3xl font-semibold text-[#293320]"
          >
            {Array.from(displayName)[0]?.toUpperCase()}
          </span>
          <div className="min-w-0">
            <h2 id="profile-name" className="text-2xl font-semibold tracking-tight wrap-anywhere">
              {displayName}
            </h2>
            <p className="mt-1 text-sm text-[#ced2c5]">Member since {joined}</p>
          </div>
        </header>
        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Account email</h3>
            <p className="mt-1 wrap-anywhere">{profile.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {profile.verified ? "Verified email" : "Email unverified"}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Current session</h3>
              <p className="mt-1 flex items-center gap-2">
                <KeyRound size={15} aria-hidden="true" /> GitHub sign-in
              </p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </section>

      <section aria-labelledby="workspace-heading">
        <h2 id="workspace-heading" className="mb-3 text-lg font-semibold tracking-tight">
          Your workspace
        </h2>
        <div className="secretly-workspace-panel divide-y">
          <Link
            href="/dashboard"
            className="secretly-workspace-row flex items-center gap-4 rounded-t-xl p-5 sm:px-6"
          >
            <FolderGit2 size={20} aria-hidden="true" />
            <div className="flex-1">
              <p className="font-semibold">Repositories</p>
              <p className="text-sm text-muted-foreground">
                {profile.repoCount === 0
                  ? "Find your public repositories on GitHub"
                  : `${profile.repoCount} imported ${profile.repoCount === 1 ? "repository" : "repositories"}`}
              </p>
            </div>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link
            href="/dashboard/email-alerts"
            className="secretly-workspace-row flex items-center gap-4 rounded-b-xl p-5 sm:px-6"
          >
            <Bell size={20} aria-hidden="true" />
            <div className="flex-1">
              <p className="font-semibold">Email alerts</p>
              <p className="text-sm text-muted-foreground">
                {profile.subscribed ? "On for new findings" : "Off"}
              </p>
            </div>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <details className="group border-t pt-4">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-sm py-1 text-sm font-medium text-destructive">
          Delete your Secretly account
          <ChevronDown size={16} className="group-open:rotate-180" aria-hidden="true" />
        </summary>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
          This permanently deletes your Secretly account, imported repository records, scan history,
          findings, and pending alerts. It signs you out on every device. Your GitHub account and
          repositories stay intact.
        </p>
        <DeleteAccountForm />
      </details>
    </>
  );
}

export default function AccountPage() {
  return (
    <main className="secretly-workspace-width flex max-w-3xl flex-col gap-6 py-10 sm:py-14">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Account</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading account…</p>}>
        <AccountSettings />
      </Suspense>
    </main>
  );
}
