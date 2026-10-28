# web — architecture

Built by the turbo pipeline from `apps/web` and deployed with wrangler.

|                     |                                                 |
| ------------------- | ----------------------------------------------- |
| Worker config       | `apps/web/wrangler.template.jsonc`              |
| Entry               | `worker.ts`                                     |
| Compatibility date  | `2026-10-01`                                    |
| Compatibility flags | `nodejs_compat`, `global_fetch_strictly_public` |

## Bindings

| Binding  | Kind          | Source                                |
| -------- | ------------- | ------------------------------------- |
| `DB`     | D1 database   | `d1_database_id` from `cloudflare-d1` |
| `ASSETS` | Static assets | `.open-next/assets`                   |

Identifiers marked _from_ a component are filled in at deploy time from
that component's published outputs for the environment being deployed.

## Scheduled triggers

- `* * * * *`

## Wiring

Resolved at deploy time from secrets the infrastructure lanes publish (names only):

- `WIRING_CLOUDFLARE_D1_PROD`
- `WIRING_CLOUDFLARE_D1_STAGE`

## Secrets resolved by the lane (names only)

- `STATUS_PAGE_PASSWORD` (optional)
