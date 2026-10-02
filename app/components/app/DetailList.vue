<script setup lang="ts">
import type { DetailItem } from '~/types/display'

// Shared definition list for detail pages. Values render the same way the lists render them
// (F-215): enums as the list's badge (pass `badge`), timestamps through AppTimestamp
// (`type: 'datetime'` / `'date'`), booleans as Yes/No, identifiers in monospace. Long values
// wrap instead of being cut off (F-223): text breaks at words, ids and codes break anywhere.
// Missing values show '—'. A `#value-<key>` slot overrides any one value.
//   <AppDetailList :items="[
//     { label: 'Email', value: user.email },
//     { key: 'status', label: 'Status', value: user.status, badge: { color: USER_STATUS_COLOR[user.status] } },
//     { label: 'Created', value: user.created_at, type: 'datetime' },
//     { label: 'Superuser', value: user.is_superuser, type: 'boolean' },
//     { label: 'ID', value: user.id, type: 'code' },
//     { label: 'Description', value: role.description, full: true }
//   ]" />

defineProps<{ items: DetailItem[] }>()

const isMissing = (value: DetailItem['value']) => value === null || value === undefined || value === ''
</script>

<template>
  <dl class="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
    <div
      v-for="item in items"
      :key="item.key ?? item.label"
      class="min-w-0"
      :class="item.full ? 'sm:col-span-2' : ''"
    >
      <dt class="text-xs text-muted">
        {{ item.label }}
      </dt>
      <dd class="text-sm text-default">
        <slot :name="`value-${item.key ?? item.label}`" :item="item">
          <span v-if="isMissing(item.value) && item.type !== 'datetime' && item.type !== 'date'" class="text-muted">{{ item.fallback ?? '—' }}</span>
          <UBadge
            v-else-if="item.badge"
            :color="item.badge.color"
            :variant="item.badge.variant ?? 'subtle'"
          >
            {{ item.badge.label ?? statusLabel(String(item.value)) }}
          </UBadge>
          <AppTimestamp
            v-else-if="item.type === 'datetime' || item.type === 'date'"
            :value="typeof item.value === 'boolean' ? null : item.value"
            :date-only="item.type === 'date'"
            :fallback="item.fallback ?? '—'"
          />
          <template v-else-if="item.type === 'boolean'">
            {{ yesNo(Boolean(item.value)) }}
          </template>
          <span v-else-if="item.type === 'code'" class="break-all font-mono">{{ item.value }}</span>
          <span v-else class="whitespace-pre-line break-words">{{ item.value }}</span>
        </slot>
      </dd>
    </div>
  </dl>
</template>
