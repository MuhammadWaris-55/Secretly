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
