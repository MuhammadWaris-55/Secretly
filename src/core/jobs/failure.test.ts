import { describe, expect, it } from "vitest";
import {
  CloneError,
  GitleaksError,
  InvalidRepoUrlError,
  RepoTooLargeError,
} from "@/core/scanner/errors";
import { SCAN_FAILED_AFTER_RETRIES, ScanAttemptError, classifyScanError } from "./failure";

describe("classifyScanError", () => {
  it("fails fast on an invalid repository URL", () => {
    expect(classifyScanError(new InvalidRepoUrlError("bad")).permanent).toBe(true);
  });

  it("fails fast on an oversized repository", () => {
    expect(classifyScanError(new RepoTooLargeError(1000)).permanent).toBe(true);
  });

  it("fails fast when gitleaks output is too large", () => {
    expect(classifyScanError(new GitleaksError("output_too_large")).permanent).toBe(true);
  });

  it("retries a failed clone", () => {
    const result = classifyScanError(new CloneError("timeout"));
    expect(result.permanent).toBe(false);
    expect(result.message).toBe(SCAN_FAILED_AFTER_RETRIES);
  });

  it("retries other gitleaks failures", () => {
    expect(classifyScanError(new GitleaksError("timeout")).permanent).toBe(false);
  });

  it("retries unknown errors", () => {
    expect(classifyScanError(new Error("boom")).permanent).toBe(false);
    expect(classifyScanError("not an error").permanent).toBe(false);
  });
});

describe("ScanAttemptError", () => {
  it("carries only the class name, never the original message", () => {
    const original = new Error("secret-looking text in a message");
    original.name = "CloneError";
    const wrapped = new ScanAttemptError(original);
    expect(wrapped.message).toBe("Scan attempt failed: CloneError");
    expect(wrapped.message).not.toContain("secret-looking");
  });
});
