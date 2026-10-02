<script setup lang="ts">
// A guest-surface wait (capabilities loading, a link being verified): a spinner announced to
// screen readers through role="status".
defineProps<{
  label: string
}>()
</script>

<template>
  <div role="status" class="flex flex-col items-center gap-3 py-6 text-center">
    <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-primary" aria-hidden="true" />
    <p class="text-sm text-muted">
      {{ label }}
    </p>
  </div>
</template>
