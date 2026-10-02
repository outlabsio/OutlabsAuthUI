import { useQueryCache } from '@pinia/colada'
import { discardUnusedSession, finalizeAuth } from '~/queries/session'
import { ApiError, getApiErrorMessage } from '~/api/client'
import { takePostSignInRedirect } from '~/auth/post-sign-in-redirect'
import { takePendingOAuth } from '~/auth/pending-oauth'
import type { AuthTokens } from '~/types/auth'

// Feature logic for the OAuth callback — the provider redirects back with tokens in the URL
// fragment; finalize the session and go to the app. Shows an inline error (not a toast), so it
// uses a small try/catch rather than `run`.

type OAuthHandoff = {
  tokens: AuthTokens | null
  // This tab left for the provider moments ago (~/auth/pending-oauth). Anything else is a link
  // someone else made, and its session is never used.
  solicited: boolean
}

// Reads the tokens and immediately strips the fragment from the address bar and history, before
// any request, so bearer and refresh tokens never linger in the URL — even when sign-in fails.
// The one-time pending marker is consumed in the same synchronous step.
function takeOAuthHandoff(): OAuthHandoff {
  if (typeof window === 'undefined') return { tokens: null, solicited: false }
  const solicited = takePendingOAuth()
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return { tokens: null, solicited }
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
  const params = new URLSearchParams(hash)
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  if (!access_token || !refresh_token) return { tokens: null, solicited }
  return { tokens: { access_token, refresh_token, token_type: params.get('token_type') || 'bearer' }, solicited }
}

export function useOAuthCallback() {
  const queryCache = useQueryCache()
  const error = ref('')
  const { tokens, solicited } = takeOAuthHandoff()
  // The in-app page the admin started from (parked by the sign-in page before leaving).
  const redirect = takePostSignInRedirect()

  onMounted(async () => {
    if (!tokens) {
      error.value = 'Sign-in did not return a usable session.'
      return
    }
    // Login CSRF: a link carrying someone else's session would sign this browser into their
    // account. Revoke that session instead of storing it.
    if (!solicited) {
      void discardUnusedSession(tokens)
      error.value = 'This sign-in was not started in this tab, or took too long to finish, so it was not used. Sign in again.'
      return
    }
    try {
      await finalizeAuth(queryCache, tokens)
      await navigateTo(redirect ?? '/app/dashboard', { replace: true })
    } catch (err) {
      error.value = err instanceof ApiError && err.status === 401
        ? 'The provider returned a session this console could not use. Try signing in again.'
        : getApiErrorMessage(err)
    }
  })

  // Back to sign-in keeps the destination, so a retry still ends where the admin started.
  const signInTo = redirect ? { path: '/auth/login', query: { redirect } } : '/auth/login'

  return { error, signInTo }
}
