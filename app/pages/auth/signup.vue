<script setup lang="ts">
import type { RuntimeConfig } from '~/utils/runtime-config'

// Signup (F3) — logic in useSignupForm; this file is display only. The page exists only when
// the deployment surfaces signup (`authUi.signup`): otherwise the route middleware sends the
// visitor to sign-in before anything renders (invite-only deployments).
definePageMeta({
  layout: 'auth',
  middleware: (to) => {
    const runtimeConfig = useState<RuntimeConfig | null>('app:runtime-config')
    if (runtimeConfig.value?.authUi.signup === false) {
      return navigateTo({ path: '/auth/login', query: to.query }, { replace: true })
    }
  }
})

const { description, oauthProviders, oauthLoading, onOAuth, state, loading, onSubmit, signInTo } = useSignupForm()

// Method-buttons pattern (like sign-in): providers as peers, the email form unfolds.
const emailOpen = ref(false)
</script>

<template>
  <div class="flex flex-col gap-5">
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
      :loading="loading"
      @submit="onSubmit"
    />

    <div class="text-sm">
      <ULink :to="signInTo" class="text-muted hover:text-default">
        Already have an account? Sign in
      </ULink>
    </div>
  </div>
</template>
