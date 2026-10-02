<script setup lang="ts">
import { resetPasswordSchema } from '~/schemas/user'
import type { User } from '~/types/user'

// Reset another account's password (display only; logic in useUserResetPasswordDialog).
const props = defineProps<{ user: User }>()
const open = defineModel<boolean>('open', { default: false })
const user = computed(() => props.user)

const { state, error, effects, onSubmit } = useUserResetPasswordDialog(user, open)
</script>

<template>
  <AppFormDialog
    ref="resetPasswordDialog"
    v-model:open="open"
    :title="`Reset password of ${user.email}`"
    description="Set a new password without their current one."
    :schema="resetPasswordSchema"
    :state="state"
    :error="error"
    submit-label="Reset password"
    submit-color="warning"
    @submit="onSubmit"
  >
    <UAlert
      color="warning"
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
    <UFormField name="new_password" label="New password" required>
      <UInput
        v-model="state.new_password"
        type="password"
        autocomplete="new-password"
        class="w-full"
      />
    </UFormField>
    <UFormField name="confirm_password" label="Confirm password" required>
      <UInput
        v-model="state.confirm_password"
        type="password"
        autocomplete="new-password"
        class="w-full"
      />
    </UFormField>
  </AppFormDialog>
</template>
