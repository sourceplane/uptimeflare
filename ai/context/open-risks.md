# uptimeflare — open risks

What is not yet proven or not yet decided. The full write-up of every risk,
including the accepted and resolved ones, is
`specs/epics/uptimeflare/risks-and-open-questions.md`; this page lists only
what is still live, so it should be short.

| ID | Risk | State | What closes it |
|---|---|---|---|
| UF-E | A brand-new Cron Trigger can take minutes to fire; the deploy's smoke waits for its first check under a ~4.5-minute backoff | OPEN | The first live bootstrap's timings; a rerun of the lane covers a slower first fire |
| UF-H | Not yet proven live: the `d1-edit` mint, the Terraform apply and its wiring publish, the migrations against the real D1 API, the deploy, the trigger and the workers.dev probes | OPEN | One bootstrap from a tag against a workspace whose Cloudflare token can mint D1 Edit |

Accepted, and worth knowing before you change them: UF-A (no geo checks
through Durable Objects), UF-D (one trigger per Worker), UF-G (a webhook URL
with a token is a credential in `uptime.config.ts`, as upstream designs it).
