<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { breakpointsTailwind, createReusableTemplate, useBreakpoints } from '@vueuse/core'
import type { Role } from '~/types/role'
import { DEFINITION_STATUS_COLOR, badgeColor, originLabel, statusLabel } from '~/utils/status'
import { hideBelowMd, hideBelowSm, srOnlyHeader } from '~/utils/table'
import { roleDefinedAt, roleScopeLabel, roleTypeBadge } from '~/utils/role-definitions'

// Roles vertical — logic in useRolesWorkspace (list) and useRoleActions (row actions, dialogs);
// this file is display only.
const {
  canRead,
  canCreate,
  isEnterprise,
  holds,
  menuItems,
  formOpen,
  formTarget,
  openCreate,
  archive,
  search,
  typeFilter,
  typeItems,
  orgFilter,
  orgItems,
  showOrgFilter,
  originFilter,
  originItems,
  activeFilterCount,
  rows,
  total,
  page,
  pageSize,
  status,
  error,
  fetching,
  retry,
  catalogIncomplete,
  emptyState
} = useRolesWorkspace()

// --- Pure display config ---
// Below `sm` the status moves under the name and Type, Permissions and Origin are hidden; the
// actions column stays pinned on the right. Type is an EnterpriseRBAC concept (F-008).
const columns = computed<TableColumn<Role>[]>(() => [
  { id: 'role', header: 'Role' },
  ...(isEnterprise.value ? [{ id: 'type', header: 'Type', meta: hideBelowSm }] satisfies TableColumn<Role>[] : []),
  { id: 'permissions', header: 'Permissions', meta: hideBelowMd },
  { id: 'origin', header: 'Origin', meta: hideBelowMd },
  { id: 'status', header: 'Status', meta: hideBelowSm },
  { id: 'actions', header: srOnlyHeader('Actions') }
])
const columnPinning = { left: [], right: ['actions'] }

const statusColor = (role: Role) => badgeColor(DEFINITION_STATUS_COLOR, role.status)

// Below `sm` the filters move behind a Filters button, so the toolbar never scrolls sideways.
const compactFilters = useBreakpoints(breakpointsTailwind).smaller('sm')
const [DefineFilters, ReuseFilters] = createReusableTemplate<{ stacked: boolean }>()

function openCreated(role: Role) {
  void navigateTo(`/app/roles/${role.id}`)
}
</script>

