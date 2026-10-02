<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { createPermissionSchema } from '~/schemas/permission'
import type { Permission } from '~/types/permission'
import { DEFINITION_STATUS_COLOR, originLabel, statusLabel } from '~/utils/status'
import { hideBelowMd, hideBelowSm, srOnlyHeader } from '~/utils/table'

// Permissions vertical — logic in usePermissionsWorkspace; this file is display only.
const {
  canRead,
  canCreate,
  search,
  resourceFilter,
  originFilter,
  resourceItems,
  resourceOptionsLoading,
  onResourceFilterOpen,
  originItems,
  rows,
  total,
  page,
  pageSize,
  status,
  error,
  fetching,
  retry,
  catalogIncomplete,
  emptyState,
  menuItems,
  editOpen,
  editTarget,
  createOpen,
  createState,
  createError,
  namePreview,
  openCreate,
  onCreate,
  archivePermission
} = usePermissionsWorkspace()

// --- Pure display config ---
// Below `sm` the name moves under the display name and resource/origin are hidden.
const columns: TableColumn<Permission>[] = [
  { accessorKey: 'display_name', header: 'Display name' },
  { accessorKey: 'name', header: 'Name', meta: hideBelowSm },
  { accessorKey: 'resource', header: 'Resource', meta: hideBelowMd },
  { accessorKey: 'is_system', header: 'Origin', meta: hideBelowSm },
  { accessorKey: 'status', header: 'Status' },
  { id: 'actions', header: srOnlyHeader('Actions') }
]
const columnPinning = { left: [], right: ['actions'] }
</script>

<template>
  <UDashboardPanel id="permissions">
    <template #header>
      <UDashboardNavbar title="Permissions">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            v-if="canCreate"
            icon="i-lucide-plus"
            label="Create permission"
            @click="openCreate"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar v-if="canRead">
        <template #left>
          <div class="flex flex-wrap items-center gap-2 py-2">
            <UInput
              v-model="search"
              type="search"
              icon="i-lucide-search"
              placeholder="Search permissions..."
              aria-label="Search permissions"
              class="w-full sm:w-64"
            />
            <USelect
              id="permission-resource-filter"
              v-model="resourceFilter"
              :items="resourceItems"
              :loading="resourceOptionsLoading"
              value-key="value"
              class="w-40"
              aria-label="Filter by resource"
              @update:open="onResourceFilterOpen"
            />
            <USelect
              id="permission-origin-filter"
              v-model="originFilter"
              :items="originItems"
              value-key="value"
              class="w-36"
              aria-label="Filter by origin"
            />
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <AppPermissionGate section="permissions">
        <UAlert
          v-if="catalogIncomplete"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Search covers part of the catalogue"
          description="This server has more permissions than the console could load for searching. Filter by resource to narrow the list."
          class="mb-4"
        />
        <AppQueryState
          :status="status"
          :error="error"
          :enabled="canRead"
          :empty="total === 0"
          :refreshing="fetching"
          error-title="Could not load permissions"
          :empty-title="emptyState.title"
          :empty-description="emptyState.description"
          empty-icon="i-lucide-key-square"
          :empty-actions="emptyState.actions"
          skeleton="table"
          :skeleton-rows="8"
          :skeleton-columns="5"
          loading-label="Loading permissions"
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
              <template #display_name-cell="{ row }">
                <ULink :to="`/app/permissions/${row.original.id}`" class="font-medium text-highlighted hover:underline">
                  {{ row.original.display_name }}
                </ULink>
                <p class="font-mono text-xs text-muted sm:hidden">
                  {{ row.original.name }}
                </p>
              </template>
              <template #name-cell="{ row }">
                <span class="font-mono text-sm">{{ row.original.name }}</span>
              </template>
              <template #is_system-cell="{ row }">
                <UBadge color="neutral" :variant="row.original.is_system ? 'subtle' : 'outline'">
                  {{ originLabel(row.original.is_system) }}
                </UBadge>
              </template>
              <template #status-cell="{ row }">
                <UBadge :color="DEFINITION_STATUS_COLOR[row.original.status] ?? 'neutral'" variant="subtle">
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
                      :aria-label="`Permission actions for ${row.original.name}`"
                    />
                  </UDropdownMenu>
                </div>
              </template>
            </UTable>
            <AppListPagination
              v-model:page="page"
              :total="total"
              :page-size="pageSize"
              noun="permission"
            />
          </div>
        </AppQueryState>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>

  <!-- Create: the reference AppFormDialog (ARCHITECTURE.md, "Forms and dialogs") -->
  <AppFormDialog
    ref="createDialog"
    v-model:open="createOpen"
    title="Create permission"
    description="Custom permissions can be added to roles like the built-in ones."
    :schema="createPermissionSchema"
    :state="createState"
    :error="createError"
    submit-label="Create permission"
    @submit="onCreate"
  >
    <UFormField name="display_name" label="Display name" required>
      <UInput v-model="createState.display_name" class="w-full" placeholder="Create lead" />
    </UFormField>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <UFormField name="resource" label="Resource" required>
        <UInput v-model="createState.resource" class="w-full" placeholder="lead" />
      </UFormField>
      <UFormField name="action" label="Action" required>
        <UInput v-model="createState.action" class="w-full" placeholder="create" />
      </UFormField>
    </div>
    <p class="text-sm text-muted">
      Permission name: <span class="font-medium text-highlighted">{{ namePreview }}</span>
    </p>
    <UFormField name="description" label="Description" hint="Optional">
      <UTextarea
        v-model="createState.description"
        class="w-full"
        :rows="2"
        autoresize
      />
    </UFormField>
    <UFormField
      name="tags"
      label="Tags"
      hint="Optional"
      help="Press Enter after each tag."
    >
      <UInputTags
        v-model="createState.tags"
        placeholder="Add a tag"
        add-on-blur
        add-on-paste
        class="w-full"
      />
    </UFormField>
    <UFormField
      name="is_active"
      label="Active"
      description="Inactive permissions can't be granted."
    >
      <USwitch v-model="createState.is_active" />
    </UFormField>
  </AppFormDialog>

  <!-- Edit (custom permissions) -->
  <AppPermissionEditDialog v-model:open="editOpen" :permission="editTarget" />

  <!-- Archive -->
  <AppConfirmDialog v-model:open="archivePermission.open" v-bind="archivePermission.dialog" @confirm="archivePermission.confirm" />
</template>
