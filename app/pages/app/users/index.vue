<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { breakpointsTailwind, createReusableTemplate, useBreakpoints } from '@vueuse/core'
import type { UserListRow } from '~/composables/useUsersWorkspace'
import { PASSWORD_POLICY_HINT } from '~/schemas/auth-flows'
import { USER_STATUS_COLOR, statusLabel } from '~/utils/status'
import { hideBelowMd, hideBelowSm, srOnlyHeader } from '~/utils/table'
import { orphanMembershipSummary, userFullName, userHolds } from '~/utils/users'

// Users vertical — logic in useUsersWorkspace; this file is display only.
const {
  canRead,
  canCreate,
  canInvite,
  isSuperuser,
  isEnterprise,
  superuserDescription,
  search,
  statusFilter,
  statusItems,
  typeFilter,
  typeItems,
  showOrgFilter,
  showOrgColumn,
  orgFilter,
  orgItems,
  showOrphanedFilter,
  orphanedOnly,
  activeFilterCount,
  rows,
  total,
  page,
  pageSize,
  status,
  error,
  fetching,
  retry,
  avatarOf,
  emptyState,
  rowMenu,
  createOpen,
  createError,
  createState,
  createSchema,
  rootChoice,
  rootRequired,
  openCreate,
  onCreate,
  inviteOpen,
  inviteError,
  inviteState,
  inviteSchema,
  inviteRule,
  openInvite,
  onInvite,
  inviteGrant,
  inviteRolesPool,
  inviteRolesStatus,
  inviteRolesEmptyText,
  inviteRolesTruncated,
  inviteRolesHelp,
  editOpen,
  editTarget,
  restoreUser,
  deleteUser
} = useUsersWorkspace()

// --- Pure display config ---
// Below `sm` the status moves under the name and secondary columns are hidden; the actions
// column stays pinned on the right.
const columns = computed<TableColumn<UserListRow>[]>(() => orphanedOnly.value
  ? [
      { id: 'user', header: 'Name' },
      { id: 'status', header: 'Status', meta: hideBelowSm },
      { id: 'last_entity', header: 'Last entity', meta: hideBelowSm },
      { id: 'last_change', header: 'Last change', meta: hideBelowMd },
      { id: 'memberships', header: 'Memberships', meta: hideBelowMd },
      { id: 'actions', header: srOnlyHeader('Actions') }
    ]
  : [
      { id: 'user', header: 'Name' },
      ...(showOrgColumn.value ? [{ id: 'organization', header: 'Organization', meta: hideBelowMd }] : []),
      { id: 'status', header: 'Status', meta: hideBelowSm },
      { id: 'last_login', header: 'Last sign-in', meta: hideBelowSm },
      { id: 'created_at', header: 'Created', meta: hideBelowMd },
      { id: 'actions', header: srOnlyHeader('Actions') }
    ])
const columnPinning = { left: [], right: ['actions'] }

const now = useRelativeNow()
const holdsOf = (row: UserListRow) => userHolds(row.user, now.value.getTime())
const nameOf = (row: UserListRow) => userFullName(row.user)
const linkLabel = (row: UserListRow) => (nameOf(row) ? `${nameOf(row)}, ${row.user.email}` : row.user.email)

// Below `sm` the filters move behind a Filters button, so the toolbar never scrolls sideways.
const compactFilters = useBreakpoints(breakpointsTailwind).smaller('sm')
const [DefineFilters, ReuseFilters] = createReusableTemplate<{ stacked: boolean }>()
</script>

