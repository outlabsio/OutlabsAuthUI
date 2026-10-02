<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { addMembershipSchema, editMembershipSchema } from '~/schemas/membership'
import type { User } from '~/types/user'
import type { Membership } from '~/types/membership'
import { MEMBERSHIP_STATUS_COLOR, badgeColor, statusLabel } from '~/utils/status'
import { hideBelowMd, hideBelowSm, srOnlyHeader } from '~/utils/table'

// The user detail's Memberships card with its dialogs (display only; logic in
// useUserMembershipsCard). Rendered only where the server has memberships.
const props = defineProps<{ user: User }>()
const user = computed(() => props.user)

const {
  canReadMemberships,
  canAddMembership,
  includeEnded,
  memberships,
  endedCount,
  liveCount,
  page,
  pageSize,
  shownTotal,
  status,
  error,
  isLoading,
  hasData,
  refetch,
  roleReference,
  entityName,
  entityStatus,
  canOpenEntity,
  membershipRowMenu,
  membershipPickerRootId,
  membershipPickerBlocked,
  membershipPickerBlockedReason,
  memberEntityIds,
  addMembershipOpen,
  addMembershipState,
  addError,
  addEntityHelp,
  addMembershipPool,
  addMembershipPoolStatus,
  addMembershipPoolEmptyText,
  addMembershipPoolTruncated,
  openAddMembership,
  onAddMembership,
  editMembershipOpen,
  editMembershipTarget,
  editMembershipState,
  editError,
  editConflict,
  editWindowNote,
  editMembershipDirty,
  editMembershipPool,
  editMembershipPoolStatus,
  editMembershipPoolEmptyText,
  editMembershipPoolTruncated,
  editMembershipKnownRoles,
  savingMembership,
  onSaveMembership,
  overwriteMembership,
  reloadMembership,
  reactivateOpen,
  reactivateTarget,
  removeMembership
} = useUserMembershipsCard(user)

