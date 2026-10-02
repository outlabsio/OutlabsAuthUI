import type { RouteLocationRaw } from 'vue-router'
import { postSignInDestination, safeAuthRedirect } from '~/utils/auth-redirect'

// The page a guest flow should return to once the user is signed in (?redirect=, set by the
// auth guard or an emailed link), carried across the guest pages and honoured at the end.
export function useAuthIntent() {
  const route = useRoute()
  const origin = () => (typeof window === 'undefined' ? null : window.location.origin)

  // The in-app path to return to, or null. An absolute same-origin URL (as emailed links carry
  // it) becomes its path.
  const redirect = computed(() => safeAuthRedirect(route.query.redirect, origin()))

  // A link to another guest page that keeps the destination, plus any query of its own
  // (e.g. { method: 'email' } to open sign-in on the email form).
  function withIntent(path: string, query: Record<string, string> = {}): RouteLocationRaw {
    const target = redirect.value ? { ...query, redirect: redirect.value } : query
    return Object.keys(target).length ? { path, query: target } : path
  }

  // Where to go after signing in: the challenge's server-validated next_url, else ?redirect,
  // else the dashboard.
  function destination(nextUrl?: string | null): string {
    return postSignInDestination({ nextUrl, redirect: route.query.redirect, origin: origin() })
  }

  return { redirect, withIntent, destination }
}
