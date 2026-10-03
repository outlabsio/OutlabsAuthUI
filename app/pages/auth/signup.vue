<script setup lang="ts">
import type { RuntimeConfig } from '~/utils/runtime-config'

// Signup (F3) — logic in useSignupForm; this file is display only. The page exists only when
// the deployment surfaces signup (`authUi.signup`): otherwise the route middleware sends the
// visitor to sign-in before anything renders (invite-only deployments). A backend that does not
// accept self-registration (`registration_mode`) gets an explanation instead of the form.
definePageMeta({
  layout: 'auth',
  middleware: (to) => {
    const runtimeConfig = useState<RuntimeConfig | null>('app:runtime-config')
    if (runtimeConfig.value?.authUi.signup === false) {
      return navigateTo({ path: '/auth/login', query: to.query }, { replace: true })
    }
  }
})

const {
  description,
  capabilitiesResolved,
  closedNotice,
  oauthProviders,
  oauthLoading,
  onOAuth,
  schema,
  passwordHelp,
  state,
  loading,
  onSubmit,
  signInTo
} = useSignupForm()

// Method-buttons pattern (like sign-in): providers as peers, the email form unfolds.
const emailOpen = ref(false)
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Hold the page until the capabilities say whether this server takes registrations. -->
    <AppAuthLoading v-if="!capabilitiesResolved" label="Loading sign-up…" />

    <template v-else-if="closedNotice">
      <AppAuthStepHeading :title="closedNotice.title" :description="closedNotice.description" />
      <UButton
        :to="signInTo"
        variant="ghost"
        color="neutral"
        icon="i-lucide-arrow-left"
        label="Back to sign in"
      />
    </template>

    <template v-else>
      <AppAuthStepHeading title="Create your account" :description="description" />

      <template v-if="oauthProviders.length">
        <AppAuthOauthButtons :providers="oauthProviders" :loading-provider="oauthLoading" @select="onOAuth" />
        <USeparator label="or" />

        <UCollapsible v-model:open="emailOpen" unmount-on-hide>
          <UButton
            block
            color="neutral"
            variant="subtle"
            icon="i-lucide-mail"
            label="Continue with email"
          />
          <template #content>
            <div class="pt-3">
              <AppAuthSignupForm
                v-model:state="state"
                :schema="schema"
                :password-help="passwordHelp"
                :loading="loading"
                @submit="onSubmit"
              />
            </div>
          </template>
        </UCollapsible>
      </template>
      <AppAuthSignupForm
        v-else
        v-model:state="state"
        :schema="schema"
        :password-help="passwordHelp"
        :loading="loading"
        @submit="onSubmit"
      />

      <div class="text-sm">
        <ULink :to="signInTo" class="text-muted hover:text-default">
          Already have an account? Sign in
        </ULink>
      </div>
    </template>
  </div>
</template>
