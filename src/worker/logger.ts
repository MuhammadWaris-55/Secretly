import pino from "pino";

// Worker logs use fixed messages and validated scan IDs. Redaction is a second safeguard.
export const logger = pino({
  name: "secretly-worker",
  redact: {
    paths: [
      "err",
      "error",
      "env",
      "job",
      "payload",
      "secret",
      "stdout",
      "stderr",
      "HMAC_KEY",
      "DATABASE_URL",
      "DIRECT_URL",
    ],
    remove: true,
  },
});
