import type { MaybeRefOrGetter } from 'vue'
import type { ResolvedPermission } from '~/types/permission'
import { inactiveSelected, permissionPickerOptions } from '~/utils/role-definitions'

// The permissions a role editor may offer this actor (rules in utils/role-definitions.ts
// permissionPickerOptions):
// - the catalog when they can read it (GET /permissions/, permission:read): ACTIVE permissions
//   only, since the API refuses to attach an inactive one; for a non-superuser, the ones they do
//   not hold are `blocked` (SEC-2 delegation containment), unless already selected (removing a
//   permission is always allowed). An inactive permission the role already carries stays an
//   option, flagged `inactive`, so it can be removed;
// - otherwise the permissions they hold (GET /permissions/me), plus the base action of each
//   _tree/_all grant: all a delegated admin could attach anyway.
// The catalog source is /permissions/ (every status, needs permission:read) rather than the
// active-only /auth/config/permissions: the editor must name the inactive permissions a role
// already carries, and the permissions workspace shares the same cached entry.

export type GrantablePermission = ResolvedPermission & {
  blocked: boolean
  inactive: boolean
}

export function useGrantablePermissions(selected: MaybeRefOrGetter<readonly string[]>) {
  const catalog = usePermissionCatalog()
  const { isSuperuser, hasPermission, permissionNames } = useAuth()

  const fromCatalog = computed(() => catalog.available.value)
  // While the catalog loads the picker offers only the selection (never the held names first);
  // if it fails, the held names.
  const catalogRows = computed(() => {
    if (!fromCatalog.value || catalog.status.value === 'error') return null
    return catalog.status.value === 'success' ? catalog.all.value : []
  })

  const permissions = computed<GrantablePermission[]>(() => permissionPickerOptions({
    catalog: catalogRows.value,
    held: permissionNames.value,
    selected: toValue(selected),
    superuser: isSuperuser.value,
    allows: hasPermission
  }).map(option => ({ ...catalog.resolve(option.name), blocked: option.blocked, inactive: option.inactive })))

  // Selected permissions the catalog says are inactive (they grant nothing; remove or activate).
  const inactive = computed(() => inactiveSelected(toValue(selected), catalogRows.value?.length ? catalogRows.value : null))
  // Selected permissions a non-superuser does not hold (a duplicated role, another admin's role).
  const notHeld = computed(() => (isSuperuser.value ? [] : toValue(selected).filter(name => !hasPermission(name))))

  const loading = computed(() => fromCatalog.value && catalog.status.value === 'pending')
  // Whether the options come from the catalog (readable and not failed) or from the held names.
  const listsCatalog = computed(() => catalogRows.value !== null)

  const note = computed(() => listsCatalog.value
    ? null
    : 'Showing the permissions you hold: only those can be granted.')

  return { permissions, inactive, notHeld, loading, note, fromCatalog, listsCatalog }
}
