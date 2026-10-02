<script setup lang="ts" generic="S extends FormSchema">
import type { FormData, FormError, FormErrorEvent, FormInputEvents, FormSchema, FormSubmitEvent, InferInput } from '@nuxt/ui'
import type { ActionError, ActionForm } from '~/composables/useApiAction'
import type { DiscardPrompt } from '~/composables/useDialogGuard'
import type { FormConflict } from '~/composables/useDialogForm'

// The standard create/edit dialog: a UModal whose body is one UForm (:id, :schema, :state) and
// whose footer holds a ghost Cancel and the submit button, bound to the form through :form, so
// the actions stay put on long forms and Enter submits. Put UFormFields in the default slot.
//
// - Enter in a tags field (UInputTags) only adds the tag: it never submits the dialog, empty or
//   filled (utils/tags-enter-guard.ts). A click on the submit button right after still submits.
//
// - Errors: `error` (useApiAction's `inline` ref) renders at the top of the body; server issues
//   land on fields when run() gets `form: useDialogForm('<ref>')`. Client-side validation
//   failures move focus to the first invalid field.
// - `validate`: client-side rules the schema cannot express because they depend on more than the
//   state (what the server offers, what the dialog opened with). UForm runs it with the schema on
//   every validation, so its errors block the submit and stay on their fields. Never set such an
//   error once from onSubmit with form.setErrors: UForm re-validates a field on its own (on blur,
//   on change, 300 ms after typing) and replaces that field's errors with the result, which
//   erases a one-off error a moment after it appeared.
// - Pending: while `onSubmit` runs (UForm awaits it), or `pending` is set, the form is disabled,
//   the submit button spins, and nothing closes the dialog (useDialogGuard).
// - Dirty: by default the state is compared with a snapshot taken when the dialog opens; pass
//   `dirty` to decide it yourself (useDirtyPatch().dirty for edits). A dirty dialog asks before
//   discarding on ESC, overlay click, X, Cancel and browser Back.
// - `requireChanges`: the submit button stays disabled until something changed (edit dialogs).
// - `conflict`: fields someone else changed on the server that this dialog changed too (see
//   useDirtyPatch().conflicts). A warning offers Reload (emit `reload`) or Overwrite. Overwrite
//   submits the form like the submit button (schema validation, pending lock) but calls
//   `onOverwrite` instead of `onSubmit`. The warning hides as soon as the admin edits the form
//   after it appeared: the next save checks the server again.
const props = withDefaults(defineProps<{
  title: string
  description?: string
  schema?: S
  state: Partial<InferInput<S>>
  submitLabel: string
  submitColor?: 'primary' | 'error' | 'warning' | 'neutral'
  cancelLabel?: string
  error?: ActionError | null
  pending?: boolean
  dirty?: boolean
  requireChanges?: boolean
  submitDisabled?: boolean
  /** Content width: md (default), lg = sm:max-w-2xl for about seven fields or more, xl = sm:max-w-3xl. */
  size?: 'md' | 'lg' | 'xl'
  discard?: DiscardPrompt
  conflict?: FormConflict | null
  /** Rules beyond the schema (see the header), run with it on every validation. */
  validate?: (state: Partial<InferInput<S>>) => FormError[]
  onSubmit?: (event: FormSubmitEvent<FormData<S, true>>) => unknown
  /** Overwrite in the conflict warning: runs after the form validates, awaited like onSubmit. */
  onOverwrite?: (event: FormSubmitEvent<FormData<S, true>>) => unknown
}>(), {
  description: undefined,
  schema: undefined,
  submitColor: 'primary',
  cancelLabel: 'Cancel',
  error: null,
  pending: false,
  dirty: undefined,
  requireChanges: false,
  submitDisabled: false,
  size: 'md',
  discard: undefined,
  conflict: null,
  validate: undefined,
  onSubmit: undefined,
  onOverwrite: undefined
})
const emit = defineEmits<{
  reload: []
  // Client-side validation failed (after the first invalid field took focus): e.g. to open a
  // collapsed section that holds an invalid field.
  invalid: [event: FormErrorEvent]
}>()
const open = defineModel<boolean>('open', { default: false })
// Closing returns focus to the row menu button that opened the dialog (useDialogReturnFocus).
const { onCloseAutoFocus } = useDialogReturnFocus(open)

