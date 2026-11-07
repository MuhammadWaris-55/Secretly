export class InvalidRepoUrlError extends Error {
  constructor(reason: string) {
    super(`Invalid repository URL: ${reason}`);
    this.name = "InvalidRepoUrlError";
  }
}

export class CloneError extends Error {
  readonly reason: "timeout" | "failed";

  constructor(reason: "timeout" | "failed") {
    // Deliberately generic: no git stderr, no paths.
    super(`Repository clone failed: ${reason}`);
    this.name = "CloneError";
    this.reason = reason;
  }
}

export class RepoTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Repository exceeds the size limit of ${maxBytes} bytes`);
    this.name = "RepoTooLargeError";
  }
}

export class GitleaksError extends Error {
  readonly reason: "timeout" | "output_too_large" | "not_installed" | "failed" | "bad_report";

  constructor(reason: GitleaksError["reason"]) {
    // Deliberately generic: never include gitleaks output, which may contain secrets.
    super(`Gitleaks scan failed: ${reason}`);
    this.name = "GitleaksError";
    this.reason = reason;
  }
}
