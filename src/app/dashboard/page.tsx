import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { SyncReposButton } from "@/components/sync-repos-button";
import { db } from "@/core/db/client";
import { repos } from "@/core/db/schema";
import { getSession } from "@/lib/session";

async function Account() {
  const session = await getSession();
  if (!session) redirect("/");

  const myRepos = await db
    .select({ id: repos.id, fullName: repos.fullName })
    .from(repos)
    .where(eq(repos.userId, session.user.id))
    .orderBy(repos.fullName);

  return (
    <>
      <p className="text-muted-foreground">
        Signed in as {session.user.name} ({session.user.email})
      </p>
      <div className="flex flex-wrap gap-3">
        <SyncReposButton />
        <SignOutButton />
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Your repositories ({myRepos.length})</h2>
        {myRepos.length === 0 ? (
          <p className="text-muted-foreground">None yet. Click “Find my repositories”.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {myRepos.map((repo) => (
              <li key={repo.id} className="text-sm">
                {repo.fullName}
              </li>
            ))}
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
