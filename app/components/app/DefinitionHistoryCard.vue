<script setup lang="ts">
import type { DefinitionKind } from '~/types/definition-history'
import { DEFINITION_STATUS_COLOR, badgeColor, statusLabel } from '~/utils/status'

// A role's or permission's definition history (display only; logic in useDefinitionHistory): a
// timeline, newest first, of what changed, by whom and through what. The membership history
// card's pattern.
const props = defineProps<{ kind: DefinitionKind, definitionId: string }>()

const { enabled, page, pageSize, items, total, status, error, isLoading, hasData, refetch, emptyDescription } = useDefinitionHistory(props.kind, () => props.definitionId)
</script>

<template>
  <UCard>
    <template #header>
      <div class="min-w-0">
        <h2 class="font-semibold text-highlighted">
          History
        </h2>
        <p class="mt-1 text-sm text-muted">
          Changes to this definition, newest first.
        </p>
      </div>
    </template>

    <AppQueryState
      :status="status"
      :error="error"
      :enabled="enabled"
      :empty="!items.length"
      :refreshing="isLoading"
      :has-data="hasData"
      error-title="Could not load history"
      empty-title="No history yet"
      :empty-description="emptyDescription"
      empty-icon="i-lucide-history"
      skeleton="list"
      loading-label="Loading history"
      compact
      @retry="refetch()"
    >
      <UTimeline :items="items" color="neutral" size="sm">
        <template #date="{ item }">
          <AppTimestamp :value="item.event.occurred_at" fallback="Unknown time" />
        </template>
        <template #title="{ item }">
          <div class="flex flex-wrap items-center gap-2">
            <span class="break-words">{{ item.view.title }}</span>
            <UBadge :color="badgeColor(DEFINITION_STATUS_COLOR, item.event.status)" variant="subtle" size="sm">
              {{ statusLabel(item.event.status) }}
            </UBadge>
          </div>
        </template>
        <template #description="{ item }">
          <div class="space-y-2" data-testid="definition-history-event">
            <p class="text-xs">
              By
              <AppUserLabel v-if="item.event.actor_user_id" :user-id="item.event.actor_user_id" />
              <span v-else class="text-default">the system</span>
              <template v-if="item.event.event_source">
                · <span class="font-mono">{{ item.event.event_source }}</span>
              </template>
            </p>
            <ul v-if="item.view.changes.length" class="space-y-1 text-sm" data-testid="definition-history-changes">
              <li v-for="(change, index) in item.view.changes" :key="`${item.value}-change-${index}`" class="break-words">
                <template v-if="change.from === undefined && change.to === undefined">
                  <span class="font-medium text-default">{{ change.label }}</span> changed
                </template>
                <template v-else>
                  <span class="font-medium text-default">{{ change.label }}:</span>
                  {{ change.from !== undefined && change.to !== undefined ? `${change.from} → ${change.to}` : (change.to ?? change.from) }}
                </template>
              </li>
            </ul>
            <div v-if="item.view.permissions.length" class="space-y-1" data-testid="definition-history-permissions">
              <p class="text-xs">
                Permissions
              </p>
              <AppPermissionList :names="item.view.permissions" />
            </div>
            <div v-if="item.view.added.length" class="space-y-1" data-testid="definition-history-added">
              <p class="text-xs">
                Added
              </p>
              <AppPermissionList :names="item.view.added" />
            </div>
            <div v-if="item.view.removed.length" class="space-y-1" data-testid="definition-history-removed">
              <p class="text-xs">
                Removed
              </p>
              <AppPermissionList :names="item.view.removed" />
            </div>
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
