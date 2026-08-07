import type { Ref } from 'vue'
import { useQuery } from '@pinia/colada'
import { entitiesListQuery, entityDetailQuery, useMoveEntity, useUpdateEntity } from '~/queries/entities'
import { entityMembersQuery, useAddMember, useRemoveMember, useUpdateMemberAccess } from '~/queries/memberships'
import { rolesListQuery } from '~/queries/roles'
import { usersListQuery } from '~/queries/users'
import type { Entity, EntityClassValue, EntityStatusValue } from '~/types/entity'
import type { EntityMember, MembershipStatusValue } from '~/types/membership'
import type { Role } from '~/types/role'

// Feature logic for the entity detail panel (right column of the master-detail). The SFC binds
// this and owns pure display config (columns, badge colours); no queries/handlers in the template.

// "Root" uses a sentinel — Reka's Combobox reserves the empty string (an empty-value item throws).
const ROOT_PARENT = '__root__'

// Membership validity is stored as ISO datetimes; the form uses <input type="date"> (YYYY-MM-DD).
const toIsoOrNull = (d: string): string | null => (d ? new Date(d).toISOString() : null)
const toDateInput = (iso?: string | null): string => (iso ? iso.slice(0, 10) : '')

const MEMBER_STATUS_ITEMS = [
  { label: 'Active', value: 'active' as MembershipStatusValue },
  { label: 'Suspended', value: 'suspended' as MembershipStatusValue }
]

