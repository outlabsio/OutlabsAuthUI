<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { createPermissionSchema } from '~/schemas/permission'
import type { Permission } from '~/types/permission'

// Permissions vertical — logic in usePermissionsWorkspace; this file is display only.
const {
  canCreate,
  search,
  rows,
  status,
  errorMessage,
  rowMenu,
  createOpen,
  createState,
  creating,
  onCreate,
  deleteOpen,
  deleteTarget,
  deleting,
  onConfirmDelete
} = usePermissionsWorkspace()

// --- Pure display config ---
const columns: TableColumn<Permission>[] = [
  { accessorKey: 'display_name', header: 'Display name' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'resource', header: 'Resource' },
  { accessorKey: 'is_system', header: 'Origin' },
  { accessorKey: 'status', header: 'Status' },
  { id: 'actions', header: '' }
]
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
            label="Add permission"
            @click="createOpen = true"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Search permissions..."
            class="w-64"
          />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <AppPermissionGate permission="permission:read">
        <UAlert
          v-if="status === 'error'"
          color="error"
          icon="i-lucide-triangle-alert"
          title="Could not load permissions"
          :description="errorMessage"
          class="mb-4"
        />

        <UTable :data="rows" :columns="columns" :loading="status === 'pending'">
          <template #display_name-cell="{ row }">
            <ULink :to="`/app/permissions/${row.original.id}`" class="font-medium text-highlighted hover:underline">
              {{ row.original.display_name }}
            </ULink>
          </template>
          <template #is_system-cell="{ row }">
            <UBadge :color="row.original.is_system ? 'neutral' : 'accent'" variant="subtle">
              {{ row.original.is_system ? 'System' : 'Custom' }}
            </UBadge>
          </template>
          <template #status-cell="{ row }">
            <UBadge :color="row.original.status === 'active' ? 'success' : 'neutral'" variant="subtle" class="capitalize">
              {{ row.original.status }}
            </UBadge>
          </template>
          <template #actions-cell="{ row }">
            <div class="text-right">
              <UDropdownMenu v-if="!row.original.is_system" :items="rowMenu(row.original)">
                <UButton
                  icon="i-lucide-ellipsis-vertical"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  aria-label="Permission actions"
                />
              </UDropdownMenu>
            </div>
          </template>
        </UTable>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>

  <UModal v-model:open="createOpen" title="Add permission">
    <template #body>
      <UForm
        :schema="createPermissionSchema"
        :state="createState"
        class="space-y-4"
        @submit="onCreate"
      >
        <UFormField name="display_name" label="Display name" required>
          <UInput v-model="createState.display_name" class="w-full" placeholder="Create lead" />
        </UFormField>
        <UFormField
          name="name"
          label="Name"
          required
          description="Convention: resource:action."
        >
          <UInput v-model="createState.name" class="w-full" placeholder="lead:create" />
        </UFormField>
        <UFormField name="description" label="Description">
          <UTextarea v-model="createState.description" class="w-full" :rows="2" />
        </UFormField>
        <div class="flex justify-end gap-2 pt-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="createOpen = false"
          />
          <UButton type="submit" label="Create" :loading="creating" />
        </div>
      </UForm>
    </template>
  </UModal>

  <!-- Delete -->
  <UModal v-model:open="deleteOpen" title="Delete permission">
    <template #body>
      <p class="text-sm text-muted">
        Delete <span class="font-medium text-default">{{ deleteTarget?.name }}</span>? This cannot be undone.
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="Cancel"
          @click="deleteOpen = false"
        />
        <UButton
          color="error"
          label="Delete"
          :loading="deleting"
          @click="onConfirmDelete"
        />
      </div>
    </template>
  </UModal>
</template>
