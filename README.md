# uptimeflare

[UptimeFlare](https://github.com/lyc8503/UptimeFlare) — lyc8503's uptime
monitor and status page — on **one Cloudflare Worker**: the status page built
by [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare), its checks
on a **Cron Trigger** of the same Worker, their state in a **Cloudflare D1**
database provisioned by Terraform through [Orun](https://github.com/sourceplane/orun),
and packaged, once it is built, as an **Orun baseline**.

Being built in reviewed steps; the plan and its status are in
[`specs/epics/uptimeflare`](specs/epics/uptimeflare/README.md).

UptimeFlare is © lyc8503 and contributors, under the Apache License 2.0.
