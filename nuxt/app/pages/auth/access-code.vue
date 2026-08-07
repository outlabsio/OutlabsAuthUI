<script setup lang="ts">
import { emailRequestSchema } from '~/schemas/auth-flows'

// Access-code sign-in — logic in useAccessCodeForm; this file is display only.
definePageMeta({ layout: 'auth' })

const {
  CODE_LENGTH,
  step,
  email,
  requestState,
  requesting,
  digits,
  code,
  verifying,
  onRequest,
  onVerify,
  useDifferentEmail
} = useAccessCodeForm()
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