const formId = useId()
const form = useTemplateRef<ActionForm & { loading: boolean, submit: () => Promise<void> }>('form')

// Dirty by default = the state differs from what it was when the dialog opened.
const snapshot = ref<string | null>(null)
watch(open, (isOpen) => {
  snapshot.value = isOpen ? JSON.stringify(props.state) : null
}, { immediate: true })
const dirty = computed(() => props.dirty ?? (snapshot.value !== null && JSON.stringify(props.state) !== snapshot.value))
const pending = computed(() => props.pending || Boolean(form.value?.loading))

const { dismissible, requestClose, onUpdateOpen } = useDialogGuard({ open, dirty, pending, discard: () => props.discard })

// Fields validate on blur only once the dialog has finished opening. Opened from a dropdown menu,
// focus leaves the dialog once while it opens (the menu hands focus back to its trigger and the
// dialog's focus trap takes it back); if a field had the focus then (an `autofocus` field), that
// blur is not the admin's and must not flag it as required.
const opened = ref(false)
watch(open, (isOpen) => {
  if (!isOpen) opened.value = false
})
const validateOn = computed<FormInputEvents[]>(() => (opened.value ? ['input', 'blur', 'change'] : ['input', 'change']))

// The conflict warning stays up only while the form holds what it was raised for.
const conflictState = ref<string | null>(null)
watch(() => props.conflict, (conflict) => {
  conflictState.value = conflict ? JSON.stringify(props.state) : null
}, { immediate: true })
const shownConflict = computed(() => (props.conflict && JSON.stringify(props.state) === conflictState.value ? props.conflict : null))

// Overwrite goes through UForm's submit, so the schema validates first (and the form locks
// while it runs); `overwriting` routes the validated submit to onOverwrite.
let overwriting = false
async function overwrite() {
  if (pending.value) return
  overwriting = true
  try {
    await form.value?.submit()
  } finally {
    overwriting = false
  }
}

async function submit(event: FormSubmitEvent<FormData<S, true>>) {
  if (overwriting) await props.onOverwrite?.(event)
  else await props.onSubmit?.(event)
}

// Enter in a tags field adds the tag and never submits the form (see the header).
const tagsEnter = createTagsEnterGuard()

// The inner UForm (null while closed): useApiAction's `form` option, via useDialogForm(refName).
defineExpose({ form })
</script>

<template>
  <UModal
    :open="open"
    :content="{ onCloseAutoFocus }"
    :title="title"
    :description="description"
    :dismissible="dismissible"
    :close="{ disabled: pending }"
    :ui="{ content: size === 'xl' ? 'sm:max-w-3xl' : size === 'lg' ? 'sm:max-w-2xl' : undefined }"
    @update:open="onUpdateOpen"
    @close:prevent="requestClose"
    @after:enter="opened = true"
  >
    <template #body>
      <!-- Capture listeners on an ancestor of the form run before UForm's submit handler. -->
      <div
        @keydown.capture="tagsEnter.onKey"
        @keypress.capture="tagsEnter.onKey"
        @submit.capture="tagsEnter.onSubmit"
      >
        <UForm
          :id="formId"
          ref="form"
          :schema="schema"
          :state="state"
          :validate="validate"
          :validate-on="validateOn"
          class="space-y-4"
          @submit="submit"
          @error="(event: FormErrorEvent) => { focusFirstFormError(event); emit('invalid', event) }"
        >
          <AppApiErrorAlert :error="error" />
          <UAlert
            v-if="shownConflict"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            title="Changed by someone else"
            :description="`${shownConflict.fields.join(', ')} changed since you opened this dialog. Reload to see the current values, or overwrite them with yours.`"
            :actions="[
              { label: 'Reload', color: 'neutral', variant: 'outline', disabled: pending, onClick: () => emit('reload') },
              { label: 'Overwrite', color: 'warning', loading: pending, onClick: overwrite }
            ]"
            data-testid="form-conflict"
          />
          <slot />
        </UForm>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :label="cancelLabel"
          :disabled="pending"
          @click="requestClose"
        />
        <UButton
          type="submit"
          :form="formId"
          :color="submitColor"
          :label="submitLabel"
          :loading="pending"
          :disabled="submitDisabled || (requireChanges && !dirty)"
        />
      </div>
    </template>
  </UModal>
</template>
