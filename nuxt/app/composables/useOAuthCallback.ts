import { useQueryCache } from '@pinia/colada'
import { finalizeAuth } from '~/queries/session'
import { getApiErrorMessage } from '~/api/client'

// Feature logic for the OAuth callback — the provider redirects back with tokens in the URL
// hash; finalize the session and go to the app. Shows an inline error (not a toast), so it uses
// a small try/catch rather than `run`.

export function useOAuthCallback() {
  const queryCache = useQueryCache()
  const error = ref('')

  function readOAuthTokensFromHash() {
    if (typeof window === 'undefined') return null
    const hash = window.location.hash.replace(/^#/, '')
    if (!hash) return null
    const params = new URLSearchParams(hash)
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    if (!access_token || !refresh_token) return null
    return { access_token, refresh_token, token_type: params.get('token_type') || 'bearer' }
  }

  onMounted(async () => {
    const tokens = readOAuthTokensFromHash()
    if (!tokens) {
      error.value = 'Sign-in did not return a usable session.'
      return
    }
    try {
      await finalizeAuth(queryCache, tokens)
      // Strip the tokens back out of the URL before leaving.
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`)
      await navigateTo('/app/dashboard', { replace: true })
    } catch (err) {
      error.value = getApiErrorMessage(err)
    }
  })

  return { error }
}
