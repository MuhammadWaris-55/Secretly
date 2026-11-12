import { z } from "zod";

export const SCAN_QUEUE = "scan-repo";
export const SCAN_DEAD_LETTER_QUEUE = "scan-repo-dead-letter";

/**
 * The job carries only a scan id. The worker reads the repo from the database,
 * so a payload can never point a scan at an arbitrary URL.
 * strict() rejects any extra field.
 */
export const scanJobSchema = z.object({ scanId: z.string().uuid() }).strict();
export type ScanJob = z.infer<typeof scanJobSchema>;

/** One queued-or-active job per singletonKey. We use the repo id as the key. */
export const SCAN_QUEUE_POLICY = "exclusive" as const;

export const SCAN_QUEUE_SETTINGS = {
  retryLimit: 3,
  retryDelay: 30, // seconds, doubled with backoff on each retry
  retryBackoff: true,
  expireInSeconds: 15 * 60, // a single scan may never run longer than this
  heartbeatSeconds: 60, // a dead worker is detected within about two minutes
  deadLetter: SCAN_DEAD_LETTER_QUEUE,
} as const;
