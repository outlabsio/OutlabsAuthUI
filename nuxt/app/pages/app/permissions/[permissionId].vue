<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { permissionDetailQuery } from '~/queries/permissions'
import { getApiErrorMessage } from '~/utils/api'

const route = useRoute()
const permissionId = computed(() => String(route.params.permissionId))
const { hasPermission, can } = useAuth()

// Gate the fetch on the read permission (see users/index.vue).
const { data: permission, status, error } = useQuery(() => ({ ...permissionDetailQuery(permissionId.value), enabled: hasPermission('permission:read') }))

// ABAC — shown when exposed; editable when the actor may update non-system permissions.
const abacEnabled = computed(() => can('abac'))
const canManageAbac = computed(() => abacEnabled.value && hasPermission('permission:update') && Boolean(permission.value) && !permission.value?.is_system)

const detailItems = computed(() => {
  const p = permission.value
  if (!p) return []
  return [
    { label: 'Name', value: p.name },
    { label: 'Resource', value: p.resource },
    { label: 'Action', value: p.action },
    { label: 'Scope', value: p.scope },
    { label: 'Origin', value: p.is_system ? 'System' : 'Custom' },
    { label: 'Status', value: p.status },
    { label: 'Active', value: p.is_active ? 'Yes' : 'No' },
    { label: 'Tags', value: p.tags.join(', ') }
  ]
})
</script>

<template>
  <UDashboardPanel id="permission-detail">
    <template #header>
      <UDashboardNavbar :title="permission?.display_name ?? 'Permission'">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/app/permissions"
            aria-label="Back to permissions"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <AppPermissionGate permission="permission:read">
        <UAlert
          v-if="status === 'error'"
          color="error"
          icon="i-lucide-triangle-alert"
          title="Could not load permission"
          :description="getApiErrorMessage(error)"
        />

        <div v-else class="mx-auto w-full max-w-3xl space-y-6">
          <UCard>
            <template #header>
              <h2 class="font-semibold text-highlighted">
                Details
              </h2>
            </template>
            <AppDetailList :items="detailItems" />
            <p v-if="permission?.description" class="mt-4 text-sm text-muted">
              {{ permission.description }}
            </p>
          </UCard>

          <UCard v-if="abacEnabled">
            <template #header>
              <h2 class="font-semibold text-highlighted">
                ABAC conditions
              </h2>
            </template>
            <AppAbacConditions :id="permissionId" kind="permissions" :can-manage="canManageAbac" />
          </UCard>
        </div>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>
</template>
