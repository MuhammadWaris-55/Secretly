import { sql } from "drizzle-orm";
import { db, pool } from "@/core/db/client";

async function main() {
  const result = await db.execute(sql`select now() as server_time, current_database() as db`);
  console.log("Connected:", result.rows[0]);
  await pool.end();
}

main().catch((error: unknown) => {
  console.error("Connection failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
