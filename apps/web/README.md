# apps/web — the status page and its checker, in one Worker

[UptimeFlare](https://github.com/lyc8503/UptimeFlare) (lyc8503, Apache-2.0)
on Cloudflare Workers + Static Assets through `@opennextjs/cloudflare`. The
pages (`pages/`, `components/`, `locales/`) are upstream's, on the Next.js
pages router; `worker.ts` adds the `scheduled` handler that runs upstream's
checker (`monitor/`, upstream's `worker/src`) on the Worker's Cron Trigger.

| What | Where |
|---|---|
| The monitors, the page's links, maintenances, notifications | `uptime.config.ts` (all options: `uptime.config.full.ts`) |
| The page's name and source link | `lib/site.ts` |
| The checker (HTTP/HTTPS/TCP checks, incidents, webhooks, the state) | `monitor/` |
| The Worker's entry: OpenNext's `fetch` + the checker's `scheduled` | `worker.ts` |
| The password gate (the optional `STATUS_PAGE_PASSWORD` secret) | `proxy.ts` |
| The JSON API and the badge | `pages/api/data.ts`, `pages/api/badge.ts` |
| Bindings, the Cron Trigger | `wrangler.template.jsonc` (+ `wiring.fixture.json` → the committed `wrangler.jsonc`) |

```bash
pnpm run wire:fixture                 # render wrangler.jsonc from the fixture (committed)
pnpm db:init:local                    # create the monitor_state table in wrangler's local D1
pnpm build                            # next build + opennextjs-cloudflare build
pnpm exec wrangler dev --test-scheduled
curl 'http://localhost:8787/__scheduled?cron=*+*+*+*+*'   # run the checker once
curl http://localhost:8787/api/data                        # the state it wrote
```

`next dev` serves the pages against the same local D1 through wrangler's
platform proxy; the checker runs only under `wrangler dev`, which has a
`scheduled` event to give it.
