import { eq } from "drizzle-orm";
import { Bell, Mail } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { db } from "@/core/db/client";
import { emailAlertSubscriptions, user } from "@/core/db/schema";
import { renderAlert } from "@/core/jobs/render-alert";
import { getSession } from "@/lib/session";
import { updateEmailAlerts } from "./actions";

async function Preferences() {
  const session = await getSession();
  if (!session) redirect("/");
  const [account] = await db
    .select({
      verified: user.emailVerified,
      subscription: emailAlertSubscriptions.userId,
    })
    .from(user)
    .leftJoin(emailAlertSubscriptions, eq(user.id, emailAlertSubscriptions.userId))
    .where(eq(user.id, session.user.id));
  const subscribed = Boolean(account?.subscription);
  const preview = renderAlert("https://secretly.example", "example-repo", 2, [
    "Qz************",
    "Vb************",
  ]);

  return (
    <>
      <section
        className="secretly-workspace-panel flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6"
        aria-labelledby="email-preference"
      >
        <div className="flex items-start gap-3">
          <Bell size={20} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <h2 id="email-preference" className="font-semibold">
              {subscribed ? "Email alerts are on" : "Email alerts are off"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Get an email when a scan detects a new finding.
            </p>
          </div>
        </div>
        {subscribed || account?.verified ? (
          <form action={updateEmailAlerts}>
            <input
              type="hidden"
              name="preference"
              value={subscribed ? "unsubscribe" : "subscribe"}
            />
            <Button type="submit" variant={subscribed ? "outline" : "default"}>
              {subscribed ? "Unsubscribe" : "Turn on email alerts"}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Email alerts require a verified account email.
          </p>
        )}
      </section>
      <section className="secretly-workspace-panel space-y-4 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <Mail size={18} aria-hidden="true" /> Sample email
        </h2>
        <div className="secretly-workspace-inset space-y-3 p-4 sm:p-5">
          <p className="border-b border-[#414739] pb-3 text-sm font-semibold">{preview.subject}</p>
          <p className="text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap text-[#ced2c5]">
            {preview.text}
          </p>
        </div>
      </section>
    </>
  );
}

export default function EmailAlertsPage() {
  return (
    <main className="secretly-workspace-width flex max-w-3xl flex-col gap-6 py-10 sm:py-14">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Email alerts</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading preferences…</p>}>
        <Preferences />
      </Suspense>
    </main>
  );
}
