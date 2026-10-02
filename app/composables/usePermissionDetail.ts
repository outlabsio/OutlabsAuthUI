import type { Ref } from 'vue'
import { useQuery } from '@pinia/colada'
import { permissionDetailQuery } from '~/queries/permissions'
import type { DetailItem } from '~/types/display'
import type { Permission } from '~/types/permission'
import { DEFINITION_STATUS_COLOR, badgeColor, originLabel, statusLabel } from '~/utils/status'
import { isUuid } from '~/utils/users'

// Permission detail (F-019, F-122, F-128, F-210): the record with explicit pending, not-found,
// denied and stale states, and the list's actions in the navbar (Edit, then Archive last;
// usePermissionActions). System permissions are read-only, and say so.
export function usePermissionDetail(permissionId: Ref<string>) {
  const { canAccess, can, hasPermission } = useAuth()
  const canRead = computed(() => canAccess('permissions'))
  const validId = computed(() => isUuid(permissionId.value))

  const { data, status, error, isLoading, refetch } = useQuery(() => ({
    ...permissionDetailQuery(permissionId.value),
    enabled: canRead.value && validId.value
  }))
  const permission = computed<Permission | null>(() => data.value ?? null)
  const apiError = useApiError(error)
  // 404: missing or archived; 422: an id the API cannot parse.
  const notFound = computed(() => !validId.value || (!data.value && (apiError.value?.kind === 'not_found' || apiError.value?.status === 422)))
  const denied = computed(() => !data.value && apiError.value?.kind === 'forbidden')
  const deniedMessage = computed(() => apiError.value?.message ?? '')

  const actions = usePermissionActions({
    onArchived: () => {
      void navigateTo('/app/permissions')
    }
  })
  const policy = computed(() => (permission.value ? actions.policy(permission.value) : null))
  const canEdit = computed(() => Boolean(policy.value?.canEdit))
  const moreItems = computed(() => (permission.value ? actions.menuItems(permission.value, { edit: false }) : []))

  // Same badges and wording as the permissions list (F-215).
  const detailItems = computed<DetailItem[]>(() => {
    const p = permission.value
    if (!p) return []
    return [
      { label: 'Name', value: p.name, type: 'code' },
      { label: 'Resource', value: p.resource, type: 'code' },
      { label: 'Action', value: p.action, type: 'code' },
      ...(p.scope ? [{ label: 'Scope', value: statusLabel(p.scope) }] : []),
      { label: 'Origin', value: originLabel(p.is_system), badge: { color: 'neutral', variant: p.is_system ? 'subtle' : 'outline' } },
      { label: 'Status', value: statusLabel(p.status), badge: { color: badgeColor(DEFINITION_STATUS_COLOR, p.status), variant: 'subtle' } },
      { label: 'Tags', value: p.tags.length ? p.tags.join(', ') : 'None', full: true }
    ]
  })

  // ABAC: shown when exposed; editable when the actor may update non-system permissions.
  const abacEnabled = computed(() => can('abac'))
  const canManageAbac = computed(() => abacEnabled.value && hasPermission('permission:update') && Boolean(permission.value) && !permission.value?.is_system)
  const abacReadOnly = computed(() => (permission.value ? abacReadOnlyReason({ kind: 'permissions', isSystem: permission.value.is_system, canUpdate: hasPermission('permission:update') }) : null))

  return {
    ...actions,
    permission,
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
    detailItems,
    abacEnabled,
    canManageAbac,
    abacReadOnly
  }
}
