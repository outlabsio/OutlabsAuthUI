import type { DropdownMenuItem } from '@nuxt/ui'
import { useQuery } from '@pinia/colada'
import { useDeletePermission } from '~/queries/permissions'
import { rolesListCatalogQuery } from '~/queries/roles'
import type { Permission } from '~/types/permission'
import { permissionRowPolicy, type PermissionRowPolicy } from '~/utils/role-definitions'

// What an admin may do with a permission, shared by the permissions list (row menus) and the
// permission detail (navbar): Edit opens <AppPermissionEditDialog> (bind `editOpen` and
// `editTarget`), Archive an AppConfirmDialog (bind `archive`). System permissions cannot be
// changed (F-053); Edit needs permission:update, Archive permission:delete (F-019).
export function usePermissionActions(options: { onArchived?: (permission: Permission) => void } = {}) {
  const { hasPermission, canAccess } = useAuth()
  const canRead = computed(() => canAccess('permissions'))
  const canCreate = computed(() => canRead.value && hasPermission('permission:create'))
  const canUpdate = computed(() => canRead.value && hasPermission('permission:update'))
  const canDelete = computed(() => canRead.value && hasPermission('permission:delete'))

  function policy(permission: Permission): PermissionRowPolicy {
    return permissionRowPolicy(permission, { canUpdate: canUpdate.value, canDelete: canDelete.value })
  }

  // --- Edit ---
  const editOpen = ref(false)
  const editTarget = shallowRef<Permission | null>(null)
  function openEdit(permission: Permission) {
    editTarget.value = permission
    editOpen.value = true
  }

  // --- Archive ---
  // DELETE /permissions/{id} archives the permission: it leaves the catalog, every role that
  // includes it stops granting it, and the API offers no way back. Which roles grant it is worked
  // out client-side from every page of the roles the actor can read (no usage endpoint), loaded
  // only while the confirmation is open (a key of its own, so the gate may follow the dialog).
  const canReadRoles = computed(() => canAccess('roles'))
  const archiveOpen = ref(false)
  const { data: rolesData, status: rolesStatus } = useQuery(() => ({
    ...rolesListCatalogQuery(),
    enabled: canReadRoles.value && archiveOpen.value
  }))
  function grantedByEffect(permission: Permission): string {
    if (!canReadRoles.value) return 'Every role that includes it stops granting it immediately.'
    if (rolesStatus.value !== 'success' || !rolesData.value) return 'Every role that includes it stops granting it immediately (checking which roles do).'
    const granting = rolesData.value.items.filter(role => (role.permissions ?? []).includes(permission.name))
    const partial = rolesData.value.truncated
    if (!granting.length) {
      return partial
        ? `None of the first ${rolesData.value.items.length} roles include it; roles beyond those were not checked.`
        : 'No role you can see includes it.'
    }
    const names = granting.slice(0, 3).map(role => role.display_name).join(', ')
    const more = granting.length > 3 ? ` and ${granting.length - 3} more` : ''
    const count = `${partial ? 'At least ' : ''}${granting.length} ${granting.length === 1 ? 'role grants' : 'roles grant'} it (${names}${more})`
    return `${count}: they stop granting it immediately.`
  }

  const removePermission = useDeletePermission()
  const archive = useConfirmAction<Permission>({
    describe: permission => ({
      title: `Archive permission ${permission.name}`,
      description: 'Archived permissions leave the catalog and can\'t be restored from the console. To stop it granting access for now, make it inactive instead.',
      effects: [
        grantedByEffect(permission),
        'It can no longer be added to roles.',
        'The change is recorded in the permission\'s history.'
      ],
      confirmLabel: 'Archive permission'
    }),
    action: permission => removePermission.mutateAsync(permission.id),
    success: 'Permission archived',
    error: 'Could not archive permission',
    onSuccess: (_data, permission) => options.onArchived?.(permission),
    enabled: () => canDelete.value
  })
  watch(() => archive.open, (open) => {
    archiveOpen.value = open
  })

  /** View (lists only), Edit, then Archive last in error colour; empty when nothing can succeed. */
  function menuItems(permission: Permission, menu: { view?: boolean, edit?: boolean } = {}): DropdownMenuItem[] {
    const p = policy(permission)
    const items: DropdownMenuItem[] = []
    if (menu.view) items.push({ label: 'View', icon: 'i-lucide-eye', to: `/app/permissions/${permission.id}` })
    if (menu.edit !== false && p.canEdit) items.push({ label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openEdit(permission) })
    if (p.canArchive) items.push({ label: 'Archive', icon: 'i-lucide-archive', color: 'error' as const, onSelect: () => archive.ask(permission) })
    return items
  }

  return { canRead, canCreate, canUpdate, canDelete, policy, menuItems, editOpen, editTarget, openEdit, archive }
}
