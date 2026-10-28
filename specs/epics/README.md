# Epics

Orun-style work programs. Each epic is a folder carrying `epic.yaml` (the
declaration the platform reads: slug, key prefix, milestones with exit
criteria and task keys) beside its doc set. The pull request that adds the
folder is the adoption; the merge creates the epic in the workspace.

| Epic | Cluster | Status | What it is |
|------|---------|--------|------------|
| [`uptimeflare/`](./uptimeflare/) | **UF** | In progress | UptimeFlare's uptime monitor and status page, equivalent in code and function, on ONE Cloudflare Worker — the status page built by OpenNext, the checks on a Cron Trigger of the same Worker, their state in Cloudflare D1 — and an Orun baseline that instantiates it in one landing |

As-built ≠ intent: what shipped lives in each epic's `IMPLEMENTATION-STATUS.md`.
