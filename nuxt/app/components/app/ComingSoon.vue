<script setup lang="ts">
// Placeholder body for resource verticals not yet ported. Each is fleshed out in P2 by
// copying the users vertical (queries + schema + pages). Vanilla components only.
defineProps<{ title: string, phase?: string }>()
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2 py-16 text-center">
    <UIcon name="i-lucide-hammer" class="size-8 text-muted" />
    <h2 class="text-base font-medium text-default">
      {{ title }}
    </h2>
    <p class="text-sm text-muted">
      Not yet ported — scheduled for {{ phase ?? 'P2' }} of the Nuxt port.
    </p>
  </div>
</template>
