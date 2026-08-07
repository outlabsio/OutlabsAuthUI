<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { governanceSchema } from '~/schemas/entity'
import type { Entity, EntityStatusValue } from '~/types/entity'
import type { EntityMember } from '~/types/membership'
import type { UserStatusValue } from '~/types/user'

// The entity detail panel — the right column of the entities master-detail (and reused for the
// deep-link route). All logic is in useEntityDetail; this file is display only. entityId is a
// prop so the panel swaps as the tree selection changes.
const props = defineProps<{ entityId: string }>()
const entityId = computed(() => props.entityId)

const {
  entity,
  status,
  errorMessage,
  canManage,
  children,
  childrenStatus,
  members,
  membersStatus,
  canAddMember,
  memberRowMenu,
  rolesPool,
  addSelectedRoles,
  editSelectedRoles,
  addableUserOptions,
  memberStatusItems,
  addMemberOpen,
  addMemberState,
  addingMember,
  openAddMember,
  onAddMember,
  editMemberOpen,
  editMemberTarget,
  editMemberState,
  savingMember,
  onSaveMember,
  removeMemberOpen,
  removeMemberTarget,
  removingMember,
  onConfirmRemoveMember,
  editOpen,
  editState,
  saving,
  openEdit,
  onEdit,
  governanceOpen,
  governanceState,
  savingGovernance,
  openGovernance,
  onSaveGovernance,
  toggleChildClass,
  moveOpen,
  moveParentId,
  moving,
  openMove,
  onMove,
  moveParentSelectItems
} = useEntityDetail(entityId)

// --- Pure display config (presentation, not logic) ---
const detailItems = computed(() => {
  const e = entity.value
  if (!e) return []
  return [
    { label: 'Name', value: e.name },
    { label: 'Slug', value: e.slug },
    { label: 'Type', value: e.entity_type },
    { label: 'Class', value: e.entity_class.replace('_', ' ') },
    { label: 'Status', value: e.status }
  ]
})

const childColumns: TableColumn<Entity>[] = [
  { accessorKey: 'display_name', header: 'Display name' },
  { accessorKey: 'slug', header: 'Slug' },
  { accessorKey: 'entity_type', header: 'Type' }
]

// Deterministic badge colour per entity_type, so the same type reads the same everywhere.
const TYPE_COLORS = ['info', 'success', 'warning', 'secondary', 'accent', 'special'] as const
function typeColor(type: string): (typeof TYPE_COLORS)[number] {
  let hash = 0
  for (let i = 0; i < type.length; i++) hash = (hash * 31 + type.charCodeAt(i)) >>> 0
  return TYPE_COLORS[hash % TYPE_COLORS.length]!
}

const memberColumns: TableColumn<EntityMember>[] = [
  { id: 'name', header: 'Name' },
  { accessorKey: 'user_email', header: 'Email' },
  { id: 'roles', header: 'Roles' },
  { accessorKey: 'user_status', header: 'Status' },
  { id: 'actions', header: '' }
]
const memberStatusColor: Record<UserStatusValue, 'success' | 'info' | 'warning' | 'error' | 'neutral'> = {
  active: 'success',
  invited: 'info',
  suspended: 'warning',
  banned: 'error',
  deleted: 'neutral'
}
function memberName(m: EntityMember) {
  return [m.user_first_name, m.user_last_name].filter(Boolean).join(' ').trim() || m.user_email
}

const entityStatusItems = [
  { label: 'Active', value: 'active' as EntityStatusValue },
  { label: 'Inactive', value: 'inactive' as EntityStatusValue },
  { label: 'Archived', value: 'archived' as EntityStatusValue }
]
</script>

