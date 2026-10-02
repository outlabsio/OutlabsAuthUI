<script setup lang="ts">
// Magic-link landing page (verify-only since F1) — the request side lives in the unified
// sign-in flow at /auth/login. Nothing is verified until the user clicks. Logic in
// useMagicLinkForm; display only.
definePageMeta({
  layout: 'auth',
  // No token: nothing to verify here — go to the unified sign-in (keeping ?redirect).
  middleware: (to) => {
    if (typeof to.query.token === 'string' && to.query.token) return
    const { token: _token, ...query } = to.query
    return navigateTo({ path: '/auth/login', query }, { replace: true })
  }
})

const { state, signedInAs, signingOut, failure, continueSignIn, signOutAndContinue, newLinkTo, signInTo } = useMagicLinkForm()
</script>

<template>
  <div class="flex flex-col gap-4">
    <AppAuthLoading v-if="state === 'verifying'" label="Signing you in…" />

    <template v-else-if="state === 'failed' && failure">
      <AppAuthStepHeading :title="failure.title" :description="failure.description" />
      <div class="flex flex-col gap-2">
        <UButton
          v-if="failure.retry"
          block
          label="Try again"
          @click="continueSignIn"
        />
        <!-- Nothing is sent from here: the link opens sign-in on the email form. -->
        <UButton
          v-if="failure.requestNewLink"
          block
          :to="newLinkTo"
          label="Request a new link"
        />
        <UButton
          v-else
          block
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left"
          :to="signInTo"
          label="Back to sign in"
        />
      </div>
    </template>

    <AppAuthSignedInPrompt
      v-else-if="state === 'signed-in'"
      :email="signedInAs"
      description="This sign-in link may be for a different account. Sign out here to use it."
      continue-label="Sign out and continue"
      :loading="signingOut"
      @continue="signOutAndContinue"
    />

    <template v-else>
      <AppAuthStepHeading
        title="Continue signing in"
        description="This one-time link signs you in. It works once and expires soon."
      />
      <UButton block label="Continue signing in" @click="continueSignIn" />
    </template>
  </div>
</template>
