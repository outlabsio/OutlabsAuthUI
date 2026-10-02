import type { Ref } from 'vue'
import { useQuery } from '@pinia/colada'
import { entityDetailQuery, useUpdateEntity } from '~/queries/entities'
import type { EditEntitySchema } from '~/schemas/entity'
import type { Entity } from '~/types/entity'
import type { ActionError } from '~/composables/useApiAction'
import type { FormConflict } from '~/composables/useDialogForm'
import { endOfDayIso, startOfDayIso, toDateInput } from '~/utils/validity'

// Edit an entity's name, description, status and validity window (F-004, F-074, F-156).
// - Status offers Active / Inactive only. Archiving is its own action (DELETE /entities/{id})
//   because it also revokes memberships, keys and service accounts; a status PATCH revokes nothing.
// - Only the fields the admin changed are sent, and the record is re-read before saving: when
//   someone else changed a field this dialog also changed, it stops and offers Reload or
//   Overwrite (the API has no version or ETag).
const FIELD_LABELS: Record<string, string> = {
  display_name: 'Display name',
  description: 'Description',
  status: 'Status',
  valid_from: 'Valid from',
  valid_until: 'Valid until'
}
const FIELD_MAP = { display_name: 'displayName', description: 'description', status: 'status', valid_from: 'validFrom', valid_until: 'validUntil' }

export const ENTITY_STATUS_ITEMS = [
  { label: 'Active', value: 'active' as const },
  { label: 'Inactive', value: 'inactive' as const }
]

function formFrom(entity: Entity): EditEntitySchema {
  return {
    displayName: entity.display_name,
    description: entity.description ?? '',
    status: entity.status === 'inactive' ? 'inactive' : 'active',
    validFrom: toDateInput(entity.valid_from),
    validUntil: toDateInput(entity.valid_until)
  }
}

export function useEntityEditDialog(entity: Ref<Entity>, open: Ref<boolean>) {
  const { run } = useApiAction()
  const form = useDialogForm('editEntityDialog')
  const error = ref<ActionError | null>(null)
  const conflict = ref<FormConflict | null>(null)
  const state = reactive<EditEntitySchema>(formFrom(entity.value))
  const changes = useDirtyPatch(state, s => ({
    display_name: s.displayName.trim(),
    description: s.description.trim() || null,
    status: s.status,
    valid_from: startOfDayIso(s.validFrom),
    valid_until: endOfDayIso(s.validUntil)
  }))
  // The detail panel's own query (same key and options): Pinia Colada keeps one options object
  // per entry, so a second observer with a different `enabled` would stop the panel refetching.
  const { refetch } = useQuery(() => entityDetailQuery(entity.value.id))
  const update = useUpdateEntity()

  function reset(from: Entity) {
    Object.assign(state, formFrom(from))
    changes.snapshot()
    error.value = null
    conflict.value = null
  }
  watch(open, (isOpen) => {
    if (isOpen) reset(entity.value)
  }, { immediate: true })

  const inactiveSelected = computed(() => state.status === 'inactive')

  async function save(force: boolean) {
    const input = changes.patch.value
    if (!Object.keys(input).length) {
      open.value = false
      return
    }
    if (!force) {
      const { data: latest } = await refetch()
      const clashes = latest ? changes.conflicts(formFrom(latest)) : []
      if (clashes.length) {
        conflict.value = { fields: clashes.map(key => FIELD_LABELS[key] ?? key) }
        return
      }
    }
    conflict.value = null
    const res = await run(() => update.mutateAsync({ entityId: entity.value.id, input }), {
      success: 'Entity updated',
      error: 'Could not update entity',
      form,
      fieldMap: FIELD_MAP,
      inline: error,
      notFoundCodes: ['ENTITY_NOT_FOUND'],
      onNotFound: () => {
        open.value = false
      }
    })
    if (res.ok) open.value = false
  }
  async function reload() {
    const { data: latest } = await refetch()
    if (latest) reset(latest)
  }

  return {
    state,
    error,
    conflict,
    dirty: changes.dirty,
    inactiveSelected,
    onSubmit: () => save(false),
    onOverwrite: () => save(true),
    reload
  }
}
