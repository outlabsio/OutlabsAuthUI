import { safeAppRedirect } from '~/utils/session-lifecycle'

// Sign-in flows that leave the console (OAuth) lose the ?redirect query on the way back. The
// target is parked in sessionStorage (this tab only) before leaving and read once on return.
const storageKey = 'outlabs-auth.post-sign-in-redirect'

export function rememberPostSignInRedirect(value: unknown) {
  if (typeof window === 'undefined') return
  const target = safeAppRedirect(value)
  try {
    if (target) window.sessionStorage.setItem(storageKey, target)
    else window.sessionStorage.removeItem(storageKey)
  } catch {
    // Storage unavailable (privacy mode): the flow falls back to the dashboard.
  }
}

export function takePostSignInRedirect(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const value = window.sessionStorage.getItem(storageKey)
    window.sessionStorage.removeItem(storageKey)
    return safeAppRedirect(value)
  } catch {
    return null
  }
}
