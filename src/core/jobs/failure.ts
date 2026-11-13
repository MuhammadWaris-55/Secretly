import { GitleaksError, InvalidRepoUrlError, RepoTooLargeError } from "@/core/scanner/errors";

export const SCAN_FAILED_AFTER_RETRIES =
  "The scan failed after several attempts. Please try again later.";

export interface ScanFailure {
  /** true: retrying cannot help, so fail the scan now. false: let pg-boss retry. */
  permanent: boolean;
  /** Safe to show to the user. Never contains scanner output. */
  message: string;
}

export function classifyScanError(error: unknown): ScanFailure {
  if (error instanceof InvalidRepoUrlError) {
    return { permanent: true, message: "This repository address is not valid." };
  }
  if (error instanceof RepoTooLargeError) {
    return { permanent: true, message: "This repository is too large to scan." };
  }
  if (error instanceof GitleaksError && error.reason === "output_too_large") {
    return { permanent: true, message: "This repository has too many findings to process." };
  }
  return { permanent: false, message: SCAN_FAILED_AFTER_RETRIES };
}

/**
 * What we throw so pg-boss retries. pg-boss stores an error's text in its job table,
 * so we pass on only the class name, never the original message or cause.
 */
export class ScanAttemptError extends Error {
  constructor(cause: unknown) {
    super(`Scan attempt failed: ${cause instanceof Error ? cause.name : "UnknownError"}`);
    this.name = "ScanAttemptError";
  }
}
