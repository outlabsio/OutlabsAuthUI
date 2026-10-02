<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'

// Permission detail — logic in usePermissionDetail (record, states, actions); display only.
const route = useRoute()
const permissionId = computed(() => String(route.params.permissionId))

const {
  permission,
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
  detailItems,
  abacEnabled,
  canManageAbac,
  abacReadOnly,
  openEdit,
  editOpen,
  editTarget,
  archive
} = usePermissionDetail(permissionId)
usePageMeta(() => permission.value?.display_name)

const backToPermissions: ButtonProps[] = [{ label: 'Back to permissions', color: 'neutral', variant: 'outline', to: '/app/permissions' }]
</script>

<template>
  <UDashboardPanel id="permission-detail">
    <template #header>
      <UDashboardNavbar :title="permission?.display_name ?? 'Permission'">
        <template #leading>
          <UDashboardSidebarCollapse />
          <AppBackButton section="permissions" />
        </template>
        <template #right>
          <UButton
            v-if="permission && canEdit"
            icon="i-lucide-pencil"
            color="neutral"
            variant="outline"
            label="Edit"
            @click="openEdit(permission)"
          />
          <UDropdownMenu v-if="moreItems.length" :items="moreItems">
            <UTooltip text="More actions">
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
                aria-label="More permission actions"
              />
            </UTooltip>
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <AppPermissionGate section="permissions">
        <UEmpty
          v-if="notFound"
          icon="i-lucide-search-x"
          title="Permission not found"
          description="It doesn't exist, was archived, or the link is wrong."
          :actions="backToPermissions"
          class="mx-auto w-full max-w-3xl"
        />
        <UEmpty
          v-else-if="denied"
          icon="i-lucide-lock"
          title="You can't view this permission"
          :description="deniedMessage"
          :actions="backToPermissions"
          class="mx-auto w-full max-w-3xl"
        />
        <AppQueryState
          v-else
          :status="status"
          :error="error"
          :refreshing="isLoading"
          :has-data="Boolean(permission)"
          error-title="Could not load permission"
          skeleton="detail"
          :skeleton-rows="6"
          loading-label="Loading permission"
          class="mx-auto w-full max-w-3xl"
          @retry="refetch()"
        >
          <div v-if="permission" class="space-y-6">
            <UAlert
              v-if="policy?.lockedReason"
              color="neutral"
              variant="subtle"
              icon="i-lucide-lock"
              title="System permission"
              :description="policy.lockedReason"
              data-testid="permission-locked"
            />
            <UCard>
              <template #header>
                <h2 class="font-semibold text-highlighted">
                  Details
                </h2>
              </template>
              <AppDetailList :items="detailItems">
                <!-- The resource opens the list of its permissions (and gives keyboard users a stop
                     inside the scrolling panel). -->
                <template #value-Resource="{ item }">
                  <ULink
                    :to="{ path: '/app/permissions', query: { resource: String(item.value) } }"
                    class="break-all font-mono text-default underline"
                    :aria-label="`All ${item.value} permissions`"
                  >
                    {{ item.value }}
                  </ULink>
                </template>
              </AppDetailList>
              <p v-if="permission.description" class="mt-4 text-sm text-default">
                {{ permission.description }}
              </p>
            </UCard>

            <UCard v-if="abacEnabled">
              <template #header>
                <h2 class="font-semibold text-highlighted">
                  ABAC conditions
                </h2>
              </template>
              <AppAbacConditions
                :id="permissionId"
                kind="permissions"
                :can-manage="canManageAbac"
                :read-only-reason="abacReadOnly"
              />
            </UCard>
          </div>
        </AppQueryState>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>

  <AppPermissionEditDialog v-model:open="editOpen" :permission="editTarget" />
  <AppConfirmDialog v-model:open="archive.open" v-bind="archive.dialog" @confirm="archive.confirm" />
</template>
