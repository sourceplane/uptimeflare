# uptimeflare — implementation plan

Milestones land in order; each is one pull request into `main`, squash-merged
once its CI is green.

## UF0 — the spec

Intent (workspace `ws_CHANGE_ME`), `ci.yml` (turso-starter's, carrying the
manual-deploy contract), the shared tooling (TypeScript, ESLint, the wrangler
renderer, the Worker-secrets helper, the migration helpers), the spec index,
this doc set and the task contracts.

**Done when** the five documents, `epic.yaml` and `tasks/UF-1..UF-5` are on `main`.

## UF1 — the monitor on Workers

`apps/web`: the pages, components, locales and `uptime.config.ts`; `monitor/`
(upstream's `worker/src`); `worker.ts`; the wrangler template (the Cron
Trigger, the D1 token) and its fixture; `tests/web`.

**Done when**
- `pnpm install && pnpm run wire:fixture && pnpm typecheck && pnpm lint && pnpm test && pnpm build` is green
- `wrangler dev --test-scheduled` answers `/`, `GET /__scheduled?cron=*+*+*+*+*` checks every monitor, and `/api/data` then carries `updatedAt` and one entry per monitor
- the tests cover the compacted state, the checks (mocked fetch), the scheduled loop against SQLite, the API routes and the password gate — no network

## UF2 — the D1 database and its schema

`infra/terraform/cloudflare-d1`, `packages/db` (the `monitor_state` migration
and the runner over D1's REST API), `infra/db-migrate`, `tests/db`.

**Done when** `terraform validate` passes, and the migrations apply through the
runner into real SQLite with a second apply applying nothing.

## UF3 — ready to instantiate

README (configure the monitors, run, test, preview, fire a check, deploy; the
mapping table), `IMPLEMENTATION-STATUS.md`.

## UF4 — a baseline, in one landing

`blueprint.yaml`, `repo-blueprint.yaml` (`01-product`, `02-docs`), `.baseline/`,
`tooling/rebrand`, `tooling/bootstrap`, `tooling/catalog`, `hooks/`,
`ai/context/`, `docs/phases/`, `BOOTSTRAP.md`, `testing/`, `baseline.yml`,
`tag.yml`, and generated component docs.

**Done when** Baseline CI is green and `baseline-v1` is cut.
