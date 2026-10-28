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
}

export default nextConfig
