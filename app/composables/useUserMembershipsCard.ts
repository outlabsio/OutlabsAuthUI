import type { Ref } from 'vue'
import type { DropdownMenuItem, FormSubmitEvent } from '@nuxt/ui'
import { useQuery } from '@pinia/colada'
import { USER_HISTORY_PAGE_SIZE, userMembershipHistoryQuery } from '~/queries/users'
import { useAddMember, useRemoveMember, useUpdateMemberAccess, userAllMembershipsQuery } from '~/queries/memberships'
import { endOfDayIso, startOfDayIso, toDateInput } from '~/utils/validity'
import { endedGrantCount, grantActions, grantIsLive, grantWindowEnded, visibleGrants } from '~/utils/access-grants'
import { formatDate } from '~/utils/format-date'
import { slicePage } from '~/utils/pagination'
import { entityPickBlocked } from '~/utils/entity-scope'
import type { AddMembershipSchema, EditMembershipSchema } from '~/schemas/membership'
import type { ActionError } from '~/composables/useApiAction'
import type { FormConflict } from '~/composables/useDialogForm'
import type { ReactivateTarget } from '~/composables/useAccessReactivateDialog'
import type { RoleReference } from '~/types/role'
import type { User } from '~/types/user'
import type { Membership } from '~/types/membership'

// The Access tab's Memberships card (AppUserMembershipsCard, EnterpriseRBAC with the memberships
// router): the entities the account belongs to and the roles each membership grants.
//
// - The card reads every membership in every status (F-058, F-173: all pages, not the API's
//   first 50) and shows the live ones (active and suspended) by default, a page at a time;
//   "Include ended" adds revoked and expired ones.
// - Entities are named even when inactive or outside the loaded tree, with an Inactive badge
//   (F-066); roles by the names the membership history carries, else the role catalog (F-067).
// - Writes follow the F-015 rule (utils/access-grants.ts): Edit access only on a live
//   membership, with its real status, diff-only and checked against the server before saving;
//   Reactivate for a suspended or ended one; Remove only for a live one. Nothing is offered on
//   an account the admin may not change (useUserPolicy: deleted, or a superuser for a delegated
//   admin, F-174).
// - A user without an organization can be given a first membership (F-011): the picker offers
//   every entity the admin manages, and the first membership places the user in that
//   entity's organization.

const PAGE_SIZE = 25
const FIELD_MAP = { entity_id: 'entityId', role_ids: 'roleIds', valid_from: 'validFrom', valid_until: 'validUntil', reason: 'reason', status: 'status' }
const MEMBERSHIP_FIELDS: Record<string, string> = { role_ids: 'Roles', status: 'Status', valid_from: 'Valid from', valid_until: 'Valid until' }

