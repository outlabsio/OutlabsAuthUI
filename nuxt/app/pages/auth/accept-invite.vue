<script setup lang="ts">
import { setPasswordSchema } from '~/schemas/auth-flows'

// Accept-invitation — logic in useAcceptInviteForm; this file is display only.
definePageMeta({ layout: 'auth' })

const { token, state, loading, onSubmit } = useAcceptInviteForm()
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="!token" class="flex flex-col items-center gap-3 text-center">
      <UIcon name="i-lucide-triangle-alert" class="size-8 text-error" />
      <h1 class="text-lg font-semibold text-highlighted">
        Invalid invitation link
      </h1>
      <p class="text-sm text-muted">
        This link is missing its token.
      </p>
      <ULink to="/auth/login" class="text-sm text-muted hover:text-default">
        Back to sign in
      </ULink>
    </div>

    <template v-else>
      <div class="space-y-1">
        <h1 class="text-lg font-semibold text-highlighted">
          Accept your invitation
        </h1>
        <p class="text-sm text-muted">
          Set a password to activate your account.
        </p>
      </div>
      <UForm
        :schema="setPasswordSchema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField name="new_password" label="Password" required>
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
        <UButton
          type="submit"
          block
          :loading="loading"
          label="Accept and sign in"
        />
      </UForm>
    </template>
  </div>
</template>
