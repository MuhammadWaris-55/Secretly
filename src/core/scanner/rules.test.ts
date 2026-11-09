import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

// Every value is invented. Pieces are joined at runtime so full patterns never appear in source.
const j = (...parts: string[]) => parts.join("");

interface Case {
  name: string;
  content: string;
  /** The rule that must fire, or null if nothing may fire. */
  rule: string | null;
}

const CASES: Case[] = [
  // --- Positives: the six secret types the MVP promises to catch ---
  {
    name: "AWS access key",
    rule: "aws-access-token",
    content: `const id = "${j("AKIA", "Q7WE4RTYUI2OP5AS")}";`,
  },
  {
    name: "GitHub personal access token",
    rule: "github-pat",
    content: `const t = "${j("ghp", "_", "Kd8Fh2Lm5Qp9Rt3Vx6Zb1Cn4Jw7Sy0AeMk2P")}";`,
  },
  {
    name: "Stripe key",
    rule: "stripe-access-token",
    content: `const k = "${j("sk", "_live_", "Tg4Hj7Kl2Mn5Pq8Rs1Vw3Xy6")}";`,
  },
  {
    name: "Google API key",
    rule: "gcp-api-key",
    content: `const g = "${j("AI", "za", "SyB3nQ8vK2mX7pL4tR9wZ1cF6hJ0dGa5eUo")}";`,
  },
  {
    name: "private key block",
    rule: "private-key",
    content: [
      j("-----BEGIN ", "RSA PRIVATE KEY-----"),
      "Qk7vT2mX9pL4tR8wZ1cF6hJ0dGa5eUoNs3Yb7Kd2Fh9Lm4Qp8Rt1Vx6Zb3Cn5Jw0SyAe",
      "Mk2PgH8dL5nR3tY7wB1cV4xZ9qF6jK0sE2uI8oA5mN3bX7vC1zL4kJ9hG6fD2sQ8wR",
      "Tt5yU1iO7pA3sD9fG2hJ6kL0zX4cV8bN5mQ1wE7rT3yU9iO2pA6sD4fG8hJ1kL5zX",
      j("-----END ", "RSA PRIVATE KEY-----"),
    ].join("\n"),
  },
  {
    name: "PostgreSQL URL with password",
    rule: "database-url-with-password",
    content: `const u = "${j("postgres", "://", "app_user", ":", "Hk4Jn7Qw2Lp9", "@", "db.example-host.com", ":5432/appdb")}";`,
  },
  {
    name: "MySQL URL with password",
    rule: "database-url-with-password",
    content: `const u = "${j("mysql", "://", "svc", ":", "Vb6Nm3Qw8Zr1", "@", "10.0.0.5", "/shop")}";`,
  },
  {
    name: "MongoDB SRV URL with password",
    rule: "database-url-with-password",
    content: `const u = "${j("mongodb", "+srv://", "admin", ":", "Lp9Ko2Ij5Uh8", "@", "cluster0.example.net", "/app")}";`,
  },
  {
    name: "Redis URL with password and no username",
    rule: "database-url-with-password",
    content: `const u = "${j("redis", "://", ":", "Qz8Xc3Vb6Nm1", "@", "cache.example.com")}";`,
  },

  // --- Negatives: things that must NOT be reported ---
  {
    name: "empty .env template",
    rule: null,
    content: "DATABASE_URL=\nAPI_KEY=\nSTRIPE_SECRET_KEY=\n",
  },
  {
    name: "code that reads from the environment",
    rule: null,
    content: "const key = process.env.API_KEY;\nconst url = process.env.DATABASE_URL;\n",
  },
  {
    name: "AWS documentation placeholder key",
    rule: null,
    content: `${j("AKIA", "IOSFODNN7EXAMPLE")}\n`,
  },
  {
    name: "database URL with the word 'password' as password",
    rule: null,
    content: `url = "${j("postgres", "://", "user", ":", "password", "@", "localhost", ":5432/db")}"\n`,
  },
  {
    name: "database URL with postgres:postgres defaults",
    rule: null,
    content: `DATABASE_URL=${j("postgres", "://", "postgres", ":", "postgres", "@", "localhost", ":5432/app")}\n`,
  },
  {
    name: "database URL built from variables",
    rule: null,
    content: 'const u = "postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}/app";\n',
  },
  {
    name: "database URL with angle-bracket placeholders",
    rule: null,
    content: "# postgresql://<user>:<password>@<host>:5432/<db>\n",
  },
  {
    name: "database URL without a password",
    rule: null,
    content: "const u = 'postgres://user@db.example.com/app';\n",
  },
  {
    name: "database URL without credentials",
    rule: null,
    content: "const u = 'postgres://localhost:5432/app';\n",
  },
];

describe("gitleaks rules (config/gitleaks.toml)", () => {
  let dir = "";
  const hits = new Map<string, string[]>();

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "secretly-rules-"));
    await Promise.all(CASES.map((c, i) => writeFile(path.join(dir, `case-${i}.txt`), c.content)));

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

    // Only rule name and file are read. The secret itself is never touched.
    const report = (stdout.trim() === "" ? [] : JSON.parse(stdout)) as {
      RuleID: string;
      File: string;
    }[];
    for (const entry of report) {
      const file = path.basename(entry.File);
      hits.set(file, [...(hits.get(file) ?? []), entry.RuleID]);
    }
  }, 60_000);

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  it.each(CASES.map((c, i) => ({ ...c, file: `case-${i}.txt` })))("$name", ({ file, rule }) => {
    const fired = hits.get(file) ?? [];
    if (rule === null) {
      expect(fired).toEqual([]);
    } else {
      expect(fired).toContain(rule);
    }
  });
});
