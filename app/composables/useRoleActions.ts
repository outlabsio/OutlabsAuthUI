import type { DropdownMenuItem } from '@nuxt/ui'
import { useDeleteRole } from '~/queries/roles'
import type { Role } from '~/types/role'
import { roleRowPolicy, type RoleRowPolicy } from '~/utils/role-definitions'

// What an admin may do with a role, shared by the roles list (row menus) and the role detail
// (navbar): Edit and Duplicate open <AppRoleFormDialog> (bind `form`), Archive opens an
// AppConfirmDialog (bind `archive`). Built from permission and state (utils/role-definitions.ts
// roleRowPolicy): system roles cannot be changed, only duplicated; archived roles are read-only;
// Edit needs role:update, Archive role:delete, Duplicate role:create. A role the admin holds
// themselves is marked, and archiving it warns that they lose its access too (F-177).

export type RoleFormTarget
  = | { mode: 'create', source?: Role | null }
    | { mode: 'edit', role: Role }

export function useRoleActions(options: { onArchived?: (role: Role) => void } = {}) {
  const { hasPermission, canAccess, hasMemberships } = useAuth()
  const canRead = computed(() => canAccess('roles'))
  const canCreate = computed(() => canRead.value && hasPermission('role:create'))
  const canUpdate = computed(() => canRead.value && hasPermission('role:update'))
  const canDelete = computed(() => canRead.value && hasPermission('role:delete'))
  const { holds, atRisk } = useHeldRoles()

  function policy(role: Role): RoleRowPolicy {
    return roleRowPolicy(role, { canUpdate: canUpdate.value, canDelete: canDelete.value, canCreate: canCreate.value })
  }

  // --- Create / Edit / Duplicate (one dialog) ---
  const formOpen = ref(false)
  const formTarget = shallowRef<RoleFormTarget>({ mode: 'create' })
  function openCreate() {
    formTarget.value = { mode: 'create' }
    formOpen.value = true
  }
  function openEdit(role: Role) {
    formTarget.value = { mode: 'edit', role }
    formOpen.value = true
  }
  function openDuplicate(role: Role) {
    formTarget.value = { mode: 'create', source: role }
    formOpen.value = true
  }

  // --- Archive ---
  const removeRole = useDeleteRole()
  // DELETE /roles/{id} archives the role: it leaves the role list, every holder loses what it
  // grants, and the API offers no way back. The backend refuses it for system roles.
  const archive = useConfirmAction<Role>({
    describe: role => ({
      title: `Archive role ${role.display_name}`,
      description: 'Archived roles leave the role list and can\'t be restored from the console.',
      effects: [
        ...(atRisk(role.id) ? ['You hold this role: you lose the access it gives you too, which can lock you out of parts of the console.'] : []),
        hasMemberships.value
          ? 'Everyone who holds it, directly or through an entity membership, loses the permissions it grants immediately.'
          : 'Everyone who holds it loses the permissions it grants immediately.',
        'It can no longer be assigned.',
        'The change is recorded in the role\'s history.'
      ],
      confirmLabel: 'Archive role',
      confirmText: role.name
    }),
    action: role => removeRole.mutateAsync(role.id),
    success: 'Role archived',
    error: 'Could not archive role',
    onSuccess: (_data, role) => options.onArchived?.(role),
    enabled: () => canDelete.value
  })

  /**
   * The secondary actions of a role, in order: View (lists only), Edit, Duplicate, then Archive
   * last in error colour. Empty when nothing can succeed (hide the menu then).
   */
  function menuItems(role: Role, menu: { view?: boolean, edit?: boolean } = {}): DropdownMenuItem[] {
    const p = policy(role)
    const items: DropdownMenuItem[] = []
    if (menu.view) items.push({ label: 'View', icon: 'i-lucide-eye', to: `/app/roles/${role.id}` })
    if (menu.edit !== false && p.canEdit) items.push({ label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openEdit(role) })
    if (p.canDuplicate) items.push({ label: 'Duplicate as custom role', icon: 'i-lucide-copy', onSelect: () => openDuplicate(role) })
    if (p.canArchive) items.push({ label: 'Archive', icon: 'i-lucide-archive', color: 'error' as const, onSelect: () => archive.ask(role) })
    return items
  }

  return {
    canRead,
    canCreate,
    canUpdate,
    canDelete,
    holds,
    policy,
    menuItems,
    formOpen,
    formTarget,
    openCreate,
    openEdit,
    openDuplicate,
    archive
  }
}
