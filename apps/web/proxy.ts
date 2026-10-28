import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Upstream's middleware.ts (Next 16 calls it proxy.ts): the whole status page
// and its API behind HTTP Basic auth. Upstream read the credentials from
// `workerConfig.passwordProtection`, a string in the committed config; here
// they are the optional Orun secret STATUS_PAGE_PASSWORD (`user:password`),
// handed to the Worker as a secret by its build — unset, the page is public.
export function proxy(request: NextRequest) {
  const passwordProtection = process.env.STATUS_PAGE_PASSWORD
  if (passwordProtection) {
    const authHeader = request.headers.get('Authorization')
    let authenticated = false
    const expected = 'Basic ' + btoa(passwordProtection)

    if (authHeader && authHeader.length === expected.length) {
      // a simple timing-safe compare
      authenticated = true
      for (let i = 0; i < authHeader.length; i++) {
        if (authHeader[i] !== expected[i]) authenticated = false
      }
    }

    if (!authenticated) {
      return NextResponse.json(
        { code: 401, message: 'Not authenticated' },
        { status: 401, headers: { 'WWW-Authenticate': 'Basic' } }
      )
    }
  }
  return NextResponse.next()
}
