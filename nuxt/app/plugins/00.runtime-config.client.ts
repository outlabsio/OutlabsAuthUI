import { useQueryCache } from '@pinia/colada'
import { initializeRuntimeConfig, type RuntimeConfig, type RuntimeConfigError, type RuntimeConfigInput } from '~/utils/runtime-config'
import { apiClient, authSessionExpiredEvent } from '~/api/client'
import { clearStoredAuthTokens, hasStoredAuthTokens, isAuthTokenStorageKey, tokensPresent } from '~/auth/tokens'
import { AUTH_CONFIG_KEY, MY_PERMISSIONS_KEY, SESSION_KEY, resetSession } from '~/queries/session'
import type { AuthConfig, SessionUser } from '~/types/auth'

// Runs first (00 prefix), client-only, async — blocks app mount until (1) the backend target
// is resolved from /app-config.json + NUXT_PUBLIC_* env, and (2) the auth server-state is
// seeded into the Colada cache so the auth guard is trustworthy on the first navigation.
// On invalid config we surface a hard config-error screen (app.vue) instead of booting
// against the wrong API.
export default defineNuxtPlugin(async () => {
  const configState = useState<RuntimeConfig | null>('app:runtime-config', () => null)
  const errorState = useState<RuntimeConfigError | null>('app:config-error', () => null)

  const publicConfig = useRuntimeConfig().public as RuntimeConfigInput
  const result = await initializeRuntimeConfig(publicConfig)

  if (result.status === 'error') {
    errorState.value = result.error
    return
  }

  configState.value = result.config

  const queryCache = useQueryCache()
  const router = useRouter()

  // Public capability discovery — the sign-in screen needs auth_methods before any session.
  try {
    const config = await apiClient.get<AuthConfig>('/auth/config')
    queryCache.setQueryData(AUTH_CONFIG_KEY, config)
  } catch {
    // Non-fatal — the authConfig query retries on demand.
  }

  // Resolve the session + actor permissions before the first guarded navigation.
  if (hasStoredAuthTokens()) {
    try {
      const [user, permissions] = await Promise.all([
        apiClient.get<SessionUser>('/users/me'),
        apiClient.get<string[]>('/permissions/me')
      ])
      queryCache.setQueryData(SESSION_KEY, user)
      queryCache.setQueryData(MY_PERMISSIONS_KEY, permissions)
    } catch {
      clearStoredAuthTokens()
      queryCache.setQueryData(SESSION_KEY, null)
    }
  }

  // The api client dispatches this when a token refresh fails mid-flight.
  window.addEventListener(authSessionExpiredEvent, () => {
    resetSession(queryCache)
    void router.push('/auth/login')
  })

  // Cross-tab sync — react when the auth tokens change in ANOTHER tab.
  window.addEventListener('storage', (event) => {
    if (!isAuthTokenStorageKey(event.key)) return
    const present = hasStoredAuthTokens()
    tokensPresent.value = present
    if (!present) {
      // Logged out in another tab — drop the session here too.
      queryCache.setQueryData(SESSION_KEY, null)
      if (router.currentRoute.value.path.startsWith('/app')) {
        void router.push('/auth/login')
      }
    } else {
      // Logged in / rotated elsewhere — refresh the identity.
      void queryCache.invalidateQueries({ key: SESSION_KEY })
    }
  })
})
