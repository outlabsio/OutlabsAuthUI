import type { Ref } from 'vue'
import { useQuery } from '@pinia/colada'
import type { FormSubmitEvent } from '@nuxt/ui'
import { useAssignUserRole, useRemoveUserRole, useResetUserPassword, useUpdateUserStatus, userDetailQuery, userRoleMembershipsQuery, userSessionsQuery } from '~/queries/users'
import { rolesListQuery } from '~/queries/roles'
import { entitiesListQuery } from '~/queries/entities'
import { useAddMember, useRemoveMember, useUpdateMemberAccess, userMembershipsQuery } from '~/queries/memberships'
import type { ResetPasswordSchema } from '~/schemas/user'
import type { Role } from '~/types/role'
import type { UserRoleMembership, UserStatusUpdateValue } from '~/types/user'
import type { Membership, MembershipStatusValue } from '~/types/membership'

// Feature logic for the user-detail page: profile + sessions (read), direct role assignment, account
// admin actions (status / password), and entity membership management. The SFC binds this and owns
// pure display config. Direct role assignments are distinct from roles a user gets via membership.

// Validity is stored as ISO datetimes; forms use AppDateField (YYYY-MM-DD strings).
const toIsoOrNull = (d: string): string | null => (d ? new Date(d).toISOString() : null)
const toDateInput = (iso?: string | null): string => (iso ? iso.slice(0, 10) : '')
const MEMBER_STATUS_ITEMS = [
  { label: 'Active', value: 'active' as MembershipStatusValue },
  { label: 'Suspended', value: 'suspended' as MembershipStatusValue }
]

