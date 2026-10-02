<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { assignRolesSchema, roleAssignmentEditSchema } from '~/schemas/membership'
import type { User, UserRoleMembership } from '~/types/user'
import { MEMBERSHIP_STATUS_COLOR, badgeColor, statusLabel } from '~/utils/status'
import { hideBelowMd, hideBelowSm, srOnlyHeader } from '~/utils/table'

// The user detail's Direct roles card with its dialogs (display only; logic in useUserRolesCard).
const props = defineProps<{ user: User, isEnterprise: boolean }>()
const user = computed(() => props.user)

const {
  canManage,
  canOpenRole,
  includeEnded,
  roleMemberships,
  endedCount,
  liveCount,
  effectiveStatus,
  status,
  error,
  isLoading,
  hasData,
  refetch,
  roleRowMenu,
  rolesPool,
  rolesPoolStatus,
  rolesPoolEmptyText,
  rolesPoolTruncated,
  assignOpen,
  assignState,
  assignError,
  openAssign,
  onAssign,
  removeRole,
  reactivateOpen,
  reactivateTarget,
  editRoleOpen,
  editRoleTarget,
  editRoleState,
  editRoleError,
  editRoleConflict,
  editRoleDirty,
  editRoleWindowNote,
  savingRole,
  onSaveRoleMembership,
  overwriteRoleMembership,
  reloadRoleMembership
} = useUserRolesCard(user)

