# Secretly

Find leaked secrets in your GitHub repos. Fix them. Know you're safe.

Secretly scans your public repositories (including full commit history) for leaked API keys, tokens, database URLs and private keys, walks you through fixing each one, and tracks the fix until it's done.

> **Status:** early development. The MVP is being built step by step; nothing here is production-ready yet.

## How it works

Detect → explain → fix → verify → keep watching.

Most tools stop at "detect". Secretly's focus is the fix experience: rotate the key first, then remove it and clean the history, and re-scan to check the secret is really gone from the code.

## Tech stack

- Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui
- PostgreSQL (Neon) with Drizzle ORM
- Zod for validation, including typed environment variables
- Gitleaks for detection
- Tooling: ESLint, Prettier, Husky, lint-staged, GitHub Actions

## Getting started

Requirements: Node 24+, npm, and [Gitleaks](https://github.com/gitleaks/gitleaks) (used by the pre-commit hook).

```bash
npm install
cp .env.example .env.local   # then fill in real values
npm run dev
```

Generate an `HMAC_KEY` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Scripts

| Command                | What it does                    |
| ---------------------- | ------------------------------- |
| `npm run dev`          | Start the dev server            |
| `npm run build`        | Production build                |
| `npm run lint`         | ESLint                          |
| `npm run typecheck`    | TypeScript check (no emit)      |
| `npm run format`       | Format everything with Prettier |
| `npm run format:check` | Check formatting (used in CI)   |
| `npm run db:check`     | Verify the database connection  |
| `npm run worker`       | Run the background scan worker  |

## Scan worker

Apply the committed database migrations before starting the worker. The worker uses
`DATABASE_URL` for application data, `DIRECT_URL` for pg-boss, and the same `HMAC_KEY`
as the app. It creates or updates its queues at startup and immediately begins
consuming jobs from the configured database. Set `PORT` to override the default of 3001. `GET /healthz` returns 200 after both queue handlers register and 503 during
startup and shutdown.

For local development with Node 24, Git, and Gitleaks installed, run
`node --env-file=.env.local --import tsx src/worker/index.ts`. With the worker
variables already in the process environment, run `npm run worker`.

For a containerized worker, supply the three worker variables in a runtime env file.

```bash
docker build -f Dockerfile.worker -t secretly-worker .
docker run --rm --cpus=1 --memory=1g --stop-timeout=910 --env-file worker.env secretly-worker
```

Set equivalent CPU, memory, and shutdown limits on the hosting platform. The
worker uses pg-boss graceful shutdown on SIGTERM or SIGINT, allowing up to 15
minutes for active work to finish before pg-boss fails or retries unfinished jobs.

## Project structure

```
src/app         Next.js routes and UI
src/components  UI components
src/core        Framework-free logic: db, scanner, playbooks, types
src/worker      Background job process
```

`src/core` and `src/worker` must never import from Next.js. This is enforced by an ESLint rule.

## Security

See [SECURITY.md](./SECURITY.md) for the design rules and how to report a vulnerability.
