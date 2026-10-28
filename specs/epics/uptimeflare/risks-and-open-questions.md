# uptimeflare — risks and open questions

| # | Risk / question | Decision |
|---|---|---|
| UF-A | Upstream's geo-specific checks run in a Durable Object placed by a location hint. No Orun composition places a Durable Object, and the brief forbids hacking one in. | Left out. A `worker://` check proxy reports the monitor down with "not available in this port", or checks locally when `checkProxyFallback` is set. Globalping and HTTP proxies are unchanged. |
| UF-B | `@cloudflare/next-on-pages` is deprecated; its pages declared `runtime = 'edge'`, which OpenNext does not run. | The pages run in OpenNext's Node runtime; bindings come from `getCloudflareContext()` instead of `process.env`. |
| UF-C | The lowercase slug `uptimeflare` is this repository's identity: the rename engine rewrites it in a product, and its sweep refuses `UPTIMEFLARE_`. Upstream names its table `uptimeflare` and its binding `UPTIMEFLARE_D1`. | Table `monitor_state`, binding `DB`. Credits spell the upstream `UptimeFlare`, which the engine does not touch. |
| UF-D | Cloudflare allows five Cron Triggers per account on Workers Free. | One trigger per Worker — two per product (stage, prod). |
| UF-E | A brand-new Cron Trigger can take minutes to fire, and the smoke reads a check the trigger recorded. | The smoke runs under the composition's backoff (~4.5 min); a rerun of the lane covers a slower first fire. |
| UF-F | CVE-2026-29779 exposed `uptime.config.ts` (credentials included) to clients. | Ported from upstream after the fix: the pages hand the client only `id`, `name`, `tooltip`, `statusPageLink` and `hideLatencyChart`; a test holds that list. |
| UF-G | A webhook URL that embeds a token is a credential in `uptime.config.ts`. | Upstream's design, kept: the config is the product's own code in its own repository. The password, the one credential the port reads itself, is an Orun secret. |
| UF-H | The D1 apply, the migrations and the live deploy are proven only by a live bootstrap. | Offline: `terraform validate`, the runner against a stand-in D1 API over SQLite, and the Worker served by `wrangler dev`. |
