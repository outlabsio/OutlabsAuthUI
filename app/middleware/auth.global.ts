import { useQueryCache } from '@pinia/colada'
import { consumePendingSessionEnd } from '~/auth/session-events'
import { SESSION_KEY } from '~/queries/session'
import { ensureAuthConfig } from '~/queries/capabilities'
import type { SessionUser } from '~/types/auth'
import { capabilityAvailable, findAppSection, legacyRedirect, requiresCapabilities } from '~/utils/capabilities'
import { authRouteAllowsSignedIn, safeAuthRedirect } from '~/utils/auth-redirect'

// A5 — one global guard, reading the Colada-owned auth state directly from the query cache
// (seeded by the 00.runtime-config boot plugin, so it's trustworthy on the first navigation).
// A1 — capability-gated routes: a deep link to a section whose router surface / feature the
// backend doesn't expose redirects to the dashboard. The rule comes from the same APP_SECTIONS
// table the sidebar and AppPermissionGate use, so nav visibility equals page visibility.
// Permission denial is NOT a redirect: the page's AppPermissionGate renders it in place.
export default defineNuxtRouteMiddleware(async (to) => {
  const queryCache = useQueryCache()
  const user = queryCache.getQueryData<SessionUser | null>(SESSION_KEY)
  const isAuthenticated = user != null

  const isAppRoute = to.path === '/app' || to.path.startsWith('/app/')
  const isAuthRoute = to.path === '/auth' || to.path.startsWith('/auth/')

  // A section's former route (e.g. /app/users/api-keys, now /app/service-accounts) goes to its
  // current one first, keeping the query (scope, entity, ...) and hash; the next pass checks
  // sign-in and capabilities for the real route.
  const moved = isAppRoute ? legacyRedirect(to.path) : null
  if (moved) return navigateTo({ path: moved, query: to.query, hash: to.hash }, { replace: true })

  if (isAppRoute && !isAuthenticated) {
    // A session that just ended (e.g. refused during boot) explains itself on the sign-in page.
    const reason = consumePendingSessionEnd()
    return navigateTo({ path: '/auth/login', query: { ...(reason ? { reason } : {}), redirect: to.fullPath } })
  }

  // Signed-in users bounce off the auth pages, except the emailed-link landings that must
  // work (or ask first) while a session exists: reset-password (phone-OTP recovery emails it to
  // a signed-in user; the token is the authorization), and magic-link / accept-invite, which may
  // be meant for another account and ask before switching (authRouteAllowsSignedIn).
  // A pending ?redirect (e.g. after a retried boot or a sign-in in another tab) is honoured.
  if (isAuthRoute && isAuthenticated && !authRouteAllowsSignedIn(to.path, to.query)) {
    return navigateTo(safeAuthRedirect(to.query.redirect, window.location.origin) ?? '/app/dashboard')
  }

  if (isAppRoute && isAuthenticated) {
    const section = findAppSection(to.path)
    if (!section || !requiresCapabilities(section.requires)) return
    // Fail closed: without a resolved /auth/config nothing capability-gated is known to exist.
    // One retry here; if it still fails the route renders, but its AppPermissionGate shows the
    // "capabilities unavailable" state with Retry and its queries stay disabled.
    const config = await ensureAuthConfig(queryCache)
    if (config && !capabilityAvailable(section.requires, config)) {
      return navigateTo('/app/dashboard')
    }
  }
})
