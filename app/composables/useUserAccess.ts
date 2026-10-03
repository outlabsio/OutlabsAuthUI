import type { Ref } from 'vue'
import { useQuery } from '@pinia/colada'
import { refDebounced } from '@vueuse/core'
import { userPermissionsQuery, userRoleMembershipsQuery } from '~/queries/users'
import { userAllMembershipsQuery } from '~/queries/memberships'
import { groupEffectivePermissions, roleGrantOrigins } from '~/utils/access-grants'
import type { RoleReference } from '~/types/role'
import type { User } from '~/types/user'
import type { UserPermissionSource } from '~/types/permission'

// The Access tab's Effective permissions card (AppUserAccessCard, F-013): what this account can
// do and why. GET /users/{id}/permissions lists each permission its grants in force give it,
// with a role that grants it; the card groups them by resource, names the role (a chip that
// opens its permissions) and where that role comes from (a direct assignment, or memberships
// in named entities). It is RBAC only, across every entity: the card says so, and Check access
// (AppUserCheckAccessDialog, F-059) answers for one entity with the server's own evaluator.
//
// The direct-role and membership reads are the Direct roles and Memberships cards' own queries
// (same keys, same `enabled`), so they cost nothing extra.

export function useUserAccess(user: Ref<User>) {
  const { canAccess, hasPermission, hasSurface, hasMemberships } = useAuth()
  const userId = computed(() => user.value.id)

  // The endpoint answers the account itself or an admin with user:read: the Users section's
  // requirement, the page's own gate.
  const canRead = computed(() => canAccess('users'))
  const { data, status, error, isLoading, refetch } = useQuery(() => ({
    ...userPermissionsQuery(userId.value),
    enabled: canRead.value
  }))
  const sources = computed<UserPermissionSource[]>(() => data.value ?? [])
  const hasData = computed(() => data.value !== undefined)

  // --- Where each source role comes from (grants that give permissions now) ---
  const direct = useQuery(() => ({
    ...userRoleMembershipsQuery({ userId: userId.value, includeInactive: true }),
    enabled: canRead.value
  }))
  const canReadMemberships = computed(() => hasMemberships.value && hasPermission('membership:read'))
  const memberships = useQuery(() => ({ ...userAllMembershipsQuery(userId.value), enabled: canReadMemberships.value }))
  // The Memberships card's entity names (inactive and out-of-tree entities included, F-066).
  const { entityById, entityInactive } = useMembershipEntities(
    () => (memberships.data.value ?? []).map(m => m.entity_id),
    canReadMemberships
  )
  const grants = computed(() => {
    const directRoleIds = new Set((direct.data.value ?? []).filter(m => m.can_grant_permissions).map(m => m.role_id))
    const membershipEntityIdsByRole = new Map<string, string[]>()
    for (const membership of memberships.data.value ?? []) {
      if (!membership.can_grant_permissions) continue
      for (const roleId of membership.role_ids ?? []) {
        const list = membershipEntityIdsByRole.get(roleId) ?? []
        list.push(membership.entity_id)
        membershipEntityIdsByRole.set(roleId, list)
      }
    }
    return { directRoleIds, membershipEntityIdsByRole }
  })
  // Named by the membership itself first (0.1.0a35), so an entity this admin cannot read is named.
  const payloadEntityNames = computed(() => new Map((memberships.data.value ?? []).flatMap((m) => {
    const name = m.entity_display_name || m.entity_name
    return name ? [[m.entity_id, name] as const] : []
  })))
  const entityName = (entityId: string) => {
    const name = payloadEntityNames.value.get(entityId) ?? entityById.value.get(entityId)?.display_name
    if (!name) return 'an entity'
    return entityInactive(entityId) ? `${name} (inactive)` : name
  }
  function origins(roleId: string | null): string {
    if (!roleId) return ''
    const list = roleGrantOrigins(roleId, grants.value, entityName)
    if (!list.length) return ''
    return list.map(origin => (origin === 'Direct' ? 'direct assignment' : origin)).join(', ')
  }

  // Role names: the direct assignments embed their roles; the catalog names the rest, and the
  // payload's system name is the last resort (AppRoleChip never shows an id).
  const directRoleNames = computed(() => new Map((direct.data.value ?? []).map(m => [m.role_id, m.role.display_name] as const)))
  function sourceRole(sourceId: string | null, sourceName: string | null): RoleReference | null {
    if (!sourceId) return null
    return { id: sourceId, display_name: directRoleNames.value.get(sourceId), name: sourceName }
  }
  const roleCatalog = useRoleCatalog()
  const roleLabel = (source: UserPermissionSource) => (source.source_id
    ? roleCatalog.describe(sourceRole(source.source_id, source.source_name ?? null)!).label
    : '')

  // --- Search ---
  const search = ref('')
  const term = refDebounced(computed(() => search.value.trim()), 200)
  const groups = computed(() => groupEffectivePermissions(sources.value, term.value, roleLabel))
  const shownCount = computed(() => groups.value.reduce((sum, group) => sum + group.items.length, 0))
  function clearSearch() {
    search.value = ''
  }

  // --- Check access (F-059): permission:check where the permissions router is mounted ---
  const canCheck = computed(() => hasSurface('permissions') && hasPermission('permission:check'))
  const checkOpen = ref(false)

  return {
    canRead,
    sources,
    status,
    error,
    isLoading,
    hasData,
    refetch,
    groups,
    shownCount,
    search,
    term,
    clearSearch,
    sourceRole,
    origins,
    canCheck,
    checkOpen
  }
}
