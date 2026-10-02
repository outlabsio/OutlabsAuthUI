<script setup lang="ts">
// Rendered by app.vue when a stored session could not be loaded: the auth API did not answer
// (offline, timeout, 5xx), or answered in a way that neither confirms nor refuses the session.
// The session is kept; Retry loads it again and Sign out ends it on this device.
const { bootError, title, icon, retrying, retry, signingOut, signOut } = useBootRecovery()
</script>

<template>
  <div class="min-h-svh flex items-center justify-center p-4 bg-muted">
    <UCard class="w-full max-w-lg">
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-2 text-warning">
          <UIcon :name="icon" class="size-6" />
          <h1 class="text-lg font-semibold">
            {{ title }}
          </h1>
        </div>
        <p class="text-sm text-muted">
          {{ bootError?.message }}
        </p>
        <p class="text-sm text-muted">
          You are still signed in on this device. Retry once the API answers, or sign out.
        </p>
        <div class="flex flex-wrap justify-end gap-2">
          <UButton
            icon="i-lucide-log-out"
            label="Sign out"
            color="neutral"
            variant="ghost"
            :loading="signingOut"
            :disabled="retrying"
            @click="signOut"
          />
          <UButton
            icon="i-lucide-refresh-cw"
            label="Retry"
            :loading="retrying"
            :disabled="signingOut"
            @click="retry"
          />
        </div>
      </div>
    </UCard>
  </div>
</template>
