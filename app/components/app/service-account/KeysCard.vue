<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { ApiKey, IntegrationPrincipal } from '~/types/api-key'
import { expiresSoon } from '~/utils/api-keys'
import { hideBelowMd, hideBelowSm, srOnlyHeader } from '~/utils/table'

// A service account's keys (display only; logic in useServiceAccountKeys).
const props = defineProps<{ account: IntegrationPrincipal }>()
const account = computed(() => props.account)

const {
  canCreateKey,
  noScopes,
  keys,
  total,
  page,
  pageSize,
  status,
  error,
  isLoading,
  hasData,
  refetch,
  includeTerminal,
  hiddenTerminal,
  empty,
  incomplete,
  rowMenu,
  revealed,
  dialogOpen,
  editTarget,
  openCreate,
  onCreated,
  detailOpen,
  detailKey,
  detailActions,
  openDetail,
  onDetailAction,
  rotate,
  revoke,
  changeStatus
} = useServiceAccountKeys(account)

// On a phone the prefix, status and expiry move under the name; the row menu stays pinned.
const columns: TableColumn<ApiKey>[] = [
  { id: 'key', header: 'Key' },
  { id: 'status', header: 'Status', meta: hideBelowSm },
  { id: 'scopes', header: 'Scopes', meta: hideBelowMd },
  { id: 'expires', header: 'Expires', meta: hideBelowSm },
  { id: 'last-used', header: 'Last used', meta: hideBelowMd },
  { id: 'actions', header: srOnlyHeader('Actions') }
]
const columnPinning = { left: [], right: ['actions'] }
const now = useRelativeNow()
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <h2 class="font-semibold text-highlighted">
            Keys
          </h2>
          <span v-if="status === 'success'" class="text-sm text-muted">{{ total }}</span>
        </div>
        <UButton
          v-if="canCreateKey"
          icon="i-lucide-plus"
          label="New key"
          size="sm"
          :disabled="noScopes"
          @click="openCreate"
        />
      </div>
      <p class="mt-1 text-sm text-muted">
        Keys act as this service account. Secrets are shown once, when a key is created or rotated.
      </p>
    </template>

    <div class="space-y-4">
      <UAlert
        v-if="canCreateKey && noScopes"
        color="neutral"
        variant="subtle"
        icon="i-lucide-info"
        title="No scopes to grant"
        description="This service account's roles and direct scopes grant nothing a key may use. Give it a role or a direct scope first."
      />
      <UCheckbox
        v-model="includeTerminal"
        :label="hiddenTerminal ? `Include revoked and expired (${hiddenTerminal})` : 'Include revoked and expired'"
      />
      <AppQueryState
        :status="status"
        :error="error"
        :empty="total === 0"
        :refreshing="isLoading"
        :has-data="hasData"
        error-title="Could not load keys"
        :empty-title="empty.title"
        :empty-description="empty.description"
        empty-icon="i-lucide-key-round"
        skeleton="table"
        loading-label="Loading keys"
        compact
        @retry="refetch()"
      >
        <div class="space-y-3">
          <UAlert
            v-if="incomplete"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            title="Not every key could be loaded"
            description="This service account has more keys than the console reads at once."
          />
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
                  <span class="text-xs text-muted">Expires <AppTimestamp :value="row.original.expires_at" fallback="never" /></span>
                </div>
              </div>
            </template>
            <template #status-cell="{ row }">
              <AppApiKeyStatus :api-key="row.original" />
            </template>
            <template #scopes-cell="{ row }">
              <AppApiKeyScopes :scopes="row.original.scopes" :key-name="row.original.name" />
            </template>
            <template #expires-cell="{ row }">
              <span class="inline-flex items-center gap-1">
                <AppTimestamp :value="row.original.expires_at" fallback="Never" />
                <UBadge
                  v-if="expiresSoon(row.original, now.getTime())"
                  color="warning"
                  variant="outline"
                  size="sm"
                  label="Soon"
                />
              </span>
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
                    :aria-label="`Key actions for ${row.original.name}`"
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
        </div>
      </AppQueryState>
    </div>
  </UCard>

  <AppServiceAccountKeyDialog
    v-model:open="dialogOpen"
    :account="account"
    :target="editTarget"
    @created="onCreated"
  />
  <AppApiKeyDetail
    v-model:open="detailOpen"
    :api-key="detailKey"
    :owner="account.name"
    :actions="detailActions"
    @action="onDetailAction"
  />
  <AppSecretReveal v-model:secret="revealed" />
  <AppConfirmDialog v-model:open="rotate.open" v-bind="rotate.dialog" @confirm="rotate.confirm" />
  <AppConfirmDialog v-model:open="revoke.open" v-bind="revoke.dialog" @confirm="revoke.confirm" />
  <AppConfirmDialog v-model:open="changeStatus.open" v-bind="changeStatus.dialog" @confirm="changeStatus.confirm" />
</template>
