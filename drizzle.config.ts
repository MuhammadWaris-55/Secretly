import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

const url = process.env.DIRECT_URL;
if (!url) {
  throw new Error("DIRECT_URL is not set");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/core/db/schema.ts",
  out: "./drizzle",
  // Migrations use the direct (non-pooled) connection.
  dbCredentials: { url },
});
