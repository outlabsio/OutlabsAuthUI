<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { addMemberSchema, editMemberSchema } from '~/schemas/entity'
import type { Entity } from '~/types/entity'
import type { EntityMember } from '~/types/membership'

// The entity's Users card: a paged member table (true count, F-024) and the add / edit access /
// reactivate / remove dialogs. Display only; logic in useEntityMembers. Rendered only where memberships exist.
const props = defineProps<{
  entity: Entity
  rootId: string | null
  readOnly: boolean
  activeCount: number | null
  atCapacity: boolean
}>()

const {
  hasMemberships,
  canReadMembers,
  canAddMember,
  canOpenUsers,
  includeInactive,
  page,
  pageSize,
  total,
  pagerTotal,
  countLabel,
  members,
  status,
  error,
  refetch,
  memberRowMenu,
  capacityNote,
  rolesPool,
  rolesPoolStatus,
  rolesPoolEmptyText,
  rolesPoolTruncated,
  addOpen,
  addState,
  addError,
  openAdd,
  onAdd,
  userSearch,
  userOptions,
  userSearchInput,
  usersLoading,
  usersHint,
  existingMembershipError,
  addBlocked,
  editOpen,
  editTarget,
  editState,
  editError,
  editDirty,
  editConflict,
  savingEdit,
  editKnownRoles,
  onEdit,
  overwriteEdit,
  reloadEdit,
  reactivateOpen,
  reactivateTarget,
  removeMember
} = useEntityMembers(props)

const columns: TableColumn<EntityMember>[] = [
  { id: 'name', header: 'Member' },
  { id: 'roles', header: 'Roles', meta: hideBelowSm },
  { id: 'status', header: 'Status' },
  { id: 'actions', header: srOnlyHeader('Actions') }
]
</script>

