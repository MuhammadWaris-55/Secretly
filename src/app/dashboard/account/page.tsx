import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/session";
import { DeleteAccountForm } from "./delete-account-form";

async function AccountSettings() {
  const session = await getSession();
  if (!session) redirect("/");

  return (
    <section
      className="secretly-workspace-panel p-5 sm:p-6"
      aria-labelledby="delete-account-heading"
    >
      <h2 id="delete-account-heading" className="text-lg font-semibold tracking-tight">
        Delete your Secretly account
      </h2>
      <p className="mt-2 text-sm wrap-anywhere text-muted-foreground">{session.user.email}</p>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
        This permanently deletes your Secretly account, imported repository records, scan history,
        findings, and pending alerts. It signs you out on every device. Your GitHub account and
        repositories stay intact.
      </p>
      <DeleteAccountForm />
    </section>
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
