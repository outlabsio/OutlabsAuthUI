<script setup lang="ts">
import { cooldownLabel } from '~/utils/request-cooldown'
import { accessCodeChannelLabel } from '~/utils/auth-messages'

// Recovery (F4) — the "Can't sign in?" brancher, logic in useRecoveryFlow; display only.
// Email → password-reset link; phone → OTP sign-in as the recovery path.
definePageMeta({ layout: 'auth' })

const {
  otpLength,
  capabilitiesResolved,
  step,
  emailOpen,
  phoneOpen,
  email,
  phone,
  sending,
  emailDraft,
  emailDraftCooldown,
  onEmailSubmit,
  resetCooldown,
  resendResetLink,
  onPhoneSubmit,
  sendPhoneCode,
  channelCooldown,
  digits,
  verifying,
  resending,
  sentTo,
  resendCooldown,
  verifyCooldown,
  onVerify,
  applicationError,
  resendCode,
  backToIdentifier,
  phoneChannels
} = useRecoveryFlow()

const { defaultCountry } = useAuthUiConfig()
const { withIntent } = useAuthIntent()
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

    <!-- Step 1: identifier -->
    <template v-if="step === 'identifier'">
      <AppAuthStepHeading
        title="Can't sign in?"
        :description="phoneChannels.length
          ? 'Get a password-reset link by email, or sign in with a code sent to your phone.'
          : 'Enter your email and we will send you a link to set a new password.'"
      />

      <AppAuthLoading v-if="!capabilitiesResolved" label="Loading recovery options…" />

      <template v-else>
        <template v-if="phoneChannels.length">
          <UCollapsible v-model:open="emailOpen" :unmount-on-hide="false">
            <UButton
              block
              color="neutral"
              variant="subtle"
              icon="i-lucide-mail"
              label="Recover with email"
            />
            <template #content>
              <div class="pt-3">
                <AppAuthIdentifier
                  v-model:identifier="emailDraft"
                  kind="email"
                  submit-label="Send reset link"
                  :loading="sending === 'reset'"
                  :submit-cooldown="emailDraftCooldown"
                  @submit="onEmailSubmit"
                />
              </div>
            </template>
          </UCollapsible>

          <UCollapsible v-model:open="phoneOpen" :unmount-on-hide="false">
            <UButton
              block
              color="neutral"
              variant="subtle"
              icon="i-lucide-phone"
              label="Recover with phone"
            />
            <template #content>
              <div class="pt-3">
                <AppAuthIdentifier
                  kind="phone"
                  :default-country="defaultCountry"
                  @submit="onPhoneSubmit"
                />
              </div>
            </template>
          </UCollapsible>
        </template>

        <AppAuthIdentifier
          v-else
          v-model:identifier="emailDraft"
          kind="email"
          submit-label="Send reset link"
          :loading="sending === 'reset'"
          :submit-cooldown="emailDraftCooldown"
          @submit="onEmailSubmit"
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

    <!-- Step 2 (phone): channel choice -->
    <template v-else-if="step === 'channel'">
      <AppAuthStepHeading
        title="Get your code"
        :description="`We'll sign you in with a code sent to ${phone}. Then you can set a new password from your account page.`"
      />

      <div class="flex flex-col gap-2">
        <UButton
          v-for="(ch, i) in phoneChannels"
          :key="ch"
          block
          :color="i === 0 ? 'primary' : 'neutral'"
          :variant="i === 0 ? 'solid' : 'subtle'"
          :loading="sending === ch"
          :disabled="(sending !== '' && sending !== ch) || channelCooldown(ch) > 0"
          :label="cooldownLabel(i === 0 ? `Send code via ${accessCodeChannelLabel(ch, 'inline')}` : `Send it by ${accessCodeChannelLabel(ch, 'inline')} instead`, channelCooldown(ch))"
          @click="sendPhoneCode(ch)"
        />
      </div>

      <div class="text-sm">
        <UButton
          variant="link"
          color="neutral"
          class="px-0"
          label="Use a different email or phone"
          @click="backToIdentifier"
        />
      </div>
    </template>

    <!-- Step 3 (phone): OTP -->
    <AppAuthOtp
      v-else-if="step === 'otp'"
      v-model:digits="digits"
      :sent-to="sentTo"
      :length="otpLength"
      :verifying="verifying"
      :resending="resending"
      :resend-cooldown="resendCooldown"
      :verify-cooldown="verifyCooldown"
      back-label="Use a different email or phone"
      @verify="onVerify"
      @resend="resendCode"
      @back="backToIdentifier"
    />

    <!-- Email: reset link sent -->
    <template v-else-if="step === 'sent'">
      <AppAuthStepHeading
        title="Check your email"
        :description="`If an account exists for ${email}, we sent a password-reset link to it.`"
      />
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
        <UButton
          variant="link"
          color="neutral"
          class="px-0"
          :loading="sending === 'reset'"
          :disabled="sending !== '' || resetCooldown > 0"
          :label="cooldownLabel('Send another link', resetCooldown)"
          @click="resendResetLink"
        />
        <UButton
          variant="link"
          color="neutral"
          class="px-0"
          label="Use a different email or phone"
          @click="backToIdentifier"
        />
      </div>
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
