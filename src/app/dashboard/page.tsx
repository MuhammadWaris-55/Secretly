import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { getSession } from "@/lib/session";

async function Account() {
  const session = await getSession();
  if (!session) redirect("/");

  return (
    <>
      <p className="text-muted-foreground">
        Signed in as {session.user.name} ({session.user.email})
      </p>
      <SignOutButton />
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
