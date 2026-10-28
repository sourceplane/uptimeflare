# uptimeflare — operating contract (for humans and agents)

This is the standing guide to how this site is deployed and operated.
Instance facts (live URLs, workspace, the secrets it uses) live in
[deployment.md](deployment.md), rendered from probed reality by the
bootstrap's `02-docs` phase; this file is the contract that stays true
between deployments. It is written to give an agent with repository read
access enough context to reason about and operate the site without any
other source.

## What this system is

An uptime monitor and status page (UptimeFlare) on Cloudflare alone, as ONE
Worker, expressed as an Orun component-native desired-state repo.

- **`infra/terraform/cloudflare-d1`** — one Cloudflare D1 database per
  deployed environment (`stage`, `prod`), applied by Terraform. After each
  apply it publishes a wiring document — `{d1_database_id, d1_database_name}`
  — as the Orun secret `WIRING_CLOUDFLARE_D1` on that environment.
- **`packages/db`** — the schema as migrations (`src/migrations/*/up.sql`,
  listed with their checksums in `src/manifest.ts`) and the runner that
  applies them to D1 over the REST API, recording each in a
  `_migrations_applied` table.
- **`infra/db-migrate`** — runs that runner per environment: it plans offline
  on a pull request and applies on a merge, finding the database through
  `WIRING_CLOUDFLARE_D1`.
- **`apps/web`** — the status page AND its checker, one Worker: Next.js
  (pages router) built by `@opennextjs/cloudflare` into a Worker plus Static
  Assets, entered through `worker.ts`, which adds the `scheduled` handler.
  Every minute the Cron Trigger runs the checker (`monitor/`): it checks
  every monitor in `uptime.config.ts`, opens and closes incidents, sends
  notifications, and writes one compacted state (key `state`) to the
  `monitor_state` table through the `DB` D1 binding. The pages and
  `/api/data` read it back. `proxy.ts` puts everything behind Basic auth
  when the Worker has a `STATUS_PAGE_PASSWORD` secret.
- **`tests/web`**, **`tests/db`** — the compacted state, the checker against
  real SQLite, the API routes and the password gate, and the migrations
  applied through the runner into real SQLite (vitest), verified on the `dev`
  rung.
- **`tooling/*`** — shared TypeScript and ESLint configuration, the wrangler
  renderer that turns `wrangler.template.jsonc` plus a wiring document into
  `wrangler.jsonc`, and the migration helpers (the manifest's checksum
  check, the local-D1 apply).

Environments: **`stage`** and **`prod`** are deployed; **`dev` is
verify-only by design** — lanes build and test, nothing deploys, and no D1
database exists for it (its build renders the committed fixture).

## Identity and tenancy

Every remote operation runs against ONE Orun workspace, declared in
`intent.yaml` under `execution.state.workspace` — committed, enforced, and
what CI uses. Do not remove it; headless credentials depend on it. If it
reads `ws_SET_ME`, the bootstrap had no workspace to write: set the real one
before anything else.

## How deployment works

