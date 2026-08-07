import type { Ref } from 'vue'
import { useQuery } from '@pinia/colada'
import { useAssignUserRole, useRemoveUserRole, userDetailQuery, userRoleMembershipsQuery, userSessionsQuery } from '~/queries/users'
import { rolesListQuery } from '~/queries/roles'
import type { Role } from '~/types/role'
import type { UserRoleMembership } from '~/types/user'

// Feature logic for the user-detail page: profile + sessions (read) and direct role assignment
// (write). The SFC binds this and owns pure display config. Direct role assignments are distinct
// from roles a user gets via entity membership.

// Validity is stored as ISO datetimes; the form uses AppDateField (YYYY-MM-DD strings).
const toIsoOrNull = (d: string): string | null => (d ? new Date(d).toISOString() : null)

export function useUserDetail(userId: Ref<string>) {
  const { hasPermission } = useAuth()
  const { run } = useApiAction()

  const canRead = computed(() => hasPermission('user:read'))
  const canManageRoles = computed(() => hasPermission('user:update'))

  const { data: user, status, error } = useQuery(() => ({ ...userDetailQuery(userId.value), enabled: canRead.value }))
  const errorMessage = useApiErrorMessage(error)
  const { data: sessionsData, status: sessionsStatus } = useQuery(() => ({ ...userSessionsQuery(userId.value), enabled: canRead.value }))
  const { data: membershipsData, status: rolesStatus } = useQuery(() => ({ ...userRoleMembershipsQuery(userId.value), enabled: canRead.value }))

  const sessions = computed(() => sessionsData.value ?? [])
  const roleMemberships = computed<UserRoleMembership[]>(() => membershipsData.value ?? [])

  // Assignable roles = global + the user's root-org roles, minus roles already assigned directly.
  const rootEntityId = computed(() => user.value?.root_entity_id ?? undefined)
  const { data: globalRolesData } = useQuery(() => ({ ...rolesListQuery({ limit: 100, isGlobal: true }), enabled: canManageRoles.value }))
  const { data: rootRolesData } = useQuery(() => ({ ...rolesListQuery({ limit: 100, rootEntityId: rootEntityId.value }), enabled: canManageRoles.value && !!rootEntityId.value }))
  const assignedRoleIds = computed(() => new Set(roleMemberships.value.map(m => m.role_id)))
  const rolesPool = computed<Role[]>(() => {
    const byId = new Map<string, Role>()
    for (const r of globalRolesData.value?.items ?? []) byId.set(r.id, r)
    for (const r of rootRolesData.value?.items ?? []) byId.set(r.id, r)
    return [...byId.values()].filter(r => !assignedRoleIds.value.has(r.id))
  })

  // Assign (one POST per selected role; the endpoint assigns a single role at a time).
  const assignRole = useAssignUserRole()
  const assignOpen = ref(false)
  const assigning = ref(false)
  const assignState = reactive({ roleIds: [] as string[], validFrom: '', validUntil: '' })
  const assignSelectedRoles = computed(() => {
    const byId = new Map(rolesPool.value.map(r => [r.id, r]))
    return assignState.roleIds.map(id => byId.get(id)).filter((r): r is Role => Boolean(r))
  })
  function openAssign() {
    Object.assign(assignState, { roleIds: [], validFrom: '', validUntil: '' })
    assignOpen.value = true
  }
  async function onAssign() {
    if (!assignState.roleIds.length) return
    assigning.value = true
    const validFrom = toIsoOrNull(assignState.validFrom)
    const validUntil = toIsoOrNull(assignState.validUntil)
    const res = await run(async () => {
      for (const roleId of assignState.roleIds) {
        await assignRole.mutateAsync({ userId: userId.value, roleId, valid_from: validFrom, valid_until: validUntil })
      }
    }, { success: assignState.roleIds.length > 1 ? 'Roles assigned' : 'Role assigned', error: 'Could not assign roles' })
    if (res.ok) assignOpen.value = false
    assigning.value = false
  }

  // Remove a direct role assignment.
  const removeRole = useRemoveUserRole()
  const removeOpen = ref(false)
  const removeTarget = ref<UserRoleMembership | null>(null)
  const removing = ref(false)
  function openRemove(membership: UserRoleMembership) {
    removeTarget.value = membership
    removeOpen.value = true
  }
  async function onConfirmRemove() {
    const membership = removeTarget.value
    if (!membership) return
    removing.value = true
    const res = await run(() => removeRole.mutateAsync({ userId: userId.value, roleId: membership.role_id }), { success: 'Role removed', error: 'Could not remove role' })
    if (res.ok) removeOpen.value = false
    removing.value = false
  }

  function roleRowMenu(membership: UserRoleMembership) {
    if (!canManageRoles.value) return []
    return [[{ label: 'Remove', icon: 'i-lucide-trash', color: 'error' as const, onSelect: () => openRemove(membership) }]]
  }

  return {
    user,
    status,
    errorMessage,
    sessions,
    sessionsStatus,
    roleMemberships,
    rolesStatus,
    canManageRoles,
    roleRowMenu,
    rolesPool,
    assignSelectedRoles,
    assignOpen,
    assignState,
    assigning,
    openAssign,
    onAssign,
    removeOpen,
    removeTarget,
    removing,
    onConfirmRemove
  }
}
