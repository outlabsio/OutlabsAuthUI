<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { createUserSchema, inviteUserSchema, updateUserSchema } from '~/schemas/user'
import type { User } from '~/types/user'

// Users vertical — logic in useUsersWorkspace; this file is display only.
const {
  canCreate,
  filters,
  statusFilter,
  statusItems,
  rows,
  total,
  status,
  errorMessage,
  rowMenu,
  createOpen,
  createState,
  creating,
  onCreate,
  inviteOpen,
  inviteState,
  inviting,
  openInvite,
  onInvite,
  entityOptions,
  inviteRolesPool,
  inviteSelectedRoles,
  editOpen,
  editTarget,
  editState,
  saving,
  onSaveEdit,
  deleteOpen,
  deleteTarget,
  deleting,
  onConfirmDelete
} = useUsersWorkspace()

// --- Pure display config ---
const columns: TableColumn<User>[] = [
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'first_name', header: 'First name' },
  { accessorKey: 'last_name', header: 'Last name' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'created_at', header: 'Created' },
  { id: 'actions', header: '' }
]
const statusColor: Record<User['status'], 'success' | 'info' | 'warning' | 'error' | 'neutral'> = {
  active: 'success',
  invited: 'info',
  suspended: 'warning',
  banned: 'error',
  deleted: 'neutral'
}
</script>

<template>
  <UDashboardPanel id="users">
    <template #header>
      <UDashboardNavbar title="Users">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div v-if="canCreate" class="flex items-center gap-2">
            <UButton
              icon="i-lucide-mail"
              color="neutral"
              variant="outline"
              label="Invite"
              @click="openInvite"
            />
            <UButton
              icon="i-lucide-plus"
              label="Add user"
              @click="createOpen = true"
            />
          </div>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UInput
            v-model="filters.search"
            icon="i-lucide-search"
            placeholder="Search users..."
            class="w-64"
          />
          <USelect
            id="user-status-filter"
            v-model="statusFilter"
            :items="statusItems"
            value-key="value"
            class="w-40"
            aria-label="Filter by status"
          />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <AppPermissionGate permission="user:read">
        <UAlert
          v-if="status === 'error'"
          color="error"
          icon="i-lucide-triangle-alert"
          title="Could not load users"
          :description="errorMessage"
          class="mb-4"
        />

        <UTable
          :data="rows"
          :columns="columns"
          :loading="status === 'pending'"
        >
          <template #email-cell="{ row }">
            <ULink :to="`/app/users/${row.original.id}`" class="font-medium text-highlighted hover:underline">
              {{ row.original.email }}
            </ULink>
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
                  aria-label="User actions"
                />
              </UDropdownMenu>
            </div>
          </template>
        </UTable>

        <div v-if="total > filters.limit!" class="flex justify-end pt-4">
          <UPagination
            v-model:page="filters.page"
            :total="total"
            :items-per-page="filters.limit"
          />
        </div>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>

  <!-- Create -->
  <UModal v-model:open="createOpen" title="Add user">
    <template #body>
      <UForm
        :schema="createUserSchema"
        :state="createState"
        class="space-y-4"
        @submit="onCreate"
      >
        <UFormField name="email" label="Email" required>
          <UInput
            v-model="createState.email"
            type="email"
            class="w-full"
            placeholder="you@example.com"
          />
        </UFormField>
        <UFormField name="password" label="Initial password" required>
          <UInput
            v-model="createState.password"
            type="password"
            autocomplete="new-password"
            class="w-full"
          />
        </UFormField>
        <div class="grid grid-cols-2 gap-3">
          <UFormField name="first_name" label="First name">
            <UInput v-model="createState.first_name" class="w-full" />
          </UFormField>
          <UFormField name="last_name" label="Last name">
            <UInput v-model="createState.last_name" class="w-full" />
          </UFormField>
        </div>
        <UFormField name="is_superuser">
          <UCheckbox v-model="createState.is_superuser" label="Superuser" />
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

  <!-- Invite -->
  <UModal
    v-model:open="inviteOpen"
    title="Invite user"
    description="Email an invitation. Optionally attach an entity membership with roles, or direct account roles."
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <UForm
        :schema="inviteUserSchema"
        :state="inviteState"
        class="space-y-4"
        @submit="onInvite"
      >
        <div class="grid grid-cols-2 gap-3">
          <UFormField name="email" label="Email" required>
            <UInput
              v-model="inviteState.email"
              type="email"
              class="w-full"
              placeholder="you@example.com"
            />
          </UFormField>
          <div class="space-y-1.5">
            <label for="invite-entity" class="block text-sm font-medium text-default">Entity</label>
            <USelectMenu
              id="invite-entity"
              v-model="inviteState.entityId"
              value-key="value"
              :items="entityOptions"
              placeholder="No entity (direct roles)"
              class="w-full"
            />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <UFormField name="first_name" label="First name">
            <UInput v-model="inviteState.first_name" class="w-full" />
          </UFormField>
          <UFormField name="last_name" label="Last name">
            <UInput v-model="inviteState.last_name" class="w-full" />
          </UFormField>
        </div>
        <div class="space-y-1.5">
          <span class="block text-sm font-medium text-default">Roles</span>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AppRolePicker v-model="inviteState.roleIds" :roles="inviteRolesPool" height-class="h-64" />
            <div class="h-64 overflow-hidden rounded-md border border-default p-3">
              <AppEffectivePermissions :roles="inviteSelectedRoles" />
            </div>
          </div>
        </div>
        <UFormField name="is_superuser">
          <UCheckbox v-model="inviteState.is_superuser" label="Superuser" />
        </UFormField>
        <div class="flex justify-end gap-2 pt-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="inviteOpen = false"
          />
          <UButton type="submit" label="Send invite" :loading="inviting" />
        </div>
      </UForm>
    </template>
  </UModal>

  <!-- Edit -->
  <UModal v-model:open="editOpen" :title="`Edit ${editTarget?.email ?? 'user'}`">
    <template #body>
      <UForm
        :schema="updateUserSchema"
        :state="editState"
        class="space-y-4"
        @submit="onSaveEdit"
      >
        <div class="grid grid-cols-2 gap-3">
          <UFormField name="first_name" label="First name">
            <UInput v-model="editState.first_name" class="w-full" />
          </UFormField>
          <UFormField name="last_name" label="Last name">
            <UInput v-model="editState.last_name" class="w-full" />
          </UFormField>
        </div>
        <UFormField name="phone" label="Phone" description="E.164 format, e.g. +15551234567.">
          <UInput v-model="editState.phone" class="w-full" placeholder="+15551234567" />
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
  <UModal v-model:open="deleteOpen" title="Delete user">
    <template #body>
      <p class="text-sm text-muted">
        Delete <span class="font-medium text-default">{{ deleteTarget?.email }}</span>? This cannot be undone.
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
