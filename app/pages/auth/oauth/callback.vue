<script setup lang="ts">
// OAuth callback — logic in useOAuthCallback; this file is display only.
definePageMeta({ layout: 'auth' })

const { error, signInTo } = useOAuthCallback()
</script>

<template>
  <div class="flex flex-col gap-4">
    <template v-if="error">
      <AppAuthStepHeading title="Sign-in failed" :description="error" />
      <UButton
        :to="signInTo"
        variant="ghost"
        color="neutral"
        icon="i-lucide-arrow-left"
        label="Back to sign in"
      />
    </template>
    <AppAuthLoading v-else label="Completing sign in…" />
  </div>
</template>
