<script setup lang="ts">
const { capabilities, displayName } = useAuth()

const capabilityCards = computed(() => {
  const f = capabilities.value?.features
  if (!f) return []
  return [
    { label: 'Entity hierarchy', on: f.entity_hierarchy },
    { label: 'Context-aware roles', on: f.context_aware_roles },
    { label: 'ABAC', on: f.abac },
    { label: 'API keys', on: f.api_keys },
    { label: 'User status', on: f.user_status },
    { label: 'Activity tracking', on: f.activity_tracking },
    { label: 'Invitations', on: f.invitations }
  ]
})
</script>

<template>
  <UDashboardPanel id="dashboard">
    <template #header>
      <UDashboardNavbar title="Dashboard">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <div>
          <h2 class="text-base font-medium text-highlighted">
            Welcome back{{ displayName ? `, ${displayName}` : '' }}
          </h2>
          <p class="text-sm text-muted">
            Signed in against <span class="font-medium">{{ capabilities?.preset ?? 'the configured backend' }}</span>.
          </p>
        </div>

        <div>
          <p class="mb-2 text-sm font-medium text-default">
            Backend capabilities
          </p>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <UCard v-for="cap in capabilityCards" :key="cap.label">
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm text-default">{{ cap.label }}</span>
                <UIcon
                  :name="cap.on ? 'i-lucide-check' : 'i-lucide-minus'"
                  :class="cap.on ? 'text-primary' : 'text-muted'"
                  class="size-4"
                />
              </div>
            </UCard>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
