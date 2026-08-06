<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { accessCodeSchema, type AccessCodeSchema, emailRequestSchema, type EmailRequestSchema } from '~/schemas/auth-flows'
import { useRequestAccessCode, useVerifyAccessCode } from '~/queries/session'
import { getApiErrorMessage } from '~/utils/api'

definePageMeta({ layout: 'auth' })

const toast = useToast()
const requestAccessCode = useRequestAccessCode()
const verifyAccessCode = useVerifyAccessCode()

const step = ref<'request' | 'verify'>('request')
const email = ref('')
const requestState = reactive<Partial<EmailRequestSchema>>({ email: '' })
const codeState = reactive<Partial<AccessCodeSchema>>({ code: '' })
const requesting = ref(false)
const verifying = ref(false)

async function onRequest(event: FormSubmitEvent<EmailRequestSchema>) {
  requesting.value = true
  try {
    await requestAccessCode.mutateAsync({ email: event.data.email, channel: 'email' })
    email.value = event.data.email
    step.value = 'verify'
  } catch (err) {
    toast.add({ title: 'Could not send code', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    requesting.value = false
  }
}

async function onVerify(event: FormSubmitEvent<AccessCodeSchema>) {
  verifying.value = true
  try {
    await verifyAccessCode.mutateAsync({ email: email.value, channel: 'email', code: event.data.code })
    await navigateTo('/app/dashboard', { replace: true })
  } catch (err) {
    toast.add({ title: 'Invalid code', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    verifying.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <template v-if="step === 'request'">
      <div class="space-y-1">
        <h1 class="text-lg font-semibold text-highlighted">
          Sign in with an access code
        </h1>
        <p class="text-sm text-muted">
          We'll email you a one-time code.
        </p>
      </div>
      <UForm
        :schema="emailRequestSchema"
        :state="requestState"
        class="space-y-4"
        @submit="onRequest"
      >
        <UFormField name="email" label="Email" required>
          <UInput
            v-model="requestState.email"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          block
          :loading="requesting"
          label="Email me a code"
        />
      </UForm>
      <ULink to="/auth/login" class="text-sm text-muted hover:text-default">
        Back to sign in
      </ULink>
    </template>

    <template v-else>
      <div class="space-y-1">
        <h1 class="text-lg font-semibold text-highlighted">
          Enter your code
        </h1>
        <p class="text-sm text-muted">
          We sent a code to {{ email }}.
        </p>
      </div>
      <UForm
        :schema="accessCodeSchema"
        :state="codeState"
        class="space-y-4"
        @submit="onVerify"
      >
        <UFormField name="code" label="Access code" required>
          <UInput v-model="codeState.code" autocomplete="one-time-code" class="w-full" />
        </UFormField>
        <UButton
          type="submit"
          block
          :loading="verifying"
          label="Verify and sign in"
        />
      </UForm>
      <UButton
        variant="link"
        color="neutral"
        class="justify-start px-0"
        label="Use a different email"
        @click="step = 'request'"
      />
    </template>
  </div>
</template>
