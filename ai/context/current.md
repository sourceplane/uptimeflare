# uptimeflare — where this repository stands

The entry page for anyone (or any agent) picking this repository up. It is
this repository's own state and does not ship to a product built from it;
the two pages that do are [operations.md](operations.md) and
[deployment.md](deployment.md).

## What it is

lyc8503's UptimeFlare — an uptime monitor and status page — as ONE Cloudflare
Worker: the status page built by OpenNext into Workers + Static Assets, the
checks on that Worker's every-minute Cron Trigger, their state in a D1
database Terraform provisions and a migration shapes, packaged as an Orun
baseline: `orun new --blueprint repo-blueprint.yaml` builds a new product in
its own repository and takes it to live on stage and prod in one landing
(`01-product`: cloudflare-d1 → db-migrate → web per environment), then records
what went live (`02-docs`).

## Release

| | |
|---|---|
| Latest tag | `baseline-v1` (UF4) — the first; built on turso-starter's `main` shape (orun v2.88.0 floor, the manual-deploy contract) |
| Proven live | No. Everything short of the platform is proven offline in Baseline CI: the migration lane against a stand-in D1 API, and the built Worker served by `wrangler dev`, its scheduled handler fired and its checks read back through `/api/data` with the component's own smoke; a live bootstrap from the tag is still to come (risk UF-H) |

## Where to read

| Question | Page |
|---|---|
| What shipped, and every departure from upstream | `specs/epics/uptimeflare/IMPLEMENTATION-STATUS.md` |
| Why it is built this way | [decisions.md](decisions.md), then `specs/epics/uptimeflare/design.md` |
| What could still go wrong | [open-risks.md](open-risks.md), then `specs/epics/uptimeflare/risks-and-open-questions.md` |
| How to instantiate it | `BOOTSTRAP.md`, `docs/phases/` |
| What each component is | `<component>/docs/` beside each `component.yaml` — `apps/web`, `packages/db`, `infra/db-migrate`, `infra/terraform/cloudflare-d1`, `tests/{web,db}` (generated; `python3 tooling/catalog/gen-component-docs.py`) |

## Next

1. Bootstrap one product from `baseline-v1` against a workspace whose
   Cloudflare token can mint D1 Edit as well as Workers Scripts, and record
   its timings — the first trigger's delay included (closes UF-E, UF-H).