export function useUserDetail(userId: Ref<string>) {
  const { hasPermission } = useAuth()
  const { run } = useApiAction()

  const canRead = computed(() => hasPermission('user:read'))
  const canManageUser = computed(() => hasPermission('user:update'))
  const canReadMemberships = computed(() => hasPermission('membership:read'))
  const canAddMembership = computed(() => hasPermission('membership:create'))
  const canEditMembership = computed(() => hasPermission('membership:update'))
  const canRemoveMembership = computed(() => hasPermission('membership:delete'))

  const { data: user, status, error } = useQuery(() => ({ ...userDetailQuery(userId.value), enabled: canRead.value }))
  const errorMessage = useApiErrorMessage(error)
  const { data: sessionsData, status: sessionsStatus } = useQuery(() => ({ ...userSessionsQuery(userId.value), enabled: canRead.value }))
  const { data: membershipsData, status: rolesStatus } = useQuery(() => ({ ...userRoleMembershipsQuery(userId.value), enabled: canRead.value }))

  const sessions = computed(() => sessionsData.value ?? [])
  const roleMemberships = computed<UserRoleMembership[]>(() => membershipsData.value ?? [])

  // Roles available in the user's org (global + root-org roles) — the base pool for both direct role
  // assignment and membership roles. Loaded when the actor can manage roles or read memberships.
  const rootEntityId = computed(() => user.value?.root_entity_id ?? undefined)
  const rolesNeeded = computed(() => canManageUser.value || canReadMemberships.value)
  const { data: globalRolesData } = useQuery(() => ({ ...rolesListQuery({ limit: 100, isGlobal: true }), enabled: rolesNeeded.value }))
  const { data: rootRolesData } = useQuery(() => ({ ...rolesListQuery({ limit: 100, rootEntityId: rootEntityId.value }), enabled: rolesNeeded.value && !!rootEntityId.value }))
  const orgRoles = computed<Role[]>(() => {
    const byId = new Map<string, Role>()
    for (const r of globalRolesData.value?.items ?? []) byId.set(r.id, r)
    for (const r of rootRolesData.value?.items ?? []) byId.set(r.id, r)
    return [...byId.values()]
  })
  const roleById = computed(() => new Map(orgRoles.value.map(r => [r.id, r])))

  // Direct-role picker excludes roles already assigned directly.
  const assignedRoleIds = computed(() => new Set(roleMemberships.value.map(m => m.role_id)))
  const rolesPool = computed<Role[]>(() => orgRoles.value.filter(r => !assignedRoleIds.value.has(r.id)))

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
    if (!canManageUser.value) return []
    return [[{ label: 'Remove', icon: 'i-lucide-trash', color: 'error' as const, onSelect: () => openRemove(membership) }]]
  }

  // --- Change status (activate / suspend / ban) ---
  const updateStatus = useUpdateUserStatus()
  const statusOpen = ref(false)
  const savingStatus = ref(false)
  const statusItems = [
    { label: 'Active', value: 'active' as UserStatusUpdateValue },
    { label: 'Suspended', value: 'suspended' as UserStatusUpdateValue },
    { label: 'Banned', value: 'banned' as UserStatusUpdateValue }
  ]
  const statusState = reactive({ status: 'active' as UserStatusUpdateValue, suspendedUntil: '', reason: '' })
  function openStatus() {
    const current = user.value?.status
    statusState.status = current === 'suspended' || current === 'banned' ? current : 'active'
    statusState.suspendedUntil = ''
    statusState.reason = ''
    statusOpen.value = true
  }
  async function onSaveStatus() {
    savingStatus.value = true
    const res = await run(() => updateStatus.mutateAsync({
      userId: userId.value,
      status: statusState.status,
      // suspended_until only applies to a suspension.
      suspended_until: statusState.status === 'suspended' && statusState.suspendedUntil ? new Date(statusState.suspendedUntil).toISOString() : undefined,
      reason: statusState.reason.trim() || undefined
    }), { success: 'Status updated', error: 'Could not update status' })
    if (res.ok) statusOpen.value = false
    savingStatus.value = false
  }

  // --- Reset password (admin) ---
  const resetPassword = useResetUserPassword()
  const resetOpen = ref(false)
  const resettingPassword = ref(false)
  const resetState = reactive({ new_password: '', confirm_password: '' })
  function openReset() {
    resetState.new_password = ''
    resetState.confirm_password = ''
    resetOpen.value = true
  }
  async function onResetPassword(event: FormSubmitEvent<ResetPasswordSchema>) {
    resettingPassword.value = true
    const res = await run(() => resetPassword.mutateAsync({ userId: userId.value, new_password: event.data.new_password }), { success: 'Password reset', error: 'Could not reset password' })
    if (res.ok) resetOpen.value = false
    resettingPassword.value = false
  }

  // Header actions menu (both are user:update).
  const userActions = computed(() => {
    if (!canManageUser.value) return []
    return [[
      { label: 'Change status', icon: 'i-lucide-user-cog', onSelect: () => openStatus() },
      { label: 'Reset password', icon: 'i-lucide-key-round', onSelect: () => openReset() }
    ]]
  })

  // --- Memberships (entities the user belongs to) ---
  const canManageMemberships = computed(() => canAddMembership.value || canEditMembership.value || canRemoveMembership.value)
  const { data: userMembershipsData, status: membershipsStatus } = useQuery(() => ({ ...userMembershipsQuery(userId.value), enabled: canReadMemberships.value }))
  const memberships = computed<Membership[]>(() => userMembershipsData.value ?? [])

  // Entities pool for name mapping + the add-membership picker, scoped to the user's org (memberships
  // are org-scoped — the backend rejects cross-org). Loaded when memberships are readable.
  const { data: entitiesData } = useQuery(() => ({ ...entitiesListQuery({ limit: 1000 }), enabled: canReadMemberships.value }))
  const entityById = computed(() => new Map((entitiesData.value?.items ?? []).map(e => [e.id, e])))
  function entityRootOf(entityId: string): string | undefined {
    let cur = entityById.value.get(entityId)
    const seen = new Set<string>()
    while (cur?.parent_entity_id && !seen.has(cur.id)) {
      seen.add(cur.id)
      const parent = entityById.value.get(cur.parent_entity_id)
      if (!parent) break
      cur = parent
    }
    return cur?.id
  }
  const memberEntityIds = computed(() => new Set(memberships.value.map(m => m.entity_id)))
  const membershipEntityOptions = computed(() => (entitiesData.value?.items ?? [])
    .filter(e => entityRootOf(e.id) === user.value?.root_entity_id && !memberEntityIds.value.has(e.id))
    .map(e => ({ label: e.display_name, value: e.id })))
  const entityName = (entityId: string) => entityById.value.get(entityId)?.display_name ?? entityId

  // Add membership
  const addMember = useAddMember()
  const addMembershipOpen = ref(false)
  const addingMembership = ref(false)
  const addMembershipState = reactive({ entityId: '', roleIds: [] as string[], status: 'active' as MembershipStatusValue, validFrom: '', validUntil: '', reason: '' })
  const addMembershipRoles = computed(() => addMembershipState.roleIds.map(id => roleById.value.get(id)).filter((r): r is Role => Boolean(r)))
  function openAddMembership() {
    Object.assign(addMembershipState, { entityId: '', roleIds: [], status: 'active', validFrom: '', validUntil: '', reason: '' })
    addMembershipOpen.value = true
  }
  async function onAddMembership() {
    if (!addMembershipState.entityId) return
    addingMembership.value = true
    const res = await run(() => addMember.mutateAsync({
      user_id: userId.value,
      entity_id: addMembershipState.entityId,
      role_ids: [...addMembershipState.roleIds],
      status: addMembershipState.status,
      valid_from: toIsoOrNull(addMembershipState.validFrom),
      valid_until: toIsoOrNull(addMembershipState.validUntil),
      reason: addMembershipState.reason.trim() || null
    }), { success: 'Membership added', error: 'Could not add membership' })
    if (res.ok) addMembershipOpen.value = false
    addingMembership.value = false
  }

  // Edit membership access
  const updateMember = useUpdateMemberAccess()
  const editMembershipOpen = ref(false)
  const editMembershipTarget = ref<Membership | null>(null)
  const savingMembership = ref(false)
  const editMembershipState = reactive({ roleIds: [] as string[], status: 'active' as MembershipStatusValue, validFrom: '', validUntil: '', reason: '' })
  const editMembershipRoles = computed(() => editMembershipState.roleIds.map(id => roleById.value.get(id)).filter((r): r is Role => Boolean(r)))
  function openEditMembership(membership: Membership) {
    editMembershipTarget.value = membership
    Object.assign(editMembershipState, {
      roleIds: [...membership.role_ids],
      status: membership.status === 'suspended' ? 'suspended' : 'active',
      validFrom: toDateInput(membership.valid_from),
      validUntil: toDateInput(membership.valid_until),
      reason: ''
    })
    editMembershipOpen.value = true
  }
  async function onSaveMembership() {
    const membership = editMembershipTarget.value
    if (!membership) return
    savingMembership.value = true
    const res = await run(() => updateMember.mutateAsync({
      entityId: membership.entity_id,
      userId: userId.value,
      input: {
        role_ids: [...editMembershipState.roleIds],
        status: editMembershipState.status,
        valid_from: toIsoOrNull(editMembershipState.validFrom),
        valid_until: toIsoOrNull(editMembershipState.validUntil),
        reason: editMembershipState.reason.trim() || null
      }
    }), { success: 'Membership updated', error: 'Could not update membership' })
    if (res.ok) editMembershipOpen.value = false
    savingMembership.value = false
  }

  // Remove membership
  const removeMember = useRemoveMember()
  const removeMembershipOpen = ref(false)
  const removeMembershipTarget = ref<Membership | null>(null)
  const removingMembership = ref(false)
  function openRemoveMembership(membership: Membership) {
    removeMembershipTarget.value = membership
    removeMembershipOpen.value = true
  }
  async function onConfirmRemoveMembership() {
    const membership = removeMembershipTarget.value
    if (!membership) return
    removingMembership.value = true
    const res = await run(() => removeMember.mutateAsync({ entityId: membership.entity_id, userId: userId.value }), { success: 'Membership removed', error: 'Could not remove membership' })
    if (res.ok) removeMembershipOpen.value = false
    removingMembership.value = false
  }

  function membershipRowMenu(membership: Membership) {
    const items = []
    if (canEditMembership.value) items.push({ label: 'Edit access', icon: 'i-lucide-pencil', onSelect: () => openEditMembership(membership) })
    if (canRemoveMembership.value) items.push({ label: 'Remove', icon: 'i-lucide-trash', color: 'error' as const, onSelect: () => openRemoveMembership(membership) })
    return items.length ? [items] : []
  }

  const memberStatusItems = MEMBER_STATUS_ITEMS

  return {
    user,
    status,
    errorMessage,
    sessions,
    sessionsStatus,
    roleMemberships,
    rolesStatus,
    canManageUser,
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
    onConfirmRemove,
    userActions,
    statusOpen,
    statusItems,
    statusState,
    savingStatus,
    onSaveStatus,
    resetOpen,
    resetState,
    resettingPassword,
    onResetPassword,
    // memberships
    canAddMembership,
    canManageMemberships,
    memberships,
    membershipsStatus,
    membershipRowMenu,
    membershipEntityOptions,
    entityName,
    memberStatusItems,
    orgRoles,
    addMembershipOpen,
    addMembershipState,
    addMembershipRoles,
    addingMembership,
    openAddMembership,
    onAddMembership,
    editMembershipOpen,
    editMembershipTarget,
    editMembershipState,
    editMembershipRoles,
    savingMembership,
    onSaveMembership,
    removeMembershipOpen,
    removeMembershipTarget,
    removingMembership,
    onConfirmRemoveMembership
  }
}
