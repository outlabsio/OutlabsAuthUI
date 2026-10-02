<script setup lang="ts">
import type { ApiKey } from '~/types/api-key'

// Whose key it is, in the entity key inventory (display only): a service-account key names its
// account (AppServiceAccountLabel, linked to its page), a personal key its user (AppUserLabel).
// The labels resolve the names through their own cached queries. Used by the inventory's Owner
// column, its phone line under the key name and the key detail's "Acts as" row, so all three
// say the same thing. `entity-id` is the entity the inventory lists (the account's anchor).
defineProps<{
  apiKey: Pick<ApiKey, 'key_kind' | 'owner_id'>
  entityId?: string | null
}>()
</script>

<template>
  <AppServiceAccountLabel
    v-if="apiKey.key_kind === 'system_integration' && apiKey.owner_id && entityId"
    :account-id="apiKey.owner_id"
    :entity-id="entityId"
  />
  <AppUserLabel v-else-if="apiKey.owner_id" :user-id="apiKey.owner_id" />
  <span v-else class="text-muted">Unknown</span>
</template>
