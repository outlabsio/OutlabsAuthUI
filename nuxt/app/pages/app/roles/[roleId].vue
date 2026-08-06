<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { roleDetailQuery } from '~/queries/roles'
import { getApiErrorMessage } from '~/utils/api'

const route = useRoute()
const roleId = computed(() => String(route.params.roleId))
const { hasPermission } = useAuth()

// Gate the fetch on the read permission (see users/index.vue).
const { data: role, status, error } = useQuery(() => ({ ...roleDetailQuery(roleId.value), enabled: hasPermission('role:read') }))

const detailItems = computed(() => {
  const r = role.value
  if (!r) return []
  return [
    { label: 'Name', value: r.name },
    { label: 'Reach', value: r.is_global ? 'Global' : 'Scoped' },
    { label: 'Scope', value: r.scope.replace('_', ' ') },
    { label: 'Origin', value: r.is_system_role ? 'System' : 'Custom' },
    { label: 'Status', value: r.status },
    { label: 'Auto-assigned', value: r.is_auto_assigned ? 'Yes' : 'No' },
    { label: 'Root entity', value: r.root_entity_name },
    { label: 'Assignable at', value: r.assignable_at_types.join(', ') }
  ]
})
</script>

<template>
  <UDashboardPanel id="role-detail">
    <template #header>
      <UDashboardNavbar :title="role?.display_name ?? 'Role'">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/app/roles"
            aria-label="Back to roles"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <AppPermissionGate permission="role:read">
        <UAlert
          v-if="status === 'error'"
          color="error"
          icon="i-lucide-triangle-alert"
          title="Could not load role"
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
            <p v-if="role?.description" class="mt-4 text-sm text-muted">
              {{ role.description }}
            </p>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="font-semibold text-highlighted">
                  Permissions
                </h2>
                <span class="text-sm text-muted">{{ role?.permissions.length ?? 0 }}</span>
              </div>
            </template>
            <div v-if="role?.permissions.length" class="flex flex-wrap gap-2">
              <UBadge
                v-for="p in role.permissions"
                :key="p"
                color="neutral"
                variant="subtle"
              >
                {{ p }}
              </UBadge>
            </div>
            <p v-else class="text-sm text-muted">
              No permissions attached.
            </p>
          </UCard>
        </div>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>
</template>