<template>
  <UDashboardPanel id="roles">
    <template #header>
      <UDashboardNavbar title="Roles">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            v-if="canCreate"
            icon="i-lucide-plus"
            label="Add role"
            @click="openCreate"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar v-if="canRead">
        <template #left>
          <DefineFilters v-slot="{ stacked }">
            <template v-if="isEnterprise">
              <UFormField v-if="stacked" label="Type">
                <USelect
                  id="role-type-filter"
                  v-model="typeFilter"
                  :items="typeItems"
                  value-key="value"
                  class="w-full"
                />
              </UFormField>
              <USelect
                v-else
                id="role-type-filter"
                v-model="typeFilter"
                :items="typeItems"
                value-key="value"
                class="w-52"
                aria-label="Filter by type"
              />
            </template>
            <template v-if="showOrgFilter">
              <UFormField v-if="stacked" label="Organization">
                <USelectMenu
                  id="role-org-filter"
                  v-model="orgFilter"
                  aria-label="Organization"
                  :items="orgItems"
                  value-key="value"
                  class="w-full"
                />
              </UFormField>
              <USelectMenu
                v-else
                id="role-org-filter"
                v-model="orgFilter"
                :items="orgItems"
                value-key="value"
                class="w-48"
                aria-label="Filter by organization"
              />
            </template>
            <UFormField v-if="stacked" label="Origin">
              <USelect
                id="role-origin-filter"
                v-model="originFilter"
                :items="originItems"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <USelect
              v-else
              id="role-origin-filter"
              v-model="originFilter"
              :items="originItems"
              value-key="value"
              class="w-36"
              aria-label="Filter by origin"
            />
          </DefineFilters>

          <div class="flex w-full flex-wrap items-center gap-2 py-2">
            <UInput
              v-model="search"
              type="search"
              icon="i-lucide-search"
              placeholder="Search roles..."
              aria-label="Search roles"
              class="min-w-0 flex-1 sm:w-64 sm:flex-none"
            />
            <UPopover v-if="compactFilters">
              <UChip :text="activeFilterCount" :show="activeFilterCount > 0" size="3xl">
                <UButton
                  icon="i-lucide-sliders-horizontal"
                  color="neutral"
                  variant="outline"
                  label="Filters"
                />
              </UChip>
              <template #content>
                <div class="flex w-72 flex-col gap-3 p-4">
                  <ReuseFilters :stacked="true" />
                </div>
              </template>
            </UPopover>
            <ReuseFilters v-else :stacked="false" />
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <AppPermissionGate section="roles">
        <UAlert
          v-if="catalogIncomplete"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="The origin filter covers part of the roles"
          description="This server has more roles than the console could load for filtering. Search or filter by type to narrow the list."
          class="mb-4"
        />
        <AppQueryState
          :status="status"
          :error="error"
          :enabled="canRead"
          :empty="total === 0"
          :refreshing="fetching"
          error-title="Could not load roles"
          :empty-title="emptyState.title"
          :empty-description="emptyState.description"
          empty-icon="i-lucide-shield"
          :empty-actions="emptyState.actions"
          skeleton="table"
          :skeleton-rows="8"
          :skeleton-columns="5"
          loading-label="Loading roles"
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
              <template #role-cell="{ row }">
                <div class="flex flex-col gap-1 whitespace-normal">
                  <div class="flex flex-wrap items-center gap-2">
                    <ULink :to="`/app/roles/${row.original.id}`" class="font-medium text-highlighted hover:underline">
                      {{ row.original.display_name }}
                    </ULink>
                    <UBadge
                      v-if="holds(row.original.id)"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      label="You hold this role"
                    />
                  </div>
                  <span class="font-mono text-xs text-muted">{{ row.original.name }}</span>
                  <!-- Phones: the type and status under the name -->
                  <div class="flex flex-wrap items-center gap-1 sm:hidden">
                    <UBadge v-if="isEnterprise" v-bind="roleTypeBadge(row.original)" size="sm" />
                    <UBadge :color="statusColor(row.original)" variant="subtle" size="sm">
                      {{ statusLabel(row.original.status) }}
                    </UBadge>
                  </div>
                </div>
              </template>
              <template #type-cell="{ row }">
                <div class="flex flex-col items-start gap-1 whitespace-normal">
                  <UBadge v-bind="roleTypeBadge(row.original)" />
                  <span v-if="roleDefinedAt(row.original)" class="text-sm text-default">{{ roleDefinedAt(row.original) }}</span>
                  <span v-if="roleScopeLabel(row.original)" class="text-xs text-muted">{{ roleScopeLabel(row.original) }}</span>
                </div>
              </template>
              <template #permissions-cell="{ row }">
                <span class="text-sm">{{ row.original.permissions.length }}</span>
              </template>
              <template #origin-cell="{ row }">
                <UBadge color="neutral" :variant="row.original.is_system_role ? 'subtle' : 'outline'">
                  {{ originLabel(row.original.is_system_role) }}
                </UBadge>
              </template>
              <template #status-cell="{ row }">
                <UBadge :color="statusColor(row.original)" variant="subtle">
                  {{ statusLabel(row.original.status) }}
                </UBadge>
              </template>
              <template #actions-cell="{ row }">
                <div class="text-right">
                  <UDropdownMenu :items="menuItems(row.original, { view: true })">
                    <UButton
                      icon="i-lucide-ellipsis-vertical"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      :aria-label="`Role actions for ${row.original.display_name}`"
                    />
                  </UDropdownMenu>
                </div>
              </template>
            </UTable>
            <AppListPagination
              v-model:page="page"
              :total="total"
              :page-size="pageSize"
              noun="role"
            />
          </div>
        </AppQueryState>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>

  <AppRoleFormDialog v-model:open="formOpen" :target="formTarget" @created="openCreated" />
  <AppConfirmDialog v-model:open="archive.open" v-bind="archive.dialog" @confirm="archive.confirm" />
</template>
