import { useSessionStore } from '~/stores/session'
import type { AuthConfig } from '~/types/auth'

// A5 — one global guard. /app/** requires an authenticated session; the auth flows live
// outside it. Session is hydrated by the 00.runtime-config boot plugin before the first
// navigation is evaluated, so isAuthenticated is trustworthy here.

// A1 — capability-gated routes: a deep link to a feature the mounted backend doesn't expose
// redirects to the dashboard (the nav already hides these links; this covers direct URLs).
const capabilityRoutes: { prefix: string, feature: keyof AuthConfig['features'] }[] = [
  { prefix: '/app/entities', feature: 'entity_hierarchy' },
  { prefix: '/app/api-keys', feature: 'api_keys' },
  { prefix: '/app/audit', feature: 'activity_tracking' }
]

export default defineNuxtRouteMiddleware((to) => {
  const session = useSessionStore()

  const isAppRoute = to.path === '/app' || to.path.startsWith('/app/')
  const isAuthRoute = to.path === '/auth' || to.path.startsWith('/auth/')

  if (isAppRoute && !session.isAuthenticated) {
    return navigateTo({ path: '/auth/login', query: { redirect: to.fullPath } })
  }

  if (isAuthRoute && session.isAuthenticated) {
    return navigateTo('/app/dashboard')
  }

  if (isAppRoute && session.isAuthenticated) {
    const gated = capabilityRoutes.find(r => to.path === r.prefix || to.path.startsWith(`${r.prefix}/`))
    if (gated && session.capabilities && !session.can(gated.feature)) {
      return navigateTo('/app/dashboard')
    }
  }
})
