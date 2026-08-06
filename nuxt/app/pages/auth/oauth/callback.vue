<script setup lang="ts">
definePageMeta({ layout: 'auth' })

// P1 skeleton: the full token-exchange + finalize-session flow is ported in P2 (the plan
// flags oauth/invite/reset deep links as parity-bug hotspots to cover with explicit E2E).
</script>

<template>
  <div class="flex flex-col items-center gap-3 py-4">
    <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-primary" />
    <p class="text-sm text-muted">
      Completing sign in...
    </p>
  </div>
</template>
