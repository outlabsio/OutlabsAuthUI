<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { User, UserRoleMembership } from '~/types/user'
import type { UserSession } from '~/types/account'

// User detail — logic in useUserDetail; this file is display only.
const route = useRoute()
const userId = computed(() => String(route.params.userId))

const {
  user,
  status,
  errorMessage,
  sessions,
  sessionsStatus,
  roleMemberships,
  rolesStatus,
  canManageRoles,
  roleRowMenu,
  rolesPool,
  assignSelectedRoles,
  assignOpen,
  assignState,
  assigning,
  openAssign,
  onAssign,
  removeOpen,
  removeTarget,
  removing,
  onConfirmRemove
} = useUserDetail(userId)

// --- Pure display config ---
const statusColor: Record<User['status'], 'success' | 'info' | 'warning' | 'error' | 'neutral'> = {
  active: 'success',
  invited: 'info',
  suspended: 'warning',
  banned: 'error',
  deleted: 'neutral'
}

const profileItems = computed(() => {
  const u = user.value
  if (!u) return []
  return [
    { label: 'Email', value: u.email },
    { label: 'First name', value: u.first_name },
    { label: 'Last name', value: u.last_name },
    { label: 'Status', value: u.status },
    { label: 'Superuser', value: u.is_superuser ? 'Yes' : 'No' },
    { label: 'Email verified', value: u.email_verified ? 'Yes' : 'No' },
    { label: 'Phone', value: u.phone },
    { label: 'Root entity', value: u.root_entity_name },
    { label: 'Created', value: u.created_at },
    { label: 'Last login', value: u.last_login }
  ]
})

const roleColumns: TableColumn<UserRoleMembership>[] = [
  { id: 'role', header: 'Role' },
  { accessorKey: 'valid_until', header: 'Valid until' },
  { id: 'validity', header: 'Status' },
  { id: 'actions', header: '' }
]

const sessionColumns: TableColumn<UserSession>[] = [
  { accessorKey: 'device_name', header: 'Device' },
  { accessorKey: 'ip_address', header: 'IP address' },
  { accessorKey: 'last_used_at', header: 'Last used' }
]
</script>

<template>
  <UDashboardPanel id="user-detail">
    <template #header>
      <UDashboardNavbar :title="user?.email ?? 'User'">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/app/users"
            aria-label="Back to users"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <AppPermissionGate permission="user:read">
        <UAlert
          v-if="status === 'error'"
          color="error"
          icon="i-lucide-triangle-alert"
          title="Could not load user"
          :description="errorMessage"
        />

        <div v-else class="mx-auto w-full max-w-3xl space-y-6">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="font-semibold text-highlighted">
                  Profile
                </h2>
                <UBadge
                  v-if="user"
                  :color="statusColor[user.status]"
                  variant="subtle"
                  class="capitalize"
                >
                  {{ user.status }}
                </UBadge>
              </div>
            </template>
            <AppDetailList :items="profileItems" />
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <h2 class="font-semibold text-highlighted">
                    Direct roles
                  </h2>
                  <span class="text-sm text-muted">{{ roleMemberships.length }}</span>
                </div>
                <UButton
                  v-if="canManageRoles"
                  icon="i-lucide-plus"
                  size="xs"
                  variant="outline"
                  color="neutral"
                  label="Assign roles"
                  @click="openAssign"
                />
              </div>
            </template>
            <UTable
              :data="roleMemberships"
              :columns="roleColumns"
              :loading="rolesStatus === 'pending'"
              :empty="'No roles assigned directly.'"
            >
              <template #role-cell="{ row }">
                <div class="flex items-baseline gap-2">
                  <ULink :to="`/app/roles/${row.original.role_id}`" class="font-medium text-highlighted hover:underline">
                    {{ row.original.role.display_name }}
                  </ULink>
                  <span class="text-xs capitalize text-dimmed">{{ row.original.role.scope.replace('_', ' ') }}</span>
                </div>
              </template>
              <template #valid_until-cell="{ row }">
                {{ row.original.valid_until ? row.original.valid_until.slice(0, 10) : 'No expiry' }}
              </template>
              <template #validity-cell="{ row }">
                <UBadge
                  :color="row.original.is_currently_valid ? 'success' : 'neutral'"
                  variant="subtle"
                  size="sm"
                  class="capitalize"
                >
                  {{ row.original.is_currently_valid ? 'Active' : (row.original.status || 'Inactive') }}
                </UBadge>
              </template>
              <template #actions-cell="{ row }">
                <div v-if="roleRowMenu(row.original).length" class="text-right">
                  <UDropdownMenu :items="roleRowMenu(row.original)">
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
          </UCard>

          <UCard>
            <template #header>
              <h2 class="font-semibold text-highlighted">
                Active sessions
              </h2>
            </template>
            <UTable :data="sessions" :columns="sessionColumns" :loading="sessionsStatus === 'pending'">
              <template #last_used_at-cell="{ row }">
                {{ row.original.last_used_at ?? '—' }}
              </template>
            </UTable>
          </UCard>
        </div>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>

  <!-- Assign roles -->
  <UModal
    v-model:open="assignOpen"
    title="Assign roles"
    :description="`Grant direct roles to ${user?.email ?? 'this user'}.`"
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <div class="space-y-1.5">
          <span class="block text-sm font-medium text-default">Roles</span>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AppRolePicker v-model="assignState.roleIds" :roles="rolesPool" height-class="h-64" />
            <div class="h-64 overflow-hidden rounded-md border border-default p-3">
              <AppEffectivePermissions :roles="assignSelectedRoles" />
            </div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <span class="block text-sm font-medium text-default">Valid from</span>
            <AppDateField v-model="assignState.validFrom" placeholder="Any time" />
          </div>
          <div class="space-y-1.5">
            <span class="block text-sm font-medium text-default">Valid until</span>
            <AppDateField v-model="assignState.validUntil" placeholder="No expiry" />
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="Cancel"
          @click="assignOpen = false"
        />
        <UButton
          label="Assign"
          :loading="assigning"
          :disabled="!assignState.roleIds.length"
          @click="onAssign"
        />
      </div>
    </template>
  </UModal>

  <!-- Remove role -->
  <UModal v-model:open="removeOpen" title="Remove role">
    <template #body>
      <p class="text-sm text-muted">
        Remove <span class="font-medium text-default">{{ removeTarget?.role.display_name }}</span> from this user?
        Permissions granted only by this role are revoked.
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="Cancel"
          @click="removeOpen = false"
        />
        <UButton
          color="error"
          label="Remove"
          :loading="removing"
          @click="onConfirmRemove"
        />
      </div>
    </template>
  </UModal>
</template>
