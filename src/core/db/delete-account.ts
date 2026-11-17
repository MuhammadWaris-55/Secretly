import { eq } from "drizzle-orm";
import { db } from "./client";
import { repos, user } from "./schema";

export async function deleteAccount(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Deleting the user first also serializes deletion against a repository import.
    await tx.delete(user).where(eq(user.id, userId));
    await tx.delete(repos).where(eq(repos.userId, userId));
  });
}