export function useUserMembershipsCard(user: Ref<User>) {
  const { hasPermission, isSuperuser, canAccess, isEnterprise, hasMemberships } = useAuth()
  const { run } = useApiAction()
  const userId = computed(() => user.value.id)

  // The permission checks use the backend algebra, so an org admin's membership:read_tree counts.
  // Writes also need the account to be changeable by this admin (useUserPolicy).
  const { canEdit: canChangeUser } = useUserPolicy(user)
  const canReadMemberships = computed(() => hasMemberships.value && hasPermission('membership:read'))
  const canAddMembership = computed(() => hasMemberships.value && canChangeUser.value && hasPermission('membership:create'))
  const canEditMembership = computed(() => hasMemberships.value && canChangeUser.value && hasPermission('membership:update'))
  const canRemoveMembership = computed(() => hasMemberships.value && canChangeUser.value && hasPermission('membership:delete'))
  const canOpenEntities = computed(() => canAccess('entities'))

  const { data, status, error, isLoading, refetch } = useQuery(() => ({ ...userAllMembershipsQuery(userId.value), enabled: canReadMemberships.value }))
  const allMemberships = computed<Membership[]>(() => data.value ?? [])
  const hasData = computed(() => data.value !== undefined)
  const includeEnded = ref(false)
  const shown = computed(() => visibleGrants(allMemberships.value, includeEnded.value))
  const endedCount = computed(() => endedGrantCount(allMemberships.value))
  const liveCount = computed(() => allMemberships.value.length - endedCount.value)
  const page = ref(1)
  watch([includeEnded, userId], () => {
    page.value = 1
  })
  const memberships = computed(() => slicePage(shown.value, page.value, PAGE_SIZE))
  const shownTotal = computed(() => shown.value.length)

  // Membership history carries role names next to role ids; use them so membership role chips
  // read as names even when the actor cannot read those roles (F-067). The first page, the same
  // entry the History tab's card shows first. AppRoleChip fills the rest from the role catalog.
  const historyEnabled = computed(() => canAccess('users') && isEnterprise.value)
  const history = useQuery(() => ({
    ...userMembershipHistoryQuery({ userId: userId.value, page: 1, limit: USER_HISTORY_PAGE_SIZE }),
    enabled: historyEnabled.value
  }))
  const roleNamesFromHistory = computed(() => roleNameHints((history.data.value?.items ?? []).flatMap(event => [
    { ids: event.role_ids, names: event.role_names },
    { ids: event.previous_role_ids, names: event.previous_role_names }
  ])))
  const roleCatalog = useRoleCatalog()
  function roleReference(id: string): RoleReference {
    return { id, display_name: roleNamesFromHistory.value.get(id), namePending: historyEnabled.value && history.status.value === 'pending' }
  }
  const roleLabel = (id: string) => roleCatalog.describe(roleReference(id)).label

  // --- Entity names (F-066): inactive and out-of-tree entities are named too ---
  const { knownById, entityById, entityInactive, entityStatus } = useMembershipEntities(
    () => allMemberships.value.map(m => m.entity_id),
    canReadMemberships
  )
  const entityName = (entityId: string) => entityById.value.get(entityId)?.display_name ?? 'Unknown entity'
  // An entity is a link only when this admin can open it (it is in their organization's tree).
  const canOpenEntity = (entityId: string) => canOpenEntities.value && knownById.value.has(entityId)

  // --- Add membership ---
  // The picker (AppEntityPicker) is scoped to the user's organization (the backend refuses any
  // other: "User belongs to a different organization"); a user without one takes the anchored
  // admin's organization, and an admin who browses every organization (superusers, system-wide
  // admins: useEntityScope) picks across all of them (global search).
  const { anchoredRootId } = useEntityScope()
  const { isGlobal, reachResolving } = useActorReach()
  const membershipPickerRootId = computed(() => user.value.root_entity_id ?? anchoredRootId.value)
  // Why there is no entity to offer, when there is none (the picker is then disabled):
  // - no organization on either side and no global reach (an unknown reach counts as none);
  // - an anchored admin and a user of another organization, whose entities are outside theirs
  //   (not while a system-wide admin's reach is still loading: they are anchored only until then).
  const membershipPickerBlockedReason = computed<string | null>(() => {
    const userRoot = user.value.root_entity_id
    if (!userRoot && entityPickBlocked({ enterprise: isEnterprise.value, superuser: isSuperuser.value, actorIsGlobal: isGlobal.value, anchoredRootId: anchoredRootId.value })) {
      return 'Neither this user nor your account belongs to an organization, so there is no entity you can add them to.'
    }
    if (userRoot && anchoredRootId.value && userRoot !== anchoredRootId.value && !reachResolving.value) {
      return 'This user belongs to another organization, outside yours, so there is no entity you can add them to.'
    }
    return null
  })
  const membershipPickerBlocked = computed(() => Boolean(membershipPickerBlockedReason.value))
  // A user without an organization joins one through their first membership (F-011).
  const firstMembershipNote = computed(() => (user.value.root_entity_id
    ? null
    : `${user.value.email} belongs to no organization yet. This first membership places them in the chosen entity's organization.`))
  // Entities with a live membership are excluded; an ended one is reactivated from its row.
  const memberEntityIds = computed(() => allMemberships.value.filter(grantIsLive).map(m => m.entity_id))

  const addMember = useAddMember()
  const addMembershipOpen = ref(false)
  const addError = ref<ActionError | null>(null)
  const addForm = useDialogForm('addMembershipDialog')
  const blankAdd = (): AddMembershipSchema => ({ entityId: '', roleIds: [], status: 'active', validFrom: '', validUntil: '', reason: '' })
  const addMembershipState = reactive<AddMembershipSchema>(blankAdd())
  // Roles the backend accepts for a membership at the chosen entity; empty (and the picker
  // disabled) until an entity is chosen. A new entity means a new pool: clear stale selections.
  const addMembershipRoles = useAssignableRoles(
    () => ({ kind: 'entity', entityId: addMembershipState.entityId || null }),
    { enabled: addMembershipOpen }
  )
  watch(() => addMembershipState.entityId, () => {
    addMembershipState.roleIds = []
  })
  // The user's ended membership in the chosen entity: adding again reactivates it in place.
  const addEndedMembership = computed(() => allMemberships.value.find(m => m.entity_id === addMembershipState.entityId && !grantIsLive(m)) ?? null)
  const addEntityHelp = computed(() => {
    if (addEndedMembership.value) return `They had a ${addEndedMembership.value.status} membership here; adding them again reactivates it with these roles.`
    return firstMembershipNote.value ?? undefined
  })
  function openAddMembership() {
    Object.assign(addMembershipState, blankAdd())
    addError.value = null
    addMembershipOpen.value = true
  }
  async function onAddMembership(event: FormSubmitEvent<AddMembershipSchema>) {
    const d = event.data
    const res = await run(() => addMember.mutateAsync({
      user_id: userId.value,
      entity_id: d.entityId,
      role_ids: [...d.roleIds],
      status: d.status,
      valid_from: startOfDayIso(d.validFrom),
      valid_until: endOfDayIso(d.validUntil),
      reason: d.reason.trim() || null
    }), {
      success: 'Membership added',
      error: 'Could not add membership',
      form: addForm,
      inline: addError,
      fieldMap: FIELD_MAP,
      notFoundCodes: ['USER_NOT_FOUND'],
      onNotFound: () => {
        addMembershipOpen.value = false
      },
      grantedRoles: () => d.roleIds.map(id => addMembershipRoles.roleById.value.get(id)).filter(r => r !== undefined)
    })
    if (res.ok) addMembershipOpen.value = false
  }

  // --- Edit access (live memberships only) ---
  // The PATCH carries only what changed: the endpoint replaces the role set (and re-checks
  // delegation) whenever role_ids is present, so a validity-only edit must not re-send it, and
  // an untouched status is never re-sent (F-015). The note rides along with any change and is
  // sent only when written. Before saving, the membership is re-read: a field someone else
  // changed meanwhile that this dialog also changed stops the save with Reload / Overwrite.
  const updateMember = useUpdateMemberAccess()
  const editMembershipOpen = ref(false)
  const editMembershipTarget = ref<Membership | null>(null)
  const editError = ref<ActionError | null>(null)
  const editConflict = ref<FormConflict | null>(null)
  const savingMembership = ref(false)
  const editForm = useDialogForm('editMembershipDialog')
  const editMembershipState = reactive<EditMembershipSchema>({ roleIds: [], status: 'active', validFrom: '', validUntil: '', reason: '' })
  const membershipForm = (membership: Membership): EditMembershipSchema => ({
    roleIds: [...(membership.role_ids ?? [])],
    // Only live memberships open this dialog, so the status is one the form represents.
    status: membership.status === 'suspended' ? 'suspended' : 'active',
    validFrom: toDateInput(membership.valid_from),
    validUntil: toDateInput(membership.valid_until),
    reason: ''
  })
  const editMembershipChanges = useDirtyPatch(editMembershipState, state => ({
    role_ids: [...state.roleIds].sort(),
    status: state.status,
    valid_from: startOfDayIso(state.validFrom),
    valid_until: endOfDayIso(state.validUntil),
    reason: state.reason.trim() || undefined
  }), { always: ['reason'] })
  const editMembershipRoles = useAssignableRoles(
    () => ({ kind: 'entity', entityId: editMembershipTarget.value?.entity_id ?? null }),
    { enabled: editMembershipOpen }
  )
  // Names for the membership's current roles, including ones outside the pool.
  const editMembershipKnownRoles = computed<RoleReference[]>(() => (editMembershipTarget.value?.role_ids ?? []).map(id => ({ ...roleReference(id), display_name: roleLabel(id) })))
  const editWindowNote = computed(() => {
    const membership = editMembershipTarget.value
    if (!membership || !grantWindowEnded(membership)) return null
    return `Its window ended on ${formatDate(membership.valid_until)}, so it grants nothing. Set a later Valid until, or clear it, to restore it.`
  })
  function openEditMembership(membership: Membership) {
    editMembershipTarget.value = membership
    Object.assign(editMembershipState, membershipForm(membership))
    editMembershipChanges.snapshot()
    editError.value = null
    editConflict.value = null
    editMembershipOpen.value = true
  }
  async function latestMembership(entityId: string): Promise<Membership | null> {
    const { data: latest } = await refetch()
    return latest?.find(m => m.entity_id === entityId) ?? null
  }
  async function saveMembership(force: boolean) {
    const membership = editMembershipTarget.value
    const input = editMembershipChanges.patch.value
    if (!membership) return
    if (!Object.keys(input).length) {
      editMembershipOpen.value = false
      return
    }
    savingMembership.value = true
    try {
      if (!force) {
        const latest = await latestMembership(membership.entity_id)
        const clashes = latest ? editMembershipChanges.conflicts(membershipForm(latest)) : []
        // Ended meanwhile (removed elsewhere): saving would bring it back, so it is a clash.
        if (latest && !grantIsLive(latest)) clashes.push('status')
        if (clashes.length) {
          editConflict.value = { fields: [...new Set(clashes)].map(key => MEMBERSHIP_FIELDS[key] ?? key) }
          return
        }
      }
      editConflict.value = null
      const res = await run(() => updateMember.mutateAsync({ entityId: membership.entity_id, userId: userId.value, input }), {
        success: 'Membership updated',
        error: 'Could not update membership',
        form: editForm,
        inline: editError,
        fieldMap: FIELD_MAP,
        notFoundCodes: ['MEMBERSHIP_NOT_FOUND'],
        onNotFound: () => {
          editMembershipOpen.value = false
        },
        grantedRoles: () => editMembershipState.roleIds.map(id => editMembershipRoles.roleById.value.get(id)).filter(r => r !== undefined)
      })
      if (res.ok) editMembershipOpen.value = false
    } finally {
      savingMembership.value = false
    }
  }
  const onSaveMembership = () => saveMembership(false)
  const overwriteMembership = () => saveMembership(true)
  async function reloadMembership() {
    const membership = editMembershipTarget.value
    if (!membership) return
    const latest = await latestMembership(membership.entity_id)
    if (!latest || !grantIsLive(latest)) {
      editMembershipOpen.value = false
      return
    }
    openEditMembership(latest)
  }

  // --- Reactivate (F-015, F-058) ---
  const reactivateOpen = ref(false)
  const reactivateTarget = ref<ReactivateTarget | null>(null)
  function openReactivate(membership: Membership) {
    reactivateTarget.value = {
      kind: 'membership',
      entityId: membership.entity_id,
      userId: userId.value,
      entityName: entityName(membership.entity_id),
      userEmail: user.value.email,
      status: membership.status,
      validFrom: membership.valid_from,
      validUntil: membership.valid_until,
      roleNames: (membership.role_ids ?? []).map(roleLabel),
      entityInactive: entityInactive(membership.entity_id)
    }
    reactivateOpen.value = true
  }

  // --- Remove (DELETE /memberships/{entity}/{user} revokes it; it stays in the history) ---
  const removeMember = useRemoveMember()
  const removeMembership = useConfirmAction<Membership>({
    describe: membership => ({
      title: `Remove membership in ${entityName(membership.entity_id)}`,
      description: `${user.value.email} leaves ${entityName(membership.entity_id)}.`,
      effects: [
        membership.status === 'suspended'
          ? 'The membership is suspended, so it grants nothing now; removing it ends it for good.'
          : 'The roles this membership grants stop applying immediately, here and in sub-entities for roles that reach down the tree.',
        'The user account and their other memberships and direct roles are not affected.',
        'The membership stays in the user\'s history as revoked, and can be reactivated later.'
      ],
      confirmLabel: 'Remove membership'
    }),
    action: membership => removeMember.mutateAsync({ entityId: membership.entity_id, userId: userId.value }),
    success: 'Membership removed',
    error: 'Could not remove membership',
    notFoundCodes: ['MEMBERSHIP_NOT_FOUND']
  })

  function membershipRowMenu(membership: Membership): DropdownMenuItem[][] {
    const actions = grantActions(membership, { edit: canEditMembership.value, remove: canRemoveMembership.value, reactivate: canEditMembership.value })
    const items: DropdownMenuItem[] = []
    if (actions.includes('reactivate')) items.push({ label: 'Reactivate', icon: 'i-lucide-rotate-ccw', onSelect: () => openReactivate(membership) })
    if (actions.includes('edit')) items.push({ label: 'Edit access', icon: 'i-lucide-pencil', onSelect: () => openEditMembership(membership) })
    const groups: DropdownMenuItem[][] = items.length ? [items] : []
    if (actions.includes('remove')) groups.push([{ label: 'Remove', icon: 'i-lucide-trash', color: 'error', onSelect: () => removeMembership.ask(membership) }])
    return groups
  }

  return {
    canReadMemberships,
    canAddMembership,
    includeEnded,
    memberships,
    endedCount,
    liveCount,
    page,
    pageSize: PAGE_SIZE,
    shownTotal,
    status,
    error,
    isLoading,
    hasData,
    refetch,
    roleReference,
    entityName,
    entityStatus,
    canOpenEntity,
    membershipRowMenu,
    membershipPickerRootId,
    membershipPickerBlocked,
    membershipPickerBlockedReason,
    memberEntityIds,
    addMembershipOpen,
    addMembershipState,
    addError,
    addEntityHelp,
    addMembershipPool: addMembershipRoles.roles,
    addMembershipPoolStatus: addMembershipRoles.status,
    addMembershipPoolEmptyText: addMembershipRoles.emptyText,
    addMembershipPoolTruncated: addMembershipRoles.truncated,
    openAddMembership,
    onAddMembership,
    editMembershipOpen,
    editMembershipTarget,
    editMembershipState,
    editError,
    editConflict,
    editWindowNote,
    editMembershipDirty: editMembershipChanges.dirty,
    editMembershipPool: editMembershipRoles.roles,
    editMembershipPoolStatus: editMembershipRoles.status,
    editMembershipPoolEmptyText: editMembershipRoles.emptyText,
    editMembershipPoolTruncated: editMembershipRoles.truncated,
    editMembershipKnownRoles,
    savingMembership,
    onSaveMembership,
    overwriteMembership,
    reloadMembership,
    reactivateOpen,
    reactivateTarget,
    removeMembership
  }
}