// On a phone the window moves under the role and the actions stay pinned on screen; the grant
// (when and by whom) is a column from md up and a line under the role below it.
const columns: TableColumn<UserRoleMembership>[] = [
  { id: 'role', header: 'Role' },
  { id: 'window', header: 'Window', meta: hideBelowSm },
  { id: 'granted', header: 'Assigned', meta: hideBelowMd },
  { id: 'validity', header: 'Status' },
  { id: 'actions', header: srOnlyHeader('Actions') }
]
const columnPinning = { left: [], right: ['actions'] }
const emptyDescription = computed(() => {
  if (includeEnded.value) return 'This user has never had a role assigned directly.'
  if (endedCount.value) return `${endedCount.value} ended assignment${endedCount.value === 1 ? ' is' : 's are'} hidden. Turn on Include ended to see ${endedCount.value === 1 ? 'it' : 'them'}.`
  return 'Roles granted through memberships are listed under Memberships.'
})
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <h2 class="font-semibold text-highlighted">
            Direct roles
          </h2>
          <span v-if="status === 'success'" class="text-sm text-muted">{{ liveCount }}</span>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <UCheckbox v-model="includeEnded" label="Include ended" />
          <UButton
            v-if="canManage"
            icon="i-lucide-plus"
            size="sm"
            variant="outline"
            color="neutral"
            label="Assign roles"
            @click="openAssign"
          />
        </div>
      </div>
    </template>
    <AppQueryState
      :status="status"
      :error="error"
      :empty="!roleMemberships.length"
      :refreshing="isLoading"
      :has-data="hasData"
      error-title="Could not load direct roles"
      empty-title="No roles assigned directly"
      :empty-description="emptyDescription"
      empty-icon="i-lucide-shield"
      skeleton="table"
      :skeleton-columns="3"
      loading-label="Loading direct roles"
      compact
      @retry="refetch()"
    >
      <UTable
        :data="roleMemberships"
        :columns="columns"
        :column-pinning="columnPinning"
        :loading="isLoading"
      >
        <template #role-cell="{ row }">
          <div class="min-w-0 whitespace-normal">
            <div class="flex flex-wrap items-baseline gap-x-2">
              <ULink v-if="canOpenRole(row.original.role_id)" :to="`/app/roles/${row.original.role_id}`" class="font-medium text-highlighted hover:underline">
                {{ row.original.role.display_name }}
              </ULink>
              <span v-else class="font-medium text-highlighted">{{ row.original.role.display_name }}</span>
              <span v-if="isEnterprise" class="text-xs text-dimmed">{{ statusLabel(row.original.role.scope) }}</span>
              <UBadge
                v-if="(row.original.role.status ?? 'active') !== 'active'"
                color="neutral"
                variant="outline"
                size="sm"
                :label="`Role ${statusLabel(row.original.role.status).toLowerCase()}`"
              />
            </div>
            <p class="text-xs text-muted sm:hidden">
              <template v-if="row.original.valid_until">
                Until <AppTimestamp :value="row.original.valid_until" date-only />
              </template>
              <template v-else>
                No end date
              </template>
            </p>
            <p class="text-xs text-muted md:hidden">
              Assigned <AppTimestamp :value="row.original.assigned_at" date-only /><template v-if="row.original.assigned_by_id">
                by <AppUserLabel :user-id="row.original.assigned_by_id" :subject-id="user.id" />
              </template>
            </p>
          </div>
        </template>
        <template #window-cell="{ row }">
          <AppGrantWindow :valid-from="row.original.valid_from" :valid-until="row.original.valid_until" />
        </template>
        <template #granted-cell="{ row }">
          <div class="min-w-0 whitespace-normal text-sm">
            <AppTimestamp :value="row.original.assigned_at" date-only />
            <p v-if="row.original.assigned_by_id" class="text-xs text-muted">
              by <AppUserLabel :user-id="row.original.assigned_by_id" :subject-id="user.id" />
            </p>
          </div>
        </template>
        <template #validity-cell="{ row }">
          <div class="min-w-0 whitespace-normal">
            <UBadge
              :color="badgeColor(MEMBERSHIP_STATUS_COLOR, effectiveStatus(row.original))"
              variant="subtle"
              size="sm"
              :label="statusLabel(effectiveStatus(row.original))"
            />
            <p v-if="row.original.revoked_at && row.original.status !== 'active'" class="text-xs text-muted">
              Since <AppTimestamp :value="row.original.revoked_at" date-only />
            </p>
            <p v-if="row.original.revocation_reason && row.original.status !== 'active'" class="text-xs text-muted">
              {{ row.original.revocation_reason }}
            </p>
          </div>
        </template>
        <template #actions-cell="{ row }">
          <div v-if="roleRowMenu(row.original).length" class="text-right">
            <UDropdownMenu :items="roleRowMenu(row.original)">
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
                size="sm"
                :aria-label="`Role actions for ${row.original.role.display_name}`"
              />
            </UDropdownMenu>
          </div>
        </template>
      </UTable>
    </AppQueryState>
  </UCard>

  <!-- Assign roles -->
  <AppFormDialog
    ref="assignDialog"
    v-model:open="assignOpen"
    title="Assign roles"
    :description="`Grant direct roles to ${user.email}.`"
    :schema="assignRolesSchema"
    :state="assignState"
    :error="assignError"
    submit-label="Assign roles"
    size="xl"
    @submit="onAssign"
  >
    <UFormField name="roleIds" label="Roles" required>
      <AppRoleAccessEditor
        v-model="assignState.roleIds"
        grant="direct"
        :roles="rolesPool"
        :loading="rolesPoolStatus === 'pending'"
        :empty-text="rolesPoolEmptyText"
        :truncated="rolesPoolTruncated"
      />
    </UFormField>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <UFormField
        name="validFrom"
        label="Valid from"
        hint="Optional"
        :help="startOfDayHelp()"
      >
        <AppDateField v-model="assignState.validFrom" label="Valid from" />
      </UFormField>
      <UFormField
        name="validUntil"
        label="Valid until"
        hint="Optional"
        :help="endOfDayHelp()"
      >
        <AppDateField v-model="assignState.validUntil" label="Valid until" />
      </UFormField>
    </div>
  </AppFormDialog>

  <!-- Remove role -->
  <AppConfirmDialog v-model:open="removeRole.open" v-bind="removeRole.dialog" @confirm="removeRole.confirm" />

  <!-- Reactivate a suspended or ended assignment -->
  <AppAccessReactivateDialog v-model:open="reactivateOpen" :target="reactivateTarget" />

  <!-- Edit a role assignment: its status and validity window -->
  <AppFormDialog
    ref="editRoleDialog"
    v-model:open="editRoleOpen"
    title="Edit role assignment"
    :description="`${editRoleTarget?.role.display_name ?? 'This'} role. Update the assignment's status and validity window. Only the fields you change are saved.`"
    :schema="roleAssignmentEditSchema"
    :state="editRoleState"
    :error="editRoleError"
    :conflict="editRoleConflict"
    :pending="savingRole"
    :dirty="editRoleDirty"
    require-changes
    submit-label="Save changes"
    @submit="onSaveRoleMembership"
    @reload="reloadRoleMembership"
    @overwrite="overwriteRoleMembership"
  >
    <UAlert
      v-if="editRoleWindowNote"
      color="info"
      variant="subtle"
      icon="i-lucide-calendar-x"
      :description="editRoleWindowNote"
      data-testid="grant-window-ended"
    />
    <UFormField name="status" label="Status" required>
      <USelect
        id="edit-role-status"
        v-model="editRoleState.status"
        :items="ROLE_ASSIGNMENT_STATUS_ITEMS"
        class="w-full"
      />
    </UFormField>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <UFormField
        name="validFrom"
        label="Valid from"
        hint="Optional"
        :help="startOfDayHelp()"
      >
        <AppDateField v-model="editRoleState.validFrom" label="Valid from" />
      </UFormField>
      <UFormField
        name="validUntil"
        label="Valid until"
        hint="Optional"
        :help="endOfDayHelp()"
      >
        <AppDateField v-model="editRoleState.validUntil" label="Valid until" />
      </UFormField>
    </div>
  </AppFormDialog>
</template>
