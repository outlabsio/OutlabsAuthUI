import type { FormSubmitEvent } from '@nuxt/ui'
import type { Ref } from 'vue'
import type { ActionError, ActionForm } from '~/composables/useApiAction'
import { useCreateCondition, useUpdateCondition, type AbacScope } from '~/queries/abac'
import {
  ATTRIBUTE_CONTEXT_META,
  ATTRIBUTE_CONTEXTS,
  CONDITION_OPERATORS,
  conditionFormSchema,
  defaultValueType,
  LIST_ITEM_TYPE_LABELS,
  LIST_ITEM_TYPES,
  OPERATOR_GROUP_ORDER,
  OPERATOR_META,
  VALUE_TYPE_LABELS,
  type ConditionFormOutput,
  type ConditionFormState
} from '~/schemas/abac'
import type { AbacCondition, AbacConditionGroup } from '~/types/abac'

// Add / edit one ABAC condition (AppAbacConditionForm). The form only offers what the policy
// engine can evaluate: the operator enum, a context prefix + path, and a value control typed by
// the operator (none, text, number, true/false, date-time or a list of tags).

type FormApi = ActionForm & {
  validate: (opts: { silent: true }) => Promise<unknown>
}

// Wire field -> form field, for mapping 422 validation errors onto the right control (an entry
// also covers the field's members, e.g. `value.str` from a union).
const FIELD_MAP: Record<string, string> = {
  attribute: 'path',
  operator: 'operator',
  value: 'value',
  value_type: 'value_type',
  description: 'description',
  condition_group_id: 'group_id'
}

const OPERATOR_SELECT_ITEMS = OPERATOR_GROUP_ORDER.map(group => [
  { type: 'label' as const, label: group },
  ...CONDITION_OPERATORS
    .filter(op => OPERATOR_META[op].group === group)
    // The enum value is shown under the readable label (skipped when they read the same).
    .map(op => ({ label: OPERATOR_META[op].label, value: op, description: OPERATOR_META[op].label === op ? undefined : op }))
])

const CONTEXT_SELECT_ITEMS = ATTRIBUTE_CONTEXTS.map(context => ({
  label: context,
  value: context,
  description: ATTRIBUTE_CONTEXT_META[context].description
}))

const LIST_ITEM_TYPE_ITEMS = LIST_ITEM_TYPES.map(type => ({ label: LIST_ITEM_TYPE_LABELS[type], value: type }))