<template>
  <UDashboardPanel id="users">
    <template #header>
      <UDashboardNavbar title="Users">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UTooltip v-if="canInvite" text="Invite user" :disabled="!compactFilters">
            <UButton
              icon="i-lucide-mail"
              color="neutral"
              variant="outline"
              :label="compactFilters ? undefined : 'Invite'"
              :aria-label="compactFilters ? 'Invite' : undefined"
              @click="openInvite"
            />
          </UTooltip>
          <UButton
            v-if="canCreate"
            icon="i-lucide-plus"
            label="Add user"
            @click="openCreate"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar v-if="canRead">
        <template #left>
          <DefineFilters v-slot="{ stacked }">
            <UFormField v-if="stacked" label="Status">
              <USelect
                id="user-status-filter"
                v-model="statusFilter"
                :items="statusItems"
                value-key="value"
                class="w-full"
                :disabled="orphanedOnly"
              />
            </UFormField>
            <USelect
              v-else
              id="user-status-filter"
              v-model="statusFilter"
              :items="statusItems"
              value-key="value"
              class="w-40"
              :disabled="orphanedOnly"
              aria-label="Filter by status"
            />
            <UFormField v-if="stacked" label="Account type">
              <USelect
                id="user-type-filter"
                v-model="typeFilter"
                :items="typeItems"
                value-key="value"
                class="w-full"
                :disabled="orphanedOnly"
              />
            </UFormField>
            <USelect
              v-else
              id="user-type-filter"
              v-model="typeFilter"
              :items="typeItems"
              value-key="value"
              class="w-44"
              :disabled="orphanedOnly"
              aria-label="Filter by account type"
            />
            <template v-if="showOrgFilter">
              <UFormField v-if="stacked" label="Organization">
                <USelectMenu
                  id="user-org-filter"
                  v-model="orgFilter"
                  aria-label="Organization"
                  :items="orgItems"
                  value-key="value"
                  class="w-full"
                />
              </UFormField>
              <USelectMenu
                v-else
                id="user-org-filter"
                v-model="orgFilter"
                :items="orgItems"
                value-key="value"
                class="w-48"
                aria-label="Filter by organization"
              />
            </template>
            <UCheckbox v-if="showOrphanedFilter" v-model="orphanedOnly" label="Orphaned only" />
          </DefineFilters>

          <div class="flex w-full flex-wrap items-center gap-2 py-2">
            <UInput
              v-model="search"
              type="search"
              icon="i-lucide-search"
              placeholder="Search users..."
              aria-label="Search users"
              class="min-w-0 flex-1 sm:w-64 sm:flex-none"
            />
            <UPopover v-if="compactFilters">
              <UChip :text="activeFilterCount" :show="activeFilterCount > 0" size="3xl">
                <UButton
                  icon="i-lucide-sliders-horizontal"
                  color="neutral"
                  variant="outline"
                  label="Filters"
                />
              </UChip>
              <template #content>
                <div class="flex w-72 flex-col gap-3 p-4">
                  <ReuseFilters :stacked="true" />
                </div>
              </template>
            </UPopover>
            <ReuseFilters v-else :stacked="false" />
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <AppPermissionGate section="users">
        <div class="space-y-4">
          <p v-if="orphanedOnly" class="text-sm text-muted" data-testid="orphaned-note">
            Accounts that lost every entity membership, with where they last belonged. The list
            includes deleted accounts; the status and account type filters do not apply to it.
          </p>
          <AppQueryState
            :status="status"
            :error="error"
            :enabled="canRead"
            :empty="total === 0"
            :refreshing="fetching"
            error-title="Could not load users"
            :empty-title="emptyState.title"
            :empty-description="emptyState.description"
            empty-icon="i-lucide-users"
            :empty-actions="emptyState.actions"
            skeleton="table"
            :skeleton-rows="8"
            :skeleton-columns="5"
            loading-label="Loading users"
            @retry="retry"
          >
            <div class="space-y-4">
              <UTable
                :data="rows"
                :columns="columns"
                :column-pinning="columnPinning"
                :get-row-id="(row: UserListRow) => row.id"
                :loading="fetching"
                sticky="header"
              >
                <template #user-cell="{ row }">
                  <div class="flex flex-col gap-1 whitespace-normal">
                    <div class="flex flex-wrap items-center gap-2">
                      <UUser
                        :description="nameOf(row.original) ? row.original.user.email : undefined"
                        :avatar="avatarOf(row.original.user)"
                        size="sm"
                      >
                        <template #name>
                          <ULink
                            :to="`/app/users/${row.original.id}`"
                            :aria-label="linkLabel(row.original)"
                            class="text-highlighted hover:underline"
                          >
                            {{ nameOf(row.original) ?? row.original.user.email }}
                          </ULink>
                        </template>
                      </UUser>
                      <UBadge
                        v-if="row.original.user.is_superuser"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        label="Superuser"
                      />
                      <UBadge
                        v-if="!row.original.user.email_verified && !['invited', 'deleted'].includes(row.original.user.status)"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        label="Email unverified"
                      />
                    </div>
                    <!-- Phones: the status and holds under the name -->
                    <div class="flex flex-wrap items-center gap-1 sm:hidden">
                      <UBadge :color="USER_STATUS_COLOR[row.original.user.status]" variant="subtle" size="sm">
                        {{ statusLabel(row.original.user.status) }}
                      </UBadge>
                      <UBadge
                        v-for="hold in holdsOf(row.original)"
                        :key="hold.kind"
                        color="warning"
                        variant="outline"
                        size="sm"
                        icon="i-lucide-clock"
                        :label="hold.label"
                      />
                    </div>
                  </div>
                </template>
                <template #organization-cell="{ row }">
                  <span v-if="row.original.user.root_entity_name">{{ row.original.user.root_entity_name }}</span>
                  <span v-else class="text-muted">None</span>
                </template>
                <template #status-cell="{ row }">
                  <div class="flex flex-wrap items-center gap-1">
                    <UBadge :color="USER_STATUS_COLOR[row.original.user.status]" variant="subtle">
                      {{ statusLabel(row.original.user.status) }}
                    </UBadge>
                    <UTooltip v-for="hold in holdsOf(row.original)" :key="hold.kind" :text="hold.description">
                      <UBadge
                        color="warning"
                        variant="outline"
                        icon="i-lucide-clock"
                        :label="hold.label"
                      />
                    </UTooltip>
                  </div>
                </template>
                <template #last_login-cell="{ row }">
                  <AppTimestamp :value="row.original.user.last_login" fallback="Never" />
                </template>
                <template #created_at-cell="{ row }">
                  <AppTimestamp :value="row.original.user.created_at" />
                </template>
                <template #last_entity-cell="{ row }">
                  <span v-if="row.original.orphan?.last_entity_name">{{ row.original.orphan.last_entity_name }}</span>
                  <span v-else class="text-muted">Unknown</span>
                </template>
                <template #last_change-cell="{ row }">
                  <div v-if="row.original.orphan?.last_membership_event_type" class="flex flex-col">
                    <span>{{ statusLabel(row.original.orphan.last_membership_event_type) }}</span>
                    <span class="text-xs text-muted">
                      <AppTimestamp :value="row.original.orphan.last_membership_event_at" />
                    </span>
                  </div>
                  <span v-else class="text-muted">—</span>
                </template>
                <template #memberships-cell="{ row }">
                  <span v-if="row.original.orphan">{{ orphanMembershipSummary(row.original.orphan.active_membership_count, row.original.orphan.total_membership_count) }}</span>
                </template>
                <template #actions-cell="{ row }">
                  <div class="text-right">
                    <UDropdownMenu :items="rowMenu(row.original.user)">
                      <UButton
                        icon="i-lucide-ellipsis-vertical"
                        color="neutral"
                        variant="ghost"
                        size="sm"
                        :aria-label="`User actions for ${row.original.user.email}`"
                      />
                    </UDropdownMenu>
                  </div>
                </template>
              </UTable>
              <AppListPagination
                v-model:page="page"
                :total="total"
                :page-size="pageSize"
                noun="user"
              />
            </div>
          </AppQueryState>
        </div>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>

  <!-- Add user -->
  <AppFormDialog
    ref="createDialog"
    v-model:open="createOpen"
    title="Add user"
    description="The account is active right away and signs in with this password."
    :schema="createSchema"
    :state="createState"
    :error="createError"
    submit-label="Create user"
    size="lg"
    @submit="onCreate"
  >
    <UFormField name="email" label="Email" required>
      <UInput
        v-model="createState.email"
        type="email"
        autocomplete="off"
        class="w-full"
        placeholder="you@example.com"
        autofocus
      />
    </UFormField>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <UFormField name="first_name" label="First name" hint="Optional">
        <UInput v-model="createState.first_name" class="w-full" />
      </UFormField>
      <UFormField name="last_name" label="Last name" hint="Optional">
        <UInput v-model="createState.last_name" class="w-full" />
      </UFormField>
    </div>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <UFormField
        name="password"
        label="Initial password"
        required
        :help="PASSWORD_POLICY_HINT"
      >
        <AppPasswordInput
          v-model="createState.password"
          autocomplete="new-password"
          class="w-full"
        />
      </UFormField>
      <UFormField name="confirm_password" label="Confirm password" required>
        <AppPasswordInput
          v-model="createState.confirm_password"
          autocomplete="new-password"
          class="w-full"
        />
      </UFormField>
    </div>
    <UFormField
      v-if="isEnterprise"
      name="root_entity_id"
      label="Organization"
      :required="rootRequired"
      :hint="rootRequired ? undefined : 'Optional'"
      :help="rootRequired
        ? 'Accounts you create belong to your organization, so you can keep managing them.'
        : 'The account\'s home organization. Platform accounts can have none.'"
    >
      <USelectMenu
        id="user-root-entity"
        v-model="createState.root_entity_id"
        aria-label="Organization"
        value-key="value"
        :items="rootChoice.items"
        placeholder="Select an organization"
        class="w-full"
      />
    </UFormField>
    <template v-if="isSuperuser">
      <UFormField
        name="is_superuser"
        label="Superuser"
        :description="superuserDescription"
      >
        <USwitch v-model="createState.is_superuser" />
      </UFormField>
      <UAlert
        v-if="createState.is_superuser"
        color="warning"
        variant="subtle"
        icon="i-lucide-shield-alert"
        title="This account will be a superuser"
        description="It can read and change everything, including other superusers."
      />
    </template>
  </AppFormDialog>

  <!-- Invite -->
  <AppFormDialog
    ref="inviteDialog"
    v-model:open="inviteOpen"
    title="Invite user"
    :description="inviteRule.offered
      ? 'Email an invitation to set a password. Attach an entity membership with roles, or direct account roles.'
      : 'Email an invitation to set a password, optionally with account roles.'"
    :schema="inviteSchema"
    :state="inviteState"
    :error="inviteError"
    submit-label="Send invite"
    size="xl"
    @submit="onInvite"
  >
    <UFormField name="email" label="Email" required>
      <UInput
        v-model="inviteState.email"
        type="email"
        autocomplete="off"
        class="w-full"
        placeholder="you@example.com"
        autofocus
      />
    </UFormField>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <UFormField name="first_name" label="First name" hint="Optional">
        <UInput v-model="inviteState.first_name" class="w-full" />
      </UFormField>
      <UFormField name="last_name" label="Last name" hint="Optional">
        <UInput v-model="inviteState.last_name" class="w-full" />
      </UFormField>
    </div>
    <!-- Where the account gets its roles: decided right before choosing them. -->
    <UFormField
      v-if="inviteRule.offered"
      name="entity_id"
      label="Entity"
      :required="inviteRule.required"
      :hint="inviteRule.required ? undefined : 'Optional'"
      :help="inviteRule.required ? 'The account joins this entity, which keeps it in your organization.' : 'Leave empty to grant direct account roles instead.'"
    >
      <AppEntityPicker
        id="invite-entity"
        v-model="inviteState.entity_id"
        aria-label="Entity"
        :placeholder="inviteRule.required ? 'Select an entity' : 'No entity (direct roles)'"
      />
    </UFormField>
    <UFormField
      name="role_ids"
      label="Roles"
      hint="Optional"
      :help="inviteRolesHelp"
    >
      <AppRoleAccessEditor
        v-model="inviteState.role_ids"
        :grant="inviteGrant"
        :roles="inviteRolesPool"
        :loading="inviteRolesStatus === 'pending'"
        :empty-text="inviteRolesEmptyText"
        :truncated="inviteRolesTruncated"
        collapse-when-empty
      />
    </UFormField>
    <template v-if="isSuperuser">
      <UFormField
        name="is_superuser"
        label="Superuser"
        :description="superuserDescription"
      >
        <USwitch v-model="inviteState.is_superuser" />
      </UFormField>
      <UAlert
        v-if="inviteState.is_superuser"
        color="warning"
        variant="subtle"
        icon="i-lucide-shield-alert"
        title="The invited account will be a superuser"
        description="It can read and change everything, including other superusers."
      />
    </template>
  </AppFormDialog>

  <!-- Edit profile (shared with the user detail page) -->
  <AppUserProfileDialog v-model:open="editOpen" :user="editTarget" />

  <!-- Restore / delete -->
  <AppConfirmDialog v-model:open="restoreUser.open" v-bind="restoreUser.dialog" @confirm="restoreUser.confirm" />
  <AppConfirmDialog v-model:open="deleteUser.open" v-bind="deleteUser.dialog" @confirm="deleteUser.confirm" />
</template>
