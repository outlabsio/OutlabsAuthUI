<script setup lang="ts">
// Shared definition-list for the resource detail pages (used 4+ times, so it earns a
// component). Vanilla layout utilities only.
defineProps<{ items: { label: string, value?: string | number | null }[] }>()
</script>

<template>
  <dl class="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
    <div v-for="item in items" :key="item.label" class="min-w-0">
      <dt class="text-xs text-muted">
        {{ item.label }}
      </dt>
      <dd class="truncate text-sm text-default">
        {{ item.value === null || item.value === undefined || item.value === '' ? '—' : item.value }}
      </dd>
    </div>
  </dl>
</template>
