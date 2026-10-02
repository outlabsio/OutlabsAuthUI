<script setup lang="ts">
import { scopeCountLabel } from '~/utils/api-keys'

// A key's scopes in a table cell: the count, opening the full list in a popover (F-028). Shared
// by every key table that has a Scopes column, so they read the same.
defineProps<{
  scopes: readonly string[]
  /** The key's name, for the button's accessible name. */
  keyName: string
}>()
</script>

<template>
  <UPopover v-if="scopes.length">
    <UButton
      variant="link"
      color="neutral"
      class="p-0"
      :label="scopeCountLabel(scopes.length)"
      :aria-label="`Scopes of ${keyName}: ${scopeCountLabel(scopes.length)}`"
    />
    <template #content>
      <div class="max-w-sm p-3">
        <AppPermissionList :names="[...scopes]" />
      </div>
    </template>
  </UPopover>
  <span v-else class="text-sm text-muted">None</span>
</template>
