import { useQuery } from '@pinia/colada'
import { authConfigQuery, myPermissionsQuery, sessionQuery } from '~/queries/session'
import { tokensPresent } from '~/auth/tokens'
import type { AuthConfig } from '~/types/auth'
import {
  appSection,
  checkApiContract,
  configHasMemberships,
  configHasSurface,
  configIsEnterprise,
  meetsAccessRequirement,
  type AccessContext,
  type AccessRequirement,
  type AppSectionId,
  type AuthSurface
} from '~/utils/capabilities'
import { PermissionMatcher } from '~/utils/permissions'

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
  // Resolved once the capabilities query has answered — data OR error. The sign-in surface
  // gates on this so method buttons never flicker in after a first paint (an error falls
  // back to password-only rendering).
  const capabilitiesResolved = computed(() => authConfig.data.value != null || authConfig.error.value != null)
  // 'error' only when there is NO config to work with (a failed background refetch keeps the
  // last good data). Capability-gated UI fails closed until this is 'ready'.
  const configState = computed<'ready' | 'pending' | 'error'>(() => {
    if (authConfig.data.value != null) return 'ready'
    return authConfig.error.value != null ? 'error' : 'pending'
  })

  // The same for the actor's permissions (/permissions/me). Permission-gated UI fails closed
  // until 'ready', but says the permissions could not be loaded instead of denying access;
  // superusers pass permission checks without them.
  const permissionsState = computed<'ready' | 'pending' | 'error'>(() => {
    if (permissions.data.value != null) return 'ready'
    return permissions.error.value != null ? 'error' : 'pending'
  })

  const isAuthenticated = computed(() => user.value != null)
  const isSuperuser = computed(() => Boolean(user.value?.is_superuser))
  // The backend permission algebra (`*:*`, `resource:*`, `_all`, `_tree`) — never exact-match.
  const matcher = computed(() => new PermissionMatcher(permissions.data.value ?? []))
  // The actor's raw granted names (GET /permissions/me, `*:*` for superusers). For display and
  // delegation fallbacks only; decide access with hasPermission/canAccess.
  const permissionNames = computed<readonly string[]>(() => permissions.data.value ?? [])

  const displayName = computed(() => {
    const u = user.value
    if (!u) return ''
    const full = [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
    return full || u.email
  })

  // Capability = what the backend exposes (A1). Permission = what THIS actor may do (RBAC).
  // `can` reads a feature flag only; several flags are constant true on the backend, so
  // anything that calls a router must also check hasSurface (or use canAccess).
  function can(feature: keyof AuthConfig['features']) {
    return Boolean(capabilities.value?.features?.[feature])
  }
  function hasSurface(surface: AuthSurface) {
    return configHasSurface(capabilities.value, surface)
  }
  // Entity hierarchy + entities router mounted. False on SimpleRBAC: hide every entity, tree,
  // root-org, membership and scope control and never query /entities or /memberships.
  const isEnterprise = computed(() => configIsEnterprise(capabilities.value))
  const hasMemberships = computed(() => configHasMemberships(capabilities.value))

  function hasPermission(permission: string) {
    return isSuperuser.value || matcher.value.allows(permission)
  }
  function hasAnyPermission(candidates: readonly string[]) {
    return isSuperuser.value || matcher.value.allowsAny(candidates)
  }

  const accessContext = computed<AccessContext>(() => ({
    config: capabilities.value,
    isSuperuser: isSuperuser.value,
    matcher: matcher.value
  }))
  // The one nav/route/page predicate: surface AND feature AND permission. Pass a section id
  // from APP_SECTIONS (nav items) or an ad-hoc requirement (cross-links, cards).
  function canAccess(target: AppSectionId | AccessRequirement) {
    const requirement = typeof target === 'string' ? appSection(target).requires : target
    return meetsAccessRequirement(requirement, accessContext.value)
  }

  const apiContract = computed(() => checkApiContract(capabilities.value))

  return {
    user,
    capabilities,
    capabilitiesResolved,
    configState,
    refetchConfig: authConfig.refetch,
    apiContract,
    isAuthenticated,
    isSuperuser,
    displayName,
    can,
    hasSurface,
    isEnterprise,
    hasMemberships,
    hasPermission,
    hasAnyPermission,
    permissionNames,
    permissionsState,
    refetchPermissions: permissions.refetch,
    canAccess,
    refetchSession: session.refetch
  }
}
