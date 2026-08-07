import { useQuery } from '@pinia/colada'
import { authConfigQuery, myPermissionsQuery, sessionQuery } from '~/queries/session'
import { tokensPresent } from '~/auth/tokens'
import type { AuthConfig } from '~/types/auth'

// Ergonomic read surface over the Colada-owned auth state. Every consumer that needs the
// current user, capabilities, or permissions calls this — Colada dedupes by key, so it's one
// shared cache entry per resource, not N fetches. Mutations live in ~/queries/session.
export function useAuth() {
  // Gate authed fetches on token presence (reactive) so a logged-out app never hits them.
  // The cache is still seeded by the boot plugin for an instant first paint.
  const session = useQuery(() => ({ ...sessionQuery, enabled: tokensPresent.value }))
  const authConfig = useQuery(authConfigQuery)
  const permissions = useQuery(() => ({ ...myPermissionsQuery, enabled: tokensPresent.value }))

  const user = session.data
  const capabilities = authConfig.data

  const isAuthenticated = computed(() => user.value != null)
  const isSuperuser = computed(() => Boolean(user.value?.is_superuser))
  const permissionSet = computed(() => new Set(permissions.data.value ?? []))

  const displayName = computed(() => {
    const u = user.value
    if (!u) return ''
    const full = [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
    return full || u.email
  })

  // Capability = what the backend exposes (A1). Permission = what THIS actor may do (RBAC).
  function can(feature: keyof AuthConfig['features']) {
    return Boolean(capabilities.value?.features?.[feature])
  }
  function hasPermission(permission: string) {
    return isSuperuser.value || permissionSet.value.has(permission)
  }
  function hasAnyPermission(candidates: string[]) {
    return isSuperuser.value || candidates.some(p => permissionSet.value.has(p))
  }

  return {
    user,
    capabilities,
    isAuthenticated,
    isSuperuser,
    displayName,
    can,
    hasPermission,
    hasAnyPermission,
    refetchSession: session.refetch
  }
}
