<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import type { ApiKey } from '~/types/api-key'
import { expiresSoon } from '~/utils/api-keys'
import { hideBelowMd, hideBelowSm, srOnlyHeader } from '~/utils/table'

// My API keys — logic in useApiKeysWorkspace (list, detail, actions) and useApiKeyFormDialog
// (create, edit, replace); this file is display only.
const {
  canRead,
  search,
  statusFilter,
  statusItems,
  rows,
  total,
  page,
  pageSize,
  status,
  error,
  isLoading,
  hasData,
  refetch,
  emptyState,
  rowMenu,
  openDetail,
  detailOpen,
  detailKey,
  detailActions,
  detailRefreshing,
  detailError,
  onDetailAction,
  revealedSecret,
  formOpen,
  formTarget,
  openCreate,
  onCreated,
  rotateKey,
  revokeKey,
  changeKeyStatus
} = useApiKeysWorkspace()
const { isEnterprise } = useAuth()

// --- Pure display config ---
// Below `sm` the status and expiry move under the name; scopes, restriction, created and last
// used are hidden below `md`. The actions column stays pinned on the right.
const columns = computed<TableColumn<ApiKey>[]>(() => [
  { id: 'key', header: 'Key' },
  { id: 'status', header: 'Status', meta: hideBelowSm },
  { id: 'scopes', header: 'Scopes', meta: hideBelowMd },
  ...(isEnterprise.value ? [{ id: 'anchor', header: 'Restricted to', meta: hideBelowMd }] : []),
  { id: 'expires', header: 'Expires', meta: hideBelowSm },
  { id: 'created', header: 'Created', meta: hideBelowMd },
  { id: 'last-used', header: 'Last used', meta: hideBelowMd },
  { id: 'actions', header: srOnlyHeader('Actions') }
])
const columnPinning = { left: [], right: ['actions'] }
const now = useRelativeNow()

// At phone width the primary action keeps only its icon, so the title stays readable (F-129).
const compact = useBreakpoints(breakpointsTailwind).smaller('sm')
</script>

<template>
  <UDashboardPanel id="api-keys">
    <template #header>
      <UDashboardNavbar title="My API keys">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UTooltip v-if="canRead" text="Create API key" :disabled="!compact">
            <UButton
              icon="i-lucide-plus"
              :label="compact ? undefined : 'Create API key'"
              aria-label="Create API key"
              @click="openCreate"
            />
          </UTooltip>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar v-if="canRead">
        <div class="flex w-full flex-wrap items-center gap-2 py-2">
          <UInput
            v-model="search"
            type="search"
            icon="i-lucide-search"
            placeholder="Search keys..."
            aria-label="Search keys"
            class="min-w-0 flex-1 sm:w-64 sm:flex-none"
          />
          <USelect
            id="api-key-status-filter"
            v-model="statusFilter"
            :items="statusItems"
            value-key="value"
            aria-label="Filter by status"
            class="w-48"
          />
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <AppPermissionGate section="api-keys" label="personal API keys">
        <AppQueryState
          :status="status"
          :error="error"
          :empty="total === 0"
          :refreshing="isLoading"
          :has-data="hasData"
          error-title="Could not load API keys"
          :empty-title="emptyState.title"
          :empty-description="emptyState.description"
          empty-icon="i-lucide-key-round"
          :empty-actions="emptyState.actions"
          skeleton="table"
          :skeleton-rows="6"
          :skeleton-columns="5"
          loading-label="Loading API keys"
          @retry="refetch()"
        >
          <div class="space-y-4">
            <UTable
              :data="rows"
              :columns="columns"
              :column-pinning="columnPinning"
              :loading="isLoading"
              sticky="header"
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
              <template #anchor-cell="{ row }">
                <AppApiKeyAnchor :entity-id="row.original.entity_ids?.[0] ?? null" :inherit-from-tree="row.original.inherit_from_tree" />
              </template>
              <template #expires-cell="{ row }">
                <span class="inline-flex items-center gap-1">
                  <AppTimestamp :value="row.original.expires_at" fallback="Never" relative="always" />
                  <UBadge
                    v-if="expiresSoon(row.original, now.getTime())"
                    color="warning"
                    variant="outline"
                    size="sm"
                    label="Soon"
                  />
                </span>
              </template>
              <template #created-cell="{ row }">
                <AppTimestamp :value="row.original.created_at" />
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
                      :aria-label="`API key actions for ${row.original.name}`"
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
      </AppPermissionGate>
    </template>
  </UDashboardPanel>

  <AppApiKeyFormDialog v-model:open="formOpen" :target="formTarget" @created="onCreated" />
  <AppApiKeyDetail
    v-model:open="detailOpen"
    :api-key="detailKey"
    owner="You"
    :actions="detailActions"
    :refreshing="detailRefreshing"
    :refresh-error="detailError"
    @action="onDetailAction"
  />

  <!-- One-time secret -->
  <AppSecretReveal v-model:secret="revealedSecret" />

  <!-- Rotate / revoke / suspend or reactivate -->
  <AppConfirmDialog v-model:open="rotateKey.open" v-bind="rotateKey.dialog" @confirm="rotateKey.confirm" />
  <AppConfirmDialog v-model:open="revokeKey.open" v-bind="revokeKey.dialog" @confirm="revokeKey.confirm" />
  <AppConfirmDialog v-model:open="changeKeyStatus.open" v-bind="changeKeyStatus.dialog" @confirm="changeKeyStatus.confirm" />
</template>
