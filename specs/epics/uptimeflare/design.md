# uptimeflare — design

## 1. What the upstream is

[UptimeFlare](https://github.com/lyc8503/UptimeFlare) (lyc8503, Apache-2.0)
is a serverless uptime monitor and status page. Two deployables share one D1
database:

- **The checker** (`worker/`): a Worker whose `scheduled` handler runs every
  minute. It checks every monitor in `uptime.config.ts` — HTTP(S) with a
  method, headers, body, expected codes, required and forbidden keywords and
  a timeout, or `TCP_PING` through `cloudflare:sockets` — five at a time
  (`p-limit`), from the Worker's own colo, or through a check proxy
  (`worker://<region>` a Durable Object placed in that region, `globalping://`
  the Globalping API, `http(s)://` a proxy of the operator's). It folds the
  results into one compacted state — per monitor an incident list and twelve
  hours of latency, hex-packed — opens and closes incidents, sends webhook
  notifications after a grace period, calls the config's callbacks, and
  writes the state to D1 (`uptimeflare(key, value)`, key `state`) when it
  changed or the write cooldown (`kvWriteCooldownMinutes`, 3) passed.
- **The status page** (Next.js 14 pages router, Mantine, Chart.js, i18next):
  `/` (overall status, the monitor list with 90-day bars and latency charts),
  `/incidents` (maintenances by month), `/api/data` (JSON status),
  `/api/badge` (a shields.io endpoint), built by `@cloudflare/next-on-pages`
  into a Pages project with the D1 binding. `middleware.ts` puts the whole
  site behind Basic auth when the config sets `passwordProtection`.

Terraform (`deploy.tf`) creates the database, the Worker, its Cron Trigger and
the Pages project; a GitHub workflow builds and applies them.

## 2. The mapping (upstream → this port)

| Upstream | Here |
|---|---|
| A Pages project (`@cloudflare/next-on-pages`) for the status page | The same pages on Cloudflare Workers + Static Assets, built by `@opennextjs/cloudflare` (Next 16, pages router kept); `export const runtime = 'edge'` dropped — OpenNext runs the Node runtime |
| A second Worker (`worker/src/index.ts`) with a Cron Trigger | The SAME Worker: `apps/web/worker.ts` re-exports the generated `fetch` and adds `scheduled`, which runs the monitor loop (`apps/web/monitor/`, upstream's `worker/src/` with its logic unchanged). One Cron Trigger, `* * * * *`, as upstream's |
| `env.UPTIMEFLARE_D1` | `env.DB`, read through `getCloudflareContext()` in the pages and API routes (next-on-pages put bindings on `process.env`) |
| Table `uptimeflare(key, value)` created by `init.sql` / `deploy/init_d1.py` | Table `monitor_state(key, value)` — same columns — created by the migration `010_monitor_state`, applied by db-migrate before the Worker deploys. Renamed because the lowercase slug `uptimeflare` is this repository's identity, which the rename engine rewrites in a product |
| `deploy.tf`'s D1 database, Worker, Cron Trigger, Pages project | `infra/terraform/cloudflare-d1` (one database per environment, its id published as the `WIRING_CLOUDFLARE_D1` wiring document); the Worker, its Cron Trigger and its static assets deploy in one `wrangler deploy` from `apps/web/component.yaml` |
| The Durable Object `RemoteChecker` (`worker://` check proxy, geo-specific checks) | Left out: a `worker://` monitor is reported down ("not available in this port") unless it sets `checkProxyFallback`, which checks it locally. `globalping://` and `http(s)://` proxies are unchanged |
| `workerConfig.passwordProtection` (a string in the committed config) | The optional Orun secret `STATUS_PAGE_PASSWORD` (`user:password`), handed to the Worker as a secret by its build; `proxy.ts` (Next 16's middleware) enforces Basic auth when it is set |
| `pageConfig.title`, the header links | `lib/site.ts`'s `SITE_NAME` (the rename seam) and `SOURCE_URL` |
| GitHub Actions + Terraform deploy | Orun: one convergence per merge applies the database, migrates it and deploys `<repo>-web-{stage,prod}`, smoke-tested on a check the Worker recorded |

## 3. The scheduled flow

```
Cron Trigger "* * * * *" fires on uptimeflare-web-<env>
  └─ worker.ts  scheduled(controller, env, ctx)
       └─ monitor/index.ts  runMonitors(env)              (upstream's Worker.scheduled, verbatim logic)
            ├─ read state: SELECT value FROM monitor_state WHERE key = 'state'   (env.DB)
            ├─ check every monitor, five at a time (monitor/monitor.ts)
            ├─ open/close incidents, notify, call callbacks (monitor/util.ts)
            └─ write state when it changed or the cooldown passed
                 INSERT … ON CONFLICT(key) DO UPDATE                           (env.DB)

Browser GET /           → pages/index.tsx getServerSideProps → the state string → rendered client-side (NoSsr)
GET /api/data           → { up, down, updatedAt, monitors, maintenances }   ← the deploy's smoke reads updatedAt
```

## 4. Out of scope

- Geo-specific checks through Durable Objects (no Orun composition places a
  Durable Object; §2).
- Upstream's KV-to-D1 migration script (`deploy/migrate_kv.py`): a product
  starts on D1.
- The Docker self-host image and the Vercel-hosted check proxy (`proxy/`).
