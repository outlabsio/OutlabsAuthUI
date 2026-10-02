<script setup lang="ts">
import type { RoleReference } from '~/types/role'
import type { User } from '~/types/user'
import type { MembershipHistoryItem } from '~/composables/useUserMembershipHistoryCard'
import { MEMBERSHIP_STATUS_COLOR, badgeColor, statusLabel } from '~/utils/status'

// The user detail's Membership history card (display only; logic in useUserMembershipHistoryCard).
const props = defineProps<{ user: User }>()
const user = computed(() => props.user)

const { page, pageSize, items, total, status, error, isLoading, hasData, refetch } = useUserMembershipHistoryCard(user)

// The roles a membership had after this event (names from the event itself).
function currentRoles(item: MembershipHistoryItem): RoleReference[] {
  const { role_ids: ids, role_names: names } = item.event
  return ids.map((id, index) => ({ id, display_name: names.length === ids.length ? names[index] : undefined }))
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="min-w-0">
        <h2 class="font-semibold text-highlighted">
          Membership history
        </h2>
        <p class="mt-1 text-sm text-muted">
          Retained lifecycle changes for entity access, newest first.
        </p>
      </div>
    </template>

    <AppQueryState
      :status="status"
      :error="error"
      :empty="!items.length"
      :refreshing="isLoading"
      :has-data="hasData"
      error-title="Could not load membership history"
      empty-title="No history yet"
      empty-description="No membership history is currently available for this account."
      empty-icon="i-lucide-history"
      skeleton="list"
      loading-label="Loading membership history"
      compact
      @retry="refetch()"
    >
      <UTimeline :items="items" color="neutral" size="sm">
        <template #date="{ item }">
          <AppTimestamp :value="item.event.event_at" fallback="Unknown time" />
        </template>
        <template #title="{ item }">
          <div class="flex flex-wrap items-center gap-2">
            <span class="break-words">{{ item.entityName }}</span>
            <UBadge color="neutral" variant="outline" size="sm">
              {{ statusLabel(item.event.event_type) }}
            </UBadge>
            <UBadge :color="badgeColor(MEMBERSHIP_STATUS_COLOR, item.event.status)" variant="subtle" size="sm">
              {{ statusLabel(item.event.status) }}
            </UBadge>
          </div>
        </template>
        <template #description="{ item }">
          <div class="space-y-2" data-testid="membership-history-event">
            <p v-if="item.event.entity_path.length > 1" class="break-words text-xs">
              {{ item.event.entity_path.join(' / ') }}
            </p>
            <p class="text-xs">
              By
              <AppUserLabel v-if="item.event.actor_user_id" :user-id="item.event.actor_user_id" :subject-id="user.id" />
              <span v-else class="text-default">the system</span>
              <template v-if="item.event.event_source">
                · <span class="font-mono">{{ item.event.event_source }}</span>
              </template>
            </p>
            <p v-if="item.changes.status" class="text-sm">
              Status {{ statusLabel(item.changes.status.from) }} → {{ statusLabel(item.changes.status.to) }}
            </p>
            <p v-if="item.changes.validity" class="text-sm">
              Valid
              <AppTimestamp :value="item.event.previous_valid_from" date-only fallback="from the start" />
              –
              <AppTimestamp :value="item.event.previous_valid_until" date-only fallback="no end" />
              →
              <AppTimestamp :value="item.event.valid_from" date-only fallback="from the start" />
              –
              <AppTimestamp :value="item.event.valid_until" date-only fallback="no end" />
            </p>
            <div v-if="item.changes.initial && item.event.role_ids.length" class="flex flex-wrap items-center gap-1">
              <span class="text-xs">Roles</span>
              <AppRoleChip v-for="role in currentRoles(item)" :key="`${item.value}-${role.id}`" :role="role" />
            </div>
            <template v-else>
              <div v-if="item.changes.added.length" class="flex flex-wrap items-center gap-1" data-testid="membership-history-added">
                <span class="text-xs">Added</span>
                <AppRoleChip v-for="role in item.changes.added" :key="`${item.value}-add-${role.id}`" :role="role" />
              </div>
              <div v-if="item.changes.removed.length" class="flex flex-wrap items-center gap-1" data-testid="membership-history-removed">
                <span class="text-xs">Removed</span>
                <AppRoleChip v-for="role in item.changes.removed" :key="`${item.value}-remove-${role.id}`" :role="role" />
              </div>
            </template>
            <p v-if="item.event.reason" class="text-sm">
              <span class="font-medium text-default">Reason:</span> {{ item.event.reason }}
            </p>
          </div>
        </template>
      </UTimeline>
      <AppListPagination
        v-model:page="page"
        :total="total"
        :page-size="pageSize"
        noun="event"
        class="mt-4"
      />
    </AppQueryState>
  </UCard>
</template>
