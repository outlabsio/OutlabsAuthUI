<script setup lang="ts">
import { PASSWORD_POLICY_HINT, setPasswordSchema } from '~/schemas/auth-flows'

// Reset-password — logic in useResetPasswordForm; this file is display only.
definePageMeta({ layout: 'auth' })

const { token, state, loading, onSubmit, linkProblem, requestLinkTo, signInTo } = useResetPasswordForm()
</script>

<template>
  <div class="flex flex-col gap-4">
    <template v-if="!token">
      <AppAuthStepHeading title="Invalid reset link" description="This link is missing its token. Request a new one." />
      <UButton :to="requestLinkTo" block label="Request a reset link" />
      <UButton
        :to="signInTo"
        variant="ghost"
        color="neutral"
        icon="i-lucide-arrow-left"
        label="Back to sign in"
      />
    </template>

    <template v-else>
      <AppAuthStepHeading title="Choose a new password" />
      <UAlert
        v-if="linkProblem"
        role="alert"
        color="error"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="This link cannot be used"
        :description="linkProblem"
        :actions="[{ label: 'Request a reset link', to: requestLinkTo, color: 'error', variant: 'outline' }]"
      />
      <UForm
        ref="form"
        :schema="setPasswordSchema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          name="new_password"
          label="New password"
          :help="PASSWORD_POLICY_HINT"
          required
        >
          <AppPasswordInput
            v-model="state.new_password"
            autocomplete="new-password"
            class="w-full"
          />
        </UFormField>
        <UFormField name="confirm_password" label="Confirm new password" required>
          <AppPasswordInput
            v-model="state.confirm_password"
            autocomplete="new-password"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          block
          :loading="loading"
          label="Reset password"
        />
      </UForm>
      <UButton
        :to="signInTo"
        variant="ghost"
        color="neutral"
        icon="i-lucide-arrow-left"
        label="Back to sign in"
      />
    </template>
  </div>
</template>
