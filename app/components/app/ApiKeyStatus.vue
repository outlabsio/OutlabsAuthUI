<script setup lang="ts">
import type { ApiKey } from '~/types/api-key'
import { apiKeyState } from '~/utils/api-keys'

// One API key's status, the same in every key table and the key detail (F-027): the stored
// status when the key is not active, "Expired" once its expiry date has passed, "Not in effect"
// when the server refuses an active key (owner or service account inactive, entity inactive, no
// scope still granted), else "Active". The reasons are in a tooltip for pointer users and in
// screen-reader text; the key detail lists them in full.
const props = withDefaults(defineProps<{
  apiKey: Pick<ApiKey, 'status' | 'expires_at' | 'is_currently_effective' | 'ineffective_reasons'>
  size?: 'sm' | 'md'
}>(), { size: 'md' })

const now = useRelativeNow()
const state = computed(() => apiKeyState(props.apiKey, now.value.getTime()))
const reasonText = computed(() => state.value.reasons.join(' '))
</script>

<template>
  <UTooltip v-if="reasonText" :text="reasonText">
    <UBadge
      :color="state.color"
      variant="subtle"
      :size="size"
      :label="state.label"
      data-testid="api-key-status"
    >
      <template #trailing>
        <span class="sr-only">: {{ reasonText }}</span>
      </template>
    </UBadge>
  </UTooltip>
  <UBadge
    v-else
    :color="state.color"
    variant="subtle"
    :size="size"
    :label="state.label"
    data-testid="api-key-status"
  />
</template>
