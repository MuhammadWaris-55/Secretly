import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { buildChildEnv } from "./child-env";
import { GitleaksError } from "./errors";
import { parseGitleaksReport, type ScanFinding } from "./report";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 5 * 60_000;
const MAX_REPORT_BYTES = 64 * 1024 * 1024;

export interface GitleaksOptions {
  /** Defaults to config/gitleaks.toml. Resolved from the working directory, so run from the project root. */
  configPath?: string;
  timeoutMs?: number;
}

/** Scans the full git history of an already-cloned repo. Returns safe findings only. */
export async function scanGitHistory(
  repoDir: string,
  hmacKey: string,
  options: GitleaksOptions = {},
): Promise<ScanFinding[]> {
  const configPath = options.configPath ?? path.resolve(process.cwd(), "config", "gitleaks.toml");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      "gitleaks",
      [
        "git",
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
        repoDir,
      ],
      {
        env: buildChildEnv(),
        timeout: timeoutMs,
        killSignal: "SIGKILL",
        maxBuffer: MAX_REPORT_BYTES,
        windowsHide: true,
      },
    ));
  } catch (error) {
    // Never forward the error object: it can carry stdout/stderr with secrets in it.
    const e = error as { killed?: boolean; code?: string };
    if (e.code === "ENOENT") throw new GitleaksError("not_installed");
    if (e.killed) throw new GitleaksError("timeout");
    if (e.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") throw new GitleaksError("output_too_large");
    throw new GitleaksError("failed");
  }

  return parseGitleaksReport(stdout, hmacKey);
}
