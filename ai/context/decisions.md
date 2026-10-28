# uptimeflare — decisions

The choices that shape this repository, one line each, with where the full
reasoning lives.

| # | Decision | Why | Source |
|---|---|---|---|
| 1 | One Worker: `worker.ts` re-exports OpenNext's `fetch` and adds the checker's `scheduled`, instead of upstream's Pages project plus a second Worker | One deployable, one binding, one trigger, one smoke (cron-starter's shape) | design.md §2 |
| 2 | The pages run in OpenNext's Node runtime; the edge exports go and the two API routes become Node API routes with the same headers and bodies | OpenNext runs no edge runtime; next-on-pages is deprecated | risk UF-B |
| 3 | The binding is `DB` and the table `monitor_state` | The lowercase slug `uptimeflare` is this tree's identity: the rename engine rewrites it and refuses `UPTIMEFLARE_` | risk UF-C, `tooling/rebrand/rebrand.mjs` |
| 4 | The schema is a migration (`packages/db`'s `010_monitor_state`), applied by `infra/db-migrate` between the D1 apply and the Worker's deploy | The checker and the page never write DDL; the convergence's order includes the schema (turso-starter's TU5) | design.md §2 |
| 5 | The Durable Object remote checker is left out; `worker://` monitors report why, or fall back | No Orun composition places a Durable Object | risk UF-A |
| 6 | The status page's password is the optional Orun secret `STATUS_PAGE_PASSWORD`, a Worker secret set by the build | Credentials are Orun secrets, never a string in the committed config | design.md §2 |
| 7 | ONE Cron Trigger per Worker, every minute | Upstream's schedule; two per product fit Workers Free's five per account | risk UF-D |
| 8 | The smoke reads `/api/data`'s `updatedAt`, no older than ten minutes | Only the Worker, reading the state its own trigger wrote to the migrated database, answers it; read-only | `apps/web/component.yaml` |
| 9 | `wrangler.jsonc` is rendered from the D1 root's wiring document per environment, and the fixture render is committed; dev renders the fixture | The deploy lane checks the config exists before the build; no root applies in dev | turso-starter |
| 10 | One landing (`01-product`) then the record (`02-docs`); edges `mode: enforced` on main, advisory on a pull request | The plan, not a landing boundary, orders the database, its schema and the Worker | `repo-blueprint.yaml` |
| 11 | The D1 apply and the migrations use their own `d1-edit` key (`CLOUDFLARE_D1_TOKEN`) | The `workers-deploy` token cannot touch D1 | `repo-blueprint.yaml` |
| 12 | The migrations package is named `@saas/db` | stack-tectonic's db-migrate composition builds `--filter=@saas/db` | turso-starter |
| 13 | stack-tectonic 0.19.0 | 0.20.0 links the install out of the job's tree, which Next 16's Turbopack refuses | `intent.yaml` (the pin's comment) |
| 14 | Component docs are generated from the manifests and checked in CI | A hand-written copy of the dependency graph, bindings and migrations drifts silently | `tooling/catalog/gen-component-docs.py` |
| 15 | The console card reads `subdomain` from the Cloudflare connection and asks for no domain | Both belong to the account or come later; a typed one could only be wrong | `blueprint.yaml` |
| 16 | The page hands the browser only `id`, `name`, `tooltip`, `statusPageLink` and `hideLatencyChart` per monitor | CVE-2026-29779: the config's credentials never leave the Worker; a test holds the list | risk UF-F |
