import { clearStoredAuthTokens } from '@/lib/api/auth-token'

export const authSessionExpiredEvent = 'outlabs-auth:session-expired'

export function expireAuthSession() {
  clearStoredAuthTokens()

  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new Event(authSessionExpiredEvent))
}
