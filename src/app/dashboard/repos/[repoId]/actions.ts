"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setOwnedFindingStatus } from "@/core/db/finding-status";
import { findingStatus } from "@/core/db/schema";
import { getSession } from "@/lib/session";

const inputSchema = z.strictObject({
  repoId: z.uuid(),
  findingId: z.uuid(),
  status: z.enum(findingStatus.enumValues),
});

type Result = { ok: true } | { ok: false; message: string };

export async function updateFindingStatus(input: unknown): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Please sign in again." };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid finding status request." };
  const { repoId, findingId, status } = parsed.data;

  try {
    const updated = await setOwnedFindingStatus(session.user.id, repoId, findingId, status);
    if (!updated) return { ok: false, message: "Finding not found." };
  } catch {
    return { ok: false, message: "Could not save the status. Please try again." };
  }

  revalidatePath(`/dashboard/repos/${repoId.toLowerCase()}`);
  return { ok: true };
}
