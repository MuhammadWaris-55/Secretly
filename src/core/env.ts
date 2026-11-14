import { z } from "zod";
import { EnvValidationError } from "./env-validation-error";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HMAC_KEY: z.string().min(32, "must be at least 32 characters"),
  DATABASE_URL: z.string().startsWith("postgres", "must be a Postgres connection string"),
  DIRECT_URL: z.string().startsWith("postgres", "must be a Postgres connection string"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Only variable names and messages are printed, never the values.
  const problems = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new EnvValidationError(
    parsed.error.issues.map((issue) => issue.path.join(".")),
    `Invalid environment variables:\n${problems}`,
  );
}

export const env = parsed.data;
