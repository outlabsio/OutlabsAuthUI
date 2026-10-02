import type { Ref } from 'vue'
import type { DropdownMenuItem, FormSubmitEvent } from '@nuxt/ui'
import { useQuery } from '@pinia/colada'
import { normalizeApiError } from '~/api/errors'
import { useAssignUserRoles, useRemoveUserRole, useUpdateUserRoleMembership, userRoleMembershipsQuery, type RoleAssignOutcome } from '~/queries/users'
import { endOfDayIso, startOfDayIso, toDateInput } from '~/utils/validity'
import { assignOutcomeSummary, endedGrantCount, grantActions, grantEffectiveStatus, grantIsLive, grantWindowEnded, visibleGrants } from '~/utils/access-grants'
import { formatDate } from '~/utils/format-date'
import type { AssignRolesSchema, RoleAssignmentEditSchema } from '~/schemas/membership'
import type { ActionError } from '~/composables/useApiAction'
import type { FormConflict } from '~/composables/useDialogForm'
import type { ReactivateTarget } from '~/composables/useAccessReactivateDialog'
import type { User, UserRoleMembership } from '~/types/user'
import type { MembershipStatusValue } from '~/types/membership'

// The Access tab's Direct roles card (AppUserRolesCard): roles granted to the account itself, as
// distinct from roles it gets through entity memberships. Assign, edit the validity window and
// status of a live assignment, reactivate an ended or suspended one, remove one.
//
// The card reads every assignment (include_inactive) and shows the live ones (active and
// suspended) by default, so a suspension never makes a row vanish; "Include ended" adds revoked
// and expired ones. Writes follow the F-015 rule (utils/access-grants.ts): Edit assignment opens
// only on a live assignment, with its real status, and sends only what changed; an ended one is
// offered Reactivate instead.

export const ROLE_ASSIGNMENT_STATUS_ITEMS = [
  { label: 'Active', value: 'active' as MembershipStatusValue },
  { label: 'Suspended', value: 'suspended' as MembershipStatusValue }
]

