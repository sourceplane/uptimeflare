import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// `next dev` reaches the D1 binding through wrangler's local platform proxy
// (render apps/web/wrangler.jsonc first: `pnpm run wire:fixture`).
initOpenNextCloudflareForDev()

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Required by @opennextjs/cloudflare, which bundles `.next/standalone/**`
  // into the Worker; traced from the monorepo root.
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  // OpenNext bundles the Worker with the `workerd` export condition, and
  // react-textarea-autosize (a Mantine dependency) points that condition at
  // its edge-light build, which Next's tracing — done under Node's conditions
  // — never copies into the standalone output. Trace it in by hand.
  outputFileTracingIncludes: {
    '/*': ['../../node_modules/.pnpm/react-textarea-autosize@*/node_modules/react-textarea-autosize/dist/*edge-light*'],
  },
  experimental: {
    // Dev server only: behind orun.work's live Preview the browser's Origin
    // is the preview's host while `next dev` sees a local Host, and Next.js
    // refuses a Server Action from an origin it is not told about. `next
    // build` runs with NODE_ENV=production, so production keeps its
    // same-origin check.
    ...(process.env.NODE_ENV === 'development'
      ? { serverActions: { allowedOrigins: ['*.orun-preview.app', 'preview-gateway-stage.oruncloud.workers.dev'] } }
      : {}),
  },
  // Dev server only (`next build` ignores it): orun.work's live Preview tab
  // loads `next dev` from the preview's own host, and Next.js refuses the
  // hot reload and other /_next/* dev requests from an origin it is not told
  // about. These are the preview's hosts, prod's and stage's.
  allowedDevOrigins: ['*.orun-preview.app', 'preview-gateway-stage.oruncloud.workers.dev'],
}

export default nextConfig
