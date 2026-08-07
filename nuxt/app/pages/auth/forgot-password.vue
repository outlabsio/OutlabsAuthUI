<script setup lang="ts">
import { emailRequestSchema } from '~/schemas/auth-flows'

// Forgot-password request — logic in useForgotPasswordForm; this file is display only.
definePageMeta({ layout: 'auth' })

const { state, loading, sent, onSubmit } = useForgotPasswordForm()
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="sent" class="flex flex-col items-center gap-3 text-center">
      <UIcon name="i-lucide-mail-check" class="size-8 text-primary" />
      <h1 class="text-lg font-semibold text-highlighted">
        Check your email
      </h1>
      <p class="text-sm text-muted">
        If an account exists for that address, a password reset link is on its way.
      </p>
      <ULink to="/auth/login" class="text-sm text-muted hover:text-default">
        Back to sign in
      </ULink>
    </div>

    <template v-else>
      <div class="space-y-1">
        <h1 class="text-lg font-semibold text-highlighted">
          Reset your password
        </h1>
        <p class="text-sm text-muted">
          Enter your email and we'll send a reset link.
        </p>
      </div>
      <UForm
        :schema="emailRequestSchema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField name="email" label="Email" required>
          <UInput
            v-model="state.email"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          block
          :loading="loading"
          label="Send reset link"
        />
      </UForm>
      <ULink to="/auth/login" class="text-sm text-muted hover:text-default">
        Back to sign in
      </ULink>
    </template>
  </div>
</template>
