import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { CloneError, RepoTooLargeError } from "./errors";
import type { RepoRef } from "./repo-url";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_BYTES = 500 * 1024 * 1024;

export interface CloneOptions {
  timeoutMs?: number;
  maxBytes?: number;
}

// The child process gets only what git needs. Our own secrets
// (HMAC_KEY, database URLs) are never passed to it.
const ENV_ALLOWLIST = ["PATH", "SystemRoot", "TEMP", "TMP", "HOME", "USERPROFILE"];

function buildGitEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string> = {
    GIT_TERMINAL_PROMPT: "0", // never wait for a password
    GIT_CONFIG_NOSYSTEM: "1", // ignore system-level git config
    GCM_INTERACTIVE: "never", // no credential-manager popups on Windows
  };
  for (const key of ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  // Next.js's type augmentation makes NODE_ENV a required key of ProcessEnv.
  // We intentionally don't pass it to git, so we assert the type here.
  return env as NodeJS.ProcessEnv;
}

/** Total size in bytes of all regular files under a directory (symlinks are skipped). */
export async function dirSize(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await dirSize(full);
    } else if (entry.isFile()) {
      total += (await stat(full)).size;
    }
  }
  return total;
}

/**
 * Clones a validated repo into a fresh temp directory, runs `fn` with the path,
 * and ALWAYS deletes the directory afterwards, even when `fn` or the clone throws.
 * The repo never outlives this call.
 */
export async function withClonedRepo<T>(
  repo: RepoRef,
  fn: (repoDir: string) => Promise<T>,
  options: CloneOptions = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES } = options;

  const workDir = await mkdtemp(path.join(tmpdir(), "secretly-"));
  try {
    const emptyDir = path.join(workDir, "empty");
    await mkdir(emptyDir);
    const repoDir = path.join(workDir, "repo");

    try {
      await execFileAsync(
        "git",
        [
          "-c",
          `core.hooksPath=${emptyDir}`, // no hooks can run
          "-c",
          "core.symlinks=false", // symlinks become plain files on checkout
          "-c",
          "credential.helper=", // no stored credentials
          "-c",
          "protocol.allow=never", // only https, nothing else
          "-c",
          "protocol.https.allow=always",
          "clone",
          "--quiet",
          "--no-tags",
          `--template=${emptyDir}`, // don't copy any hook templates
          "--",
          repo.cloneUrl,
          repoDir,
        ],
        {
          env: buildGitEnv(),
          timeout: timeoutMs,
          killSignal: "SIGKILL",
          maxBuffer: 1024 * 1024,
          windowsHide: true,
        },
      );
    } catch (error) {
      const timedOut = (error as { killed?: boolean }).killed === true;
      throw new CloneError(timedOut ? "timeout" : "failed");
    }

    // Full history needs a full clone, so we can't cap during download. This is the
    // backstop. In Step 5 we'll also skip big repos up front using GitHub's reported size.
    if ((await dirSize(repoDir)) > maxBytes) {
      throw new RepoTooLargeError(maxBytes);
    }

    return await fn(repoDir);
  } finally {
    // Git marks pack files read-only, which can make deletion fail on Windows, so retry.
    await rm(workDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
