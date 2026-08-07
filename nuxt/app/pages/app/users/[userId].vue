<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { resetPasswordSchema } from '~/schemas/user'
import type { User, UserRoleMembership } from '~/types/user'
import type { Membership } from '~/types/membership'
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
  canManageUser,
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
  onConfirmRemove,
  userActions,
  statusOpen,
  statusItems,
  statusState,
  savingStatus,
  onSaveStatus,
  resetOpen,
  resetState,
  resettingPassword,
  onResetPassword,
  canAddMembership,
  memberships,
  membershipsStatus,
  membershipRowMenu,
  membershipEntityOptions,
  entityName,
  membershipRoleNames,
  memberStatusItems,
  orgRoles,
  addMembershipOpen,
  addMembershipState,
  addMembershipRoles,
  addingMembership,
  openAddMembership,
  onAddMembership,
  editMembershipOpen,
  editMembershipTarget,
  editMembershipState,
  editMembershipRoles,
  savingMembership,
  onSaveMembership,
  removeMembershipOpen,
  removeMembershipTarget,
  removingMembership,
  onConfirmRemoveMembership
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

const membershipColumns: TableColumn<Membership>[] = [
  { id: 'entity', header: 'Entity' },
  { id: 'roles', header: 'Roles' },
  { id: 'validity', header: 'Status' },
  { id: 'actions', header: '' }
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
        <template #right>
          <UDropdownMenu v-if="userActions.length" :items="userActions">
            <UButton
              icon="i-lucide-settings-2"
              color="neutral"
              variant="outline"
              label="Actions"
              trailing-icon="i-lucide-chevron-down"
            />
          </UDropdownMenu>
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
                  v-if="canManageUser"
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
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <h2 class="font-semibold text-highlighted">
                    Memberships
                  </h2>
                  <span class="text-sm text-muted">{{ memberships.length }}</span>
                </div>
                <UButton
                  v-if="canAddMembership"
                  icon="i-lucide-plus"
                  size="xs"
                  variant="outline"
                  color="neutral"
                  label="Add membership"
                  @click="openAddMembership"
                />
              </div>
            </template>
            <UTable
              :data="memberships"
              :columns="membershipColumns"
              :loading="membershipsStatus === 'pending'"
              :empty="'Not a member of any entity.'"
            >
              <template #entity-cell="{ row }">
                <ULink
                  :to="{ path: '/app/entities', query: { entity: row.original.entity_id } }"
                  class="font-medium text-highlighted hover:underline"
                >
                  {{ entityName(row.original.entity_id) }}
                </ULink>
              </template>
              <template #roles-cell="{ row }">
                <div class="flex flex-wrap gap-1">
                  <UBadge
                    v-for="name in membershipRoleNames(row.original.role_ids)"
                    :key="name"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                  >
                    {{ name }}
                  </UBadge>
                  <span v-if="!row.original.role_ids.length" class="text-sm text-dimmed">—</span>
                </div>
              </template>
              <template #validity-cell="{ row }">
                <UBadge
                  :color="row.original.is_currently_valid ? 'success' : 'neutral'"
                  variant="subtle"
                  size="sm"
                  class="capitalize"
                >
                  {{ row.original.is_currently_valid ? 'Active' : (row.original.effective_status || 'Inactive') }}
                </UBadge>
              </template>
              <template #actions-cell="{ row }">
                <div v-if="membershipRowMenu(row.original).length" class="text-right">
                  <UDropdownMenu :items="membershipRowMenu(row.original)">
                    <UButton
                      icon="i-lucide-ellipsis-vertical"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      aria-label="Membership actions"
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

  <!-- Change status -->
  <UModal
    v-model:open="statusOpen"
    title="Change status"
    :description="`Update ${user?.email ?? 'this user'}'s account status.`"
  >
    <template #body>
      <div class="space-y-4">
        <div class="space-y-1.5">
          <label for="user-status" class="block text-sm font-medium text-default">Status</label>
          <USelect
            id="user-status"
            v-model="statusState.status"
            :items="statusItems"
            class="w-full"
          />
        </div>
        <div v-if="statusState.status === 'suspended'" class="space-y-1.5">
          <span class="block text-sm font-medium text-default">Suspended until</span>
          <AppDateField v-model="statusState.suspendedUntil" placeholder="No auto-expiry" />
        </div>
        <div class="space-y-1.5">
          <label for="user-status-reason" class="block text-sm font-medium text-default">Reason</label>
          <UTextarea
            id="user-status-reason"
            v-model="statusState.reason"
            :rows="2"
            placeholder="Optional note for the audit log"
            class="w-full"
          />
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="Cancel"
          @click="statusOpen = false"
        />
        <UButton label="Save" :loading="savingStatus" @click="onSaveStatus" />
      </div>
    </template>
  </UModal>

  <!-- Reset password -->
  <UModal
    v-model:open="resetOpen"
    title="Reset password"
    :description="`Set a new password for ${user?.email ?? 'this user'}.`"
  >
    <template #body>
      <UForm
        :schema="resetPasswordSchema"
        :state="resetState"
        class="space-y-4"
        @submit="onResetPassword"
      >
        <UFormField name="new_password" label="New password" required>
          <UInput
            v-model="resetState.new_password"
            type="password"
            autocomplete="new-password"
            class="w-full"
          />
        </UFormField>
        <UFormField name="confirm_password" label="Confirm password" required>
          <UInput
            v-model="resetState.confirm_password"
            type="password"
            autocomplete="new-password"
            class="w-full"
          />
        </UFormField>
        <div class="flex justify-end gap-2 pt-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="resetOpen = false"
          />
          <UButton type="submit" label="Reset password" :loading="resettingPassword" />
        </div>
      </UForm>
    </template>
  </UModal>

  <!-- Add membership -->
  <UModal
    v-model:open="addMembershipOpen"
    title="Add membership"
    :description="`Add ${user?.email ?? 'this user'} to an entity.`"
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label for="add-membership-entity" class="block text-sm font-medium text-default">Entity</label>
            <USelectMenu
              id="add-membership-entity"
              v-model="addMembershipState.entityId"
              value-key="value"
              :items="membershipEntityOptions"
              placeholder="Select an entity"
              class="w-full"
            />
          </div>
          <div class="space-y-1.5">
            <label for="add-membership-status" class="block text-sm font-medium text-default">Status</label>
            <USelect
              id="add-membership-status"
              v-model="addMembershipState.status"
              :items="memberStatusItems"
              class="w-full"
            />
          </div>
        </div>
        <div class="space-y-1.5">
          <span class="block text-sm font-medium text-default">Roles</span>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AppRolePicker v-model="addMembershipState.roleIds" :roles="orgRoles" height-class="h-64" />
            <div class="h-64 overflow-hidden rounded-md border border-default p-3">
              <AppEffectivePermissions :roles="addMembershipRoles" />
            </div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <span class="block text-sm font-medium text-default">Valid from</span>
            <AppDateField v-model="addMembershipState.validFrom" placeholder="Any time" />
          </div>
          <div class="space-y-1.5">
            <span class="block text-sm font-medium text-default">Valid until</span>
            <AppDateField v-model="addMembershipState.validUntil" placeholder="No expiry" />
          </div>
        </div>
        <div class="space-y-1.5">
          <label for="add-membership-reason" class="block text-sm font-medium text-default">Reason</label>
          <UTextarea
            id="add-membership-reason"
            v-model="addMembershipState.reason"
            :rows="2"
            placeholder="Optional note for the audit trail"
            class="w-full"
          />
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="Cancel"
          @click="addMembershipOpen = false"
        />
        <UButton
          label="Add membership"
          :loading="addingMembership"
          :disabled="!addMembershipState.entityId"
          @click="onAddMembership"
        />
      </div>
    </template>
  </UModal>

  <!-- Edit membership -->
  <UModal
    v-model:open="editMembershipOpen"
    :title="`Edit membership — ${editMembershipTarget ? entityName(editMembershipTarget.entity_id) : 'entity'}`"
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <div class="space-y-1.5">
          <span class="block text-sm font-medium text-default">Roles</span>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AppRolePicker v-model="editMembershipState.roleIds" :roles="orgRoles" height-class="h-64" />
            <div class="h-64 overflow-hidden rounded-md border border-default p-3">
              <AppEffectivePermissions :roles="editMembershipRoles" />
            </div>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div class="space-y-1.5">
            <label for="edit-membership-status" class="block text-sm font-medium text-default">Status</label>
            <USelect
              id="edit-membership-status"
              v-model="editMembershipState.status"
              :items="memberStatusItems"
              class="w-full"
            />
          </div>
          <div class="space-y-1.5">
            <span class="block text-sm font-medium text-default">Valid from</span>
            <AppDateField v-model="editMembershipState.validFrom" placeholder="Any time" />
          </div>
          <div class="space-y-1.5">
            <span class="block text-sm font-medium text-default">Valid until</span>
            <AppDateField v-model="editMembershipState.validUntil" placeholder="No expiry" />
          </div>
        </div>
        <div class="space-y-1.5">
          <label for="edit-membership-reason" class="block text-sm font-medium text-default">Reason</label>
          <UTextarea
            id="edit-membership-reason"
            v-model="editMembershipState.reason"
            :rows="2"
            placeholder="Optional note for the audit trail"
            class="w-full"
          />
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="Cancel"
          @click="editMembershipOpen = false"
        />
        <UButton label="Save access" :loading="savingMembership" @click="onSaveMembership" />
      </div>
    </template>
  </UModal>

  <!-- Remove membership -->
  <UModal v-model:open="removeMembershipOpen" title="Remove membership">
    <template #body>
      <p class="text-sm text-muted">
        Remove this user from
        <span class="font-medium text-default">{{ removeMembershipTarget ? entityName(removeMembershipTarget.entity_id) : '' }}</span>?
        Their membership and its roles are revoked.
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="Cancel"
          @click="removeMembershipOpen = false"
        />
        <UButton
          color="error"
          label="Remove"
          :loading="removingMembership"
          @click="onConfirmRemoveMembership"
        />
      </div>
    </template>
  </UModal>
</template>