export function useUserRolesCard(user: Ref<User>) {
  const { canAccess, hasMemberships } = useAuth()
  const { run } = useApiAction()
  const toast = useToast()
  const userId = computed(() => user.value.id)

  // Same requirement as the Users nav item.
  const canRead = computed(() => canAccess('users'))
  // Writes follow the user's policy (useUserPolicy): never on a deleted account, a superuser
  // account only by a global admin (F-174).
  const { canEdit } = useUserPolicy(user)
  const canManage = canEdit
  const canOpenRoles = computed(() => canAccess('roles'))
  // A role is a link only when this admin can open it: the role catalog is what they may read
  // (a delegated admin cannot open a system-wide role, F-122). A truncated catalog may miss
  // readable roles, so it does not withhold links.
  const roleCatalog = useRoleCatalog()
  function canOpenRole(roleId: string) {
    return canOpenRoles.value && (roleCatalog.truncated.value || roleCatalog.roleById.value.has(roleId))
  }

  const includeEnded = ref(false)
  const { data, status, error, isLoading, refetch } = useQuery(() => ({
    ...userRoleMembershipsQuery({ userId: userId.value, includeInactive: true }),
    enabled: canRead.value
  }))
  const allAssignments = computed<UserRoleMembership[]>(() => data.value ?? [])
  const roleMemberships = computed(() => visibleGrants(allAssignments.value, includeEnded.value))
  const endedCount = computed(() => endedGrantCount(allAssignments.value))
  const liveCount = computed(() => allAssignments.value.length - endedCount.value)
  const hasData = computed(() => data.value !== undefined)
  const now = useRelativeNow()
  const effectiveStatus = (membership: UserRoleMembership) => grantEffectiveStatus(membership, now.value.getTime())

  // Direct-role pool (useAssignableRoles): active, never entity-local, and on EnterpriseRBAC only
  // system-wide roles plus the user's own organization's roles; roles the actor cannot delegate
  // are listed disabled. It excludes roles with a live (active or suspended) assignment: the API
  // reactivates any non-active row in place with the dialog's window, so offering a suspended
  // role here would quietly bring it back and drop its stored window (F-015); that is what the
  // row's Reactivate or Edit assignment is for. An ended (revoked, expired) one is assignable again.
  const assignedRoleIds = computed(() => new Set(allAssignments.value.filter(grantIsLive).map(m => m.role_id)))
  const directRoles = useAssignableRoles(
    () => ({ kind: 'direct', rootEntityId: user.value.root_entity_id ?? null }),
    { enabled: canManage, exclude: assignedRoleIds }
  )

  // --- Assign (F-176: every selected role is tried and each answer reported) ---
  const assignRoles = useAssignUserRoles()
  const assignOpen = ref(false)
  const assignError = ref<ActionError | null>(null)
  const assignForm = useDialogForm('assignDialog')
  const assignState = reactive<AssignRolesSchema>({ roleIds: [], validFrom: '', validUntil: '' })
  const roleName = (roleId: string) => {
    const role = directRoles.roleById.value.get(roleId) ?? roleCatalog.roleById.value.get(roleId)
    return role?.display_name || role?.name || 'Unknown role'
  }
  const assignSelectedRoles = computed(() => assignState.roleIds
    .map(id => directRoles.roleById.value.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r)))
  function openAssign() {
    Object.assign(assignState, { roleIds: [], validFrom: '', validUntil: '' })
    assignError.value = null
    assignOpen.value = true
  }
  async function onAssign(event: FormSubmitEvent<AssignRolesSchema>) {
    const roleIds = [...event.data.roleIds]
    const res = await run(
      () => assignRoles.mutateAsync({
        userId: userId.value,
        roleIds,
        valid_from: startOfDayIso(event.data.validFrom),
        valid_until: endOfDayIso(event.data.validUntil)
      }),
      {
        error: 'Could not assign roles',
        form: assignForm,
        inline: assignError,
        fieldMap: { role_id: 'roleIds', valid_from: 'validFrom', valid_until: 'validUntil' },
        notFoundCodes: ['USER_NOT_FOUND'],
        onNotFound: () => {
          assignOpen.value = false
        },
        grantedRoles: assignSelectedRoles
      }
    )
    if (!res.ok) return
    const summary = assignOutcomeSummary(res.data as RoleAssignOutcome[], roleName, error => normalizeApiError(error).message)
    if (!summary.failed.length) {
      toast.add({ title: summary.title, color: 'success', icon: 'i-lucide-check' })
      assignOpen.value = false
      return
    }
    // Some were assigned, some refused: say which, and keep only the refused ones selected so
    // a retry does not re-send the assigned ones (F-176).
    toast.add({ title: summary.title, description: summary.description, color: 'warning', icon: 'i-lucide-triangle-alert' })
    const first = normalizeApiError((res.data as RoleAssignOutcome[]).find(outcome => !outcome.ok && 'error' in outcome)?.error)
    assignError.value = {
      kind: first.kind,
      status: first.status,
      code: first.code,
      title: summary.title,
      description: summary.failed.length === 1
        ? `${summary.failed[0]!.name} was not assigned: ${summary.failed[0]!.message}`
        : `These roles were not assigned: ${summary.description}`,
      issues: [],
      missingPermissions: first.missingPermissions,
      requiredPermissions: first.requiredPermissions,
      contributingRoles: [],
      retryAfterSeconds: first.retryAfterSeconds
    }
    assignState.roleIds = summary.failed.map(item => item.roleId)
  }

  // --- Remove (F-015: only a live assignment) ---
  // DELETE /users/{id}/roles/{role_id} revokes an ACTIVE assignment (404 otherwise); a suspended
  // one is revoked through its PATCH. Either way it stays in the history as revoked.
  const removeUserRole = useRemoveUserRole()
  const updateRoleMembership = useUpdateUserRoleMembership()
  const removeRole = useConfirmAction<UserRoleMembership>({
    describe: membership => ({
      title: `Remove role ${membership.role.display_name}`,
      description: `${user.value.email} loses this direct role assignment.`,
      effects: [
        membership.status === 'suspended'
          ? 'The assignment is suspended, so it grants nothing now; removing it ends it for good.'
          : 'Permissions this user has only through this role are revoked immediately.',
        ...(hasMemberships.value ? ['The same role granted through an entity membership is not affected.'] : []),
        'The assignment stays in the user\'s history as revoked, and the role can be assigned again later.'
      ],
      confirmLabel: 'Remove role'
    }),
    action: membership => (membership.status === 'suspended'
      ? updateRoleMembership.mutateAsync({ userId: userId.value, membershipId: membership.id, input: { status: 'revoked' } })
      : removeUserRole.mutateAsync({ userId: userId.value, roleId: membership.role_id })),
    success: 'Role removed',
    error: 'Could not remove role'
  })

  // --- Reactivate (F-015, F-058) ---
  const reactivateOpen = ref(false)
  const reactivateTarget = ref<ReactivateTarget | null>(null)
  function openReactivate(membership: UserRoleMembership) {
    reactivateTarget.value = {
      kind: 'role',
      userId: userId.value,
      membershipId: membership.id,
      roleName: membership.role.display_name,
      userEmail: user.value.email,
      status: membership.status,
      validFrom: membership.valid_from,
      validUntil: membership.valid_until
    }
    reactivateOpen.value = true
  }

  // --- Edit assignment (live assignments only) ---
  // Named for both things it changes, like a membership's Edit access: it is also where a direct
  // role assignment is suspended (there is no separate Suspend item).
  // The validity window and status (active/suspended) of a live assignment. Which role is
  // granted isn't editable here: changing it means remove + re-assign. The PATCH carries only
  // the fields the admin changed (the endpoint applies exactly the fields it receives), so an
  // untouched day keeps its stored instant and an untouched status is never re-sent.
  //
  // The API has no version or ETag, so before saving the dialog re-reads the assignment: when
  // someone else changed a field this dialog also changed, it stops and offers Reload (show their
  // values) or Overwrite (save these anyway). Fields only they changed are safe: they are not sent.
  const editRoleOpen = ref(false)
  const editRoleTarget = ref<UserRoleMembership | null>(null)
  const editRoleError = ref<ActionError | null>(null)
  const editRoleConflict = ref<FormConflict | null>(null)
  const savingRole = ref(false)
  const editRoleForm = useDialogForm('editRoleDialog')
  const editRoleState = reactive<RoleAssignmentEditSchema>({ status: 'active', validFrom: '', validUntil: '' })
  const roleAssignmentForm = (membership: UserRoleMembership): RoleAssignmentEditSchema => ({
    // Only live assignments open this dialog, so the status is one the form represents.
    status: membership.status === 'suspended' ? 'suspended' : 'active',
    validFrom: toDateInput(membership.valid_from),
    validUntil: toDateInput(membership.valid_until)
  })
  const editRoleChanges = useDirtyPatch(editRoleState, state => ({
    status: state.status,
    valid_from: startOfDayIso(state.validFrom),
    valid_until: endOfDayIso(state.validUntil)
  }))
  // An active assignment whose window has closed grants nothing: the dialog says how to restore it.
  const editRoleWindowNote = computed(() => {
    const membership = editRoleTarget.value
    if (!membership || !grantWindowEnded(membership, now.value.getTime())) return null
    return `Its window ended on ${formatDate(membership.valid_until)}, so it grants nothing. Set a later Valid until, or clear it, to restore it.`
  })
  const ROLE_ASSIGNMENT_FIELDS: Record<string, string> = { status: 'Status', valid_from: 'Valid from', valid_until: 'Valid until' }
  function openEditRole(membership: UserRoleMembership) {
    editRoleTarget.value = membership
    Object.assign(editRoleState, roleAssignmentForm(membership))
    editRoleChanges.snapshot()
    editRoleError.value = null
    editRoleConflict.value = null
    editRoleOpen.value = true
  }
  // The assignment as the server has it now (null when it is no longer listed).
  async function latestRoleAssignment(id: string): Promise<UserRoleMembership | null> {
    const { data: latest } = await refetch()
    return latest?.find(membership => membership.id === id) ?? null
  }
  async function saveRoleMembership(force: boolean) {
    const membership = editRoleTarget.value
    const input = editRoleChanges.patch.value
    if (!membership) return
    if (!Object.keys(input).length) {
      editRoleOpen.value = false
      return
    }
    savingRole.value = true
    try {
      if (!force) {
        const latest = await latestRoleAssignment(membership.id)
        const clashes = latest ? editRoleChanges.conflicts(roleAssignmentForm(latest)) : []
        // Ended meanwhile (revoked elsewhere): saving would bring it back, so it is a clash.
        if (latest && !['active', 'suspended'].includes(latest.status)) clashes.push('status')
        if (clashes.length) {
          editRoleConflict.value = { fields: [...new Set(clashes)].map(key => ROLE_ASSIGNMENT_FIELDS[key] ?? key) }
          return
        }
      }
      editRoleConflict.value = null
      const res = await run(() => updateRoleMembership.mutateAsync({ userId: userId.value, membershipId: membership.id, input }), {
        success: 'Role assignment updated',
        error: 'Could not update role assignment',
        form: editRoleForm,
        fieldMap: { valid_from: 'validFrom', valid_until: 'validUntil', status: 'status' },
        inline: editRoleError,
        onNotFound: () => {
          editRoleOpen.value = false
        }
      })
      if (res.ok) editRoleOpen.value = false
    } finally {
      savingRole.value = false
    }
  }
  const onSaveRoleMembership = () => saveRoleMembership(false)
  const overwriteRoleMembership = () => saveRoleMembership(true)
  // Start over from the server's values (the admin's edits are dropped). An assignment that has
  // ended meanwhile is not editable any more: the dialog closes and the row offers Reactivate.
  async function reloadRoleMembership() {
    const membership = editRoleTarget.value
    if (!membership) return
    const latest = await latestRoleAssignment(membership.id)
    if (!latest || !['active', 'suspended'].includes(latest.status)) {
      editRoleOpen.value = false
      return
    }
    openEditRole(latest)
  }

  function roleRowMenu(membership: UserRoleMembership): DropdownMenuItem[][] {
    if (!canManage.value) return []
    // An assignment of an inactive or archived role grants nothing even when active.
    const roleActive = (membership.role.status ?? 'active') === 'active'
    const actions = grantActions(membership, { edit: true, remove: true, reactivate: roleActive })
    const items: DropdownMenuItem[] = []
    if (actions.includes('reactivate')) items.push({ label: 'Reactivate', icon: 'i-lucide-rotate-ccw', onSelect: () => openReactivate(membership) })
    if (actions.includes('edit')) items.push({ label: 'Edit assignment', icon: 'i-lucide-pencil', onSelect: () => openEditRole(membership) })
    const groups: DropdownMenuItem[][] = items.length ? [items] : []
    if (actions.includes('remove')) groups.push([{ label: 'Remove', icon: 'i-lucide-trash', color: 'error', onSelect: () => removeRole.ask(membership) }])
    return groups
  }

  return {
    canManage,
    canOpenRole,
    includeEnded,
    roleMemberships,
    endedCount,
    liveCount,
    effectiveStatus,
    status,
    error,
    isLoading,
    hasData,
    refetch,
    roleRowMenu,
    rolesPool: directRoles.roles,
    rolesPoolStatus: directRoles.status,
    rolesPoolEmptyText: directRoles.emptyText,
    rolesPoolTruncated: directRoles.truncated,
    assignOpen,
    assignState,
    assignError,
    openAssign,
    onAssign,
    removeRole,
    reactivateOpen,
    reactivateTarget,
    editRoleOpen,
    editRoleTarget,
    editRoleState,
    editRoleError,
    editRoleConflict,
    editRoleDirty: editRoleChanges.dirty,
    editRoleWindowNote,
    savingRole,
    onSaveRoleMembership,
    overwriteRoleMembership,
    reloadRoleMembership
  }
}
