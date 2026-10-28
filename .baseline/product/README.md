# uptimeflare

A status page that checks itself: lyc8503's
[UptimeFlare](https://github.com/lyc8503/UptimeFlare) — HTTP, HTTPS and TCP
checks every minute, 90 days of uptime bars, latency charts, incident
history, scheduled maintenances, webhook notifications and a JSON API — on
**one Cloudflare Worker**: the status page built by
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) into Workers +
Static Assets, the checks on the same Worker's **Cron Trigger**, and their
state in a **Cloudflare D1** database that Terraform provisions per
environment and whose schema is applied by migrations before every deploy.

## Live deployment

<!-- 02-docs:begin -->
Not recorded yet. The bootstrap's last phase writes the live URLs, the
workspace and the secrets the site uses into
[ai/context/deployment.md](ai/context/deployment.md); how the site deploys
and how to operate it is in
[ai/context/operations.md](ai/context/operations.md).
<!-- 02-docs:end -->

## What is here

| Surface | Where |
|---|---|
| The monitors, links, maintenances and notifications | `apps/web/uptime.config.ts` (every option: `uptime.config.full.ts`) |
| The page's name and source link | `apps/web/lib/site.ts` |
| The status page, the incidents page, their components and translations | `apps/web/pages`, `apps/web/components`, `apps/web/locales` |
| The checker: the checks, incidents, notifications and the stored state | `apps/web/monitor/` |
| The Worker entry: the page's `fetch` + the checker's `scheduled` | `apps/web/worker.ts` |
| The JSON API and the status badge | `apps/web/pages/api/data.ts`, `apps/web/pages/api/badge.ts` |
| The password gate (optional) | `apps/web/proxy.ts` |
| Workers build, trigger, bindings and deploy contract | `apps/web/next.config.mjs`, `open-next.config.ts`, `wrangler.template.jsonc` + `wiring.fixture.json` (→ `wrangler.jsonc`), `component.yaml` |
| The D1 database (stage, prod) | `infra/terraform/cloudflare-d1` |
| The schema (migrations) and their runner | `packages/db`, applied by `infra/db-migrate` |
| Tests | `tests/web`, `tests/db` (vitest) |

## Configuring the monitors

Everything the page shows is in `apps/web/uptime.config.ts`: `pageConfig`
(title, header links, groups, logo, footer), `workerConfig` (the monitors,
the write cooldown, notifications, callbacks) and `maintenances`. It starts
with three public monitors — Cloudflare and GitHub over HTTPS, Google Public
DNS over TCP — so the page has something to check from its first minute;
replace them with yours. A monitor's `id` keys its history: keep it and the
history stays.

| Monitor kind | `method` | `target` |
|---|---|---|
| HTTP(S), with optional `expectedCodes`, `headers`, `body`, `responseKeyword`, `responseForbiddenKeyword`, `timeout` | `GET`, `HEAD`, `POST`, … | a URL |
| TCP connect | `TCP_PING` | `host:port` |

