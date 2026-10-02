<script setup lang="ts">
import { timestampParts, type DateInput, type RelativeMode } from '~/utils/format-date'

// Every API timestamp renders through this: relative when recent ("5 minutes ago"), medium
// date + short time otherwise, with the full absolute value in a UTooltip and in screen-reader
// text (so it is reachable without hovering). Missing values show `fallback`.
//   <AppTimestamp :value="row.original.created_at" />
//   <AppTimestamp :value="user.last_login" fallback="Never" />
//   <AppTimestamp :value="membership.valid_until" date-only fallback="No expiry" />
const props = withDefaults(defineProps<{
  value: DateInput
  fallback?: string
  // 'auto' = relative within 7 days of now; 'always' / 'never' force one form.
  relative?: RelativeMode
  // Date without time of day (validity dates).
  dateOnly?: boolean
}>(), {
  fallback: '—',
  relative: 'auto',
  dateOnly: false
})

const now = useRelativeNow()
const parts = computed(() => timestampParts(props.value, {
  now: now.value.getTime(),
  mode: props.relative,
  dateOnly: props.dateOnly,
  fallback: props.fallback
}))
</script>

<template>
  <span v-if="!parts.iso" class="text-muted">{{ parts.label }}</span>
  <UTooltip v-else :text="parts.full">
    <time :datetime="parts.iso" class="whitespace-nowrap">{{ parts.label }}<span v-if="parts.relative" class="sr-only"> ({{ parts.absolute }})</span></time>
  </UTooltip>
</template>
