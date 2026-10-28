# uptimeflare — implementation status

As built, kept apart from the plan.

| Milestone | State | Pull request |
|---|---|---|
| UF0 — the spec | ✅ shipped | [#1](https://github.com/sourceplane/uptimeflare/pull/1) |
| UF1 — the monitor on Workers | ✅ shipped | [#2](https://github.com/sourceplane/uptimeflare/pull/2) |
| UF2 — the D1 database and its schema | ✅ shipped | [#3](https://github.com/sourceplane/uptimeflare/pull/3) |
| UF3 — ready to instantiate | ✅ this pull request | UF3 |
| UF4 — a baseline | planned | — |

## Upstream

[lyc8503/UptimeFlare](https://github.com/lyc8503/UptimeFlare) at `8035521`
(2026-10-21), Apache-2.0 — after the CVE-2026-29779 fix (2026-03-04). The
licence ships as `apps/web/LICENSE`.

## Departures from upstream, each deliberate

| # | Upstream | Here | Why |
|---|---|---|---|
| 1 | Pages project (`@cloudflare/next-on-pages`) + a checker Worker | One Worker: OpenNext's `fetch` + `scheduled` (`worker.ts`) | One deployable, one binding, one trigger; next-on-pages is deprecated |
| 2 | Next 14, `runtime = 'edge'` pages and API routes | Next 16 pages router on OpenNext's Node runtime; Node API routes with the same headers and bodies | OpenNext runs no edge runtime |
| 3 | Bindings on `process.env` | `getCloudflareContext()` | OpenNext's way to the Worker's env |
| 4 | Binding `UPTIMEFLARE_D1`, table `uptimeflare` | Binding `DB`, table `monitor_state`, same columns | The lowercase slug is this repository's identity: the rename engine rewrites it in a product and refuses the upper-case env prefix |
| 5 | `init.sql` run by `deploy/init_d1.py` | Migration `010_monitor_state`, applied by db-migrate before each deploy | The schema ships with the product and applies itself |
| 6 | `RemoteChecker` Durable Object for `worker://` proxies | Left out; such a monitor reports "not available in this port", or checks locally under `checkProxyFallback` | No Orun composition places a Durable Object |
| 7 | `workerConfig.passwordProtection` in the committed config | The optional Orun secret `STATUS_PAGE_PASSWORD`, a Worker secret | Credentials are Orun secrets, never committed |
| 8 | `middleware.ts` | `proxy.ts` (Next 16's name), same gate | Next 16 renamed middleware |
| 9 | The page's `<title>` set only in the browser | Also in the server-rendered page (`_app.tsx`) | A product's name is in its HTML; nothing else changes |
| 10 | Example monitors pointing at `example.com` and `1.2.3.4:22`, an active test maintenance | Cloudflare and GitHub over HTTPS, Google Public DNS over TCP; no maintenance | A new status page checks real, public things and shows no fake banner |
| 11 | `@mantine/ds` dependency, unused | Dropped | Nothing imports it |
| 12 | `NoSsr`'s children typed with React 18's `PromiseLikeOfReactNode` | `React.ReactNode` | React 19's types dropped that member |
| 13 | — | `next.config.mjs` traces react-textarea-autosize's edge-light build into the standalone output | OpenNext bundles under the `workerd` condition, which Next's tracing (under Node's conditions) does not follow |

Everything else — the checker loop, the compacted state, the check kinds,
incidents, grace periods, notifications, callbacks, maintenances, the pages,
components, styles and translations, the badge and data APIs — is upstream's.

## Verified

- UF1: `pnpm install`, `wire:fixture` (no diff), `typecheck`, `lint`, `test`,
  `build`; `wrangler dev --test-scheduled` — a fired trigger checked every
  monitor and wrote the state, `/api/data` read it back, the component's own
  smoke command passed (and, with a password set, refused a request without
  it); no monitor config in the client bundle.
- UF2: `terraform validate`; the migrations into real SQLite; `db:migrate:local`
  creates `monitor_state` in wrangler's local D1; a local `orun plan` for a
  push to main orders `cloudflare-d1 → db-migrate → web` per environment.

## Not verified offline

The D1 apply, the migrations against a real database, the deploy, and the
first Cron Trigger firing on Cloudflare (risk UF-E) — a live bootstrap's.
