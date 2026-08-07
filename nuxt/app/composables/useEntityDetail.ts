import type { Ref } from 'vue'
import { useQuery } from '@pinia/colada'
import { entitiesListQuery, entityDetailQuery, useMoveEntity, useUpdateEntity } from '~/queries/entities'
import { entityMembersQuery } from '~/queries/memberships'
import type { Entity, EntityClassValue, EntityStatusValue } from '~/types/entity'
import type { EntityMember } from '~/types/membership'

// Feature logic for the entity detail panel (right column of the master-detail). The SFC binds
// this and owns pure display config (columns, badge colours); no queries/handlers in the template.

// "Root" uses a sentinel — Reka's Combobox reserves the empty string (an empty-value item throws).
const ROOT_PARENT = '__root__'

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
