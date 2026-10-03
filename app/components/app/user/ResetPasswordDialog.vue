<script setup lang="ts">
import type { User } from '~/types/user'

// Reset another account's password, or set a first one for an account without (display only;
// logic in useUserResetPasswordDialog).
const props = defineProps<{ user: User }>()
const open = defineModel<boolean>('open', { default: false })
const user = computed(() => props.user)

const { schema, passwordHelp, state, error, copy, onSubmit } = useUserResetPasswordDialog(user, open)
</script>

<template>
  <AppFormDialog
    ref="resetPasswordDialog"
    v-model:open="open"
    :title="copy.title"
    :description="copy.description"
    :schema="schema"
    :state="state"
    :error="error"
    :submit-label="copy.action"
    :submit-color="copy.submitColor"
    @submit="onSubmit"
  >
    <UAlert
      :color="copy.action === 'Set password' ? 'neutral' : 'warning'"
      variant="subtle"
      :icon="copy.action === 'Set password' ? 'i-lucide-info' : 'i-lucide-triangle-alert'"
      title="What happens"
      data-testid="confirm-effects"
    >
      <template #description>
        <ul class="list-disc space-y-1 ps-4">
          <li v-for="effect in copy.effects" :key="effect">
            {{ effect }}
          </li>
        </ul>
      </template>
    </UAlert>
    <UFormField
      name="new_password"
      label="New password"
      :help="passwordHelp"
      required
    >
      <AppPasswordInput
        v-model="state.new_password"
        autocomplete="new-password"
        class="w-full"
        autofocus
      />
    </UFormField>
    <UFormField name="confirm_password" label="Confirm password" required>
      <AppPasswordInput
        v-model="state.confirm_password"
        autocomplete="new-password"
        class="w-full"
      />
    </UFormField>
  </AppFormDialog>
</template>
