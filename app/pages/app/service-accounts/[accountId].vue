<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { effectiveScopeRows } from '~/utils/service-accounts'

// A service account — logic in useServiceAccountDetail (record, states, tabs, actions) and
// AppServiceAccountKeysCard (keys); this file is display only.
const route = useRoute()
const accountId = computed(() => String(route.params.accountId))

const {
  account,
  status,
  error,
  isLoading,
  refetch,
  notFound,
  denied,
  deniedMessage,
  tab,
  tabs,
  detailItems,
  anchorInactive,
  policy,
  canEdit,
  moreItems,
  openEdit,
  formOpen,
  formTarget,
  lifecycle
} = useServiceAccountDetail(accountId)
usePageMeta(() => account.value?.name)

const backToList: ButtonProps[] = [{ label: 'Back to service accounts', color: 'neutral', variant: 'outline', to: '/app/service-accounts' }]
const scopeRows = computed(() => (account.value ? effectiveScopeRows(account.value) : []))
const directScopes = computed(() => scopeRows.value.filter(row => row.direct).map(row => row.name))

// At phone width Edit keeps only its icon, so more of the account's name fits (F-129).
const compact = useBreakpoints(breakpointsTailwind).smaller('sm')
</script>

<template>
  <UDashboardPanel id="service-account-detail">
    <template #header>
      <UDashboardNavbar :title="account?.name ?? 'Service account'">
        <template #leading>
          <UDashboardSidebarCollapse />
          <AppBackButton section="service-accounts" />
        </template>
        <template #right>
          <UTooltip v-if="account && canEdit" text="Edit" :disabled="!compact">
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="outline"
              :label="compact ? undefined : 'Edit'"
              aria-label="Edit"
              @click="openEdit(account)"
            />
          </UTooltip>
          <UDropdownMenu v-if="moreItems.length" :items="moreItems">
            <UTooltip text="More actions">
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
                aria-label="More service account actions"
              />
            </UTooltip>
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar v-if="account">
        <!-- `-mx-1` aligns the first tab with the navbar, as in the dashboard template. -->
        <UNavigationMenu
          :items="tabs"
          highlight
          class="-mx-1 flex-1"
          aria-label="Service account sections"
        />
      </UDashboardToolbar>
    </template>

    <template #body>
      <AppPermissionGate section="service-accounts">
        <UEmpty
          v-if="notFound"
          icon="i-lucide-search-x"
          title="Service account not found"
          description="It doesn't exist, the link is wrong, or it belongs to another entity."
          :actions="backToList"
          class="mx-auto w-full max-w-4xl"
        />
        <UEmpty
          v-else-if="denied"
          icon="i-lucide-lock"
          title="You can't view this service account"
          :description="deniedMessage"
          :actions="backToList"
          class="mx-auto w-full max-w-4xl"
        />
        <AppQueryState
          v-else
          :status="status"
          :error="error"
          :refreshing="isLoading"
          :has-data="Boolean(account)"
          error-title="Could not load service account"
          skeleton="detail"
          :skeleton-rows="6"
          loading-label="Loading service account"
          class="mx-auto w-full max-w-4xl"
          @retry="refetch()"
        >
          <div v-if="account" class="space-y-6">
            <UAlert
              v-if="policy?.lockedReason"
              color="neutral"
              variant="subtle"
              icon="i-lucide-archive"
              title="Archived service account"
              :description="policy.lockedReason"
              data-testid="service-account-locked"
            />
            <UAlert
              v-else-if="account.status === 'inactive'"
              color="warning"
              variant="subtle"
              icon="i-lucide-pause"
              title="Deactivated"
              description="Its keys were revoked when it was deactivated. Reactivate it to issue new keys."
              data-testid="service-account-inactive"
            />

            <UCard v-if="tab === 'overview'">
              <template #header>
                <h2 class="font-semibold text-highlighted">
                  Details
                </h2>
              </template>
              <AppDetailList :items="detailItems">
                <template #value-scope="{ item }">
                  <span class="text-sm text-default">{{ item.value }}</span>
                  <UBadge
                    v-if="anchorInactive"
                    color="warning"
                    variant="subtle"
                    size="sm"
                    label="Entity inactive"
                    class="ml-2"
                  />
                </template>
                <template #value-created-by>
                  <AppUserLabel v-if="account.created_by_user_id" :user-id="account.created_by_user_id" />
                  <span v-else class="text-sm text-muted">Unknown</span>
                </template>
              </AppDetailList>
              <p v-if="account.description" class="mt-4 text-sm text-default">
                {{ account.description }}
              </p>
            </UCard>

            <template v-else-if="tab === 'access'">
              <UCard>
                <template #header>
                  <div class="flex items-center gap-2">
                    <h2 class="font-semibold text-highlighted">
                      Roles
                    </h2>
                    <span class="text-sm text-muted">{{ account.role_ids.length }}</span>
                  </div>
                </template>
                <div v-if="account.role_ids.length" class="flex flex-wrap gap-1.5">
                  <AppRoleChip v-for="roleId in account.role_ids" :key="roleId" :role="{ id: roleId }" />
                </div>
                <p v-else class="text-sm text-muted">
                  No roles. Its access comes from direct scopes only.
                </p>
              </UCard>
              <UCard>
                <template #header>
                  <div class="flex items-center gap-2">
                    <h2 class="font-semibold text-highlighted">
                      Effective scopes
                    </h2>
                    <span class="text-sm text-muted">{{ scopeRows.length }}</span>
                  </div>
                  <p class="mt-1 text-sm text-muted">
                    What its roles and direct scopes allow, within the server's policy for service-account keys. Each key gets at most these.
                  </p>
                </template>
                <AppPermissionList :names="account.effective_allowed_scopes" detailed empty-text="It can do nothing yet: give it a role." />
              </UCard>
              <UCard>
                <template #header>
                  <div class="flex items-center gap-2">
                    <h2 class="font-semibold text-highlighted">
                      Direct scopes
                    </h2>
                    <span class="text-sm text-muted">{{ account.allowed_scopes.length }}</span>
                  </div>
                  <p class="mt-1 text-sm text-muted">
                    Given without a role. Scopes the server's policy does not allow are listed here but are not in effect.
                  </p>
                </template>
                <AppPermissionList :names="account.allowed_scopes" detailed empty-text="None." />
                <p v-if="directScopes.length < account.allowed_scopes.length" class="mt-3 text-sm text-muted" data-testid="service-account-scopes-not-in-effect">
                  {{ account.allowed_scopes.length - directScopes.length }} of them are not in effect.
                </p>
              </UCard>
            </template>

            <AppServiceAccountKeysCard v-else :account="account" />
          </div>
        </AppQueryState>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>

  <AppServiceAccountFormDialog v-if="formTarget" v-model:open="formOpen" :target="formTarget" />
  <AppConfirmDialog v-model:open="lifecycle.open" v-bind="lifecycle.dialog" @confirm="lifecycle.confirm" />
</template>
