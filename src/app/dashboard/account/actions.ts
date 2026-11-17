"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { deleteAccount } from "@/core/db/delete-account";
import { auth } from "@/lib/auth";
import { getSession } from "@/lib/session";

export async function deleteMyAccount(_previous: string, form: FormData): Promise<string> {
  const session = await getSession();
  if (!session) redirect("/");

  if (!z.literal("DELETE").safeParse(form.get("confirmation")).success) {
    return "Type DELETE to confirm.";
  }

  try {
    await deleteAccount(session.user.id);
  } catch {
    return "Could not delete your account. Please try again.";
  }

  // All sessions are already gone. Better Auth also clears the browser's auth cookies.
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // The deleted sessions cannot authenticate even if cookie cleanup fails.
  }
  redirect("/");
}
