// OpenNext Cloudflare adapter config.
//
// Nothing is cached between requests and nothing revalidates: the page renders
// per request (only to put its Open Graph image on the request's origin; SWR
// polls the API routes from the browser), and the API routes are dynamic. The
// static-assets incremental cache is the read-only one, with no R2/KV/D1 to
// provision for it. A template that revalidates (ISR, `revalidateTag`) swaps
// this for the R2 incremental cache plus a tag cache.
import { defineCloudflareConfig } from "@opennextjs/cloudflare/config";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
