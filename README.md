# Secretly

Find leaked secrets in your GitHub repos. Fix them. Know you're safe.

Secretly scans your public repositories (including full commit history) for leaked API keys, tokens, database URLs and private keys, walks you through fixing each one, and tracks the fix until it's done.

> **Release status:** staging candidate. The production and staging section below covers deployment and the checks to run before a public launch.

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
| `npm run dev`          | Start the dev server and worker |
| `npm run dev:web`      | Start only the dev server       |
| `npm run dev:worker`   | Start only the local worker     |
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

For local development with Node 24, Git, and Gitleaks installed, use `npm run dev`
and wait for **Scan worker ready**. The worker reads `.env.local` and starts
processing queued scans. Use `npm run dev:web` if you only need the web app,
or `npm run dev:worker` to start the local worker separately. The local worker
uses port 3001 for its health endpoint by default. Override it with `WORKER_PORT`.

For a containerized worker, supply the three worker variables in a runtime env file.

```bash
docker build -f Dockerfile.worker -t secretly-worker .
docker run --rm --cpus=1 --memory=1536m --read-only --tmpfs /tmp:rw,noexec,nosuid,size=768m --cap-drop ALL --security-opt no-new-privileges --stop-timeout=910 --env-file worker.env secretly-worker
```

Set equivalent CPU, memory, and shutdown limits on the hosting platform. The
worker uses pg-boss graceful shutdown on SIGTERM or SIGINT, allowing up to 15
minutes for active work to finish before pg-boss fails or retries unfinished jobs.

## Production and staging

Build the web service with `docker build -f Dockerfile.web -t secretly-web .`.
It serves the standalone Next.js build on port 3000. Both services use Node 24
and run as the unprivileged `node` user. The web image includes its fonts.

1. Create a separate Postgres database for each environment. Set `DATABASE_URL`
   and `DIRECT_URL` to pooled and direct connections to the **same database**.
   With development dependencies installed, run `npm run db:migrate` as a
   release step. The web database role needs permission to insert pg-boss jobs.
2. Set the web service's `BETTER_AUTH_URL` to its public HTTPS origin. Register
   `/api/auth/callback/github` on that origin as the GitHub OAuth callback.
   Supply its GitHub credentials, a random `BETTER_AUTH_SECRET`, and a persistent
   `HMAC_KEY` shared with the worker. Changing the HMAC key changes finding identities.
3. Start the worker with bounded temporary storage and the limits above. Wait for
   `/healthz` to return 200 before serving web traffic. Enable the email variables
   on the worker when alert delivery is required.
4. On staging, sign in, import the fixture repository, scan it, and verify the
   current and history-only findings. Opt in to alerts and scan a fresh synthetic
   finding. Confirm delivery and rescan the same revision to check duplicate suppression.
   Verify sign-out and account deletion with a disposable account.
5. Before opening registration, verify a database backup can be restored and track
   worker availability, queue age, exhausted retries, and email failures on the host.

Each account can have two active scans and start ten scans in a rolling hour.
Worker retries reuse the original scan. Before cloning, the worker checks the
public GitHub API for the signed-in owner's numeric GitHub ID, fork status,
canonical repository name, and reported size (500 MiB limit). This unauthenticated
metadata request shares GitHub's per-IP budget across workers. Factor that budget
into staging load tests. [GitHub REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)

## Automatic worker capacity on Render + Vercel

The optional controller runs inside the **long-lived Render web server**, not in
a Vercel Function. Leave it disabled locally, on previews, and on the scanner.
It starts one Vercel `scan-worker` instance after a scan is queued and keeps it
warm for five minutes after work finishes. All scan states, including delayed
retries, keep it running. Due emails also wake it; future email retries set a
recovery timer. No scan or credential validation logic changes.

To enable it:

1. Apply the committed migration with `npm run db:migrate` using your deployment
   database configuration. Migration `0006` adds only the worker idle clock.
