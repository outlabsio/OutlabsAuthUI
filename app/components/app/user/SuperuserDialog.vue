<script setup lang="ts">
import type { User } from '~/types/user'

// Grant or revoke superuser for another account (display only; logic in useUserSuperuserDialog).
const props = defineProps<{ user: User }>()
const open = defineModel<boolean>('open', { default: false })
const user = computed(() => props.user)

const { granting, state, error, schema, title, submitLabel, effects, confirmed, onSubmit } = useUserSuperuserDialog(user, open)
</script>

<template>
  <AppFormDialog
    ref="superuserDialog"
    v-model:open="open"
    :title="title"
    :schema="schema"
    :state="state"
    :error="error"
    :submit-label="submitLabel"
    :submit-color="granting ? 'warning' : 'error'"
    :submit-disabled="!confirmed"
    @submit="onSubmit"
  >
    <UAlert
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="What happens"
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
    <UFormField
      name="reason"
      label="Reason"
      :required="granting"
      :hint="granting ? undefined : 'Optional'"
      help="Recorded in the audit log with the change."
    >
      <UTextarea
        v-model="state.reason"
        :rows="2"
        autoresize
        class="w-full"
      />
    </UFormField>
    <UFormField
      v-if="granting"
      name="confirmation"
      :label="`Type ${user.email} to confirm`"
      required
    >
      <UInput
        v-model="state.confirmation"
        autocomplete="off"
        spellcheck="false"
        class="w-full"
      />
    </UFormField>
  </AppFormDialog>
</template>
