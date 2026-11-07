// Child processes get only what they need. Our own secrets
// (HMAC_KEY, database URLs) are never passed to them.
const ENV_ALLOWLIST = ["PATH", "SystemRoot", "TEMP", "TMP", "HOME", "USERPROFILE"];

export function buildChildEnv(): NodeJS.ProcessEnv {
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
  // We intentionally don't pass it to children, so we assert the type here.
  return env as NodeJS.ProcessEnv;
}
