<script setup lang="ts">
import { z } from 'zod'
import type { Form } from '@nuxt/ui'
import type { ActionError } from '~/composables/useApiAction'

// The one confirmation dialog (destructive or consequential actions, and the discard prompt).
// Title "<Verb> <target>"; an error-subtle alert lists what the action does, in the backend's
// terms (revoked, archived, restorable or not); an optional typed confirmation for the
// highest-impact actions; the dialog's own error surface (AppApiErrorAlert) for a failed request.
// Slots: the default slot renders above the effects (context); `acknowledge` renders after them and
// before the typed confirmation (a checkbox the admin ticks once they have read the effects,
// paired with `confirm-disabled`).
// While `pending` it cannot be dismissed and Cancel is disabled (useDialogGuard); browser Back
// closes it. Cancel is the way out (no X: the target in the title can be long, and the header's
// close button would sit on top of it on a phone). The parent runs the action on `confirm` and
// closes it on success (useConfirmAction wires all of this). With `closeOnConfirm` it closes itself and emits `close(true)`, which is how
// useOverlay() awaits it as a prompt.
const props = withDefaults(defineProps<{
  title: string
  description?: string
  /** Concrete effects, one sentence each. */
  effects?: readonly string[]
  effectsTitle?: string
  confirmLabel: string
  confirmColor?: 'error' | 'warning' | 'primary' | 'neutral'
  cancelLabel?: string
  /** Typed confirmation: the exact text (an email, a name or a slug) the admin must type. */
  confirmText?: string | null
  /** Keep Confirm disabled, e.g. until an acknowledgement in the `acknowledge` slot is ticked. */
  confirmDisabled?: boolean
  pending?: boolean
  error?: ActionError | null
  closeOnConfirm?: boolean
}>(), {
  description: undefined,
  effects: () => [],
  effectsTitle: 'What happens',
  confirmColor: 'error',
  cancelLabel: 'Cancel',
  confirmText: null,
  confirmDisabled: false,
  pending: false,
  error: null,
  closeOnConfirm: false
})
const emit = defineEmits<{
  'confirm': []
  'close': [confirmed: boolean]
  'after:leave': []
}>()
const open = defineModel<boolean>('open', { default: false })
// Closing returns focus to the row menu button that opened the dialog (useDialogReturnFocus).
const { onCloseAutoFocus } = useDialogReturnFocus(open)

const formId = useId()
const state = reactive({ typed: '' })
watch(open, (isOpen) => {
  if (isOpen) state.typed = ''
})
const expected = computed(() => props.confirmText?.trim() ?? '')
const typedMatches = computed(() => !expected.value || state.typed.trim() === expected.value)
const schema = computed(() => z.object({
  typed: z.string().refine(value => !expected.value || value.trim() === expected.value, `Type ${expected.value} exactly to confirm.`)
}))

// The typed text is checked when the admin submits it (Enter); until then the disabled Confirm
// button is the feedback. No blur or input validation: opened from a dropdown menu, the dialog's
// first field is blurred once without the admin doing anything (the menu hands focus back to its
// trigger as it closes and the dialog's focus trap takes it back), which would flag the empty
// field on open. After a flagged submit the message follows the typing and clears on a match.
const form = useTemplateRef<Form<typeof schema.value>>('form')
watch(() => state.typed, () => {
  if (form.value?.getErrors('typed').length) void form.value.validate({ name: 'typed', silent: true })
})

const { dismissible, requestClose, onUpdateOpen } = useDialogGuard({ open, pending: () => props.pending })

function confirm() {
  if (props.pending || props.confirmDisabled || !typedMatches.value) return
  emit('confirm')
  if (props.closeOnConfirm) {
    open.value = false
    emit('close', true)
  }
}

async function cancel() {
  if (await requestClose()) emit('close', false)
}
</script>

<template>
  <UModal
    :open="open"
    :content="{ onCloseAutoFocus }"
    :title="title"
    :description="description"
    :dismissible="dismissible"
    :close="false"
    @update:open="onUpdateOpen"
    @close:prevent="requestClose"
    @after:leave="emit('after:leave')"
  >
    <template v-if="error || effects.length || confirmText || $slots.default || $slots.acknowledge" #body>
      <UForm
        :id="formId"
        ref="form"
        :schema="schema"
        :state="state"
        :validate-on="[]"
        class="space-y-4"
        @submit="confirm"
      >
        <AppApiErrorAlert :error="error" />
        <slot />
        <UAlert
          v-if="effects.length"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="effectsTitle"
          data-testid="confirm-effects"
        >
          <template #description>
            <ul class="list-disc space-y-1 ps-4">
              <li v-for="effect in effects" :key="effect">
                {{ effect }}
              </li>
            </ul>
          </template>
        </UAlert>
        <slot name="acknowledge" />
        <UFormField
          v-if="confirmText"
          name="typed"
          :label="`Type ${expected} to confirm`"
          required
        >
          <UInput
            v-model="state.typed"
            autocomplete="off"
            spellcheck="false"
            class="w-full"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :label="cancelLabel"
          :disabled="pending"
          @click="cancel"
        />
        <UButton
          :color="confirmColor"
          :label="confirmLabel"
          :loading="pending"
          :disabled="!typedMatches || confirmDisabled"
          @click="confirm"
        />
      </div>
    </template>
  </UModal>
</template>
