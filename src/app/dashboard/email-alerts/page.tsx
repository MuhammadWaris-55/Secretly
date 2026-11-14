import { eq } from "drizzle-orm";
import Link from "next/link";
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
      <div className="space-y-3">
        <p>{subscribed ? "Email alerts are on." : "Email alerts are off."}</p>
        {subscribed || account?.verified ? (
          <form action={updateEmailAlerts}>
            <input
              type="hidden"
              name="preference"
              value={subscribed ? "unsubscribe" : "subscribe"}
            />
            <Button type="submit" variant="outline">
              {subscribed ? "Unsubscribe" : "Turn on email alerts"}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Email alerts require a verified account email.
          </p>
        )}
      </div>
      <section className="space-y-3 rounded-lg border p-5">
        <h2 className="font-semibold">Sample email</h2>
        <p className="text-sm font-medium">{preview.subject}</p>
        <p className="text-sm break-all whitespace-pre-wrap text-muted-foreground">
          {preview.text}
        </p>
      </section>
    </>
  );
}

export default function EmailAlertsPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <Link href="/dashboard" className="self-start text-sm underline underline-offset-4">
        Back to dashboard
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">Email alerts</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading preferences…</p>}>
        <Preferences />
      </Suspense>
    </main>
  );
}
