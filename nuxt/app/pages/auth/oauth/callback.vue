<script setup lang="ts">
// OAuth callback — logic in useOAuthCallback; this file is display only.
definePageMeta({ layout: 'auth' })

const { error } = useOAuthCallback()
</script>

<template>
  <div class="flex flex-col items-center gap-3 py-4 text-center">
    <template v-if="error">
      <UIcon name="i-lucide-triangle-alert" class="size-8 text-error" />
      <h1 class="text-lg font-semibold text-highlighted">
        Sign-in failed
      </h1>
      <p class="text-sm text-muted">
        {{ error }}
      </p>
      <ULink to="/auth/login" class="text-sm text-muted hover:text-default">
        Back to sign in
      </ULink>
    </template>
    <template v-else>
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-primary" />
      <p class="text-sm text-muted">
        Completing sign in...
      </p>
    </template>
  </div>
</template>
