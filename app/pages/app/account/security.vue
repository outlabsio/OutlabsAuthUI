<script setup lang="ts">
import { changePasswordSchema } from '~/schemas/account'
import { PASSWORD_POLICY_HINT } from '~/schemas/auth-flows'
import { cooldownLabel } from '~/utils/request-cooldown'

// Account › Security — logic in useAccountSecurity; display only.
usePageMeta('Security')

const {
  passwordEnabled,
  passwordState,
  passwordFormKey,
  changingPassword,
  onChangePassword,
  sendingResetLink,
  resetLinkCooldown,
  onSendResetLink,
  hasEmail,
  sessionRows,
  sessionsStatus,
  sessionsError,
  sessionsFetching,
  refetchSessions,
  currentSessionId,
  revoke,
  signOutEverywhere,
  signOut,
  signingOut
} = useAccountSecurity()
</script>

<template>
  <!-- Password (F-029, F-097, F-098). Hidden where the server has password sign-in off. -->
  <UPageCard
    v-if="passwordEnabled"
    description="Changing your password signs out your other devices. This browser signs in again with the new password."
  >
    <template #title>
      <h2>Change password</h2>
    </template>
    <UForm
      :key="passwordFormKey"
      ref="passwordForm"
      :schema="changePasswordSchema"
      :state="passwordState"
      class="flex max-w-sm flex-col gap-4"
      @submit="onChangePassword"
      @error="focusFirstFormError"
    >
      <UFormField name="current_password" label="Current password" required>
        <AppPasswordInput
          v-model="passwordState.current_password"
          autocomplete="current-password"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="new_password"
        label="New password"
        :help="PASSWORD_POLICY_HINT"
        required
      >
        <AppPasswordInput
          v-model="passwordState.new_password"
          autocomplete="new-password"
          class="w-full"
        />
      </UFormField>
      <UFormField name="confirm_password" label="Confirm new password" required>
        <AppPasswordInput
          v-model="passwordState.confirm_password"
          autocomplete="new-password"
          class="w-full"
        />
      </UFormField>
      <div>
        <UButton type="submit" label="Change password" :loading="changingPassword" />
      </div>
    </UForm>
    <div v-if="hasEmail" class="flex flex-wrap items-center gap-x-2 text-sm text-muted">
      <span>Forgot your current password, or never had one?</span>
      <UButton
        variant="link"
        color="primary"
        class="px-0"
        :label="cooldownLabel('Email me a reset link', resetLinkCooldown)"
        :loading="sendingResetLink"
        :disabled="resetLinkCooldown > 0"
        @click="onSendResetLink"
      />
    </div>
  </UPageCard>

  <!-- Sessions (F-030, F-094). -->
  <UPageCard description="Every browser and device signed in to your account.">
    <template #title>
      <h2>Active sessions</h2>
    </template>
    <div class="flex flex-col gap-4">
      <AppSessionsTable
        :sessions="sessionRows"
        :status="sessionsStatus"
        :error="sessionsError"
        :refreshing="sessionsFetching"
        revocable
        :revoking-id="revoke.pending ? revoke.target?.id : null"
        :current-session-id="currentSessionId"
        :signing-out="signingOut"
        empty-description="This server does not record sign-in sessions for your account."
        @revoke="revoke.ask"
        @sign-out="signOut"
        @retry="refetchSessions()"
      />
      <div class="flex justify-end">
        <UButton
          color="error"
          variant="soft"
          icon="i-lucide-log-out"
          label="Sign out everywhere"
          @click="signOutEverywhere.ask(true)"
        />
      </div>
    </div>
  </UPageCard>

  <AppConfirmDialog v-model:open="revoke.open" v-bind="revoke.dialog" @confirm="revoke.confirm" />
  <AppConfirmDialog v-model:open="signOutEverywhere.open" v-bind="signOutEverywhere.dialog" @confirm="signOutEverywhere.confirm" />
</template>
