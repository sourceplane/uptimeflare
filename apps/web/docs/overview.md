# web

UptimeFlare's status page and checker in one Worker (Next.js on Cloudflare Workers + Static Assets via @opennextjs/cloudflare, the checks on its Cron Trigger, per environment)

A Cloudflare Worker with Static Assets (server rendering plus static files), deployed per environment by its CI lane.

|              |                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| Type         | `cloudflare-workers-assets-turbo`                                                                                  |
| Source       | `apps/web`                                                                                                         |
| Package      | `@app/web`                                                                                                         |
| Environments | `dev`: `verify` · `stage`: `verify`, `deploy` on a push to `main` · `prod`: `verify`, `deploy` on a push to `main` |

## Depends on

- **cloudflare-d1** — Provisions the Cloudflare D1 database the monitor state lives in, for stage and prod
- **db-migrate** — Applies the monitor state's schema (packages/db's migrations) to the stage and prod Cloudflare D1 databases

## Depended on by

- (none)
