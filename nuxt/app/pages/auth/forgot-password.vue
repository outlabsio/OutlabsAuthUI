<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { emailRequestSchema, type EmailRequestSchema } from '~/schemas/auth-flows'
import { useForgotPassword } from '~/queries/session'
import { describeAuthError } from '~/api/client'

definePageMeta({ layout: 'auth' })

const toast = useToast()
const forgotPassword = useForgotPassword()
const state = reactive<Partial<EmailRequestSchema>>({ email: '' })
const loading = ref(false)
const sent = ref(false)

async function onSubmit(event: FormSubmitEvent<EmailRequestSchema>) {
  loading.value = true
  try {
    await forgotPassword.mutateAsync({ email: event.data.email })
    // Always show success (don't leak whether the account exists).
    sent.value = true
  } catch (err) {
    const { title, description } = describeAuthError(err, 'Could not send reset link')
    toast.add({ title, description, color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    loading.value = false
  }
}
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
