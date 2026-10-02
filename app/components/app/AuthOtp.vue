<script setup lang="ts">
import { cooldownLabel } from '~/utils/request-cooldown'

// The one-time-code step shared by sign-in (email and phone codes), the access-code page and
// recovery: where the code went, the code input (focused on arrival, numeric keypad, one-time
// code autofill), verify, resend and back. Digits are v-modeled so the flow composable can
// clear them after a failed verify. Resend and verify are disabled while their rate-limit
// cooldowns run.

withDefaults(defineProps<{
  sentTo: string
  length: number
  verifying: boolean
  resending: boolean
  // Seconds before another code may be requested / another attempt made (0 = none).
  resendCooldown?: number
  verifyCooldown?: number
  backLabel?: string
}>(), {
  resendCooldown: 0,
  verifyCooldown: 0,
  backLabel: 'Use a different method'
})

const emit = defineEmits<{
  verify: []
  resend: []
  back: []
}>()

const digits = defineModel<number[]>('digits', { required: true })
</script>

<template>
  <div class="flex flex-col gap-4">
    <AppAuthStepHeading title="Enter your code">
      <template #description>
        <span role="status">{{ sentTo }}</span>
      </template>
    </AppAuthStepHeading>

    <div class="flex flex-col items-center gap-4">
      <UPinInput
        v-model="digits"
        :length="length"
        type="number"
        otp
        autofocus
        size="lg"
        aria-label="Access code"
        :disabled="verifying"
        @complete="emit('verify')"
      />
      <UButton
        block
        :loading="verifying"
        :disabled="digits.length < length || verifyCooldown > 0"
        :label="cooldownLabel('Verify and sign in', verifyCooldown)"
        @click="emit('verify')"
      />
    </div>

    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
      <UButton
        variant="link"
        color="neutral"
        class="px-0"
        :loading="resending"
        :disabled="resending || resendCooldown > 0"
        :label="cooldownLabel('Resend code', resendCooldown)"
        @click="emit('resend')"
      />
      <UButton
        variant="link"
        color="neutral"
        class="px-0"
        :label="backLabel"
        @click="emit('back')"
      />
    </div>
  </div>
</template>
