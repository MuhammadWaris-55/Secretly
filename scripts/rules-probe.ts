import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const j = (...parts: string[]) => parts.join("");

// Every value here is invented. Pieces are joined at runtime so the full patterns
// never appear in this source file.
const FIXTURES: Record<string, { expect: string; content: string }> = {
  "aws.js": {
    expect: "an AWS access key",
    content: `const id = "${j("AKIA", "Q7WE4RTYUI2OP5AS")}";`,
  },
  "github.js": {
    expect: "a GitHub token",
    content: `const t = "${j("ghp", "_", "Kd8Fh2Lm5Qp9Rt3Vx6Zb1Cn4Jw7Sy0AeMk2P")}";`,
  },
  "stripe.js": {
    expect: "a Stripe key",
    content: `const k = "${j("sk", "_live_", "Tg4Hj7Kl2Mn5Pq8Rs1Vw3Xy6")}";`,
  },
  "google.js": {
    expect: "a Google API key",
    content: `const g = "${j("AI", "za", "SyB3nQ8vK2mX7pL4tR9wZ1cF6hJ0dGa5eUo")}";`,
  },
  "private-key.pem": {
    expect: "a private key block",
    content: [
      j("-----BEGIN ", "RSA PRIVATE KEY-----"),
      "Qk7vT2mX9pL4tR8wZ1cF6hJ0dGa5eUoNs3Yb7Kd2Fh9Lm4Qp8Rt1Vx6Zb3Cn5Jw0SyAe",
      "Mk2PgH8dL5nR3tY7wB1cV4xZ9qF6jK0sE2uI8oA5mN3bX7vC1zL4kJ9hG6fD2sQ8wR",
      "Tt5yU1iO7pA3sD9fG2hJ6kL0zX4cV8bN5mQ1wE7rT3yU9iO2pA6sD4fG8hJ1kL5zX",
      j("-----END ", "RSA PRIVATE KEY-----"),
    ].join("\n"),
  },
  "database.js": {
    expect: "a database URL with a password",
    content: `const url = "${j("postgres", "://", "app_user", ":", "Hk4Jn7Qw2Lp9", "@", "db.example-host.com", ":5432/appdb")}";`,
  },
  // Negative controls: these should produce NO findings.
  "negative-env-example.txt": {
    expect: "nothing (empty template)",
    content: "DATABASE_URL=\nAPI_KEY=\nSTRIPE_SECRET_KEY=\n",
  },
  "negative-code.js": {
    expect: "nothing (reads from env)",
    content: "const key = process.env.API_KEY;\nconst url = process.env.DATABASE_URL;\n",
  },
  "negative-aws-doc-example.txt": {
    expect: "nothing (AWS docs placeholder)",
    content: `${j("AKIA", "IOSFODNN7EXAMPLE")}\n`,
  },
};

async function main() {
  const dir = await mkdtemp(path.join(tmpdir(), "secretly-probe-"));
  try {
    for (const [name, fixture] of Object.entries(FIXTURES)) {
      await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
      await writeFile(path.join(dir, name), fixture.content);
    }

    const { stdout } = await execFileAsync(
      "gitleaks",
      [
        "dir",
        "--config",
        path.resolve(process.cwd(), "config", "gitleaks.toml"),
        "--ignore-gitleaks-allow",
        "--report-format",
        "json",
        "--report-path",
        "-",
        "--exit-code",
        "0",
        "--no-banner",
        "--no-color",
        "--log-level",
        "error",
        dir,
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    );

    // Keep only the rule name and file. The secret itself is never read.
    const report: unknown = stdout.trim() === "" ? [] : JSON.parse(stdout);
    const hits = new Map<string, string[]>();
    for (const entry of report as { RuleID: string; File: string }[]) {
      const file = path.basename(entry.File);
      hits.set(file, [...(hits.get(file) ?? []), entry.RuleID]);
    }

    console.table(
      Object.entries(FIXTURES).map(([name, fixture]) => ({
        file: name,
        planted: fixture.expect,
        "rules that fired": hits.get(name)?.join(", ") ?? "(none)",
      })),
    );
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