export function useEntityDetail(entityId: Ref<string>) {
  const { hasPermission } = useAuth()
  const { run } = useApiAction()

  const canRead = computed(() => hasPermission('entity:read'))
  const canManage = computed(() => hasPermission('entity:update'))
  const canReadMembers = computed(() => hasPermission('membership:read'))

  const { data: entity, status, error } = useQuery(() => ({ ...entityDetailQuery(entityId.value), enabled: canRead.value }))
  const errorMessage = useApiErrorMessage(error)

  const { data: childrenData, status: childrenStatus } = useQuery(() => ({
    ...entitiesListQuery({ parentId: entityId.value, limit: 100 }),
    enabled: canRead.value
  }))
  const children = computed<Entity[]>(() => childrenData.value?.items ?? [])

  // The full hierarchy for the move-target picker (the USelectMenu searches it client-side).
  const { data: parentPool } = useQuery(() => ({ ...entitiesListQuery({ limit: 1000 }), enabled: canRead.value }))
  const moveParentSelectItems = computed(() => [
    { label: 'None (root)', value: ROOT_PARENT },
    ...(parentPool.value?.items ?? []).filter(e => e.id !== entityId.value).map(e => ({ label: e.display_name, value: e.id }))
  ])

  // Members of this entity (users + their roles) for the Users card. Needs membership:read
  // (superusers pass); gated so a denied actor fires no guaranteed-403 call.
  const { data: membersData, status: membersStatus } = useQuery(() => ({
    ...entityMembersQuery(entityId.value),
    enabled: canReadMembers.value
  }))
  const members = computed<EntityMember[]>(() => membersData.value ?? [])

  // --- Member management ---
  const canAddMember = computed(() => hasPermission('membership:create'))
  const canEditMember = computed(() => hasPermission('membership:update'))
  const canRemoveMember = computed(() => hasPermission('membership:delete'))
  const canManageMembers = computed(() => canAddMember.value || canEditMember.value || canRemoveMember.value)

  // Memberships are scoped within a root org — only users/roles of this entity's root are eligible.
  // The entity response doesn't carry its root, so walk parents up the already-loaded pool to find
  // it (a root entity is its own root), then scope both pickers to that org.
  const rootEntityId = computed(() => {
    const byId = new Map((parentPool.value?.items ?? []).map(e => [e.id, e]))
    let cur = entity.value ?? byId.get(entityId.value)
    const seen = new Set<string>()
    while (cur?.parent_entity_id && !seen.has(cur.id)) {
      seen.add(cur.id)
      const parent = byId.get(cur.parent_entity_id)
      if (!parent) break
      cur = parent
    }
    return cur?.id
  })

  // Assignable roles = global roles + roles owned by this entity's root (the backend rejects
  // cross-org roles). Fetched only when an actor can manage members; unioned, deduped by id.
  const { data: globalRolesData } = useQuery(() => ({ ...rolesListQuery({ limit: 100, isGlobal: true }), enabled: canManageMembers.value }))
  const { data: rootRolesData } = useQuery(() => ({ ...rolesListQuery({ limit: 100, rootEntityId: rootEntityId.value }), enabled: canManageMembers.value && !!rootEntityId.value }))
  const rolesPool = computed<Role[]>(() => {
    const byId = new Map<string, Role>()
    for (const r of globalRolesData.value?.items ?? []) byId.set(r.id, r)
    for (const r of rootRolesData.value?.items ?? []) byId.set(r.id, r)
    return [...byId.values()]
  })

  const { data: usersData } = useQuery(() => ({
    ...usersListQuery({ limit: 100, status: 'active', rootEntityId: rootEntityId.value }),
    enabled: canAddMember.value && !!rootEntityId.value
  }))
  const memberUserIds = computed(() => new Set(members.value.map(m => m.user_id)))
  const addableUserOptions = computed(() => (usersData.value?.items ?? [])
    .filter(u => !memberUserIds.value.has(u.id))
    .map((u) => {
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
      return { label: name ? `${name} (${u.email})` : u.email, value: u.id }
    }))

  const memberStatusItems = MEMBER_STATUS_ITEMS

  // Add member
  const addMember = useAddMember()
  const addMemberOpen = ref(false)
  const addingMember = ref(false)
  const addMemberState = reactive({ userId: '', roleIds: [] as string[], status: 'active' as MembershipStatusValue, validFrom: '', validUntil: '', reason: '' })
  function openAddMember() {
    Object.assign(addMemberState, { userId: '', roleIds: [], status: 'active', validFrom: '', validUntil: '', reason: '' })
    addMemberOpen.value = true
  }
  async function onAddMember() {
    if (!addMemberState.userId) return
    addingMember.value = true
    const res = await run(() => addMember.mutateAsync({
      user_id: addMemberState.userId,
      entity_id: entityId.value,
      role_ids: [...addMemberState.roleIds],
      status: addMemberState.status,
      valid_from: toIsoOrNull(addMemberState.validFrom),
      valid_until: toIsoOrNull(addMemberState.validUntil),
      reason: addMemberState.reason.trim() || null
    }), { success: 'Member added', error: 'Could not add member' })
    if (res.ok) addMemberOpen.value = false
    addingMember.value = false
  }

  // Edit member access
  const updateMember = useUpdateMemberAccess()
  const editMemberOpen = ref(false)
  const editMemberTarget = ref<EntityMember | null>(null)
  const savingMember = ref(false)
  const editMemberState = reactive({ roleIds: [] as string[], status: 'active' as MembershipStatusValue, validFrom: '', validUntil: '', reason: '' })
  function openEditMember(m: EntityMember) {
    editMemberTarget.value = m
    Object.assign(editMemberState, {
      roleIds: m.roles.map(r => r.id),
      status: m.status === 'suspended' ? 'suspended' : 'active',
      validFrom: toDateInput(m.valid_from),
      validUntil: toDateInput(m.valid_until),
      reason: ''
    })
    editMemberOpen.value = true
  }
  async function onSaveMember() {
    const m = editMemberTarget.value
    if (!m) return
    savingMember.value = true
    const res = await run(() => updateMember.mutateAsync({
      entityId: entityId.value,
      userId: m.user_id,
      input: {
        role_ids: [...editMemberState.roleIds],
        status: editMemberState.status,
        valid_from: toIsoOrNull(editMemberState.validFrom),
        valid_until: toIsoOrNull(editMemberState.validUntil),
        reason: editMemberState.reason.trim() || null
      }
    }), { success: 'Member access updated', error: 'Could not update member' })
    if (res.ok) editMemberOpen.value = false
    savingMember.value = false
  }

  // Remove member
  const removeMember = useRemoveMember()
  const removeMemberOpen = ref(false)
  const removeMemberTarget = ref<EntityMember | null>(null)
  const removingMember = ref(false)
  function openRemoveMember(m: EntityMember) {
    removeMemberTarget.value = m
    removeMemberOpen.value = true
  }
  async function onConfirmRemoveMember() {
    const m = removeMemberTarget.value
    if (!m) return
    removingMember.value = true
    const res = await run(() => removeMember.mutateAsync({ entityId: entityId.value, userId: m.user_id }), { success: 'Member removed', error: 'Could not remove member' })
    if (res.ok) removeMemberOpen.value = false
    removingMember.value = false
  }

  // Row menu for a member (only the actions the actor is permitted).
  function memberRowMenu(m: EntityMember) {
    const items = []
    if (canEditMember.value) items.push({ label: 'Edit access', icon: 'i-lucide-pencil', onSelect: () => openEditMember(m) })
    if (canRemoveMember.value) items.push({ label: 'Remove', icon: 'i-lucide-user-minus', color: 'error' as const, onSelect: () => openRemoveMember(m) })
    return items.length ? [items] : []
  }

  // Selected roles (resolved from the pool) feed the live effective-permissions preview.
  const addSelectedRoles = computed(() => rolesPool.value.filter(r => addMemberState.roleIds.includes(r.id)))
  const editSelectedRoles = computed(() => rolesPool.value.filter(r => editMemberState.roleIds.includes(r.id)))

  // --- Edit ---
  const editOpen = ref(false)
  const editState = reactive({ displayName: '', description: '', status: 'active' as EntityStatusValue, allowedChildClasses: [] as EntityClassValue[], allowedChildTypes: '' })
  const updateEntity = useUpdateEntity()
  const saving = ref(false)

  function toggleChildClass(value: EntityClassValue) {
    const idx = editState.allowedChildClasses.indexOf(value)
    if (idx === -1) editState.allowedChildClasses.push(value)
    else editState.allowedChildClasses.splice(idx, 1)
  }

  function openEdit() {
    const e = entity.value
    if (!e) return
    editState.displayName = e.display_name
    editState.description = e.description ?? ''
    editState.status = e.status
    editState.allowedChildClasses = [...(e.allowed_child_classes ?? [])]
    editState.allowedChildTypes = (e.allowed_child_types ?? []).join(', ')
    editOpen.value = true
  }

  async function onEdit() {
    saving.value = true
    const res = await run(() => updateEntity.mutateAsync({
      entityId: entityId.value,
      input: {
        display_name: editState.displayName.trim(),
        description: editState.description.trim() ? editState.description.trim() : null,
        status: editState.status,
        allowed_child_classes: [...editState.allowedChildClasses],
        allowed_child_types: editState.allowedChildTypes.split(',').map(t => t.trim()).filter(Boolean)
      }
    }), { success: 'Entity updated', error: 'Could not update entity' })
    if (res.ok) editOpen.value = false
    saving.value = false
  }

  // --- Move ---
  const moveOpen = ref(false)
  const moveParentId = ref(ROOT_PARENT)
  const moveEntity = useMoveEntity()
  const moving = ref(false)

  function openMove() {
    moveParentId.value = entity.value?.parent_entity_id ?? ROOT_PARENT
    moveOpen.value = true
  }

  async function onMove() {
    moving.value = true
    const newParentId = moveParentId.value === ROOT_PARENT ? null : moveParentId.value
    const res = await run(() => moveEntity.mutateAsync({ entityId: entityId.value, newParentId }), { success: 'Entity moved', error: 'Could not move entity' })
    if (res.ok) moveOpen.value = false
    moving.value = false
  }

  return {
    entity,
    status,
    errorMessage,
    canManage,
    children,
    childrenStatus,
    members,
    membersStatus,
    // member management
    canAddMember,
    canManageMembers,
    memberRowMenu,
    rolesPool,
    addSelectedRoles,
    editSelectedRoles,
    addableUserOptions,
    memberStatusItems,
    addMemberOpen,
    addMemberState,
    addingMember,
    openAddMember,
    onAddMember,
    editMemberOpen,
    editMemberTarget,
    editMemberState,
    savingMember,
    onSaveMember,
    removeMemberOpen,
    removeMemberTarget,
    removingMember,
    onConfirmRemoveMember,
    editOpen,
    editState,
    saving,
    openEdit,
    onEdit,
    toggleChildClass,
    moveOpen,
    moveParentId,
    moving,
    openMove,
    onMove,
    moveParentSelectItems
  }
}
