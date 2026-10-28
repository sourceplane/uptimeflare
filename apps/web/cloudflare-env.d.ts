// The bindings wrangler.jsonc declares, as the Worker (and `next dev` through
// the platform proxy) sees them. Keep in step with wrangler.template.jsonc.
// The Workers runtime types (D1Database, ExportedHandler, …) come from
// @cloudflare/workers-types, as upstream's checker Worker had them.
interface CloudflareEnv {
  DB: D1Database
  ASSETS: Fetcher
}
