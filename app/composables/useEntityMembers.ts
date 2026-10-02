import type { DropdownMenuItem, FormSubmitEvent } from '@nuxt/ui'
import { useQuery, useQueryCache } from '@pinia/colada'
import { refDebounced } from '@vueuse/core'
import { entityMembersQuery, useAddMember, useRemoveMember, useUpdateMemberAccess, userAllMembershipsQuery } from '~/queries/memberships'
import { usersListQuery } from '~/queries/users'
import type { AddMemberSchema, EditMemberSchema } from '~/schemas/entity'
import type { Entity } from '~/types/entity'
import type { EntityMember, MembershipStatusValue } from '~/types/membership'
import type { RoleReference } from '~/types/role'
import type { User, UsersListResponse } from '~/types/user'
import { describeActionError, type ActionError } from '~/composables/useApiAction'
import { normalizeApiError } from '~/api/errors'
import type { FormConflict } from '~/composables/useDialogForm'
import type { ReactivateTarget } from '~/composables/useAccessReactivateDialog'
import { endOfDayIso, startOfDayIso, toDateInput } from '~/utils/validity'
import { grantActions, grantIsLive } from '~/utils/access-grants'

// Feature logic for the entity's Users card: one page of members at a time with the true count
// (F-024), and the add / edit access / remove dialogs (AppFormDialog + Zod, F-115).
//
// The members endpoint answers a bare page (max 100) with no total; the active count comes from
// GET /entities/{id}/members (passed in as `activeCount`). With "Include inactive" on there is no
// total, so the pager moves by "Next" while full pages keep coming.

export type EntityMembersProps = {
  entity: Entity
  rootId: string | null
  readOnly: boolean
  activeCount: number | null
  atCapacity: boolean
}

const PAGE_SIZE = 25
const FIELD_MAP = { user_id: 'userId', role_ids: 'roleIds', valid_from: 'validFrom', valid_until: 'validUntil', reason: 'reason', status: 'status' }
const MEMBER_FIELDS: Record<string, string> = { role_ids: 'Roles', status: 'Status', valid_from: 'Valid from', valid_until: 'Valid until' }

export const MEMBER_STATUS_ITEMS = [
  { label: 'Active', value: 'active' as MembershipStatusValue },
  { label: 'Suspended', value: 'suspended' as MembershipStatusValue }
]

type UserOption = { label: string, value: string, description: string, disabled?: boolean }

