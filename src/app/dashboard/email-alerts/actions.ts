"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/core/db/client";
import { emailAlertSubscriptions, user } from "@/core/db/schema";
import { getSession } from "@/lib/session";

export async function updateEmailAlerts(form: FormData) {
  const preference = form.get("preference");
  if (preference !== "subscribe" && preference !== "unsubscribe") return;

  const session = await getSession();
  if (!session) redirect("/");
  const userId = session.user.id;
  if (preference === "unsubscribe") {
    await db.delete(emailAlertSubscriptions).where(eq(emailAlertSubscriptions.userId, userId));
  } else {
    const [account] = await db
      .select({ verified: user.emailVerified })
      .from(user)
      .where(eq(user.id, userId));
    if (account?.verified) {
      await db.insert(emailAlertSubscriptions).values({ userId }).onConflictDoNothing();
    }
  }
  revalidatePath("/dashboard/email-alerts");
}
