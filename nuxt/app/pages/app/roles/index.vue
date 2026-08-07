<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { createRoleSchema, updateRoleSchema } from '~/schemas/role'
import type { Role } from '~/types/role'

// Roles vertical — logic in useRolesWorkspace; this file is display only.
const {
  canCreate,
  filters,
  rows,
  status,
  errorMessage,
  rowMenu,
  createOpen,
  createState,
  creating,
  onCreate,
  editOpen,
  editTarget,
  editState,
  saving,
  onSaveEdit,
  deleteOpen,
  deleteTarget,
  deleting,
  onConfirmDelete
} = useRolesWorkspace()

// --- Pure display config ---
const columns: TableColumn<Role>[] = [
  { accessorKey: 'display_name', header: 'Display name' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'scope', header: 'Scope' },
  { accessorKey: 'is_global', header: 'Reach' },
  { accessorKey: 'status', header: 'Status' },
  { id: 'actions', header: '' }
]
const statusColor: Record<Role['status'], 'success' | 'neutral'> = {
  active: 'success',
  inactive: 'neutral',
  archived: 'neutral'
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
            @click="createOpen = true"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UInput
            v-model="filters.search"
            icon="i-lucide-search"
            placeholder="Search roles..."
            class="w-64"
          />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <AppPermissionGate permission="role:read">
        <UAlert
          v-if="status === 'error'"
          color="error"
          icon="i-lucide-triangle-alert"
          title="Could not load roles"
          :description="errorMessage"
          class="mb-4"
        />

        <UTable :data="rows" :columns="columns" :loading="status === 'pending'">
          <template #display_name-cell="{ row }">
            <ULink :to="`/app/roles/${row.original.id}`" class="font-medium text-highlighted hover:underline">
              {{ row.original.display_name }}
            </ULink>
          </template>
          <template #scope-cell="{ row }">
            <span class="capitalize">{{ row.original.scope.replace('_', ' ') }}</span>
          </template>
          <template #is_global-cell="{ row }">
            <UBadge :color="row.original.is_global ? 'secondary' : 'neutral'" variant="subtle">
              {{ row.original.is_global ? 'Global' : 'Scoped' }}
            </UBadge>
          </template>
          <template #status-cell="{ row }">
            <UBadge :color="statusColor[row.original.status]" variant="subtle" class="capitalize">
              {{ row.original.status }}
            </UBadge>
          </template>
          <template #actions-cell="{ row }">
            <div class="text-right">
              <UDropdownMenu :items="rowMenu(row.original)">
                <UButton
                  icon="i-lucide-ellipsis-vertical"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  aria-label="Role actions"
                />
              </UDropdownMenu>
            </div>
          </template>
        </UTable>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>

  <UModal v-model:open="createOpen" title="Add role" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <UForm
        :schema="createRoleSchema"
        :state="createState"
        class="space-y-4"
        @submit="onCreate"
      >
        <UFormField name="display_name" label="Display name" required>
          <UInput v-model="createState.display_name" class="w-full" placeholder="Regional Admin" />
        </UFormField>
        <UFormField
          name="name"
          label="Name"
          required
          description="Machine name: lowercase, no spaces."
        >
          <UInput v-model="createState.name" class="w-full" placeholder="regional-admin" />
        </UFormField>
        <UFormField name="description" label="Description">
          <UTextarea v-model="createState.description" class="w-full" :rows="2" />
        </UFormField>
        <UFormField name="is_global">
          <UCheckbox v-model="createState.is_global" label="Global role" />
        </UFormField>
        <UFormField name="permissions" label="Permissions">
          <AppPermissionPicker v-model="createState.permissions" />
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

  <!-- Edit -->
  <UModal v-model:open="editOpen" :title="`Edit ${editTarget?.display_name ?? 'role'}`" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <UForm
        :schema="updateRoleSchema"
        :state="editState"
        class="space-y-4"
        @submit="onSaveEdit"
      >
        <UFormField name="display_name" label="Display name" required>
          <UInput v-model="editState.display_name" class="w-full" />
        </UFormField>
        <UFormField name="description" label="Description">
          <UTextarea v-model="editState.description" class="w-full" :rows="2" />
        </UFormField>
        <UFormField name="permissions" label="Permissions">
          <AppPermissionPicker v-model="editState.permissions" />
        </UFormField>
        <div class="flex justify-end gap-2 pt-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="editOpen = false"
          />
          <UButton type="submit" label="Save" :loading="saving" />
        </div>
      </UForm>
    </template>
  </UModal>

  <!-- Delete -->
  <UModal v-model:open="deleteOpen" title="Delete role">
    <template #body>
      <p class="text-sm text-muted">
        Delete <span class="font-medium text-default">{{ deleteTarget?.display_name }}</span>? This cannot be undone.
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
