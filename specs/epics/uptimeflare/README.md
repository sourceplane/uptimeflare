# Epic: uptimeflare (UF)

**UptimeFlare already runs on Cloudflare — as two deployables, a Pages project built by `@cloudflare/next-on-pages` for the status page and a Worker for the checks, sharing one D1 database. This port makes it ONE Worker: the status page built by `@opennextjs/cloudflare`, and a custom entry (`worker.ts`, cron-starter's shape) that re-exports the generated `fetch` and adds `scheduled`, so the Cron Trigger that runs upstream's monitor loop lives on the Worker that serves the page. The state stays in D1, the way upstream keeps it since 2026-01, in a database Terraform provisions per environment through Orun (turso-starter's `cloudflare-d1` root), its table applied by db-migrate before the Worker deploys.**

The port keeps the status page, the incident history, the latency charts, the badge and JSON APIs, the HTTP/HTTPS/TCP checks with their codes, keywords, timeouts and grace periods, maintenances, webhooks and callbacks. It leaves out the Durable Object remote checker (geo-specific checks), which only a `worker://` check proxy used; `globalping://` and `http(s)://` proxies still work.

## Status

| Field | Value |
|-------|-------|
| Status | ✅ UF0–UF3 shipped (#1–#4); UF4 tagged `baseline-v1`. D1 apply, migrations, live deploy and the first trigger proven only by a live bootstrap (risks UF-E, UF-H) |
| Cluster | **UF** (UF0–UF4) |
| Owner(s) | `apps/web` (the status page, `worker.ts`, `monitor/`, `uptime.config.ts`) · `tests/web` · `infra/terraform/cloudflare-d1` · `packages/db` + `infra/db-migrate` · `tests/db` |
| Builds on | `cron-starter` (one OpenNext Worker with a `scheduled` handler on its own Cron Trigger), `turso-starter` (the `cloudflare-d1` root, the D1 migration runner and `db-migrate`), `cirrus-baseline` (the `@@wiring(...)@@` deploy-time render) |
| Upstream | [lyc8503/UptimeFlare](https://github.com/lyc8503/UptimeFlare) (Apache-2.0), at `8035521` (2026-10-21) — after the CVE-2026-29779 fix |
| Changes | One Worker instead of a Pages project and a Worker; OpenNext instead of next-on-pages; the D1 binding `DB` and the table `monitor_state` (the rename engine owns the lowercase slug); the remote checker left out; the status-page password an Orun secret instead of a config string |
| Gate | UF1 is the first user-visible rung. UF2 applies only with a linked workspace; verified by `terraform validate` and the migrations run into real SQLite |

## Read order

1. `design.md` — what maps to what, the scheduled flow, what is out of scope
2. `implementation-plan.md` — the milestones and what "done" means for each
3. `risks-and-open-questions.md` — what could go wrong and what was decided
4. `IMPLEMENTATION-STATUS.md` — what actually shipped (kept distinct from intent)

## Milestones at a glance

| Milestone | What it lands | Done when |
|---|---|---|
| UF0 — the spec | intent, CI, tooling, the spec index, this doc set and the task contracts | merged on `main` |
| UF1 — the monitor on Workers | `apps/web` (the page, `worker.ts`, `monitor/`), the rendered wrangler config, `tests/web` | `wrangler dev --test-scheduled` records a check of every monitor in the local D1 and the page shows it |
| UF2 — the D1 database and its schema | `infra/terraform/cloudflare-d1`, `packages/db`, `infra/db-migrate`, `tests/db` | the root validates; the migrations apply into real SQLite and a second apply applies nothing |
| UF3 — ready to instantiate | README, as-built status | a reader can configure, run, test, preview and deploy it |
| UF4 — a baseline | card, build document (`01-product` + `02-docs`), rename, bootstrap tooling, tests | a new status page goes from nothing to live in one landing; Baseline CI green |
