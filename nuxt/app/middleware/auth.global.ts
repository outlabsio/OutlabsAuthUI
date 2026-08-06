import { useSessionStore } from '~/stores/session'

// A5 — one global guard. /app/** requires an authenticated session; the auth flows live
// outside it. Session is hydrated by the 00.runtime-config boot plugin before the first
// navigation is evaluated, so isAuthenticated is trustworthy here.
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
})
