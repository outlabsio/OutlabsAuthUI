import { useQuery } from '@pinia/colada'
import { authConfigQuery, sessionQuery } from '~/queries/session'
import { tokensPresent } from '~/utils/auth-token'
import type { AuthConfig } from '~/types/auth'

// Ergonomic read surface over the Colada-owned auth state. Every consumer that needs the
// current user or capabilities calls this — Colada dedupes by key, so it's one shared cache
// entry, not N fetches. Mutations (login/logout/verify/…) live in ~/queries/session.
export function useAuth() {
  // Gate the session fetch on token presence (reactive) so a logged-out app never hits
  // /users/me. The cache is still seeded by the boot plugin for an instant first paint.
  const session = useQuery(() => ({ ...sessionQuery, enabled: tokensPresent.value }))
  const authConfig = useQuery(authConfigQuery)

  const user = session.data
  const capabilities = authConfig.data

  const isAuthenticated = computed(() => user.value != null)

  const displayName = computed(() => {
    const u = user.value
    if (!u) return ''
    const full = [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
    return full || u.email
  })

  function can(feature: keyof AuthConfig['features']) {
    return Boolean(capabilities.value?.features?.[feature])
  }

  return {
    user,
    capabilities,
    isAuthenticated,
    displayName,
    can,
    refetchSession: session.refetch
  }
}
