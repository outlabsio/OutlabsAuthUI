<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import type { ApiKey, IntegrationPrincipal } from '~/types/api-key'
import { DEFINITION_STATUS_COLOR, badgeColor } from '~/utils/status'
import { hideBelowMd, hideBelowSm, srOnlyHeader } from '~/utils/table'
import { serviceAccountAccessSummary, serviceAccountPath, serviceAccountStatusLabel } from '~/utils/service-accounts'

// Service accounts — logic in useServiceAccountsWorkspace (scope, list, key inventory) and
// useServiceAccountActions (row actions, dialogs); this file is display only.
const {
  canRead,
  isEnterprise,
  platformAllowed,
  scope,
  scopeKind,
  scopeItems,
  entityId,
  entityPickerBlocked,
  anchoredRootId,
  anchorLabel,
  anchorInactive,
  view,
  viewTabs,
  inventoryAvailable,
  search,
  statusFilter,
  statusItems,
  rows,
  total,
  page,
  pageSize,
  status,
  error,
  fetching,
  retry,
  emptyState,
  canCreateHere,
  openCreateHere,
  openCreated,
  menuItems,
  formOpen,
  formTarget,
  lifecycle,
  inventory,
  guideOpen
} = useServiceAccountsWorkspace()

// --- Pure display config ---
// Below `sm` the status moves under the name and Access and Created are hidden; the actions
// column stays pinned on the right.
const columns: TableColumn<IntegrationPrincipal>[] = [
  { id: 'account', header: 'Service account' },
  { id: 'access', header: 'Access', meta: hideBelowMd },
  { id: 'status', header: 'Status', meta: hideBelowSm },
  { id: 'created', header: 'Created', meta: hideBelowMd },
  { id: 'actions', header: srOnlyHeader('Actions') }
]
const keyColumns: TableColumn<ApiKey>[] = [
  { id: 'key', header: 'Key' },
  { id: 'kind', header: 'Kind', meta: hideBelowSm },
  { id: 'owner', header: 'Owner', meta: hideBelowMd },
  { id: 'status', header: 'Status', meta: hideBelowSm },
  { id: 'expires', header: 'Expires', meta: hideBelowMd },
  { id: 'last-used', header: 'Last used', meta: hideBelowMd },
  { id: 'actions', header: srOnlyHeader('Actions') }
]
const columnPinning = { left: [], right: ['actions'] }
const statusColor = (account: IntegrationPrincipal) => badgeColor(DEFINITION_STATUS_COLOR, account.status)
const kindLabel = (key: ApiKey) => (key.key_kind === 'system_integration' ? 'Service account' : 'Personal')

// At phone width the primary action keeps only its icon, so the title stays readable (F-129).
const compact = useBreakpoints(breakpointsTailwind).smaller('sm')
</script>

