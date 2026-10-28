# uptimeflare

lyc8503's [UptimeFlare](https://github.com/lyc8503/UptimeFlare) — an uptime
monitor and status page: HTTP, HTTPS and TCP checks every minute, 90 days of
uptime bars, twelve hours of latency charts, incident history, scheduled
maintenances, webhook notifications and a JSON API — running as **one
Cloudflare Worker**: the status page built by
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) into Workers +
Static Assets, and the checks on a **Cron Trigger** of the same Worker, their
state in a **Cloudflare D1** database provisioned by Terraform through
[Orun](https://github.com/sourceplane/orun) and its schema applied by
migrations — and packaged as an **Orun baseline**: one command takes a new
status page from nothing to live and checking on stage and prod, in its own
repository, under its own name, in ONE landing.

Upstream already runs on Cloudflare, as two deployables — a Pages project
built by `@cloudflare/next-on-pages` for the page and a second Worker for the
checks, sharing one D1 database. Here they are one Worker: its custom entry
(`apps/web/worker.ts`) re-exports OpenNext's `fetch` and adds `scheduled`,
which runs upstream's checker loop unchanged. The Durable Object remote
checker (geo-specific checks) is left out. What the baseline adds is
everything needed to make a copy of it somebody else's, built the way
[turso-starter](https://github.com/sourceplane/turso-starter) and
[cron-starter](https://github.com/sourceplane/cron-starter) are. See
[`specs/epics/uptimeflare`](specs/epics/uptimeflare/README.md) for the
design, the milestones and the as-built status.

## Instantiating a product

```bash
git clone --depth 1 --branch <baseline-tag> https://github.com/sourceplane/uptimeflare
cd uptimeflare
orun new --blueprint repo-blueprint.yaml --out ~/sites/acme-status --run-hooks --resume \
  --set reponame=acme-status --set productname="Acme Status" \
  --set githuborg=acme-inc --set subdomain=<workers-dev-subdomain>
```

Or, once the platform's registry lists it, from the Orun console (Baselines →
`uptimeflare` → Build). Two phases: **`01-product`** creates the repository
and lands the whole product as ONE pull request — intent, CI, tooling, the D1
root, the migrations, the status page with its checker, and its tests — and
one convergence, per environment, applies the D1 database, then its
migrations, then deploys the Worker with its id and its Cron Trigger,
smoke-tested on a check the trigger recorded; **`02-docs`** records the live
deployment from probed facts. **[BOOTSTRAP.md](BOOTSTRAP.md)** is the operator
guide; [docs/phases/](docs/phases/README.md) has a page per phase. The
Workers Free plan is enough: the product registers one Cron Trigger per
Worker.

The new repository receives the **product only** — the app, its D1 root, its
migrations and their runner, its tests, its CI, its tooling, a README of its
own and its operating contract — renamed throughout to the product's name,
repository, Cloudflare Worker and database names. None of this repository's
machinery ships.

| What makes it a baseline | Where |
|---|---|
| The console card (inputs, secrets, programme) | `blueprint.yaml` |
| The build document (modules, phases, hooks) | `repo-blueprint.yaml` |
| This tree's identity, and the bootstrap's task contracts | `.baseline/` |
| The rename engine | `tooling/rebrand/rebrand.mjs` |
| The bootstrap's helpers (deferrals, redeploy marker, work-tree strip) | `tooling/bootstrap/` |
| The component-docs generator | `tooling/catalog/gen-component-docs.py` |
| The deployment-record renderer | `hooks/render-deployment-docs.sh` |
| The product's README and context pack | `.baseline/product/README.md`, `ai/context/` |
| The baseline's tests: contract, wiring, leak, offline bootstrap, end to end | `testing/`, `.github/workflows/baseline.yml` |
| Cutting a `baseline-vN` tag | `.github/workflows/tag.yml` |

## What is here (the product)

| Surface | Where |
|---|---|
| The status page, the incidents page, their components and translations | `apps/web/pages`, `apps/web/components`, `apps/web/locales` |
| The monitors, links, maintenances and notifications | `apps/web/uptime.config.ts` (every option: `uptime.config.full.ts`) |
| The page's name and source link | `apps/web/lib/site.ts` |
| The checker: HTTP(S) and TCP checks, incidents, notifications, the compacted state | `apps/web/monitor/` (upstream's `worker/src`) |
| The Worker entry: OpenNext's `fetch` + the checker's `scheduled` | `apps/web/worker.ts` |
| The JSON API and the status badge | `apps/web/pages/api/data.ts`, `apps/web/pages/api/badge.ts` |
| The password gate (optional) | `apps/web/proxy.ts` |
| Workers build, trigger, bindings and deploy contract | `apps/web/next.config.mjs`, `open-next.config.ts`, `wrangler.template.jsonc` + `wiring.fixture.json` (→ the committed `wrangler.jsonc`), `component.yaml` |
| The D1 database (stage, prod) | `infra/terraform/cloudflare-d1` |
| The schema (migrations) and the runner that applies them over the D1 REST API | `packages/db`, run by `infra/db-migrate` |
| The wrangler renderer, the Worker-secrets helper, the migration helpers | `tooling/wire`, `tooling/migrations` |
| Tests | `tests/web` (the state, the checker against SQLite, the API, the gate), `tests/db` (the migrations into real SQLite) |

## Configuring the monitors

Everything a status page shows is in `apps/web/uptime.config.ts`, as upstream
has it: `pageConfig` (title, header links, groups, logo, footer),
`workerConfig` (the monitors, the write cooldown, notifications, callbacks)
and `maintenances`. It ships with three public monitors — Cloudflare and
GitHub over HTTPS, Google Public DNS over TCP — so a new page has something
to check; replace them with your own. Each monitor's `id` keys its history:
keep it and the history stays, change it and the monitor starts over.

| Monitor kind | `method` | `target` |
|---|---|---|
| HTTP(S), with optional `expectedCodes`, `headers`, `body`, `responseKeyword`, `responseForbiddenKeyword`, `timeout` | `GET`, `HEAD`, `POST`, … | a URL |
| TCP connect | `TCP_PING` | `host:port` |

A check through a proxy (`checkProxy`) works for `globalping://` and
`http(s)://` proxies; `worker://<region>`, upstream's Durable Object, is not
part of this port — such a monitor reports why it is down, or is checked from
the Worker itself with `checkProxyFallback: true`.

Only `id`, `name`, `tooltip`, `statusPageLink` and `hideLatencyChart` reach
the browser (the CVE-2026-29779 fix, kept); a test holds that list. A webhook
whose URL embeds a token is still a credential in this file, as upstream
designs it — keep the repository private, or send notifications from a
`callbacks` function, which receives the Worker's `env`.

## Getting started

```bash
pnpm install
pnpm run wire:fixture   # render apps/web/wrangler.jsonc from the offline fixture
pnpm typecheck
pnpm lint
pnpm test
pnpm build              # next build + opennextjs-cloudflare build → apps/web/.open-next
```

```bash
pnpm --filter @app/web db:migrate:local   # create the monitor_state table in wrangler's local D1
pnpm --filter @app/web dev                # http://localhost:3000 — the pages, against that D1 (no scheduler)
pnpm --filter @app/web preview            # wrangler dev over the built Worker, same local D1
```

## Watching a check run

`wrangler dev` never runs the clock; `--test-scheduled` adds a
`/__scheduled` endpoint that fires the handler:

```bash
cd apps/web
pnpm exec wrangler dev --port 8808 --config wrangler.jsonc --test-scheduled

curl http://127.0.0.1:8808/api/data                     # {"error":"No data available"} — nothing checked yet
curl "http://127.0.0.1:8808/__scheduled?cron=*+*+*+*+*"  # runs the checker once
curl http://127.0.0.1:8808/api/data                     # {"up":…,"down":…,"updatedAt":…,"monitors":{…}}
```

Deployed, the trigger fires every minute; the state is written when a status
changes and otherwise every three minutes (`kvWriteCooldownMinutes`).
Workers → the Worker → Triggers shows the one Cron Trigger; its logs show
each check.

## A private status page

Store `user:password` as the product's Orun secret `STATUS_PAGE_PASSWORD`
for an environment and redeploy it: the build hands it to the Worker as a
secret (`tooling/wire/worker-secrets.mjs`, the value over stdin, never in a
bundle), and `apps/web/proxy.ts` asks every request for those credentials,
the API's included. Locally, put the same line in `apps/web/.dev.vars`
(`.dev.vars.example`). Removing the Orun secret does not remove the Worker's
copy: delete it with `wrangler secret delete STATUS_PAGE_PASSWORD --name
<worker>` too.

## How it maps to UptimeFlare's own deployment

| Upstream | Here |
|---|---|
| A Pages project built by `@cloudflare/next-on-pages` | The same pages on Workers + Static Assets, built by `@opennextjs/cloudflare` (Next 16, pages router); `runtime = 'edge'` gone — OpenNext runs the Node runtime, and the two API routes are Node API routes |
| A second Worker (`worker/`) with a Cron Trigger | The same Worker: `worker.ts` adds `scheduled`, which runs the checker (`monitor/`), on one every-minute trigger |
| `env.UPTIMEFLARE_D1`, read through `process.env` on Pages | `env.DB`, read through `getCloudflareContext()` |
| The `uptimeflare(key, value)` table, created by `deploy/init_d1.py` | `monitor_state(key, value)`, created by the migration `010_monitor_state` before the Worker deploys |
| `deploy.tf`: the database, the Worker, its trigger, the Pages project | `infra/terraform/cloudflare-d1` for the database; the Worker, its trigger and its assets in one `wrangler deploy` |
| The `RemoteChecker` Durable Object (`worker://` geo checks) | Left out (no Orun composition places a Durable Object); `globalping://` and `http(s)://` proxies unchanged |
| `workerConfig.passwordProtection`, a string in the committed config | The optional Orun secret `STATUS_PAGE_PASSWORD`, a Worker secret |
| The page title in `uptime.config.ts` | `SITE_NAME` in `lib/site.ts`, which `pageConfig.title` reads; the server-rendered page carries the title too |
| GitHub Actions: build, init D1, Terraform apply | Orun: one convergence per merge applies the database, migrates it and deploys `<repo>-web-{stage,prod}`, smoke-tested on a check the trigger recorded |

## How the database reaches the Worker

```
infra/terraform/cloudflare-d1 ──apply──► orun secret WIRING_CLOUDFLARE_D1 (stage, prod)
                                               ▼
infra/db-migrate  dependsOn cloudflare-d1 (enforced on main) · secretEnv WIRING_CLOUDFLARE_D1
  apply:  packages/db's runner → POST …/d1/database/<id>/query, each pending migration once
                                               ▼
apps/web  dependsOn cloudflare-d1 + db-migrate (enforced on main) · secretEnv WIRING_CLOUDFLARE_D1_<ENV>
  build:  tooling/wire/live.mjs → wrangler.jsonc with the environment's database id
          (dev, verify-only, renders the fixture) → next build → opennextjs-cloudflare
  deploy: worker.ts (fetch + scheduled) and its one trigger, * * * * *
  smoke:  /api/data carries an updatedAt the trigger's checks wrote, no older than ten minutes
```

`wrangler.jsonc` is committed as the fixture render of
`wrangler.template.jsonc`, because the deploy lane's `verify-app-structure`
step checks the config exists before it builds.

## CI

| Workflow | What it runs | Ships to a product |
|---|---|---|
| `ci.yml` | the Orun pipeline, and the only workflow a product carries: `orun plan --changed`, then one job per lane. A pull request runs the verify lanes (the packages type-checked, linted, tested and built, both test suites, the D1 root planned, the Worker built and dry-deployed per environment), except the bootstrap's own landings (`orun/BASE-*`), where `plan` alone is the check; a merge applies the D1 database, migrates it, then deploys stage → prod. It plans nothing while `intent.yaml` names the placeholder workspace `ws_CHANGE_ME`, as this repository does. A manual run (Orunbase's Deploy button, or Run workflow on `main`) plans the environment and components it names under the push-to-main trigger, so they deploy as a merge deploys them | yes |
| `baseline.yml` | the baseline's own tiers: contract tests, the wiring path, the component docs, the blueprint read by the pinned orun, the leak gate, the offline bootstrap with the product's own plan, and the product built in the job tree, migrated, dry-deployed, served, its trigger fired and its checks read back | no |
| `tag.yml` | cuts a `baseline-vN` tag (manual) | no |

## Licence

UptimeFlare is © lyc8503 and its contributors, under the Apache License 2.0
(`apps/web/LICENSE`); the code here derived from it keeps that licence.
