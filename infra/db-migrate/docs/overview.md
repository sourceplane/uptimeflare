# db-migrate

Applies the monitor state's schema (packages/db's migrations) to the stage and prod Cloudflare D1 databases

Applies this repository's ordered database migrations per environment: plan on pull requests, apply on merge to `main`.

|              |                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------ |
| Type         | `db-migrate`                                                                               |
| Source       | `infra/db-migrate`                                                                         |
| Environments | `stage`: `plan`, `apply` on a push to `main` · `prod`: `plan`, `apply` on a push to `main` |

## Depends on

- **db** — The monitor state's schema as migrations, and the runner that applies them to D1 (built by the db-migrate component before it plans or applies)
- **cloudflare-d1** — Provisions the Cloudflare D1 database the monitor state lives in, for stage and prod

## Depended on by

- **web** — UptimeFlare's status page and checker in one Worker (Next.js on Cloudflare Workers + Static Assets via @opennextjs/cloudflare, the checks on its Cron Trigger, per environment)
