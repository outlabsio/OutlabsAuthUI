<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { ApiKey } from '~/types/api-key'
import type { User } from '~/types/user'
import { hideBelowMd, hideBelowSm, srOnlyHeader } from '~/utils/table'

// The user detail's Personal API keys card (display only; logic in useUserApiKeysCard).
const props = defineProps<{ user: User }>()
const user = computed(() => props.user)

const {
  keys,
  total,
  page,
  pageSize,
  empty,
  includeTerminal,
  hiddenTerminal,
  status,
  error,
  isLoading,
  hasData,
  refetch,
  rowMenu,
  revoke,
  detailOpen,
  detailKey,
  detailActions,
  openDetail,
  onDetailAction
} = useUserApiKeysCard(user)

// On a phone the prefix, status and last use move under the name, and the row menu stays pinned
// on screen (the table fits its card at 390px).
const columns: TableColumn<ApiKey>[] = [
  { id: 'key', header: 'Key' },
  { id: 'status', header: 'Status', meta: hideBelowSm },
  { id: 'expires', header: 'Expires', meta: hideBelowMd },
  { id: 'last-used', header: 'Last used', meta: hideBelowSm },
  { id: 'actions', header: srOnlyHeader('Actions') }
]
const columnPinning = { left: [], right: ['actions'] }
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <h2 class="font-semibold text-highlighted">
          Personal API keys
        </h2>
        <span v-if="status === 'success'" class="text-sm text-muted">{{ total }}</span>
      </div>
      <p class="mt-1 text-sm text-muted">
        Metadata only. Plaintext API-key secrets cannot be retrieved.
      </p>
    </template>
    <div class="space-y-4">
      <UCheckbox
        v-model="includeTerminal"
        :label="hiddenTerminal ? `Include revoked and expired (${hiddenTerminal})` : 'Include revoked and expired'"
      />
      <AppQueryState
        :status="status"
        :error="error"
        :empty="!keys.length"
        :refreshing="isLoading"
        :has-data="hasData"
        error-title="Could not load personal API keys"
        :empty-title="empty.title"
        :empty-description="empty.description"
        empty-icon="i-lucide-key-round"
        skeleton="table"
        loading-label="Loading personal API keys"
        compact
        @retry="refetch()"
      >
        <UTable
          :data="keys"
          :columns="columns"
          :column-pinning="columnPinning"
          :loading="isLoading"
        >
          <template #key-cell="{ row }">
            <div class="min-w-0 whitespace-normal">
              <ULink
                class="block break-words text-left font-medium text-highlighted hover:underline"
                :aria-label="`View key ${row.original.name}`"
                @click="openDetail(row.original)"
              >
                {{ row.original.name }}
              </ULink>
              <p class="font-mono text-xs text-muted">
                {{ row.original.prefix }}
              </p>
              <div class="mt-1 flex flex-wrap items-center gap-1 sm:hidden">
                <AppApiKeyStatus :api-key="row.original" size="sm" />
                <span class="text-xs text-muted">Used <AppTimestamp :value="row.original.last_used_at" fallback="never" /></span>
              </div>
            </div>
          </template>
          <template #status-cell="{ row }">
            <AppApiKeyStatus :api-key="row.original" />
          </template>
          <template #expires-cell="{ row }">
            <AppTimestamp :value="row.original.expires_at" fallback="Never" />
          </template>
          <template #last-used-cell="{ row }">
            <AppTimestamp :value="row.original.last_used_at" fallback="Never" />
          </template>
          <template #actions-cell="{ row }">
            <div v-if="rowMenu(row.original).length" class="text-right">
              <UDropdownMenu :items="rowMenu(row.original)">
                <UButton
                  icon="i-lucide-ellipsis-vertical"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  :aria-label="`Personal API key actions for ${row.original.name}`"
                />
              </UDropdownMenu>
            </div>
          </template>
        </UTable>
        <AppListPagination
          v-model:page="page"
          :total="total"
          :page-size="pageSize"
          noun="key"
        />
      </AppQueryState>
    </div>
  </UCard>

  <AppApiKeyDetail
    v-model:open="detailOpen"
    :api-key="detailKey"
    :owner="user.email"
    :actions="detailActions"
    @action="onDetailAction"
  />
  <AppConfirmDialog v-model:open="revoke.open" v-bind="revoke.dialog" @confirm="revoke.confirm" />
</template>