<template>
  <UDashboardPanel id="entity-detail">
    <template #header>
      <UDashboardNavbar :title="entity?.display_name ?? 'Entity'">
        <template #leading>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            to="/app/entities"
            aria-label="Close entity detail"
          />
        </template>
        <template #right>
          <div v-if="entity && canManage" class="flex items-center gap-2">
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="outline"
              label="Edit"
              @click="openEdit"
            />
            <UButton
              icon="i-lucide-shield-check"
              color="neutral"
              variant="outline"
              label="Governance"
              @click="openGovernance"
            />
            <UButton
              icon="i-lucide-move"
              color="neutral"
              variant="outline"
              label="Move"
              @click="openMove"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <AppPermissionGate permission="entity:read">
        <UAlert
          v-if="status === 'error'"
          color="error"
          icon="i-lucide-triangle-alert"
          title="Could not load entity"
          :description="errorMessage"
        />

        <div v-else class="mx-auto w-full max-w-3xl space-y-6">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="font-semibold text-highlighted">
                  Details
                </h2>
                <UBadge v-if="entity" :color="entity.entity_class === 'structural' ? 'info' : 'special'" variant="subtle">
                  {{ entity.entity_class.replace('_', ' ') }}
                </UBadge>
              </div>
            </template>
            <AppDetailList :items="detailItems" />
            <p v-if="entity?.description" class="mt-4 text-sm text-muted">
              {{ entity.description }}
            </p>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="font-semibold text-highlighted">
                  Children
                </h2>
                <span class="text-sm text-muted">{{ children.length }}</span>
              </div>
            </template>
            <UTable
              :data="children"
              :columns="childColumns"
              :loading="childrenStatus === 'pending'"
              :empty="'No child entities.'"
            >
              <template #display_name-cell="{ row }">
                <ULink
                  :to="{ query: { entity: row.original.id } }"
                  class="font-medium text-highlighted hover:underline"
                >
                  {{ row.original.display_name }}
                </ULink>
              </template>
              <template #entity_type-cell="{ row }">
                <UBadge :color="typeColor(row.original.entity_type)" variant="subtle" size="sm">
                  {{ row.original.entity_type }}
                </UBadge>
              </template>
            </UTable>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <h2 class="font-semibold text-highlighted">
                    Users
                  </h2>
                  <span class="text-sm text-muted">{{ members.length }}</span>
                </div>
                <UButton
                  v-if="canAddMember"
                  icon="i-lucide-user-plus"
                  size="xs"
                  variant="outline"
                  color="neutral"
                  label="Add member"
                  @click="openAddMember"
                />
              </div>
            </template>
            <AppPermissionGate permission="membership:read">
              <UTable
                :data="members"
                :columns="memberColumns"
                :loading="membersStatus === 'pending'"
                :empty="'No users assigned to this entity.'"
              >
                <template #name-cell="{ row }">
                  <ULink
                    :to="`/app/users/${row.original.user_id}`"
                    class="font-medium text-highlighted hover:underline"
                  >
                    {{ memberName(row.original) }}
                  </ULink>
                </template>
                <template #roles-cell="{ row }">
                  <div class="flex flex-wrap gap-1">
                    <UBadge
                      v-for="r in row.original.roles"
                      :key="r.id"
                      color="neutral"
                      variant="subtle"
                      size="sm"
                    >
                      {{ r.display_name || r.name }}
                    </UBadge>
                    <span v-if="!row.original.roles.length" class="text-sm text-dimmed">—</span>
                  </div>
                </template>
                <template #user_status-cell="{ row }">
                  <UBadge
                    :color="memberStatusColor[row.original.user_status]"
                    variant="subtle"
                    size="sm"
                    class="capitalize"
                  >
                    {{ row.original.user_status }}
                  </UBadge>
                </template>
                <template #actions-cell="{ row }">
                  <div v-if="memberRowMenu(row.original).length" class="text-right">
                    <UDropdownMenu :items="memberRowMenu(row.original)">
                      <UButton
                        icon="i-lucide-ellipsis-vertical"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        aria-label="Member actions"
                      />
                    </UDropdownMenu>
                  </div>
                </template>
              </UTable>
            </AppPermissionGate>
          </UCard>
        </div>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>

  <!-- Edit -->
  <UModal v-model:open="editOpen" title="Edit entity">
    <template #body>
      <div class="space-y-4">
        <div class="space-y-1.5">
          <label for="entity-edit-display-name" class="block text-sm font-medium text-default">Display name</label>
          <UInput id="entity-edit-display-name" v-model="editState.displayName" class="w-full" />
        </div>
        <div class="space-y-1.5">
          <label for="entity-edit-description" class="block text-sm font-medium text-default">Description</label>
          <UTextarea
            id="entity-edit-description"
            v-model="editState.description"
            :rows="2"
            class="w-full"
          />
        </div>
        <div class="space-y-1.5">
          <label for="entity-edit-status" class="block text-sm font-medium text-default">Status</label>
          <USelect
            id="entity-edit-status"
            v-model="editState.status"
            :items="entityStatusItems"
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
          @click="editOpen = false"
        />
        <UButton label="Save changes" :loading="saving" @click="onEdit" />
      </div>
    </template>
  </UModal>

  <!-- Governance -->
  <UModal
    v-model:open="governanceOpen"
    title="Governance"
    description="Control what can be created under this entity and how children are named."
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <UForm
        :schema="governanceSchema"
        :state="governanceState"
        class="space-y-4"
        @submit="onSaveGovernance"
      >
        <div class="space-y-1.5">
          <span class="block text-sm font-medium text-default">Allowed child classes</span>
          <div class="flex gap-4">
            <UCheckbox
              label="Structural"
              :model-value="governanceState.allowedChildClasses.includes('structural')"
              @update:model-value="toggleChildClass('structural')"
            />
            <UCheckbox
              label="Access group"
              :model-value="governanceState.allowedChildClasses.includes('access_group')"
              @update:model-value="toggleChildClass('access_group')"
            />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label for="gov-child-types" class="block text-sm font-medium text-default">Allowed child types</label>
            <UInput
              id="gov-child-types"
              v-model="governanceState.allowedChildTypes"
              placeholder="region, office"
              class="w-full"
            />
            <p class="text-xs text-muted">
              Comma-separated. Blank = any.
            </p>
          </div>
          <UFormField name="max_members" label="Max members">
            <UInput
              v-model="governanceState.max_members"
              inputmode="numeric"
              placeholder="No limit"
              class="w-full"
            />
          </UFormField>
        </div>
        <div class="space-y-2 rounded-lg border border-default p-3">
          <p class="text-sm font-medium text-default">
            Child naming rules
          </p>
          <p class="text-xs text-muted">
            Optional regular expressions enforced when naming children. Blank = no constraint.
          </p>
          <UFormField name="child_name_pattern" label="System-name pattern">
            <UInput v-model="governanceState.child_name_pattern" class="w-full font-mono" placeholder="^[a-z0-9-]+$" />
          </UFormField>
          <UFormField name="child_display_name_pattern" label="Display-name pattern">
            <UInput v-model="governanceState.child_display_name_pattern" class="w-full font-mono" placeholder="^.{2,}$" />
          </UFormField>
          <UFormField name="child_slug_pattern" label="Slug pattern">
            <UInput v-model="governanceState.child_slug_pattern" class="w-full font-mono" placeholder="^[a-z0-9-]+$" />
          </UFormField>
          <UFormField name="child_naming_guidance" label="Naming guidance">
            <UTextarea
              v-model="governanceState.child_naming_guidance"
              :rows="2"
              class="w-full"
              placeholder="Human-readable note shown when creating a child."
            />
          </UFormField>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="governanceOpen = false"
          />
          <UButton type="submit" label="Save governance" :loading="savingGovernance" />
        </div>
      </UForm>
    </template>
  </UModal>

  <!-- Move -->
  <UModal v-model:open="moveOpen" title="Move entity">
    <template #body>
      <div class="space-y-1.5">
        <label for="entity-move-parent" class="block text-sm font-medium text-default">New parent</label>
        <USelectMenu
          id="entity-move-parent"
          v-model="moveParentId"
          value-key="value"
          :items="moveParentSelectItems"
          placeholder="None (root)"
          class="w-full"
        />
        <p class="text-xs text-muted">
          Re-parents this entity. Hierarchy rules on the new parent still apply.
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="Cancel"
          @click="moveOpen = false"
        />
        <UButton label="Move entity" :loading="moving" @click="onMove" />
      </div>
    </template>
  </UModal>

  <!-- Add member -->
  <UModal
    v-model:open="addMemberOpen"
    title="Add member"
    description="Add an existing user to this entity."
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label for="add-member-user" class="block text-sm font-medium text-default">User</label>
            <USelectMenu
              id="add-member-user"
              v-model="addMemberState.userId"
              value-key="value"
              :items="addableUserOptions"
              placeholder="Search users..."
              class="w-full"
            />
          </div>
          <div class="space-y-1.5">
            <label for="add-member-status" class="block text-sm font-medium text-default">Status</label>
            <USelect
              id="add-member-status"
              v-model="addMemberState.status"
              :items="memberStatusItems"
              class="w-full"
            />
          </div>
        </div>
        <div class="space-y-1.5">
          <span class="block text-sm font-medium text-default">Roles</span>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AppRolePicker v-model="addMemberState.roleIds" :roles="rolesPool" height-class="h-64" />
            <div class="h-64 overflow-hidden rounded-md border border-default p-3">
              <AppEffectivePermissions :roles="addSelectedRoles" />
            </div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <span class="block text-sm font-medium text-default">Valid from</span>
            <AppDateField v-model="addMemberState.validFrom" placeholder="Any time" />
          </div>
          <div class="space-y-1.5">
            <span class="block text-sm font-medium text-default">Valid until</span>
            <AppDateField v-model="addMemberState.validUntil" placeholder="No expiry" />
          </div>
        </div>
        <div class="space-y-1.5">
          <label for="add-member-reason" class="block text-sm font-medium text-default">Reason</label>
          <UTextarea
            id="add-member-reason"
            v-model="addMemberState.reason"
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
          @click="addMemberOpen = false"
        />
        <UButton
          label="Add member"
          :loading="addingMember"
          :disabled="!addMemberState.userId"
          @click="onAddMember"
        />
      </div>
    </template>
  </UModal>

  <!-- Edit member access -->
  <UModal
    v-model:open="editMemberOpen"
    :title="`Edit access — ${editMemberTarget?.user_email ?? 'member'}`"
    description="Update this member's roles and access window."
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <div class="space-y-1.5">
          <span class="block text-sm font-medium text-default">Roles</span>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AppRolePicker v-model="editMemberState.roleIds" :roles="rolesPool" height-class="h-64" />
            <div class="h-64 overflow-hidden rounded-md border border-default p-3">
              <AppEffectivePermissions :roles="editSelectedRoles" />
            </div>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div class="space-y-1.5">
            <label for="edit-member-status" class="block text-sm font-medium text-default">Status</label>
            <USelect
              id="edit-member-status"
              v-model="editMemberState.status"
              :items="memberStatusItems"
              class="w-full"
            />
          </div>
          <div class="space-y-1.5">
            <span class="block text-sm font-medium text-default">Valid from</span>
            <AppDateField v-model="editMemberState.validFrom" placeholder="Any time" />
          </div>
          <div class="space-y-1.5">
            <span class="block text-sm font-medium text-default">Valid until</span>
            <AppDateField v-model="editMemberState.validUntil" placeholder="No expiry" />
          </div>
        </div>
        <div class="space-y-1.5">
          <label for="edit-member-reason" class="block text-sm font-medium text-default">Reason</label>
          <UTextarea
            id="edit-member-reason"
            v-model="editMemberState.reason"
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
          @click="editMemberOpen = false"
        />
        <UButton label="Save access" :loading="savingMember" @click="onSaveMember" />
      </div>
    </template>
  </UModal>

  <!-- Remove member -->
  <UModal v-model:open="removeMemberOpen" title="Remove member">
    <template #body>
      <p class="text-sm text-muted">
        Remove <span class="font-medium text-default">{{ removeMemberTarget?.user_email }}</span> from this entity?
        Their membership and its roles are revoked. This does not delete the user.
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="Cancel"
          @click="removeMemberOpen = false"
        />
        <UButton
          color="error"
          label="Remove"
          :loading="removingMember"
          @click="onConfirmRemoveMember"
        />
      </div>
    </template>
  </UModal>
</template>
