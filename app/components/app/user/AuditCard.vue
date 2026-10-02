<script setup lang="ts">
import type { User } from '~/types/user'

// The user detail's Audit timeline card (display only; logic in useUserAuditCard).
const props = defineProps<{ user: User }>()
const user = computed(() => props.user)

const {
  category,
  categoryItems,
  filtered,
  clearCategory,
  page,
  pageSize,
  events,
  total,
  status,
  error,
  isLoading,
  hasData,
  refetch,
  canOpenAudit,
  auditLinks
} = useUserAuditCard(user)
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="font-semibold text-highlighted">
            Audit timeline
          </h2>
          <p class="mt-1 text-sm text-muted">
            Account events retained for this user, newest first.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <USelect
            v-model="category"
            :items="categoryItems"
            size="sm"
            aria-label="Audit category"
            class="w-48"
          />
          <UDropdownMenu v-if="canOpenAudit" :items="auditLinks">
            <UButton
              label="Open in Audit"
              trailing-icon="i-lucide-chevron-down"
              color="neutral"
              variant="outline"
              size="sm"
            />
          </UDropdownMenu>
        </div>
      </div>
    </template>

    <AppQueryState
      :status="status"
      :error="error"
      :empty="!events.length"
      :refreshing="isLoading"
      :has-data="hasData"
      error-title="Could not load audit timeline"
      :empty-title="filtered ? 'No events in this category' : 'No audit events'"
      :empty-description="filtered ? 'Choose another category, or show them all.' : 'No audit events are currently available for this account.'"
      :empty-actions="filtered ? [{ label: 'Show all categories', color: 'neutral', variant: 'outline', onClick: clearCategory }] : undefined"
      empty-icon="i-lucide-scroll-text"
      skeleton="list"
      loading-label="Loading audit timeline"
      compact
      @retry="refetch()"
    >
      <div class="divide-y divide-default">
        <AppAuditEventCard
          v-for="event in events"
          :key="event.id"
          :event="event"
          context="user"
        />
      </div>
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