// The table fits its card on a 390px phone: the status sits beside the entity (no column of its
// own), the roles and the window (below sm) and the join (below md) move under it, cells wrap
// (they are nowrap by default), and the row menu is pinned to the right edge.
const columns: TableColumn<Membership>[] = [
  { id: 'entity', header: 'Entity' },
  { id: 'roles', header: 'Roles', meta: hideBelowSm },
  { id: 'window', header: 'Window', meta: hideBelowSm },
  { id: 'joined', header: 'Joined', meta: hideBelowMd },
  { id: 'actions', header: srOnlyHeader('Actions') }
]
const columnPinning = { left: [], right: ['actions'] }
// Below sm the role chips render under the entity instead of in their (hidden) column: rendered in
// one place only, so each chip and its popover exist once.
const stackRoles = useBreakpoints(breakpointsTailwind).smaller('sm')
const emptyDescription = computed(() => {
  if (endedCount.value && !includeEnded.value) return `${endedCount.value} ended membership${endedCount.value === 1 ? ' is' : 's are'} hidden. Turn on Include ended to see ${endedCount.value === 1 ? 'it' : 'them'}.`
  return canAddMembership.value ? 'Add a membership to give this user access within an organization.' : undefined
})
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <h2 class="font-semibold text-highlighted">
            Memberships
          </h2>
          <span v-if="canReadMemberships && status === 'success'" class="text-sm text-muted">{{ liveCount }}</span>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <UCheckbox v-if="canReadMemberships" v-model="includeEnded" label="Include ended" />
          <UButton
            v-if="canAddMembership"
            icon="i-lucide-plus"
            size="sm"
            variant="outline"
            color="neutral"
            label="Add membership"
            @click="openAddMembership"
          />
        </div>
      </div>
    </template>
    <AppPermissionGate permission="membership:read" label="memberships" compact>
      <AppQueryState
        :status="status"
        :error="error"
        :enabled="canReadMemberships"
        :empty="!memberships.length"
        :refreshing="isLoading"
        :has-data="hasData"
        error-title="Could not load memberships"
        empty-title="Not a member of any entity"
        :empty-description="emptyDescription"
        empty-icon="i-lucide-building-2"
        skeleton="table"
        :skeleton-columns="3"
        loading-label="Loading memberships"
        compact
        @retry="refetch()"
      >
        <UTable
          :data="memberships"
          :columns="columns"
          :column-pinning="columnPinning"
          :loading="isLoading"
        >
          <template #entity-cell="{ row }">
            <div class="min-w-0 whitespace-normal">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <ULink
                  v-if="canOpenEntity(row.original.entity_id)"
                  :to="{ path: '/app/entities', query: { entity: row.original.entity_id } }"
                  class="font-medium text-highlighted hover:underline"
                >
                  {{ entityName(row.original.entity_id) }}
                </ULink>
                <span v-else class="break-words font-medium text-highlighted">{{ entityName(row.original.entity_id) }}</span>
                <UBadge
                  :color="badgeColor(MEMBERSHIP_STATUS_COLOR, row.original.effective_status)"
                  variant="subtle"
                  size="sm"
                  :label="statusLabel(row.original.effective_status)"
                />
                <UBadge
                  v-if="entityStatus(row.original.entity_id) && entityStatus(row.original.entity_id) !== 'active'"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :label="`Entity ${statusLabel(entityStatus(row.original.entity_id)).toLowerCase()}`"
                />
              </div>
              <div v-if="stackRoles && row.original.role_ids.length" class="mt-1 flex flex-wrap gap-1">
                <AppRoleChip v-for="id in row.original.role_ids" :key="id" :role="roleReference(id)" />
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
                Joined <AppTimestamp :value="row.original.joined_at" date-only /><template v-if="row.original.joined_by_id">
                  by <AppUserLabel :user-id="row.original.joined_by_id" :subject-id="user.id" />
                </template>
              </p>
              <p v-if="row.original.revocation_reason && row.original.status !== 'active'" class="text-xs text-muted">
                {{ row.original.revocation_reason }}
              </p>
            </div>
          </template>
          <template #roles-cell="{ row }">
            <div v-if="!stackRoles" class="flex flex-wrap gap-1 whitespace-normal">
              <AppRoleChip v-for="id in row.original.role_ids" :key="id" :role="roleReference(id)" />
              <span v-if="!row.original.role_ids.length" class="text-sm text-dimmed">—</span>
            </div>
          </template>
          <template #window-cell="{ row }">
            <AppGrantWindow :valid-from="row.original.valid_from" :valid-until="row.original.valid_until" />
          </template>
          <template #joined-cell="{ row }">
            <div class="min-w-0 whitespace-normal text-sm">
              <AppTimestamp :value="row.original.joined_at" date-only />
              <p v-if="row.original.joined_by_id" class="text-xs text-muted">
                by <AppUserLabel :user-id="row.original.joined_by_id" :subject-id="user.id" />
              </p>
            </div>
          </template>
          <template #actions-cell="{ row }">
            <div v-if="membershipRowMenu(row.original).length" class="text-right">
              <UDropdownMenu :items="membershipRowMenu(row.original)">
                <UButton
                  icon="i-lucide-ellipsis-vertical"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  :aria-label="`Membership actions for ${entityName(row.original.entity_id)}`"
                />
              </UDropdownMenu>
            </div>
          </template>
        </UTable>
        <div v-if="shownTotal > pageSize" class="mt-3">
          <AppListPagination
            v-model:page="page"
            :total="shownTotal"
            :page-size="pageSize"
            noun="membership"
          />
        </div>
      </AppQueryState>
    </AppPermissionGate>
  </UCard>

  <!-- Add membership -->
  <AppFormDialog
    ref="addMembershipDialog"
    v-model:open="addMembershipOpen"
    title="Add membership"
    :description="`Add ${user.email} to an entity.`"
    :schema="addMembershipSchema"
    :state="addMembershipState"
    :error="addError"
    submit-label="Add membership"
    size="xl"
    @submit="onAddMembership"
  >
    <UFormField
      name="entityId"
      label="Entity"
      required
      :help="membershipPickerBlockedReason ?? addEntityHelp"
    >
      <AppEntityPicker
        id="add-membership-entity"
        v-model="addMembershipState.entityId"
        aria-label="Entity"
        :root-id="membershipPickerRootId"
        :exclude-ids="memberEntityIds"
        :disabled="membershipPickerBlocked"
      />
    </UFormField>
    <UFormField name="roleIds" label="Roles" hint="Optional">
      <AppRoleAccessEditor
        v-model="addMembershipState.roleIds"
        :roles="addMembershipPool"
        :disabled="!addMembershipState.entityId"
        :loading="addMembershipPoolStatus === 'pending'"
        :empty-text="addMembershipPoolEmptyText"
        :truncated="addMembershipPoolTruncated"
      />
    </UFormField>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <UFormField name="status" label="Status" required>
        <USelect
          id="add-membership-status"
          v-model="addMembershipState.status"
          :items="ROLE_ASSIGNMENT_STATUS_ITEMS"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="validFrom"
        label="Valid from"
        hint="Optional"
        :help="startOfDayHelp()"
      >
        <AppDateField v-model="addMembershipState.validFrom" label="Valid from" />
      </UFormField>
      <UFormField
        name="validUntil"
        label="Valid until"
        hint="Optional"
        :help="endOfDayHelp()"
      >
        <AppDateField v-model="addMembershipState.validUntil" label="Valid until" />
      </UFormField>
    </div>
    <UFormField name="reason" label="Reason" hint="Optional">
      <UTextarea
        v-model="addMembershipState.reason"
        :rows="2"
        placeholder="A note for the audit trail"
        class="w-full"
      />
    </UFormField>
  </AppFormDialog>

  <!-- Edit membership access (live memberships only) -->
  <AppFormDialog
    ref="editMembershipDialog"
    v-model:open="editMembershipOpen"
    :title="`Edit membership in ${editMembershipTarget ? entityName(editMembershipTarget.entity_id) : 'entity'}`"
    description="Update this membership's roles, status and access window. Only the fields you change are saved."
    :schema="editMembershipSchema"
    :state="editMembershipState"
    :error="editError"
    :conflict="editConflict"
    :pending="savingMembership"
    :dirty="editMembershipDirty"
    require-changes
    submit-label="Save changes"
    size="xl"
    @submit="onSaveMembership"
    @reload="reloadMembership"
    @overwrite="overwriteMembership"
  >
    <UAlert
      v-if="editWindowNote"
      color="info"
      variant="subtle"
      icon="i-lucide-calendar-x"
      :description="editWindowNote"
      data-testid="grant-window-ended"
    />
    <UFormField name="roleIds" label="Roles">
      <AppRoleAccessEditor
        v-model="editMembershipState.roleIds"
        :roles="editMembershipPool"
        :known="editMembershipKnownRoles"
        :loading="editMembershipPoolStatus === 'pending'"
        :empty-text="editMembershipPoolEmptyText"
        :truncated="editMembershipPoolTruncated"
      />
    </UFormField>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <UFormField name="status" label="Status" required>
        <USelect
          id="edit-membership-status"
          v-model="editMembershipState.status"
          :items="ROLE_ASSIGNMENT_STATUS_ITEMS"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="validFrom"
        label="Valid from"
        hint="Optional"
        :help="startOfDayHelp()"
      >
        <AppDateField v-model="editMembershipState.validFrom" label="Valid from" />
      </UFormField>
      <UFormField
        name="validUntil"
        label="Valid until"
        hint="Optional"
        :help="endOfDayHelp()"
      >
        <AppDateField v-model="editMembershipState.validUntil" label="Valid until" />
      </UFormField>
    </div>
    <UFormField name="reason" label="Reason" hint="Optional">
      <UTextarea
        v-model="editMembershipState.reason"
        :rows="2"
        placeholder="A note for the audit trail"
        class="w-full"
      />
    </UFormField>
  </AppFormDialog>

  <!-- Reactivate a suspended or ended membership -->
  <AppAccessReactivateDialog v-model:open="reactivateOpen" :target="reactivateTarget" />

  <!-- Remove membership -->
  <AppConfirmDialog v-model:open="removeMembership.open" v-bind="removeMembership.dialog" @confirm="removeMembership.confirm" />
</template>
