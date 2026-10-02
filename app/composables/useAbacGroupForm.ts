import type { FormSubmitEvent } from '@nuxt/ui'
import type { Ref } from 'vue'
import type { ActionError } from '~/composables/useApiAction'
import { useCreateConditionGroup, useUpdateConditionGroup, type AbacScope } from '~/queries/abac'
import type { GroupFormState } from '~/schemas/abac'
import type { AbacConditionGroup, UpdateConditionGroupInput } from '~/types/abac'

// Add / edit one ABAC condition group (AppAbacGroupForm): how the group combines its conditions
// (AND / OR) and an optional description. Edits send only the changed fields.

const FIELD_MAP: Record<string, string> = { operator: 'operator', description: 'description' }

const OPERATOR_ITEMS = [
  { label: 'All conditions must pass (AND)', value: 'AND' as const, description: 'Use for requirements that must all hold, e.g. on call and in the office network.' },
  { label: 'Any condition can pass (OR)', value: 'OR' as const, description: 'Use for alternatives, e.g. the owner or the owner\'s manager.' }
]

export function useAbacGroupForm(props: Readonly<{
  scope: AbacScope
  group: AbacConditionGroup | null
}>, open: Ref<boolean>) {
  const form = useDialogForm('groupDialog')
  const { run } = useApiAction()
  const createGroup = useCreateConditionGroup()
  const updateGroup = useUpdateConditionGroup()

  const state = reactive<GroupFormState>({ operator: 'AND', description: '' })
  const snapshot = ref('')
  const saving = ref(false)
  const serverError = ref<ActionError | null>(null)

  function reset() {
    Object.assign(state, {
      operator: props.group?.operator === 'OR' ? 'OR' : 'AND',
      description: props.group?.description ?? ''
    })
    snapshot.value = JSON.stringify(state)
    serverError.value = null
  }
  watch(open, (isOpen) => {
    if (isOpen) reset()
  }, { immediate: true })
  function close() {
    open.value = false
  }

  const isEdit = computed(() => Boolean(props.group))
  const dirty = computed(() => JSON.stringify(state) !== snapshot.value)

  // The dialog is the error surface (no toast): issues on a field land there, the rest and any
  // other failure are stated in the dialog's alert (AppApiErrorAlert).
  const failure = { form, fieldMap: FIELD_MAP, inline: serverError }

  async function onSubmit(event: FormSubmitEvent<{ operator: 'AND' | 'OR', description: string }>) {
    const { kind, id } = props.scope
    const description = event.data.description.trim() || null
    const original = props.group
    saving.value = true
    let res
    if (original) {
      const input: UpdateConditionGroupInput = {}
      if (original.operator !== event.data.operator) input.operator = event.data.operator
      if ((original.description ?? null) !== description) input.description = description
      if (!Object.keys(input).length) {
        saving.value = false
        close()
        return
      }
      res = await run(() => updateGroup.mutateAsync({ kind, id, groupId: original.id, input }), {
        success: 'Condition group updated',
        error: 'Could not update condition group',
        ...failure
      })
    } else {
      res = await run(() => createGroup.mutateAsync({ kind, id, input: { operator: event.data.operator, ...(description ? { description } : {}) } }), {
        success: 'Condition group added',
        error: 'Could not add condition group',
        ...failure
      })
    }
    saving.value = false
    if (res.ok) close()
  }

  return { state, isEdit, dirty, saving, serverError, operatorItems: OPERATOR_ITEMS, onSubmit }
}
