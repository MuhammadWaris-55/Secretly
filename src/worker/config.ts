import { z } from "zod";

const emailSchema = z.object({
  RESEND_API_KEY: z.string().trim().min(1),
  EMAIL_FROM: z
    .string()
    .trim()
    .refine((value) => {
      const address = /^[^<>\r\n]+ <([^<>]+)>$/.exec(value)?.[1] ?? value;
      return z.email().safeParse(address).success;
    }),
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/ }),
});

export function readWorkerEmailConfig(env: Record<string, string | undefined>) {
  if (!env.RESEND_API_KEY?.trim()) return { invalid: [] };
  const result = emailSchema.safeParse(env);
  if (!result.success) {
    return { invalid: result.error.issues.map((issue) => issue.path.join(".")) };
  }

  return {
    invalid: [],
    config: {
      apiKey: result.data.RESEND_API_KEY,
      from: result.data.EMAIL_FROM,
      baseUrl: result.data.BETTER_AUTH_URL,
    },
  };
}