2. In the **Render web service** environment, add `WORKER_AUTOSCALE=true`,
   `WORKER_VERCEL_TOKEN`, `WORKER_VERCEL_PROJECT_ID` (`prj_...`),
   `WORKER_VERCEL_TEAM_ID` (`team_...`), and `WORKER_VERCEL_REGION`.
   Find the project/team IDs in their Vercel settings. Create an access token
   authorized to update that team's project. Keep it server-side and restrict
   its scope and lifetime where available. Never use a `NEXT_PUBLIC_` variable.
3. Set the region to the one you tested, preferably near Neon. The controller
   owns **all regions** of this daemon and zeros other regions to avoid extra
   instances. Do not share this daemon with another application or change its
   scaling manually while management is enabled.
4. Deploy the updated web and worker images. Keep the Vercel daemon's
   `instances: {}` configuration. Existing dashboard scaling overrides are
   corrected by the controller. Set `WORKER_IDLE_SECONDS` only if you want
   another idle window (60–900 seconds; default 300).
5. With local processes stopped, scan a fixture, wait at least six minutes after
   completion, and confirm Vercel's desired instance count reaches zero. Scan
   again and confirm it rises to one and completes without refreshing the page.
   Record click-to-completion time for a cold and a warm scan. The worker's
   ready log includes `startupMs`, which measures application initialization,
   excluding Vercel's provisioning and image startup time.

Wake-up is requested after the queue transaction commits and after the web
response, so the UI does not wait for a Vercel API request. Active dashboard
refreshes also recover queued work. A Postgres advisory lock serializes capacity
decisions across web replicas. A scan arriving during a stop triggers another
check; graceful worker shutdown and pg-boss retries protect in-flight work.
Warm workers use direct-connection LISTEN/NOTIFY to receive new jobs immediately,
with polling retained as a fallback.

The controller checks every 15 seconds while warm, and at the next email retry
or every ten minutes while idle. This backs off database queries so Neon can
sleep. It restarts automatically when Render starts. Timers cannot run while
Render is asleep or suspended: keep the existing uptime monitor on `/api/health`
if you want that service awake, subject to Render's own shared free-tier quota.
Without an awake web service, queued work and retries recover on the next web
startup; this is not an independent always-on scheduler.

Vercel still provisions the stopped worker on the first scan: no instant cold
start is promised. Use the same region for successive starts to avoid geographic
changes. API errors are retried without dropping the queued scan and are logged
without credentials or response bodies. Persistent API/configuration errors can
leave capacity running or scans waiting, so monitor these logs and platform
usage. Stopping idle instances saves quota; it does not remove monthly limits.

To roll back, set `WORKER_AUTOSCALE=false` on Render and redeploy, then manually
scale the Vercel daemon to one. Disabling management alone does not change the
last scaling override.

## Postgres integration tests

GitHub Actions runs `npm run test:integration` with a disposable Postgres service.
For a local run, start a separate database and point `TEST_DATABASE_URL` at it.
The suite applies the committed migrations and uses synthetic scanner results.

```powershell
docker run --rm --name secretly-test-db -e POSTGRES_DB=secretly_test -e POSTGRES_PASSWORD=secretly-test-only -p 127.0.0.1:55432:5432 -d postgres:18
$env:TEST_DATABASE_URL = "postgresql://postgres:secretly-test-only@127.0.0.1:55432/secretly_test"
npm run test:integration
docker stop secretly-test-db
```

## Viewing findings

Select **View findings** next to a repository in the dashboard. After a scan
completes, the page shows masked previews, where findings were detected, and
remediation guidance. Findings retained from earlier scans are labeled
**Previously detected** when the latest completed scan did not detect them.
Use the **Status** menu to mark a finding fixed, ignored, or a false positive.
Choose **Open** to reopen it. Rescans preserve your choice.

## Email alerts

Apply the committed migrations, then open **Dashboard → Email alerts** to see
the sample email. Users with a verified account email can opt in and return
to the same page to unsubscribe.

To enable delivery, set `RESEND_API_KEY`, `EMAIL_FROM` (a sender on a verified
Resend domain), and `BETTER_AUTH_URL` (the app's public URL) in the worker
environment. Alerts group newly detected fingerprints by scan and include up to
five masked previews. Existing findings do not generate alerts on repeat scans.
Delivery retries for up to 23 hours.

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
