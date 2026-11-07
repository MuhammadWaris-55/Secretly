import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { buildChildEnv } from "./child-env";
import { GitleaksError } from "./errors";
import { parseFingerprints, parseGitleaksReport, type ScanFinding } from "./report";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 5 * 60_000;
const MAX_REPORT_BYTES = 64 * 1024 * 1024;

export interface GitleaksOptions {
  /** Defaults to config/gitleaks.toml. Resolved from the working directory, so run from the project root. */
  configPath?: string;
  timeoutMs?: number;
}

type Mode = "git" | "dir";

/** Runs gitleaks and returns the raw JSON report from stdout. Never returns or throws raw output. */
async function runGitleaks(mode: Mode, target: string, options: GitleaksOptions): Promise<string> {
  const configPath = options.configPath ?? path.resolve(process.cwd(), "config", "gitleaks.toml");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const { stdout } = await execFileAsync(
      "gitleaks",
      [
        mode,
        "--config",
        configPath, // never use a config from the scanned repo
        "--gitleaks-ignore-path",
        path.dirname(configPath), // nor its .gitleaksignore
        "--ignore-gitleaks-allow", // nor inline "gitleaks:allow" comments
        "--report-format",
        "json",
        "--report-path",
        "-", // report goes to stdout, never to disk
        "--exit-code",
        "0", // so a non-zero exit means a real failure
        "--no-banner",
        "--no-color",
        "--log-level",
        "error",
        "--timeout",
        String(Math.ceil(timeoutMs / 1000)),
        target,
      ],
      {
        env: buildChildEnv(),
        timeout: timeoutMs,
        killSignal: "SIGKILL",
        maxBuffer: MAX_REPORT_BYTES,
        windowsHide: true,
      },
    );
    return stdout;
  } catch (error) {
    // Never forward the error object: it can carry stdout/stderr with secrets in it.
    const e = error as { killed?: boolean; code?: string };
    if (e.code === "ENOENT") throw new GitleaksError("not_installed");
    if (e.killed) throw new GitleaksError("timeout");
    if (e.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") throw new GitleaksError("output_too_large");
    throw new GitleaksError("failed");
  }
}

/** Scans the full git history of an already-cloned repo. Returns safe findings only. */
export async function scanGitHistory(
  repoDir: string,
  hmacKey: string,
  options: GitleaksOptions = {},
): Promise<ScanFinding[]> {
  return parseGitleaksReport(await runGitleaks("git", repoDir, options), hmacKey);
}

/** Scans the checked-out files only. Returns the fingerprints of secrets present right now. */
export async function scanWorkingTree(
  repoDir: string,
  hmacKey: string,
  options: GitleaksOptions = {},
): Promise<Set<string>> {
  return parseFingerprints(await runGitleaks("dir", repoDir, options), hmacKey);
}
