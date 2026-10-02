import type { Ref } from 'vue'
import { useQuery } from '@pinia/colada'
import { roleDetailQuery } from '~/queries/roles'
import type { DetailItem } from '~/types/display'
import type { Role } from '~/types/role'
import { DEFINITION_STATUS_COLOR, badgeColor, originLabel, statusLabel } from '~/utils/status'
import { roleDefinedAt, roleScopeLabel, roleTypeBadge } from '~/utils/role-definitions'
import { isUuid } from '~/utils/users'

// Role detail (F-068, F-122, F-128, F-210): the record with explicit pending, not-found, denied
// and stale states, where the role is defined, and the same actions as the list's row menu in
// the navbar (Edit, then Duplicate and Archive, Archive last; useRoleActions).
export function useRoleDetail(roleId: Ref<string>) {
  const { canAccess, isEnterprise, can, hasPermission } = useAuth()
  const canRead = computed(() => canAccess('roles'))
  // A malformed id is a link nobody can open: "not found" without asking the API.
  const validId = computed(() => isUuid(roleId.value))

  const { data, status, error, isLoading, refetch } = useQuery(() => ({
    ...roleDetailQuery(roleId.value),
    enabled: canRead.value && validId.value
  }))
  const role = computed<Role | null>(() => data.value ?? null)
  const apiError = useApiError(error)
  // 404: missing, archived (archived roles are not readable), or outside the admin's
  // organization (outlabs-auth answers 404 rather than confirm it exists); 422: an id the API
  // cannot parse. 403: a system-wide role read by a scoped admin.
  const notFound = computed(() => !validId.value || (!data.value && (apiError.value?.kind === 'not_found' || apiError.value?.status === 422)))
  const denied = computed(() => !data.value && apiError.value?.kind === 'forbidden')
  const deniedMessage = computed(() => apiError.value?.message ?? '')

  const actions = useRoleActions({
    onArchived: () => {
      void navigateTo('/app/roles')
    }
  })
  const policy = computed(() => (role.value ? actions.policy(role.value) : null))
  const canEdit = computed(() => Boolean(policy.value?.canEdit))
  const moreItems = computed(() => (role.value ? actions.menuItems(role.value, { edit: false }) : []))
  const holdsRole = computed(() => Boolean(role.value && actions.holds(role.value.id)))

  // Same badges and wording as the roles list. Type, where it is defined, scope, auto-assignment
  // and entity types are EnterpriseRBAC concepts (F-008).
  const detailItems = computed<DetailItem[]>(() => {
    const r = role.value
    if (!r) return []
    const enterprise: DetailItem[] = isEnterprise.value
      ? [
          { key: 'type', label: 'Type', value: roleTypeBadge(r).label, badge: roleTypeBadge(r) },
          { key: 'defined-at', label: 'Defined at', value: roleDefinedAt(r) ?? 'The whole system' },
          ...(roleScopeLabel(r) ? [{ label: 'Applies to', value: roleScopeLabel(r) }] : []),
          { label: 'Auto-assigned', value: r.is_auto_assigned, type: 'boolean' },
          { label: 'Assignable at', value: r.assignable_at_types.length ? r.assignable_at_types.join(', ') : 'Any entity type' }
        ]
      : []
    return [
      { label: 'Name', value: r.name, type: 'code' },
      ...enterprise,
      { label: 'Origin', value: originLabel(r.is_system_role), badge: { color: 'neutral', variant: r.is_system_role ? 'subtle' : 'outline' } },
      { label: 'Status', value: statusLabel(r.status), badge: { color: badgeColor(DEFINITION_STATUS_COLOR, r.status), variant: 'subtle' } }
    ]
  })

  // ABAC: shown when the backend exposes it; editable when the actor may update non-system roles.
  const abacEnabled = computed(() => can('abac'))
  const canManageAbac = computed(() => abacEnabled.value && hasPermission('role:update') && Boolean(role.value) && !role.value?.is_system_role)
  const abacReadOnly = computed(() => (role.value ? abacReadOnlyReason({ kind: 'roles', isSystem: role.value.is_system_role, canUpdate: hasPermission('role:update') }) : null))

  return {
    ...actions,
    role,
    status,
    error,
    isLoading,
    refetch,
    notFound,
    denied,
    deniedMessage,
    policy,
    canEdit,
    moreItems,
    holdsRole,
    detailItems,
    abacEnabled,
    canManageAbac,
    abacReadOnly
  }
}
