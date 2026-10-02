<script setup lang="ts">
import type { User } from '~/types/user'
import { statusLabel } from '~/utils/status'

// The user detail's Profile card (display only; logic in useUserProfileCard).
const props = defineProps<{ user: User }>()
const user = computed(() => props.user)

const { items, badgeHolds, statusColor, notice } = useUserProfileCard(user)
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-semibold text-highlighted">
          Profile
        </h2>
        <div class="flex flex-wrap items-center justify-end gap-1">
          <UBadge :color="statusColor" variant="subtle" data-testid="user-status">
            {{ statusLabel(user.status) }}
          </UBadge>
          <UTooltip v-for="hold in badgeHolds" :key="hold.kind" :text="hold.description">
            <UBadge
              color="warning"
              variant="outline"
              icon="i-lucide-clock"
              :label="hold.label"
            />
          </UTooltip>
        </div>
      </div>
    </template>
    <UAlert
      v-if="notice"
      color="neutral"
      variant="subtle"
      :icon="notice.icon"
      :title="notice.title"
      :description="notice.description"
      class="mb-4"
      data-testid="user-state-notice"
    />
    <!-- The badges' tooltips are hover-only: each hold's explanation (and the access scope's)
         is also readable under its own row. -->
    <AppDetailList :items="items" />
  </UCard>
</template>
