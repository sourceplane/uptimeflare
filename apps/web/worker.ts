// The Worker's entry (wrangler `main`). @opennextjs/cloudflare generates a
// worker that exports only `fetch` — the status page and its API. This re-uses
// that handler and adds the `scheduled` handler the Cron Trigger calls, the
// way the adapter's custom-worker howto describes
// (https://opennext.js.org/cloudflare/howtos/custom-worker): every minute it
// runs UptimeFlare's checker (monitor/), which upstream deployed as a second
// Worker. One Worker serves the page and runs the checks, binding one D1.
// @ts-ignore `.open-next/worker.js` is generated at build time
import { default as handler } from './.open-next/worker.js'
import monitor from './monitor'

const worker = {
  fetch: handler.fetch,
  scheduled: monitor.scheduled,
} satisfies ExportedHandler<CloudflareEnv>

export default worker