<template>
  <UDashboardPanel id="service-accounts">
    <template #header>
      <UDashboardNavbar title="Service accounts">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <!-- Denied: the lock state alone, no guide to a section the viewer cannot use. -->
          <UTooltip v-if="canRead" text="About service accounts">
            <UButton
              icon="i-lucide-book-open"
              color="neutral"
              variant="ghost"
              aria-label="About service accounts"
              @click="guideOpen = true"
            />
          </UTooltip>
          <UTooltip v-if="canCreateHere && view === 'accounts'" text="New service account" :disabled="!compact">
            <UButton
              icon="i-lucide-plus"
              :label="compact ? undefined : 'New service account'"
              aria-label="New service account"
              @click="openCreateHere"
            />
          </UTooltip>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar v-if="canRead && inventoryAvailable">
        <!-- `-mx-1` aligns the first tab with the navbar, as in the dashboard template. -->
        <UNavigationMenu
          :items="viewTabs"
          highlight
          class="-mx-1 flex-1"
          aria-label="Service account views"
        />
      </UDashboardToolbar>

      <UDashboardToolbar v-if="canRead">
        <div class="flex w-full flex-wrap items-center gap-2 py-2">
          <template v-if="isEnterprise">
            <USelect
              v-if="platformAllowed"
              id="service-account-scope"
              v-model="scopeKind"
              :items="scopeItems"
              value-key="value"
              aria-label="Scope"
              class="w-full sm:w-40"
            />
            <div v-if="scopeKind === 'entity'" class="w-full sm:w-72">
              <AppEntityPicker
                id="service-account-entity"
                v-model="entityId"
                :root-id="anchoredRootId"
                :disabled="entityPickerBlocked"
                include-inactive
                aria-label="Entity"
                placeholder="Choose an entity"
                class="w-full"
              />
            </div>
          </template>
          <template v-if="scope && view === 'accounts'">
            <UInput
              v-model="search"
              type="search"
              icon="i-lucide-search"
              placeholder="Search service accounts..."
              aria-label="Search service accounts"
              class="min-w-0 flex-1 sm:w-64 sm:flex-none"
            />
            <USelect
              id="service-account-status"
              v-model="statusFilter"
              :items="statusItems"
              value-key="value"
              aria-label="Filter by status"
              class="w-36"
            />
          </template>
          <template v-else-if="scope && view === 'inventory'">
            <UInput
              v-model="inventory.search"
              type="search"
              icon="i-lucide-search"
              placeholder="Search keys..."
              aria-label="Search keys"
              class="w-full sm:w-56"
            />
            <!-- Wide enough for "Active (includes expired)"; full rows on phones. -->
            <USelect
              id="inventory-kind"
              v-model="inventory.kind"
              :items="inventory.kindItems"
              value-key="value"
              aria-label="Filter by kind"
              class="w-full sm:w-40"
            />
            <USelect
              id="inventory-status"
              v-model="inventory.kstatus"
              :items="inventory.statusItems"
              value-key="value"
              aria-label="Filter by status"
              class="w-full sm:w-56"
            />
          </template>
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <AppPermissionGate section="service-accounts">
        <UEmpty
          v-if="entityPickerBlocked"
          icon="i-lucide-building-2"
          title="No organization"
          description="Your account belongs to no organization, so there is no entity whose service accounts you can manage."
          class="mx-auto w-full max-w-3xl"
        />
        <UEmpty
          v-else-if="!scope"
          icon="i-lucide-building-2"
          title="Choose an entity"
          description="Service accounts anchored at an entity are listed per entity. Choose one above."
          class="mx-auto w-full max-w-3xl"
        />

        <!-- Key inventory -->
        <div v-else-if="view === 'inventory'" class="space-y-4">
          <p class="text-sm text-muted">
            Every key anchored at {{ anchorLabel ?? 'this entity' }}: personal keys and service-account keys. Keys of child entities are not listed.
          </p>
          <AppQueryState
            :status="inventory.status"
            :error="inventory.error"
            :empty="inventory.total === 0"
            :refreshing="inventory.fetching"
            error-title="Could not load the key inventory"
            :empty-title="inventory.emptyState.title"
            :empty-description="inventory.emptyState.description"
            empty-icon="i-lucide-key-round"
            :empty-actions="inventory.emptyState.actions"
            skeleton="table"
            :skeleton-rows="6"
            :skeleton-columns="5"
            loading-label="Loading keys"
            @retry="inventory.retry"
          >
            <div class="space-y-4">
              <UTable
                :data="inventory.rows"
                :columns="keyColumns"
                :column-pinning="columnPinning"
                :loading="inventory.fetching"
                sticky="header"
              >
                <template #key-cell="{ row }">
                  <div class="min-w-0 whitespace-normal">
                    <ULink
                      class="block break-words text-left font-medium text-highlighted hover:underline"
                      :aria-label="`View key ${row.original.name}`"
                      @click="inventory.openDetail(row.original)"
                    >
                      {{ row.original.name }}
                    </ULink>
                    <p class="font-mono text-xs text-muted">
                      {{ row.original.prefix }}
                    </p>
                    <div class="mt-1 flex flex-wrap items-center gap-1 sm:hidden">
                      <UBadge
                        color="neutral"
                        variant="outline"
                        size="sm"
                        :label="kindLabel(row.original)"
                      />
                      <AppApiKeyStatus :api-key="row.original" size="sm" />
                    </div>
                    <!-- Below md: whose key it is, under the name (the Owner column is hidden) -->
                    <p class="mt-1 text-sm text-muted md:hidden" data-testid="key-owner-line">
                      Owner: <AppApiKeyOwner :api-key="row.original" :entity-id="entityId" />
                    </p>
                  </div>
                </template>
                <template #kind-cell="{ row }">
                  <UBadge color="neutral" variant="outline" :label="kindLabel(row.original)" />
                </template>
                <template #owner-cell="{ row }">
                  <div class="min-w-0 whitespace-normal">
                    <AppApiKeyOwner :api-key="row.original" :entity-id="entityId" />
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
                  <div v-if="inventory.rowMenu(row.original).length" class="text-right">
                    <UDropdownMenu :items="inventory.rowMenu(row.original)">
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
                v-model:page="inventory.page"
                :total="inventory.total"
                :page-size="inventory.pageSize"
                noun="key"
              />
            </div>
          </AppQueryState>
        </div>

        <!-- Service accounts -->
        <div v-else class="space-y-4">
          <UAlert
            v-if="anchorInactive"
            color="warning"
            variant="subtle"
            icon="i-lucide-circle-pause"
            title="This entity is inactive"
            description="Its service accounts' keys are refused while it is inactive, and no new service account can be anchored here."
          />
          <AppQueryState
            :status="status"
            :error="error"
            :empty="total === 0"
            :refreshing="fetching"
            error-title="Could not load service accounts"
            :empty-title="emptyState.title"
            :empty-description="emptyState.description"
            empty-icon="i-lucide-server-cog"
            :empty-actions="emptyState.actions"
            skeleton="table"
            :skeleton-rows="6"
            :skeleton-columns="4"
            loading-label="Loading service accounts"
            @retry="retry"
          >
            <div class="space-y-4">
              <UTable
                :data="rows"
                :columns="columns"
                :column-pinning="columnPinning"
                :loading="fetching"
                sticky="header"
              >
                <template #account-cell="{ row }">
                  <div class="flex min-w-0 flex-col gap-1 whitespace-normal">
                    <ULink :to="serviceAccountPath(row.original)" class="break-words font-medium text-highlighted hover:underline">
                      {{ row.original.name }}
                    </ULink>
                    <span v-if="row.original.description" class="break-words text-xs text-muted">{{ row.original.description }}</span>
                    <!-- Phones: the status and access under the name -->
                    <div class="flex flex-wrap items-center gap-1 sm:hidden">
                      <UBadge :color="statusColor(row.original)" variant="subtle" size="sm">
                        {{ serviceAccountStatusLabel(row.original.status) }}
                      </UBadge>
                      <span class="text-xs text-muted">{{ serviceAccountAccessSummary(row.original) }}</span>
                    </div>
                  </div>
                </template>
                <template #access-cell="{ row }">
                  <div class="flex flex-col gap-0.5 whitespace-normal">
                    <span class="text-sm">{{ serviceAccountAccessSummary(row.original) }}</span>
                    <span v-if="row.original.scope_kind === 'entity' && row.original.inherit_from_tree" class="text-xs text-muted">Includes child entities</span>
                  </div>
                </template>
                <template #status-cell="{ row }">
                  <UBadge :color="statusColor(row.original)" variant="subtle">
                    {{ serviceAccountStatusLabel(row.original.status) }}
                  </UBadge>
                </template>
                <template #created-cell="{ row }">
                  <AppTimestamp :value="row.original.created_at" />
                </template>
                <template #actions-cell="{ row }">
                  <div class="text-right">
                    <UDropdownMenu :items="menuItems(row.original, { view: true })">
                      <UButton
                        icon="i-lucide-ellipsis-vertical"
                        color="neutral"
                        variant="ghost"
                        size="sm"
                        :aria-label="`Service account actions for ${row.original.name}`"
                      />
                    </UDropdownMenu>
                  </div>
                </template>
              </UTable>
              <AppListPagination
                v-model:page="page"
                :total="total"
                :page-size="pageSize"
                noun="service account"
              />
            </div>
          </AppQueryState>
        </div>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>

  <AppServiceAccountFormDialog
    v-if="formTarget"
    v-model:open="formOpen"
    :target="formTarget"
    @created="openCreated"
  />
  <AppConfirmDialog v-model:open="lifecycle.open" v-bind="lifecycle.dialog" @confirm="lifecycle.confirm" />
  <AppConfirmDialog v-model:open="inventory.revoke.open" v-bind="inventory.revoke.dialog" @confirm="inventory.revoke.confirm" />
  <AppApiKeyDetail
    v-model:open="inventory.detailOpen"
    :api-key="inventory.detailKey"
    :actions="inventory.detailActions"
    @action="inventory.onDetailAction"
  >
    <template #owner>
      <AppApiKeyOwner v-if="inventory.detailKey" :api-key="inventory.detailKey" :entity-id="entityId" />
    </template>
  </AppApiKeyDetail>

  <USlideover v-model:open="guideOpen" title="About service accounts">
    <template #body>
      <div class="space-y-4 text-sm text-muted">
        <p>A service account is a non-human identity for an integration. Its keys act as the account, never as a person, and every change is audited.</p>
        <ul class="list-disc space-y-1.5 pl-5">
          <li>Give it <span class="text-default">roles</span>: its keys can do at most what they grant. Direct scopes are for narrow cases.</li>
          <li>Open it and create <span class="text-default">keys</span>. Each secret is shown once; rotate a key to get a new one.</li>
          <li><span class="text-default">Deactivate</span> or <span class="text-default">archive</span> it to revoke every key it owns at once.</li>
        </ul>
        <p v-if="isEnterprise">
          Platform-wide accounts are managed by superusers. Accounts anchored at an entity are managed by its admins; the <span class="text-default">Key inventory</span> lists every key anchored at the entity, personal ones included, for incident response.
        </p>
      </div>
    </template>
  </USlideover>
</template>