export function useAbacConditionForm(props: Readonly<{
  scope: AbacScope
  condition: AbacCondition | null
  defaultGroupId: string | null
  groups: AbacConditionGroup[]
}>, open: Ref<boolean>) {
  // The UForm inside <AppFormDialog ref="conditionDialog"> (null while the dialog is closed).
  const dialog = useTemplateRef<{ form: FormApi | null }>('conditionDialog')
  const form = computed(() => dialog.value?.form ?? null)
  const { run } = useApiAction()
  const createCondition = useCreateCondition()
  const updateCondition = useUpdateCondition()

  const state = reactive<ConditionFormState>(emptyAbacConditionForm())
  const snapshot = ref('')
  const saving = ref(false)
  const serverError = ref<ActionError | null>(null)

  function reset() {
    Object.assign(state, props.condition ? abacConditionFormState(props.condition) : emptyAbacConditionForm(props.defaultGroupId))
    // A group id that no longer exists is evaluated as ungrouped; show it that way (saving then
    // clears the dangling reference).
    if (state.group_id !== ABAC_UNGROUPED && !props.groups.some(group => group.id === state.group_id)) state.group_id = ABAC_UNGROUPED
    snapshot.value = JSON.stringify(state)
    serverError.value = null
  }
  watch(open, (isOpen) => {
    if (isOpen) reset()
  }, { immediate: true })
  function close() {
    open.value = false
  }

  const isEdit = computed(() => Boolean(props.condition))
  // A stored row the engine cannot evaluate (or mis-evaluates): say so, and flag the fields that
  // need a valid choice as soon as the form mounts.
  const storedIssue = computed(() => (props.condition ? abacConditionIssue(props.condition) : null))
  watch(form, (instance) => {
    if (instance && open.value && storedIssue.value) void instance.validate({ silent: true })
  })
  // Whether the admin changed anything since the dialog opened (for a discard prompt).
  const dirty = computed(() => JSON.stringify(state) !== snapshot.value)
  // Edit: Save is enabled when submitting would change the stored row. Loading can already
  // correct a flagged row (e.g. an "in" list stored as text becomes a list), so this compares the
  // PATCH that would be sent rather than the form against its loaded state. An invalid form keeps
  // Save enabled so submitting shows what to fix.
  const canSave = computed(() => {
    if (!props.condition) return true
    const parsed = conditionFormSchema.safeParse(state)
    if (!parsed.success) return true
    return Object.keys(abacConditionPatch(props.condition, abacConditionPayload(parsed.data))).length > 0
  })

  const meta = computed(() => (state.operator ? OPERATOR_META[state.operator] : null))
  const valueKind = computed(() => meta.value?.kind ?? 'none')
  // A new operator keeps the value type when it can use it, otherwise takes its default.
  watch(() => state.operator, (operator) => {
    if (!operator) return
    if (!OPERATOR_META[operator].valueTypes.includes(state.value_type)) state.value_type = defaultValueType(operator)
  })

  const valueTypeItems = computed(() => (meta.value?.valueTypes ?? []).map(type => ({ label: VALUE_TYPE_LABELS[type], value: type })))
  // Only operators that accept more than one value type show the picker.
  const showValueType = computed(() => (valueKind.value === 'scalar' || valueKind.value === 'number'))
  // Shows the exact attribute that will be stored plus what the chosen context contains.
  const pathHelp = computed(() => {
    if (!state.context) return 'Choose where the attribute comes from when a permission is checked.'
    const description = ATTRIBUTE_CONTEXT_META[state.context].description
    const path = state.path.trim()
    return path ? `Reads ${state.context}.${path}. ${description}` : description
  })
  const pathPlaceholder = computed(() => (state.context ? ATTRIBUTE_CONTEXT_META[state.context].placeholder : 'department'))

  const groupItems = computed(() => [
    { label: 'Ungrouped (all must pass)', value: ABAC_UNGROUPED },
    ...props.groups.map((group, index) => ({
      label: `${abacGroupTitle(index)} · ${abacGroupRule(group.operator).toLowerCase()}`,
      value: group.id,
      description: group.description ?? undefined
    }))
  ])

  // The dialog is the error surface (no toast): issues on a field land there, the rest and any
  // other failure are stated in the dialog's alert (AppApiErrorAlert).
  const failure = { form: () => form.value, fieldMap: FIELD_MAP, inline: serverError }

  async function onSubmit(event: FormSubmitEvent<ConditionFormOutput>) {
    const { kind, id } = props.scope
    const original = props.condition
    if (original) {
      const patch = abacConditionPatch(original, abacConditionPayload(event.data))
      if (!Object.keys(patch).length) {
        close()
        return
      }
      saving.value = true
      const res = await run(() => updateCondition.mutateAsync({ kind, id, conditionId: original.id, input: patch }), {
        success: 'Condition updated',
        error: 'Could not update condition',
        ...failure
      })
      saving.value = false
      if (res.ok) close()
      return
    }
    saving.value = true
    const res = await run(() => createCondition.mutateAsync({ kind, id, input: abacConditionCreateBody(event.data) }), {
      success: 'Condition added',
      error: 'Could not add condition',
      ...failure
    })
    saving.value = false
    if (res.ok) close()
  }

  return {
    state,
    isEdit,
    storedIssue,
    dirty,
    canSave,
    saving,
    serverError,
    meta,
    valueKind,
    showValueType,
    valueTypeItems,
    contextItems: CONTEXT_SELECT_ITEMS,
    pathHelp,
    pathPlaceholder,
    operatorItems: OPERATOR_SELECT_ITEMS,
    listItemTypeItems: LIST_ITEM_TYPE_ITEMS,
    groupItems,
    onSubmit
  }
}
