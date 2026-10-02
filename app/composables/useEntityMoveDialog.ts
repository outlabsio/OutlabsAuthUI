import type { Ref } from 'vue'
import { useMoveEntity } from '~/queries/entities'
import type { MoveEntitySchema } from '~/schemas/entity'
import type { Entity } from '~/types/entity'
import type { ActionError } from '~/composables/useApiAction'
import { placementProblem, type EntityIndex } from '~/utils/entity-tree'

// Move (re-parent) an entity (F-076). Targets stay inside the entity's organisation (moving a
// branch into another tenant would leave its members' organisation behind) and exclude what the
// server refuses: the entity's own subtree, access groups for a structural entity, and parents
// whose allowed child types leave this type out. "Top level" (a new organisation) is for
// superusers only: the server checks no root-type rule and only entity:update there.
export type EntityMoveContext = {
  entity: Entity
  rootId: string | null
  organisation: EntityIndex
  descendantCount: number
  memberCount: number | null
}

export function useEntityMoveDialog(context: Ref<EntityMoveContext>, open: Ref<boolean>) {
  const { run } = useApiAction()
  const { isSuperuser } = useAuth()
  const form = useDialogForm('moveEntityDialog')
  const error = ref<ActionError | null>(null)
  const state = reactive<MoveEntitySchema>({ destination: 'parent', parentId: '' })

  const entity = computed(() => context.value.entity)
  const isRoot = computed(() => !entity.value.parent_entity_id)
  watch(open, (isOpen) => {
    if (!isOpen) return
    Object.assign(state, { destination: 'parent', parentId: entity.value.parent_entity_id ?? '' })
    error.value = null
  }, { immediate: true })

  // A root moves anywhere (superusers only, global search); anything else stays in its organisation.
  const pickerRootId = computed(() => (isRoot.value ? null : context.value.rootId))
  const canMoveToTop = computed(() => isSuperuser.value && !isRoot.value)
  const destinationItems = computed(() => [
    { label: 'Under another entity', value: 'parent' as const, description: 'Stays in this organization.' },
    { label: 'Top level', value: 'top' as const, description: 'Becomes a separate organization.' }
  ])
  // Every loaded entity the server would refuse as the new parent.
  const excludedIds = computed(() => {
    const ids: string[] = []
    for (const target of context.value.organisation.values()) {
      if (placementProblem(entity.value, target, context.value.organisation)) ids.push(target.id)
    }
    return ids
  })

  const changed = computed(() => (state.destination === 'top'
    ? !isRoot.value
    : Boolean(state.parentId) && state.parentId !== (entity.value.parent_entity_id ?? '')))
  const currentParentName = computed(() => {
    const parent = entity.value.parent_entity_id ? context.value.organisation.get(entity.value.parent_entity_id) : undefined
    return parent?.display_name ?? null
  })
  const impact = computed(() => {
    const { descendantCount, memberCount } = context.value
    const parts = [
      descendantCount
        ? `${entity.value.display_name} and the ${descendantCount} ${descendantCount === 1 ? 'entity' : 'entities'} beneath it move together.`
        : `${entity.value.display_name} moves on its own (nothing beneath it).`,
      `Roles that reach down the tree from its current ancestors stop applying to ${memberCount != null ? `its ${memberCount} ${memberCount === 1 ? 'member' : 'members'}` : 'its members'} and everyone beneath; those of its new ancestors start applying.`
    ]
    if (isRoot.value) parts.push('It stops being a separate organization: its users and roles become part of the new parent\'s organization.')
    return parts
  })

  const move = useMoveEntity()
  async function onSubmit() {
    if (!changed.value) return
    const newParentId = state.destination === 'top' ? null : state.parentId
    const res = await run(() => move.mutateAsync({ entityId: entity.value.id, newParentId }), {
      success: `${entity.value.display_name} moved`,
      error: 'Could not move entity',
      form,
      fieldMap: { new_parent_id: 'parentId' },
      inline: error,
      notFoundCodes: ['ENTITY_NOT_FOUND'],
      onNotFound: () => {
        open.value = false
      }
    })
    if (res.ok) open.value = false
  }

  return {
    state,
    error,
    isRoot,
    canMoveToTop,
    destinationItems,
    pickerRootId,
    excludedIds,
    changed,
    currentParentName,
    impact,
    onSubmit
  }
}
