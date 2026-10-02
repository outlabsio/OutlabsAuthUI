<script setup lang="ts">
import type { RuntimeConfig } from '~/utils/runtime-config'
import { cooldownLabel } from '~/utils/request-cooldown'
import { accessCodeChannelLabel } from '~/utils/auth-messages'

// Unified sign-in — method-buttons pattern: OAuth providers, email, and phone as peer
// buttons; the chosen method unfolds in place. Email-only deployments render the email
// form directly. Logic in useSignInFlow; display only.
definePageMeta({ layout: 'auth' })

const {
  step,
  capabilitiesResolved,
  emailOnly,
  emailOpen,
  phoneOpen,
  emailState,
  passwordLoading,
  applicationError,
  onEmailSubmit,
  methodLoading,
  magicLinkCooldown,
  emailCodeCooldown,
  sendMagicLink,
  sendEmailCode,
  phone,
  onPhoneIdentifierSubmit,
  sendPhoneCode,
  channelCooldown,
  otpLength,
  digits,
  verifying,
  resending,
  sentTo,
  resendCooldown,
  verifyCooldown,
  onVerify,
  resendCode,
  linkEmail,
  linkCooldown,
  resendMagicLink,
  backToMethods,
  oauthProviders,
  oauthLoading,
  onOAuth,
  oauthError,
  dismissOAuthError,
  magicLinkEnabled,
  accessCodeEnabled,
  phoneEnabled,
  phoneChannels
} = useSignInFlow()

const { defaultCountry, signupEnabled } = useAuthUiConfig()
const { withIntent } = useAuthIntent()
const runtimeConfig = useState<RuntimeConfig | null>('app:runtime-config')
</script>

<template>
  <div class="flex flex-col gap-5">
    <AppAuthSessionNotice />

    <UAlert
      v-if="oauthError"
      role="alert"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="oauthError.title"
      :description="oauthError.description"
      close
      @update:open="dismissOAuthError"
    />
    <UAlert
      v-if="applicationError"
      role="alert"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="This console cannot sign you in"
      :description="applicationError"
    />

    <!-- Methods: peer buttons, the chosen one unfolds (email-only renders the form directly) -->
    <template v-if="step === 'methods'">
      <AppAuthStepHeading title="Sign in" :description="runtimeConfig?.signInDescription" />

      <!-- Hold the methods until capabilities resolve — no flicker from direct-form to buttons. -->
      <AppAuthLoading v-if="!capabilitiesResolved" label="Loading sign-in options…" />

      <template v-else>
        <template v-if="oauthProviders.length">
          <AppAuthOauthButtons :providers="oauthProviders" :loading-provider="oauthLoading" @select="onOAuth" />
          <USeparator label="or" />
        </template>

        <!-- Email method -->
        <AppAuthEmailForm
          v-if="emailOnly"
          v-model:state="emailState"
          :loading="passwordLoading"
          :method-loading="methodLoading"
          :magic-link-enabled="magicLinkEnabled"
          :access-code-enabled="accessCodeEnabled"
          :magic-link-cooldown="magicLinkCooldown"
          :email-code-cooldown="emailCodeCooldown"
          @submit="onEmailSubmit"
          @magic-link="sendMagicLink"
          @email-code="sendEmailCode"
        />
        <UCollapsible v-else v-model:open="emailOpen" :unmount-on-hide="false">
          <UButton
            block
            color="neutral"
            variant="subtle"
            icon="i-lucide-mail"
            label="Continue with email"
          />
          <template #content>
            <AppAuthEmailForm
              v-model:state="emailState"
              :loading="passwordLoading"
              :method-loading="methodLoading"
              :magic-link-enabled="magicLinkEnabled"
              :access-code-enabled="accessCodeEnabled"
              :magic-link-cooldown="magicLinkCooldown"
              :email-code-cooldown="emailCodeCooldown"
              @submit="onEmailSubmit"
              @magic-link="sendMagicLink"
              @email-code="sendEmailCode"
            />
          </template>
        </UCollapsible>

        <!-- Phone method -->
        <UCollapsible v-if="phoneEnabled" v-model:open="phoneOpen" :unmount-on-hide="false">
          <UButton
            block
            color="neutral"
            variant="subtle"
            icon="i-lucide-phone"
            label="Continue with phone"
          />
          <template #content>
            <div class="pt-3">
              <AppAuthIdentifier
                kind="phone"
                :default-country="defaultCountry"
                @submit="onPhoneIdentifierSubmit"
              />
            </div>
          </template>
        </UCollapsible>

        <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
          <ULink :to="withIntent('/auth/recovery')" class="text-muted hover:text-default">
            Can't sign in?
          </ULink>
          <ULink v-if="accessCodeEnabled" :to="withIntent('/auth/access-code')" class="text-muted hover:text-default">
            I already have a code
          </ULink>
          <ULink v-if="signupEnabled" :to="withIntent('/auth/signup')" class="text-muted hover:text-default">
            Create an account
          </ULink>
        </div>
      </template>
    </template>

    <!-- Phone: channel choice -->
    <template v-else-if="step === 'channel'">
      <AppAuthStepHeading title="Get your code" :description="`We'll send a one-time code to ${phone}.`" />

      <div class="flex flex-col gap-2">
        <UButton
          v-for="(ch, i) in phoneChannels"
          :key="ch"
          block
          :color="i === 0 ? 'primary' : 'neutral'"
          :variant="i === 0 ? 'solid' : 'subtle'"
          :loading="methodLoading === ch"
          :disabled="(methodLoading !== '' && methodLoading !== ch) || channelCooldown(ch) > 0"
          :label="cooldownLabel(i === 0 ? `Send code via ${accessCodeChannelLabel(ch, 'inline')}` : `Send it by ${accessCodeChannelLabel(ch, 'inline')} instead`, channelCooldown(ch))"
          @click="sendPhoneCode(ch)"
        />
      </div>

      <div class="text-sm">
        <UButton
          variant="link"
          color="neutral"
          class="px-0"
          label="Use a different method"
          @click="backToMethods"
        />
      </div>
    </template>

    <!-- OTP -->
    <AppAuthOtp
      v-else-if="step === 'otp'"
      v-model:digits="digits"
      :sent-to="sentTo"
      :length="otpLength"
      :verifying="verifying"
      :resending="resending"
      :resend-cooldown="resendCooldown"
      :verify-cooldown="verifyCooldown"
      @verify="onVerify"
      @resend="resendCode"
      @back="backToMethods"
    />

    <!-- Magic link requested -->
    <template v-else-if="step === 'magic-link-sent'">
      <AppAuthStepHeading
        title="Check your email"
        :description="`If ${linkEmail} has an account here, we sent it a sign-in link. The link works once and expires soon.`"
      />
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
        <UButton
          variant="link"
          color="neutral"
          class="px-0"
          :loading="resending"
          :disabled="resending || linkCooldown > 0"
          :label="cooldownLabel('Send another link', linkCooldown)"
          @click="resendMagicLink"
        />
        <UButton
          variant="link"
          color="neutral"
          class="px-0"
          label="Back to sign in"
          @click="backToMethods"
        />
      </div>
    </template>
  </div>
</template>
