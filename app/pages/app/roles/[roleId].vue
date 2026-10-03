<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import type { Role } from '~/types/role'

// Role detail — logic in useRoleDetail (record, states, actions); this file is display only.
const route = useRoute()
const roleId = computed(() => String(route.params.roleId))

const {
  role,
  status,
  error,
  isLoading,
  refetch,
  notFound,
  denied,
  deniedMessage,
  policy,
  canEdit,
  moreItems,
  holdsRole,
  detailItems,
  abacEnabled,
  canManageAbac,
  abacReadOnly,
  openEdit,
  formOpen,
  formTarget,
  archive
} = useRoleDetail(roleId)
usePageMeta(() => role.value?.display_name)

const backToRoles: ButtonProps[] = [{ label: 'Back to roles', color: 'neutral', variant: 'outline', to: '/app/roles' }]

function openCreated(created: Role) {
  void navigateTo(`/app/roles/${created.id}`)
}
</script>

<template>
  <UDashboardPanel id="role-detail">
    <template #header>
      <UDashboardNavbar :title="role?.display_name ?? 'Role'">
        <template #leading>
          <UDashboardSidebarCollapse />
          <AppBackButton section="roles" />
        </template>
        <template #right>
          <UButton
            v-if="role && canEdit"
            icon="i-lucide-pencil"
            color="neutral"
            variant="outline"
            label="Edit"
            @click="openEdit(role)"
          />
          <UDropdownMenu v-if="moreItems.length" :items="moreItems">
            <UTooltip text="More actions">
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
                aria-label="More role actions"
              />
            </UTooltip>
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <AppPermissionGate section="roles">
        <UEmpty
          v-if="notFound"
          icon="i-lucide-search-x"
          title="Role not found"
          description="It doesn't exist, was archived, the link is wrong, or the role is outside your organization."
          :actions="backToRoles"
          class="mx-auto w-full max-w-3xl"
        />
        <UEmpty
          v-else-if="denied"
          icon="i-lucide-lock"
          title="You can't view this role"
          :description="deniedMessage"
          :actions="backToRoles"
          class="mx-auto w-full max-w-3xl"
        />
        <AppQueryState
          v-else
          :status="status"
          :error="error"
          :refreshing="isLoading"
          :has-data="Boolean(role)"
          error-title="Could not load role"
          skeleton="detail"
          :skeleton-rows="6"
          loading-label="Loading role"
          class="mx-auto w-full max-w-3xl"
          @retry="refetch()"
        >
          <div v-if="role" class="space-y-6">
            <UAlert
              v-if="policy?.lockedReason"
              color="neutral"
              variant="subtle"
              icon="i-lucide-lock"
              :title="role.is_system_role ? 'System role' : 'Read-only role'"
              :description="policy.lockedReason"
              data-testid="role-locked"
            />
            <UCard>
              <template #header>
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-semibold text-highlighted">
                    Details
                  </h2>
                  <UBadge
                    v-if="holdsRole"
                    color="neutral"
                    variant="outline"
                    label="You hold this role"
                  />
                </div>
              </template>
              <AppDetailList :items="detailItems" />
              <p v-if="role.description" class="mt-4 text-sm text-default">
                {{ role.description }}
              </p>
            </UCard>

            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <h2 class="font-semibold text-highlighted">
                    Permissions
                  </h2>
                  <span class="text-sm text-muted">{{ role.permissions.length }}</span>
                </div>
              </template>
              <AppPermissionList :names="role.permissions" detailed empty-text="No permissions attached." />
            </UCard>

            <UCard v-if="abacEnabled">
              <template #header>
                <h2 class="font-semibold text-highlighted">
                  ABAC conditions
                </h2>
              </template>
              <AppAbacConditions
                :id="roleId"
                kind="roles"
                :can-manage="canManageAbac"
                :read-only-reason="abacReadOnly"
              />
            </UCard>

            <AppDefinitionHistoryCard kind="role" :definition-id="roleId" />
          </div>
        </AppQueryState>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>

  <AppRoleFormDialog v-model:open="formOpen" :target="formTarget" @created="openCreated" />
  <AppConfirmDialog v-model:open="archive.open" v-bind="archive.dialog" @confirm="archive.confirm" />
</template>
