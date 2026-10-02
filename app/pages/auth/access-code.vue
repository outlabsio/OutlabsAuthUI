<script setup lang="ts">
import type { AuthIdentifierSubmit } from '~/schemas/auth-flows'
import { normalizePhone } from '~/schemas/auth-flows'
import type { AccessCodeChannel } from '~/types/auth'
import { accessCodeChannelLabel } from '~/utils/auth-messages'

// "Enter a sign-in code" — for a code the user already has: the link in a code email, "I
// already have a code" on the sign-in page, or a tab reloaded while the code was on its way.
// Collects where the code was sent, then shares the sign-in flow's code step (verify, resend
// with its cooldown, ?redirect). Logic in useSignInFlow; display only.
definePageMeta({ layout: 'auth' })

const {
  step,
  capabilitiesResolved,
  applicationError,
  accessCodeEnabled,
  phoneChannels,
  enterCode,
  otpLength,
  digits,
  codeError,
  verifying,
  resending,
  sentTo,
  resendCooldown,
  verifyCooldown,
  onVerify,
  resendCode,
  backToMethods
} = useSignInFlow()
const { defaultCountry } = useAuthUiConfig()
const { withIntent } = useAuthIntent()

const channelItems = computed(() => (['email', ...phoneChannels.value] as AccessCodeChannel[])
  .map(value => ({ label: accessCodeChannelLabel(value), value })))
const channel = ref<AccessCodeChannel>('email')

function onIdentifierSubmit(input: AuthIdentifierSubmit) {
  const identifier = channel.value === 'email'
    ? input.identifier.trim()
    : normalizePhone(input.identifier, input.dialCode, input.countryCode)
  void enterCode({ channel: channel.value, identifier })
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <UAlert
      v-if="applicationError"
      role="alert"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="This console cannot sign you in"
      :description="applicationError"
    />

    <AppAuthOtp
      v-if="step === 'otp'"
      v-model:digits="digits"
      :error="codeError"
      :sent-to="sentTo"
      :length="otpLength"
      :verifying="verifying"
      :resending="resending"
      :resend-cooldown="resendCooldown"
      :verify-cooldown="verifyCooldown"
      back-label="Use a different email or phone"
      @verify="onVerify"
      @resend="resendCode"
      @back="backToMethods"
    />

    <template v-else>
      <AppAuthStepHeading
        title="Enter a sign-in code"
        description="Tell us where the code was sent, then type it on the next step."
      />

      <AppAuthLoading v-if="!capabilitiesResolved" label="Loading sign-in options…" />

      <UAlert
        v-else-if="!accessCodeEnabled"
        color="neutral"
        variant="subtle"
        icon="i-lucide-info"
        title="Sign-in codes are turned off"
        description="This server does not accept one-time sign-in codes. Sign in another way."
      />

      <template v-else>
        <URadioGroup
          v-if="channelItems.length > 1"
          v-model="channel"
          legend="Where did the code arrive?"
          :items="channelItems"
          variant="card"
          orientation="horizontal"
        />
        <AppAuthIdentifier
          :key="channel === 'email' ? 'email' : 'phone'"
          :kind="channel === 'email' ? 'email' : 'phone'"
          :default-country="defaultCountry"
          submit-label="Continue"
          @submit="onIdentifierSubmit"
        />
      </template>

      <div class="flex justify-center">
        <UButton
          :to="withIntent('/auth/login')"
          variant="ghost"
          color="neutral"
          icon="i-lucide-arrow-left"
          label="Back to sign in"
        />
      </div>
    </template>
  </div>
</template>
