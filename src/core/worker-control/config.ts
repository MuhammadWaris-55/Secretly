import { z } from "zod";
import { EnvValidationError } from "@/core/env-validation-error";

const schema = z.object({
  WORKER_VERCEL_TOKEN: z.string().trim().min(1),
  WORKER_VERCEL_PROJECT_ID: z
    .string()
    .trim()
    .regex(/^prj_[a-zA-Z0-9]+$/),
  WORKER_VERCEL_TEAM_ID: z
    .string()
    .trim()
    .regex(/^team_[a-zA-Z0-9]+$/),
  WORKER_VERCEL_REGION: z
    .string()
    .trim()
    .regex(/^[a-z]{3}[0-9]$/),
  WORKER_IDLE_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
});

export type WorkerControlConfig = z.infer<typeof schema>;

/** Opt in only on the long-lived web server, never in the scanner or a preview. */
export function readWorkerControlConfig(
  env: Record<string, string | undefined>,
): WorkerControlConfig | null {
  if (env.WORKER_AUTOSCALE !== "true") return null;
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => String(issue.path[0])),
      "Invalid worker control configuration",
    );
  }
  return result.data;
}