<template>
  <UCard v-if="hasMemberships">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <h2 class="font-semibold text-highlighted">
            Users
          </h2>
          <UBadge
            v-if="canReadMembers && countLabel"
            color="neutral"
            variant="subtle"
            :label="countLabel"
          />
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <USwitch v-if="canReadMembers" v-model="includeInactive" label="Include inactive" />
          <UTooltip v-if="canAddMember" :text="capacityNote ?? 'Add an existing user'" :disabled="!capacityNote">
            <UButton
              icon="i-lucide-user-plus"
              size="sm"
              variant="outline"
              color="neutral"
              label="Add member"
              :disabled="atCapacity"
              @click="openAdd"
            />
          </UTooltip>
        </div>
      </div>
    </template>
    <AppPermissionGate permission="membership:read" label="members" compact>
      <AppQueryState
        :status="status"
        :error="error"
        :empty="!members.length"
        error-title="Could not load members"
        :empty-title="includeInactive ? 'No members' : 'No active members'"
        :empty-description="canAddMember && !readOnly ? 'Add an existing user to give them roles here.' : undefined"
        empty-icon="i-lucide-users"
        skeleton="table"
        :skeleton-rows="3"
        compact
        @retry="refetch()"
      >
        <UTable
          :data="members"
          :columns="columns"
          :column-pinning="{ left: [], right: ['actions'] }"
        >
          <template #name-cell="{ row }">
            <div class="min-w-0 whitespace-normal">
              <ULink
                v-if="canOpenUsers"
                :to="`/app/users/${row.original.user_id}`"
                class="font-medium text-highlighted hover:underline"
              >
                {{ memberName(row.original) }}
              </ULink>
              <span v-else class="font-medium text-highlighted">{{ memberName(row.original) }}</span>
              <p class="break-all text-xs text-muted">
                {{ row.original.user_email }}
              </p>
            </div>
          </template>
          <template #roles-cell="{ row }">
            <div class="flex flex-wrap gap-1 whitespace-normal">
              <AppRoleChip v-for="r in row.original.roles ?? []" :key="r.id" :role="r" />
              <span v-if="!row.original.roles?.length" class="text-sm text-dimmed">—</span>
            </div>
          </template>
          <template #status-cell="{ row }">
            <div class="flex flex-wrap items-center gap-1">
              <UBadge
                :color="badgeColor(MEMBERSHIP_STATUS_COLOR, row.original.effective_status)"
                variant="subtle"
                size="sm"
                :label="statusLabel(row.original.effective_status)"
              />
              <UBadge
                v-if="row.original.user_status !== 'active'"
                :color="badgeColor(USER_STATUS_COLOR, row.original.user_status)"
                variant="outline"
                size="sm"
                :label="`Account ${statusLabel(row.original.user_status).toLowerCase()}`"
              />
            </div>
          </template>
          <template #actions-cell="{ row }">
            <div v-if="memberRowMenu(row.original).length" class="text-right">
              <UDropdownMenu :items="memberRowMenu(row.original)">
                <UButton
                  icon="i-lucide-ellipsis-vertical"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  :aria-label="`Member actions for ${memberName(row.original)}`"
                />
              </UDropdownMenu>
            </div>
          </template>
        </UTable>
        <div class="mt-3">
          <AppListPagination
            v-if="total != null"
            v-model:page="page"
            :total="total"
            :page-size="pageSize"
            noun="member"
          />
          <div v-else-if="page > 1 || members.length === pageSize" class="flex justify-end">
            <UPagination
              v-model:page="page"
              :total="pagerTotal"
              :items-per-page="pageSize"
              :show-edges="false"
              aria-label="Members pages"
            />
          </div>
        </div>
      </AppQueryState>
    </AppPermissionGate>
  </UCard>

  <!-- Add member -->
  <AppFormDialog
    ref="addMemberDialog"
    v-model:open="addOpen"
    title="Add member"
    :description="`Add an existing user to ${entity.display_name}.`"
    :schema="addMemberSchema"
    :state="addState"
    :error="addError"
    submit-label="Add member"
    :submit-disabled="addBlocked"
    size="xl"
    @submit="onAdd"
  >
    <UFormField
      name="userId"
      label="User"
      required
      :error="existingMembershipError"
    >
      <USelectMenu
        id="add-member-user"
        v-model="addState.userId"
        v-model:search-term="userSearch"
        aria-label="User"
        :items="userOptions"
        value-key="value"
        ignore-filter
        :loading="usersLoading"
        placeholder="Choose a user"
        :search-input="userSearchInput"
        class="w-full"
      >
        <template #empty>
          {{ usersLoading ? 'Loading users...' : 'No user matches.' }}
        </template>
        <template v-if="usersHint" #content-bottom>
          <p class="border-t border-default px-2 py-1.5 text-xs text-muted">
            {{ usersHint }}
          </p>
        </template>
      </USelectMenu>
    </UFormField>
    <UFormField name="roleIds" label="Roles" hint="Optional">
      <AppRoleAccessEditor
        v-model="addState.roleIds"
        :roles="rolesPool"
        :loading="rolesPoolStatus === 'pending'"
        :empty-text="rolesPoolEmptyText"
        :truncated="rolesPoolTruncated"
      />
    </UFormField>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <UFormField name="status" label="Status" required>
        <USelect v-model="addState.status" :items="MEMBER_STATUS_ITEMS" class="w-full" />
      </UFormField>
      <UFormField
        name="validFrom"
        label="Valid from"
        hint="Optional"
        :help="startOfDayHelp()"
      >
        <AppDateField v-model="addState.validFrom" label="Valid from" />
      </UFormField>
      <UFormField
        name="validUntil"
        label="Valid until"
        hint="Optional"
        :help="endOfDayHelp()"
      >
        <AppDateField v-model="addState.validUntil" label="Valid until" />
      </UFormField>
    </div>
    <UFormField name="reason" label="Reason" hint="Optional">
      <UTextarea
        v-model="addState.reason"
        :rows="2"
        placeholder="A note for the audit trail"
        class="w-full"
      />
    </UFormField>
  </AppFormDialog>

  <!-- Edit member access -->
  <AppFormDialog
    ref="editMemberDialog"
    v-model:open="editOpen"
    :title="`Edit access for ${editTarget?.user_email ?? 'member'}`"
    description="Update this member's roles, status and access window."
    :schema="editMemberSchema"
    :state="editState"
    :error="editError"
    :conflict="editConflict"
    :pending="savingEdit"
    :dirty="editDirty"
    require-changes
    submit-label="Save changes"
    size="xl"
    @submit="onEdit"
    @reload="reloadEdit"
    @overwrite="overwriteEdit"
  >
    <UFormField name="roleIds" label="Roles">
      <AppRoleAccessEditor
        v-model="editState.roleIds"
        :roles="rolesPool"
        :known="editKnownRoles"
        :loading="rolesPoolStatus === 'pending'"
        :empty-text="rolesPoolEmptyText"
        :truncated="rolesPoolTruncated"
      />
    </UFormField>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <UFormField name="status" label="Status" required>
        <USelect v-model="editState.status" :items="MEMBER_STATUS_ITEMS" class="w-full" />
      </UFormField>
      <UFormField
        name="validFrom"
        label="Valid from"
        hint="Optional"
        :help="startOfDayHelp()"
      >
        <AppDateField v-model="editState.validFrom" label="Valid from" />
      </UFormField>
      <UFormField
        name="validUntil"
        label="Valid until"
        hint="Optional"
        :help="endOfDayHelp()"
      >
        <AppDateField v-model="editState.validUntil" label="Valid until" />
      </UFormField>
    </div>
    <UFormField name="reason" label="Reason" hint="Optional">
      <UTextarea
        v-model="editState.reason"
        :rows="2"
        placeholder="A note for the audit trail"
        class="w-full"
      />
    </UFormField>
  </AppFormDialog>

  <!-- Reactivate a suspended or ended membership -->
  <AppAccessReactivateDialog v-model:open="reactivateOpen" :target="reactivateTarget" />

  <!-- Remove member -->
  <AppConfirmDialog v-model:open="removeMember.open" v-bind="removeMember.dialog" @confirm="removeMember.confirm" />
</template>
