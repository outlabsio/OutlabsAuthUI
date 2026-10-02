import { safeAppRedirect } from './session-lifecycle'

// Where a guest flow lands after signing in, and which guest pages a signed-in browser may
// open. Pure; the pages read the route and window origin and pass them in.

/**
 * An in-app destination from a redirect value: an `/app/…` path, or an absolute URL on this
 * console's own origin whose path is in the app (the backend's canonical `next_url`, and the
 * `redirect` a host puts on emailed links, are absolute). Anything else is refused
 * (open-redirect guard). Returns the path with its query and hash, or null.
 */
export function safeAuthRedirect(value: unknown, origin: string | null | undefined): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const direct = safeAppRedirect(value)
  if (direct) return direct
  if (!origin || !/^https?:\/\//i.test(value)) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.origin !== origin || url.username || url.password) return null
  return safeAppRedirect(`${url.pathname}${url.search}${url.hash}`)
}

/**
 * The page to open after a successful sign-in: the server-validated `next_url` of a
 * passwordless challenge when it names an in-app page, else the flow's own `?redirect`, else
 * the dashboard.
 */
export function postSignInDestination(input: {
  nextUrl?: string | null
  redirect?: unknown
  origin?: string | null
  fallback?: string
}): string {
  return safeAuthRedirect(input.nextUrl, input.origin)
    ?? safeAuthRedirect(input.redirect, input.origin)
    ?? input.fallback
    ?? '/app/dashboard'
}

function hasToken(query: Record<string, unknown>): boolean {
  const token = query.token
  return typeof token === 'string' && token.trim() !== ''
}

/**
 * Guest pages a signed-in browser may still open. Everything else under /auth bounces to the
 * app. Reset-password: the token is the authorization (phone recovery emails it to a signed-in
 * user). Magic-link and accept-invite links may be meant for a different account than the one
 * signed in here (a shared machine), so the page asks before switching instead of silently
 * landing on the current account's dashboard.
 */
export function authRouteAllowsSignedIn(path: string, query: Record<string, unknown>): boolean {
  // A static host may serve the generated `auth/<page>/index.html` as `/auth/<page>/`.
  const page = path.replace(/\/+$/, '')
  if (page === '/auth/reset-password') return true
  if (page === '/auth/magic-link' || page === '/auth/accept-invite') return hasToken(query)
  return false
}
