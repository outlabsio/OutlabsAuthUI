import { useQueryCache } from '@pinia/colada'
import { AUTH_CONFIG_KEY, SESSION_KEY } from '~/queries/session'
import type { AuthConfig, SessionUser } from '~/types/auth'

// A5 — one global guard, reading the Colada-owned auth state directly from the query cache
// (seeded by the 00.runtime-config boot plugin, so it's trustworthy on the first navigation).
// A1 — capability-gated routes: a deep link to a feature the mounted backend doesn't expose
// redirects to the dashboard (the nav already hides these links; this covers direct URLs).
const capabilityRoutes: { prefix: string, feature: keyof AuthConfig['features'] }[] = [
  { prefix: '/app/entities', feature: 'entity_hierarchy' },
  { prefix: '/app/api-keys', feature: 'api_keys' },
  { prefix: '/app/users/api-keys', feature: 'api_keys' },
  { prefix: '/app/audit', feature: 'activity_tracking' }
]

export default defineNuxtRouteMiddleware((to) => {
  const queryCache = useQueryCache()
  const user = queryCache.getQueryData<SessionUser | null>(SESSION_KEY)
  const capabilities = queryCache.getQueryData<AuthConfig>(AUTH_CONFIG_KEY)
  const isAuthenticated = user != null

  const isAppRoute = to.path === '/app' || to.path.startsWith('/app/')
  const isAuthRoute = to.path === '/auth' || to.path.startsWith('/auth/')

  if (isAppRoute && !isAuthenticated) {
    return navigateTo({ path: '/auth/login', query: { redirect: to.fullPath } })
  }

  if (isAuthRoute && isAuthenticated) {
    return navigateTo('/app/dashboard')
  }

  if (isAppRoute && isAuthenticated && capabilities) {
    const gated = capabilityRoutes.find(r => to.path === r.prefix || to.path.startsWith(`${r.prefix}/`))
    if (gated && !capabilities.features[gated.feature]) {
      return navigateTo('/app/dashboard')
    }
  }
})