1. Merge (or push) to `main`.
2. CI (`.github/workflows/ci.yml`) runs `orun plan --changed` — only
   components whose files changed are planned — then runs each planned lane
   with `orun run --remote-state`, authenticated by GitHub OIDC (the
   exchange resolves this repository's linked workspace server-side).
3. **The database, then its schema, then the Worker**, per environment.
   `cloudflare-d1` applies and publishes `WIRING_CLOUDFLARE_D1`.
   `db-migrate` declares an enforced `dependsOn` on it for pushes to `main`,
   so it starts after that apply — a job resolves its secrets when it
   starts, so the document is there — and applies every pending migration.
   `apps/web` waits on both the same way.
4. `apps/web` renders `wrangler.jsonc` from that document (the real
   database id), builds once per environment, `wrangler deploy` ships
   `uptimeflare-web-<env>` with its one Cron Trigger (`* * * * *`), and a
   smoke test fetches `/api/data` and requires an `updatedAt` no older than
   ten minutes — which only a Worker whose trigger has written the migrated
   `monitor_state` table answers (a new trigger can take a few minutes to
   fire; the smoke retries for about four and a half).
5. `prod` deploys after `stage` has converged on the same commit
   (`environments.prod.promotion` in intent.yaml).
6. **The convergence run is the deployment.** A green run means every
   planned lane applied. Failed lanes are retried with
   `gh run rerun --failed`, which resumes the same execution.

On a pull request nothing applies or deploys: the D1 root plans, the
migrations plan offline (their checksums verified), the site builds and
dry-deploys, and the edges in step 3 are advisory.

Caveats that matter:

- A push that touches no component files plans zero lanes — that run is
  green and deployed nothing. Never treat "latest run green" as "site
  converged"; probe the URLs instead.
- A change to `intent.yaml`'s `environments` maps to no component and
  redeploys nothing on its own. Land it with a change under `apps/web`.
- `wrangler.jsonc` is generated. Edit `wrangler.template.jsonc`, run
  `pnpm run wire:fixture` and commit both; the deploy renders its own
  config from the template, so a stale committed render misleads local work.
- An applied migration is immutable: its checksum is recorded, and the
  runner refuses to run while a file no longer matches it. Change the
  schema with a NEW migration.

## Secrets model

- **Brokered provider secrets**, minted per run from the workspace's
  Cloudflare connection — no long-lived values at rest, nothing to rotate by
  hand:
  - `CLOUDFLARE_API_TOKEN` (`workers-deploy`: Workers Scripts) — the site's
    deploy;
  - `CLOUDFLARE_D1_TOKEN` (`d1-edit`: D1) — the D1 root's apply and the
    migration runner, which bind it as their `CLOUDFLARE_API_TOKEN`; the
    deploy token cannot touch D1;
  - `CLOUDFLARE_ACCOUNT_ID` — a connection fact all three bind.
- **Wiring**: `WIRING_CLOUDFLARE_D1` on `stage` and `prod`, written by the
  D1 root's apply (lease-published), read by the migration runner and by the
  Worker's build as `WIRING_CLOUDFLARE_D1_<ENV>`. It holds ids, not
  credentials.
- Inspect by NAME only: `orun secrets list --org <ws> --project` and
  `--env stage|prod`. No tooling in this repository prints a secret value,
  and no document in `ai/context/` may contain one.
- **One optional runtime secret**: `STATUS_PAGE_PASSWORD` (`user:password`),
  stored by the owner per environment to make the status page private. The
  Worker's build hands it to the Worker as a Worker secret (`wrangler secret
  bulk`, the value over stdin) before the deploy, and the smoke sends it.
  Unset, the page is public. Removing it from Orun does not remove the
  Worker's copy: `wrangler secret delete STATUS_PAGE_PASSWORD --name
  uptimeflare-web-<env>` as well.
- The D1 binding needs no credential: the binding is the credential.

## Verifying the system

```bash
# each environment's latest check (also recorded, probed, in deployment.md):
# updatedAt is the Unix time the trigger last wrote the state
curl -s https://uptimeflare-web-stage.your-workers-subdomain.workers.dev/api/data | grep -Eo '"updatedAt":[0-9]+'
curl -s -o /dev/null -w '%{http_code}\n' https://uptimeflare-web-prod.your-workers-subdomain.workers.dev/

# the wiring the migrations and deploys read, and workspace readiness
orun secrets list --org <ws> --env stage && orun secrets list --org <ws> --env prod
orun integrations list --org <ws> --json && orun cloud check --org <ws>
```

## Common operations

| task | how |
|---|---|
| change the monitors | edit `apps/web/uptime.config.ts` (every option: `uptime.config.full.ts`); keep a monitor's `id` to keep its history; merge |
| change the page | `apps/web/pages/`, `components/`, `locales/` (its name and source link: `apps/web/lib/site.ts`), merge |
| make the page private | store `STATUS_PAGE_PASSWORD` (`user:password`) for the environment, then redeploy it |
| change the schema | add `packages/db/src/migrations/<NNN>_<name>/up.sql` (idempotent: `IF NOT EXISTS`), list it in `src/manifest.ts`, `pnpm --filter @saas/db run manifest:fix`, merge — db-migrate applies it before the site redeploys |
| try the schema locally | `pnpm --filter @app/web db:migrate:local` applies every migration to wrangler's local D1 |
| deploy a change | merge to `main`; watch the run; failed lanes → `gh run rerun --failed` |
| deploy by hand | Orunbase's Deploy button, or `gh workflow run ci.yml --ref main -f environment=<env> [-f component=<a,b>]` — the named components (blank: every one) run in that environment as a merge runs them; started off `main` it is refused |
| redeploy without a change | edit the last line of `apps/web/component.yaml` (`# orun: redeploy <reason> <stamp>`) and merge — it is a deploy trigger, nothing reads it |
| read a live state | `wrangler d1 execute <name> --remote --command "SELECT length(value) FROM monitor_state WHERE key = 'state'"` (the name is in the environment's `WIRING_CLOUDFLARE_D1`) |
| watch the checks | Cloudflare → Workers → `uptimeflare-web-<env>` → Logs: one scheduled invocation a minute, a line per monitor |
| add a binding (R2, KV, another D1) | a Terraform root under `infra/terraform/` that publishes `WIRING_<ROOT>`, a token in `wrangler.template.jsonc`, its fixture entry, the root in the build's `--components`, the `WIRING_<ROOT>_<ENV>` secretEnv and an enforced `dependsOn` on it in `apps/web/component.yaml` |
| serve a custom domain | attach it to the Worker in Cloudflare (README, "Custom domain"), then replace the placeholder `uptimeflare.example.com` in `intent.yaml`'s `BASE_DOMAIN` with it |
| add a runtime secret | `orun secrets set <KEY> --org <ws> --env <env>` |
| headless credentials | `ORUN_TOKEN` (workspace-scoped) + `GITHUB_TOKEN` |

The deployment record is the bootstrap's `02-docs` phase. Re-running it (the
Orun console's Retry on that phase, or `orun new … --phase 02-docs`)
re-probes the URLs and re-renders [deployment.md](deployment.md); it is
idempotent.

## Evolution

D1 has no interactive transactions and caps a database's size; the state is
one row of a few hundred kilobytes at most (twelve hours of latency, ninety
days of incidents). Fifty monitors at one-minute checks is upstream's stated
ceiling on Workers Free. Structural changes follow the same contract that deployed the
site: add a component under `apps/`, `infra/` or `packages/` with a
`component.yaml`, land it as a pull request, and the convergence run applies
it.
