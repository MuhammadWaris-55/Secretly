import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/core/env";
import * as schema from "./schema";

// In dev, hot reloads re-run this file. Cache the pool on globalThis
// so we don't open a new set of connections on every reload.
const globalForDb = globalThis as unknown as { pool?: Pool };

export const pool = globalForDb.pool ?? new Pool({ connectionString: env.DATABASE_URL, max: 5 });

if (env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

export const db = drizzle({ client: pool, schema });