`globalping://` and `http(s)://` check proxies work; `worker://` proxies
(geo-specific checks in a Durable Object) are not part of this build — such a
monitor says so, or is checked from the Worker with `checkProxyFallback`.
Only each monitor's `id`, `name`, `tooltip`, `statusPageLink` and
`hideLatencyChart` reach the browser. A webhook whose URL embeds a token is a
credential in this file: keep the repository private, or notify from a
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
pnpm --filter @app/web dev                # http://localhost:3000 — the pages, against that D1
pnpm --filter @app/web preview            # wrangler dev over the built Worker, same local D1
```

To watch a check run locally, serve the built Worker with a test scheduler
and fire it:

```bash
cd apps/web
pnpm exec wrangler dev --port 8808 --config wrangler.jsonc --test-scheduled
curl "http://127.0.0.1:8808/__scheduled?cron=*+*+*+*+*"   # runs the checker once
curl http://127.0.0.1:8808/api/data                      # the state it wrote
```

## A private status page

Store `user:password` as this repository's Orun secret
`STATUS_PAGE_PASSWORD` for an environment, then redeploy it (below, "Deploy
by hand"): the build hands it to the Worker as a secret, never into a bundle,
and every page and API request then asks for those credentials — the deploy's
own smoke test sends them. Locally, put the same line in `apps/web/.dev.vars`
(see `.dev.vars.example`). Deleting the Orun secret leaves the Worker's copy:
remove that too, with `wrangler secret delete STATUS_PAGE_PASSWORD --name
uptimeflare-web-<env>`.

## How the database is wired

The Worker binds the database as `DB`. Its id is never hand-written:
`apps/web/wrangler.template.jsonc` names it as a wiring token, and
`wrangler.jsonc` is that template rendered — from `wiring.fixture.json`
(placeholder ids) for local work and verification, and on every deploy from
the document the `cloudflare-d1` Terraform root publishes after its apply
(`WIRING_CLOUDFLARE_D1`, per environment). Edit the template, then
`pnpm run wire:fixture` and commit the render with the template.

The schema is `packages/db`'s migrations: each
`src/migrations/<NNN>_<name>/up.sql` is listed in `src/manifest.ts` with its
checksum, and the `db-migrate` component applies the pending ones to each
environment's database before the Worker deploys. The checker keeps one row
in `monitor_state` — the whole compacted state, rewritten when a status
changes and otherwise every three minutes. To change the schema, add a
migration (never edit an applied one — its checksum is recorded), then
`pnpm --filter @saas/db run manifest:fix`.

## How it deploys

Merges to `main` converge through [Orun](https://github.com/sourceplane/orun):
`.github/workflows/ci.yml` plans the changed components and runs each lane
against the workspace in `intent.yaml`. Per environment, the D1 database
applies first, then its migrations, then the Worker builds with that
environment's database id and deploys with its Cron Trigger — to `stage`,
then to `prod` once stage has converged on the same commit; `dev` only
verifies. The Worker is `uptimeflare-web-<env>` on your account's
workers.dev subdomain, and every deploy is smoke-tested: `/api/data` must
carry a check the trigger recorded in the last ten minutes, which only that
Worker, reading its database, can answer. A pull request runs the same
pipeline's verify lanes — the packages type-checked, linted, tested and
built, both test suites, the Worker built and dry-deployed for each
environment — with nothing deployed.

The pipeline holds one credential, GitHub's own `GITHUB_TOKEN`. The
Cloudflare tokens (one to deploy, one scoped to D1) and the account id are
brokered per run from the workspace's Cloudflare connection, and the
database ids travel as Orun secrets; nothing provider-shaped is stored in the
repository or in GitHub.

**Deploy by hand.** Orunbase's **Deploy** button on a component, or **Run
workflow** on the CI workflow in GitHub's Actions tab (on `main`), runs
`ci.yml` for the environment and components you pick, and each one deploys
exactly as a merge would deploy it. Leave the component blank to redeploy
every component in that environment, with nothing changed: after storing
`STATUS_PAGE_PASSWORD`, say. A component with nothing to run in that
environment (a test suite in `prod`) is left out with a notice.

## Custom domain

The status page answers on workers.dev from its first deploy. To serve it on
your own domain, add the domain to the Cloudflare account the site deploys
into and attach it to the Worker (dashboard → Workers & Pages →
`uptimeflare-web-prod` → Settings → Domains & Routes → Add → Custom
domain). The page renders no absolute link to itself, so nothing else has to
change; the repository names the domain in one place, `BASE_DOMAIN` in
`intent.yaml`, which the site was born with as the reserved placeholder
`uptimeflare.example.com`. Replace it with your domain in the same change
that records it.

## Licence

UptimeFlare is © lyc8503 and its contributors, under the Apache License 2.0
(`apps/web/LICENSE`); the code here derived from it keeps that licence.
