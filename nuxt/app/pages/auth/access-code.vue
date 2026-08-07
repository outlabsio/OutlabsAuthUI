<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { emailRequestSchema, type EmailRequestSchema } from '~/schemas/auth-flows'
import { useRequestAccessCode, useVerifyAccessCode } from '~/queries/session'
import { describeAuthError, getApiErrorMessage } from '~/api/client'

definePageMeta({ layout: 'auth' })

const CODE_LENGTH = 6

const toast = useToast()
const requestAccessCode = useRequestAccessCode()
const verifyAccessCode = useVerifyAccessCode()

const step = ref<'request' | 'verify'>('request')
const email = ref('')
const requestState = reactive<Partial<EmailRequestSchema>>({ email: '' })
const requesting = ref(false)

// The one-time code is entered via Nuxt UI's OTP input (a digit per slot).
const digits = ref<number[]>([])
const code = computed(() => digits.value.join(''))
const verifying = ref(false)

async function onRequest(event: FormSubmitEvent<EmailRequestSchema>) {
  requesting.value = true
  try {
    await requestAccessCode.mutateAsync({ email: event.data.email, channel: 'email' })
    email.value = event.data.email
    step.value = 'verify'
  } catch (err) {
    const { title, description } = describeAuthError(err, 'Could not send code')
    toast.add({ title, description, color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    requesting.value = false
  }
}

// Called by the button and by the OTP input's @complete (auto-submit on the 6th digit).
async function onVerify() {
  if (code.value.length < CODE_LENGTH || verifying.value) return
  verifying.value = true
  try {
    await verifyAccessCode.mutateAsync({ email: email.value, channel: 'email', code: code.value })
    await navigateTo('/app/dashboard', { replace: true })
  } catch (err) {
    toast.add({ title: 'Invalid code', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
    digits.value = []
  } finally {
    verifying.value = false
  }
}

function useDifferentEmail() {
  step.value = 'request'
  digits.value = []
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
          We sent a {{ CODE_LENGTH }}-digit code to {{ email }}.
        </p>
      </div>

      <div class="flex flex-col items-center gap-4">
        <UPinInput
          v-model="digits"
          :length="CODE_LENGTH"
          type="number"
          otp
          size="lg"
          aria-label="Access code"
          :disabled="verifying"
          @complete="onVerify"
        />
        <UButton
          block
          :loading="verifying"
          :disabled="code.length < CODE_LENGTH"
          label="Verify and sign in"
          @click="onVerify"
        />
      </div>

      <UButton
        variant="link"
        color="neutral"
        class="justify-start px-0"
        label="Use a different email"
        @click="useDifferentEmail"
      />
    </template>
  </div>
</template>
