<script setup lang="ts">
import { setPasswordSchema } from '~/schemas/auth-flows'

// Reset-password — logic in useResetPasswordForm; this file is display only.
definePageMeta({ layout: 'auth' })

const { token, state, loading, onSubmit } = useResetPasswordForm()
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="!token" class="flex flex-col items-center gap-3 text-center">
      <UIcon name="i-lucide-triangle-alert" class="size-8 text-error" />
      <h1 class="text-lg font-semibold text-highlighted">
        Invalid reset link
      </h1>
      <p class="text-sm text-muted">
        This link is missing its token. Request a new one.
      </p>
      <ULink to="/auth/forgot-password" class="text-sm text-muted hover:text-default">
        Request a reset link
      </ULink>
    </div>

    <template v-else>
      <div class="space-y-1">
        <h1 class="text-lg font-semibold text-highlighted">
          Choose a new password
        </h1>
      </div>
      <UForm
        :schema="setPasswordSchema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField name="new_password" label="New password" required>
          <UInput
            v-model="state.new_password"
            type="password"
            autocomplete="new-password"
            class="w-full"
          />
        </UFormField>
        <UFormField name="confirm_password" label="Confirm new password" required>
          <UInput
            v-model="state.confirm_password"
            type="password"
            autocomplete="new-password"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          block
          :loading="loading"
          label="Reset password"
        />
      </UForm>
    </template>
  </div>
</template>
