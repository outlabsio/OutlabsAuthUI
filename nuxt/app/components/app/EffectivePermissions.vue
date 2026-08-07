<script setup lang="ts">
import type { Role } from '~/types/role'

// The deduped union of permissions a set of roles grants — the "what will they actually get" answer
// that sits beside AppRolePicker. Renders through AppPermissionList so it reads identically to every
// other permission view. Pure display; the union is computed from each role's `permissions`.
const props = withDefaults(defineProps<{
  roles?: Role[]
  title?: string
  emptyText?: string
}>(), {
  roles: () => [],
  title: 'Will grant',
  emptyText: 'Select roles to see the permissions they grant.'
})

const names = computed(() => [...new Set(props.roles.flatMap(r => r.permissions ?? []))].sort())
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="mb-1.5 flex items-center gap-2">
      <span class="text-xs font-medium uppercase tracking-wide text-muted">{{ title }}</span>
      <span class="text-xs text-dimmed">{{ names.length }}</span>
    </div>
    <p v-if="!roles.length" class="text-sm text-muted">
      {{ emptyText }}
    </p>
    <div v-else class="min-h-0 flex-1 overflow-y-auto pr-1">
      <AppPermissionList :names="names" empty-text="These roles grant no permissions." />
    </div>
  </div>
</template>