function userName(u: Pick<User, 'first_name' | 'last_name' | 'email'>) {
  return [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.email
}

export function memberName(m: EntityMember) {
  return [m.user_first_name, m.user_last_name].filter(Boolean).join(' ').trim() || m.user_email
}

export function useEntityMembers(props: EntityMembersProps) {
  const { hasPermission, canAccess, hasMemberships } = useAuth()
  const { run } = useApiAction()

  const entityId = computed(() => props.entity.id)
  const canReadMembers = computed(() => hasMemberships.value && hasPermission('membership:read'))
  const writable = computed(() => hasMemberships.value && !props.readOnly)
  const canAddMember = computed(() => writable.value && hasPermission('membership:create'))
  const canEditMember = computed(() => writable.value && hasPermission('membership:update'))
  const canRemoveMember = computed(() => writable.value && hasPermission('membership:delete'))
  const canOpenUsers = computed(() => canAccess('users'))

  // --- The list (one page at a time) ---
  const includeInactive = ref(false)
  const page = ref(1)
  watch([includeInactive, entityId], () => {
    page.value = 1
  })
  const { data, status, error, refetch } = useQuery(() => ({
    ...entityMembersQuery({ entityId: entityId.value, includeInactive: includeInactive.value, page: page.value, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData<EntityMember[]>,
    enabled: canReadMembers.value
  }))
  const members = computed<EntityMember[]>(() => data.value ?? [])
  // Active members have a true total; with inactive ones there is none, so the pager offers the
  // next page while this one is full.
  const total = computed<number | null>(() => (includeInactive.value ? null : props.activeCount))
  const pagerTotal = computed(() => total.value ?? ((page.value - 1) * PAGE_SIZE + members.value.length + (members.value.length === PAGE_SIZE ? 1 : 0)))
  watch(total, (value) => {
    if (value != null && page.value > 1 && (page.value - 1) * PAGE_SIZE >= value) page.value = Math.max(1, Math.ceil(value / PAGE_SIZE))
  })
  const countLabel = computed(() => (total.value != null ? String(total.value) : null))

  // --- Row actions (F-015: only what applies to the membership's status) ---
  // Edit access and Remove apply to live memberships (active, suspended); a suspended or ended
  // one (revoked, expired) is offered Reactivate, which says what comes back (utils/access-grants).
  function memberRowMenu(m: EntityMember): DropdownMenuItem[][] {
    const actions = grantActions(m, { edit: canEditMember.value, remove: canRemoveMember.value, reactivate: canEditMember.value })
    const items: DropdownMenuItem[] = []
    if (actions.includes('reactivate')) items.push({ label: 'Reactivate', icon: 'i-lucide-rotate-ccw', onSelect: () => openReactivate(m) })
    if (actions.includes('edit')) items.push({ label: 'Edit access', icon: 'i-lucide-pencil', onSelect: () => openEdit(m) })
    if (actions.includes('remove')) items.push({ label: 'Remove', icon: 'i-lucide-user-minus', color: 'error' as const, onSelect: () => removeMember.ask(m) })
    return items.length ? [items] : []
  }

  // --- Reactivate a suspended or ended membership (AppAccessReactivateDialog) ---
  const reactivateOpen = ref(false)
  const reactivateTarget = ref<ReactivateTarget | null>(null)
  function openReactivate(m: EntityMember) {
    reactivateTarget.value = {
      kind: 'membership',
      entityId: entityId.value,
      userId: m.user_id,
      entityName: props.entity.display_name,
      userEmail: m.user_email,
      status: m.status,
      validFrom: m.valid_from,
      validUntil: m.valid_until,
      roleNames: (m.roles ?? []).map(r => r.display_name || r.name || 'Unknown role'),
      entityInactive: props.entity.status !== 'active'
    }
    reactivateOpen.value = true
  }

  // Roles the backend accepts for a membership at THIS entity and that the actor may delegate.
  const addOpen = ref(false)
  const editOpen = ref(false)
  const memberRoles = useAssignableRoles(
    () => ({ kind: 'entity', entityId: entityId.value }),
    { enabled: () => addOpen.value || editOpen.value }
  )

  // --- Add member (F-011: server search, users without an organisation included) ---
  const addError = ref<ActionError | null>(null)
  const addForm = useDialogForm('addMemberDialog')
  const blankAdd = (): AddMemberSchema => ({ userId: '', roleIds: [], status: 'active', validFrom: '', validUntil: '', reason: '' })
  const addState = reactive<AddMemberSchema>(blankAdd())
  const userSearch = ref('')
  const userTerm = refDebounced(computed(() => userSearch.value.trim()), 300)
  const rootId = computed(() => props.rootId)
  const { data: usersData, status: usersStatus, asyncStatus: usersAsync } = useQuery(() => ({
    // Without a term: the organisation's users. With one: everyone matching (users without an
    // organisation join this one through their first membership).
    ...usersListQuery(userTerm.value || !rootId.value
      ? { search: userTerm.value || undefined, limit: 25 }
      : { rootEntityId: rootId.value, limit: 25 }),
    placeholderData: keepPreviousData<UsersListResponse>,
    enabled: addOpen.value && canAddMember.value
  }))
  const chosenUser = ref<UserOption | null>(null)
  const userOptions = computed<UserOption[]>(() => {
    const options = (usersData.value?.items ?? [])
      .filter(u => u.status !== 'deleted' && u.status !== 'banned')
      .filter(u => !rootId.value || !u.root_entity_id || u.root_entity_id === rootId.value)
      .map<UserOption>(u => ({
        label: userName(u),
        value: u.id,
        description: [
          u.email !== userName(u) ? u.email : '',
          u.status !== 'active' ? statusLabel(u.status) : '',
          u.root_entity_id ? '' : 'No organization yet'
        ].filter(Boolean).join(' · ')
      }))
    if (chosenUser.value && !options.some(o => o.value === chosenUser.value!.value)) options.unshift(chosenUser.value)
    return options
  })
  const userSearchInput = { 'placeholder': 'Search by name or email...', 'type': 'search' as const, 'aria-label': 'Search users' }
  const usersLoading = computed(() => usersStatus.value === 'pending' || usersAsync.value === 'loading')
  const usersHint = computed(() => {
    const total = usersData.value?.total ?? 0
    const shown = usersData.value?.items.length ?? 0
    if (total > shown) return `Showing ${shown} of ${total}. Type to narrow the search.`
    return userTerm.value ? null : 'Type a name or email to search everyone you can manage.'
  })
  watch(() => addState.userId, (id) => {
    chosenUser.value = userOptions.value.find(o => o.value === id) ?? null
  })

  // Adding someone who already has a membership here would overwrite it (the API updates the
  // existing row), so the chosen user is checked against their memberships first.
  const { data: chosenMemberships, status: chosenMembershipsStatus } = useQuery(() => ({
    ...userAllMembershipsQuery(addState.userId),
    enabled: addOpen.value && Boolean(addState.userId)
  }))
  const existingMembership = computed(() => (addState.userId ? chosenMemberships.value?.find(m => m.entity_id === entityId.value) ?? null : null))
  const existingMembershipError = computed(() => {
    const m = existingMembership.value
    if (!m) return undefined
    return m.status === 'active' || m.status === 'suspended'
      ? `Already a member here (${statusLabel(m.status).toLowerCase()}). Use Edit access on their row instead.`
      : `Has a ${statusLabel(m.status).toLowerCase()} membership here. Adding them again reactivates it with these roles.`
  })
  const addBlocked = computed(() => Boolean(existingMembership.value && (existingMembership.value.status === 'active' || existingMembership.value.status === 'suspended'))
    || (Boolean(addState.userId) && chosenMembershipsStatus.value === 'pending'))

  const addMember = useAddMember()
  function openAdd() {
    Object.assign(addState, blankAdd())
    userSearch.value = ''
    chosenUser.value = null
    addError.value = null
    addOpen.value = true
  }
  async function onAdd(event: FormSubmitEvent<AddMemberSchema>) {
    if (addBlocked.value) return
    const d = event.data
    const res = await run(() => addMember.mutateAsync({
      user_id: d.userId,
      entity_id: entityId.value,
      role_ids: [...d.roleIds],
      status: d.status,
      valid_from: startOfDayIso(d.validFrom),
      valid_until: endOfDayIso(d.validUntil),
      reason: d.reason || null
    }), {
      success: 'Member added',
      error: 'Could not add member',
      form: addForm,
      fieldMap: FIELD_MAP,
      inline: addError,
      notFoundCodes: ['USER_NOT_FOUND'],
      grantedRoles: () => d.roleIds.map(id => memberRoles.roleById.value.get(id)).filter(r => r !== undefined)
    })
    if (res.ok) addOpen.value = false
  }

  // --- Edit access: only what changed is sent (role_ids replaces the set and re-checks
  // delegation, so a validity-only edit must not re-send it; an untouched status is never
  // re-sent, F-015). The API has no version, so the membership is re-read before saving: a field
  // someone else changed meanwhile that this dialog also changed stops the save with Reload /
  // Overwrite, and a membership ended meanwhile is never brought back by this dialog. ---
  const queryCache = useQueryCache()
  const editError = ref<ActionError | null>(null)
  const editConflict = ref<FormConflict | null>(null)
  const savingEdit = ref(false)
  const editForm = useDialogForm('editMemberDialog')
  const editTarget = ref<EntityMember | null>(null)
  const editState = reactive<EditMemberSchema>({ roleIds: [], status: 'active', validFrom: '', validUntil: '', reason: '' })
  type MemberAccess = { role_ids: readonly string[], status: string, valid_from?: string | null, valid_until?: string | null }
  const memberForm = (m: MemberAccess): EditMemberSchema => ({
    roleIds: [...m.role_ids],
    // Only live memberships open this dialog, so the status is one the form represents.
    status: m.status === 'suspended' ? 'suspended' : 'active',
    validFrom: toDateInput(m.valid_from),
    validUntil: toDateInput(m.valid_until),
    reason: ''
  })
  const editChanges = useDirtyPatch(editState, state => ({
    role_ids: [...state.roleIds].sort(),
    status: state.status,
    valid_from: startOfDayIso(state.validFrom),
    valid_until: endOfDayIso(state.validUntil),
    reason: state.reason.trim() || undefined
  }), { always: ['reason'] })
  const updateMember = useUpdateMemberAccess()
  function openEdit(m: EntityMember) {
    editTarget.value = m
    Object.assign(editState, memberForm({ ...m, role_ids: (m.roles ?? []).map(r => r.id) }))
    editChanges.snapshot()
    editError.value = null
    editConflict.value = null
    editOpen.value = true
  }
  // The member's membership here as the server has it now (null when the user has none here).
  // The user's memberships list is the precise read; an admin who may not read all of them (an
  // entity-scoped admin) re-reads this entity's member list instead, which they can always read.
  // A failed or inconclusive re-read throws: the save stops and says so rather than going ahead
  // unchecked (the edited row may have ended meanwhile).
  async function latestMembership(userId: string): Promise<MemberAccess | null> {
    try {
      const state = await queryCache.fetch(queryCache.ensure(userAllMembershipsQuery(userId)))
      if (state.status === 'success') {
        const latest = state.data.find(membership => membership.entity_id === entityId.value)
        return latest ? { ...latest, role_ids: latest.role_ids ?? [] } : null
      }
    } catch {
      // Fall back to the entity's own list below.
    }
    const { status: listStatus, data: rows, error: listError } = await refetch()
    if (listStatus !== 'success') throw listError ?? new Error('The member list could not be read.')
    const row = rows?.find(member => member.user_id === userId)
    // Not on this page of the list: it may have ended meanwhile (and left the default view), so
    // the current state is unknown.
    if (!row) throw new Error('This membership is no longer listed on this page.')
    return { status: row.status, valid_from: row.valid_from, valid_until: row.valid_until, role_ids: (row.roles ?? []).map(r => r.id) }
  }
  // The re-read failed: say so in the dialog, never save unchecked.
  function showRereadFailure(error: unknown) {
    const apiError = normalizeApiError(error)
    const reason = apiError.generic && error instanceof Error ? error.message : apiError.message
    editError.value = {
      ...describeActionError({ ...apiError, issues: [] }, 'Could not confirm the current membership'),
      description: `${reason} Nothing was saved. Close this dialog and refresh the list before trying again.`
    }
  }
  async function saveEdit(force: boolean) {
    const m = editTarget.value
    const input = editChanges.patch.value
    if (!m || !editChanges.dirty.value) return
    savingEdit.value = true
    try {
      if (!force) {
        let latest: MemberAccess | null
        try {
          latest = await latestMembership(m.user_id)
        } catch (error) {
          showRereadFailure(error)
          return
        }
        editError.value = null
        const clashes = latest ? editChanges.conflicts(memberForm(latest)) : []
        if (latest && !grantIsLive(latest)) clashes.push('status')
        if (clashes.length) {
          editConflict.value = { fields: [...new Set(clashes)].map(key => MEMBER_FIELDS[key] ?? key) }
          return
        }
      }
      editConflict.value = null
      const res = await run(() => updateMember.mutateAsync({ entityId: entityId.value, userId: m.user_id, input }), {
        success: 'Member access updated',
        error: 'Could not update member',
        form: editForm,
        fieldMap: FIELD_MAP,
        inline: editError,
        notFoundCodes: ['MEMBERSHIP_NOT_FOUND'],
        onNotFound: () => {
          editOpen.value = false
        },
        grantedRoles: () => editState.roleIds.map(id => memberRoles.roleById.value.get(id)).filter(r => r !== undefined)
      })
      if (res.ok) editOpen.value = false
    } finally {
      savingEdit.value = false
    }
  }
  const onEdit = () => saveEdit(false)
  const overwriteEdit = () => saveEdit(true)
  // Start over from the server's values; a membership ended meanwhile closes the dialog (its row
  // offers Reactivate).
  async function reloadEdit() {
    const m = editTarget.value
    if (!m) return
    let latest: MemberAccess | null
    try {
      latest = await latestMembership(m.user_id)
    } catch (error) {
      showRereadFailure(error)
      return
    }
    if (!latest || !grantIsLive(latest)) {
      editOpen.value = false
      return
    }
    editTarget.value = { ...m, status: latest.status, valid_from: latest.valid_from ?? null, valid_until: latest.valid_until ?? null }
    Object.assign(editState, memberForm(latest))
    editChanges.snapshot()
    editError.value = null
    editConflict.value = null
  }
  // The member's current roles with the names the payload carries, so roles outside the pool
  // still read as names in the editor.
  const editKnownRoles = computed<RoleReference[]>(() => editTarget.value?.roles ?? [])

  // --- Remove (DELETE /memberships/{entity}/{user} revokes it; it stays in the history) ---
  const removeMemberMutation = useRemoveMember()
  const removeMember = useConfirmAction<EntityMember>({
    describe: m => ({
      title: `Remove ${m.user_email} from ${props.entity.display_name}`,
      effects: [
        'The roles this membership grants stop applying immediately, here and in sub-entities for roles that reach down the tree.',
        'The user account and their other memberships and direct roles are not affected.',
        'The membership stays in the user\'s history as revoked.'
      ],
      confirmLabel: 'Remove member'
    }),
    action: m => removeMemberMutation.mutateAsync({ entityId: entityId.value, userId: m.user_id }),
    success: 'Member removed',
    error: 'Could not remove member'
  })

  const capacityNote = computed(() => (props.atCapacity && props.entity.max_members != null
    ? `This entity is at its limit of ${props.entity.max_members} active members.`
    : null))

  return {
    hasMemberships,
    canReadMembers,
    canAddMember,
    canOpenUsers,
    includeInactive,
    page,
    pageSize: PAGE_SIZE,
    total,
    pagerTotal,
    countLabel,
    members,
    status,
    error,
    refetch,
    memberRowMenu,
    capacityNote,
    rolesPool: memberRoles.roles,
    rolesPoolStatus: memberRoles.status,
    rolesPoolEmptyText: memberRoles.emptyText,
    rolesPoolTruncated: memberRoles.truncated,
    addOpen,
    addState,
    addError,
    openAdd,
    onAdd,
    userSearch,
    userOptions,
    userSearchInput,
    usersLoading,
    usersHint,
    existingMembershipError,
    addBlocked,
    editOpen,
    editTarget,
    editState,
    editError,
    editDirty: editChanges.dirty,
    editConflict,
    savingEdit,
    editKnownRoles,
    onEdit,
    overwriteEdit,
    reloadEdit,
    reactivateOpen,
    reactivateTarget,
    removeMember
  }
}
