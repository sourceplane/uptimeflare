# cloudflare-d1

Provisions the Cloudflare D1 database the monitor state lives in, for stage and prod

Terraform-managed infrastructure, planned and applied per environment by its CI lane.

|              |                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Type         | `terraform`                                                                                          |
| Source       | `infra/terraform/cloudflare-d1`                                                                      |
| Environments | `stage`: `plan-only`, `apply` on a push to `main` · `prod`: `plan-only`, `apply` on a push to `main` |

## Depends on

- (none)

## Depended on by

- **db-migrate** — Applies the monitor state's schema (packages/db's migrations) to the stage and prod Cloudflare D1 databases
- **web** — UptimeFlare's status page and checker in one Worker (Next.js on Cloudflare Workers + Static Assets via @opennextjs/cloudflare, the checks on its Cron Trigger, per environment)
