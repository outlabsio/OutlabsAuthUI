<script setup lang="ts">
// Accept-invitation — logic in useAcceptInviteForm; this file is display only.
definePageMeta({ layout: 'auth' })

const { token, schema, passwordHelp, state, loading, onSubmit, invitationsOff, signedInAs, signingOut, signOut, problem, signInTo } = useAcceptInviteForm()
</script>

<template>
  <div class="flex flex-col gap-4">
    <template v-if="!token">
      <AppAuthStepHeading title="Invalid invitation link" description="This link is missing its token. Open the link from your invitation email again." />
      <UButton
        :to="signInTo"
        variant="ghost"
        color="neutral"
        icon="i-lucide-arrow-left"
        label="Back to sign in"
      />
    </template>

    <template v-else-if="invitationsOff">
      <AppAuthStepHeading title="Invitations are turned off" description="This server does not accept invitations. Ask an administrator for another way in." />
      <UButton
        :to="signInTo"
        variant="ghost"
        color="neutral"
        icon="i-lucide-arrow-left"
        label="Back to sign in"
      />
    </template>

    <AppAuthSignedInPrompt
      v-else-if="signedInAs"
      :email="signedInAs"
      description="This invitation is for a new account. Sign out here to accept it."
      continue-label="Sign out to accept"
      :loading="signingOut"
      @continue="signOut"
    />

    <template v-else>
      <AppAuthStepHeading title="Accept your invitation" description="Set a password to activate your account." />
      <UAlert
        v-if="problem"
        role="alert"
        color="error"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="problem.title"
        :description="problem.description"
      />
      <UForm
        ref="form"
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          name="new_password"
          label="Password"
          :help="passwordHelp"
          required
        >
          <AppPasswordInput
            v-model="state.new_password"
            autocomplete="new-password"
            class="w-full"
          />
        </UFormField>
        <UFormField name="confirm_password" label="Confirm password" required>
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
          label="Accept and sign in"
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
