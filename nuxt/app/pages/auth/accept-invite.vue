<script setup lang="ts">
definePageMeta({ layout: 'auth' })
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-lg font-semibold text-highlighted">
      Accept your invitation
    </h1>
    <p class="text-sm text-muted">
      Not yet ported — scheduled for P2 of the Nuxt port.
    </p>
    <ULink to="/auth/login" class="text-sm text-muted hover:text-default">
      Back to sign in
    </ULink>
  </div>
</template>
