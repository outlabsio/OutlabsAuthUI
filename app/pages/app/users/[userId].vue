<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'

// User detail — the frame (navbar, tabs, not-found and denied states, header dialogs) binds
// useUserDetail; each tab's cards are components with their own composables
// (components/app/user/*). This file is display only.
const route = useRoute()
const userId = computed(() => String(route.params.userId))

const {
  user,
  status,
  error,
  isLoading,
  refetch,
  notFound,
  denied,
  deniedMessage,
  isEnterprise,
  hasMemberships,
  personalApiKeysAvailable,
  auditTimelineAvailable,
  membershipHistoryAvailable,
  tab,
  tabs,
  canEdit,
  actionItems,
  profileOpen,
  statusOpen,
  resetOpen,
  superuserOpen,
  resendInvite,
  restoreUser,
  deleteUser,
  deletedNotice,
  globalAccountNotice,
  lockCheckNotice
} = useUserDetail(userId)
// Document title: the account's email, like the navbar.
usePageMeta(() => user.value?.email)

const backToUsers: ButtonProps[] = [{ label: 'Back to users', color: 'neutral', variant: 'outline', to: '/app/users' }]
</script>

<template>
  <UDashboardPanel id="user-detail">
    <template #header>
      <UDashboardNavbar :title="user?.email ?? 'User'">
        <template #leading>
          <UDashboardSidebarCollapse />
          <AppBackButton section="users" />
        </template>
        <template #right>
          <UButton
            v-if="canEdit"
            icon="i-lucide-pencil"
            color="neutral"
            variant="outline"
            label="Edit"
            @click="profileOpen = true"
          />
          <UDropdownMenu v-if="actionItems.length" :items="actionItems">
            <UTooltip text="More actions">
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
                aria-label="More user actions"
              />
            </UTooltip>
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar v-if="user">
        <!-- `-mx-1` aligns the first tab with the navbar, as in the dashboard template. -->
        <UNavigationMenu
          :items="tabs"
          highlight
          class="-mx-1 flex-1"
          aria-label="User sections"
        />
      </UDashboardToolbar>
    </template>

    <template #body>
      <AppPermissionGate section="users">
        <UEmpty
          v-if="notFound"
          icon="i-lucide-search-x"
          title="User not found"
          description="It doesn't exist, the link is wrong, or the account is outside your organization."
          :actions="backToUsers"
          class="mx-auto w-full max-w-5xl"
        />
        <UEmpty
          v-else-if="denied"
          icon="i-lucide-lock"
          title="You can't view this user"
          :description="deniedMessage"
          :actions="backToUsers"
          class="mx-auto w-full max-w-5xl"
        />
        <AppQueryState
          v-else
          :status="status"
          :error="error"
          :refreshing="isLoading"
          :has-data="Boolean(user)"
          error-title="Could not load user"
          skeleton="detail"
          :skeleton-rows="8"
          loading-label="Loading user"
          class="mx-auto w-full max-w-5xl"
          @retry="refetch()"
        >
          <div v-if="user" class="space-y-6">
            <!-- A delegated admin and an account holding a system-wide role: why nothing is offered. -->
            <UAlert
              v-if="globalAccountNotice"
              color="neutral"
              variant="subtle"
              icon="i-lucide-shield"
              :title="globalAccountNotice.title"
              :description="globalAccountNotice.description"
              data-testid="user-global-account"
            />
            <!-- ...or that rule could not be checked: nothing is offered until Retry reads it. -->
            <UAlert
              v-if="lockCheckNotice"
              role="alert"
              color="error"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              :title="lockCheckNotice.title"
              :description="lockCheckNotice.description"
              :actions="lockCheckNotice.actions"
              data-testid="user-lock-check-error"
            />
            <AppUserProfileCard v-if="tab === 'overview'" :user="user" />
            <template v-else-if="tab === 'access'">
              <!-- A deleted account keeps its grants on record but offers no access changes (F-174). -->
              <UAlert
                v-if="deletedNotice"
                color="neutral"
                variant="subtle"
                icon="i-lucide-archive"
                title="This account is deleted"
                :description="deletedNotice.description"
                :actions="deletedNotice.actions"
                data-testid="user-deleted-access"
              />
              <AppUserRolesCard :user="user" :is-enterprise="isEnterprise" />
              <AppUserMembershipsCard v-if="hasMemberships" :user="user" />
              <AppUserAccessCard :user="user" />
            </template>
            <template v-else-if="tab === 'security'">
              <AppUserSessionsCard :user="user" />
              <AppUserApiKeysCard v-if="personalApiKeysAvailable" :user="user" />
            </template>
            <template v-else>
              <AppUserAuditCard v-if="auditTimelineAvailable" :user="user" />
              <AppUserMembershipHistoryCard v-if="membershipHistoryAvailable" :user="user" />
            </template>
          </div>
        </AppQueryState>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>

  <template v-if="user">
    <AppUserProfileDialog v-model:open="profileOpen" :user="user" />
    <AppUserStatusDialog v-model:open="statusOpen" :user="user" />
    <AppUserResetPasswordDialog v-model:open="resetOpen" :user="user" />
    <AppUserSuperuserDialog v-model:open="superuserOpen" :user="user" />
  </template>
  <AppConfirmDialog v-model:open="resendInvite.open" v-bind="resendInvite.dialog" @confirm="resendInvite.confirm" />
  <AppConfirmDialog v-model:open="restoreUser.open" v-bind="restoreUser.dialog" @confirm="restoreUser.confirm" />
  <AppConfirmDialog v-model:open="deleteUser.open" v-bind="deleteUser.dialog" @confirm="deleteUser.confirm" />
</template>
