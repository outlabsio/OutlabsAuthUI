<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { useSessionStore } from '~/stores/session'
import { entityTypeConfigQuery } from '~/queries/settings'
import { getApiErrorMessage } from '~/utils/api'

// P2 settings vertical — runtime capabilities (from /auth/config, already in the session
// store) plus the entity-type config (read-only; superuser edit is a later pass).
const session = useSessionStore()

const features = computed(() => {
  const f = session.capabilities?.features
  if (!f) return []
  return (Object.entries(f) as [string, boolean][]).map(([key, on]) => ({
    label: key.replace(/_/g, ' '),
    on
  }))
})

const authMethods = computed(() => {
  const m = session.capabilities?.auth_methods
  if (!m) return []
  return (Object.entries(m) as [string, boolean][]).filter(([, on]) => on).map(([key]) => key.replace(/_/g, ' '))
})

const entityHierarchyOn = computed(() => session.can('entity_hierarchy'))

// Gate the config fetch on the capability so a minimal backend never 404s here.
const { data: entityConfig, status: configStatus, error: configError } = useQuery(() => ({
  ...entityTypeConfigQuery,
  enabled: entityHierarchyOn.value
}))
</script>

<template>
  <UDashboardPanel id="settings">
    <template #header>
      <UDashboardNavbar title="Settings">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-6">
        <!-- Runtime capabilities -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="font-semibold text-highlighted">
                Runtime capabilities
              </h2>
              <UBadge color="primary" variant="subtle">
                {{ session.capabilities?.preset ?? 'unknown' }}
              </UBadge>
            </div>
          </template>

          <div class="space-y-4">
            <div>
              <p class="mb-2 text-sm font-medium text-default">
                Features
              </p>
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div v-for="feature in features" :key="feature.label" class="flex items-center gap-2 text-sm">
                  <UIcon
                    :name="feature.on ? 'i-lucide-check' : 'i-lucide-minus'"
                    :class="feature.on ? 'text-primary' : 'text-muted'"
                    class="size-4 shrink-0"
                  />
                  <span class="capitalize text-toned">{{ feature.label }}</span>
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
              <span>Auth methods:
                <span class="capitalize text-default">{{ authMethods.join(', ') || 'none' }}</span>
              </span>
              <span>{{ session.capabilities?.available_permissions.length ?? 0 }} permissions available</span>
            </div>
          </div>
        </UCard>

        <!-- Entity type config -->
        <UCard v-if="entityHierarchyOn">
          <template #header>
            <h2 class="font-semibold text-highlighted">
              Entity types
            </h2>
          </template>

          <UAlert
            v-if="configStatus === 'error'"
            color="error"
            icon="i-lucide-triangle-alert"
            title="Could not load entity-type config"
            :description="getApiErrorMessage(configError)"
          />
          <div v-else-if="entityConfig" class="space-y-4 text-sm">
            <div>
              <p class="mb-2 font-medium text-default">
                Allowed root types
              </p>
              <div class="flex flex-wrap gap-2">
                <UBadge
                  v-for="t in entityConfig.allowed_root_types.structural"
                  :key="`rs-${t}`"
                  color="primary"
                  variant="subtle"
                >
                  {{ t }}
                </UBadge>
                <UBadge
                  v-for="t in entityConfig.allowed_root_types.access_group"
                  :key="`ra-${t}`"
                  color="neutral"
                  variant="subtle"
                >
                  {{ t }}
                </UBadge>
              </div>
            </div>
            <div>
              <p class="mb-2 font-medium text-default">
                Default child types
              </p>
              <div class="flex flex-wrap gap-2">
                <UBadge
                  v-for="t in entityConfig.default_child_types.structural"
                  :key="`cs-${t}`"
                  color="primary"
                  variant="subtle"
                >
                  {{ t }}
                </UBadge>
                <UBadge
                  v-for="t in entityConfig.default_child_types.access_group"
                  :key="`ca-${t}`"
                  color="neutral"
                  variant="subtle"
                >
                  {{ t }}
                </UBadge>
              </div>
            </div>
            <p class="text-xs text-muted">
              Editing entity-type configuration (superuser) is a later pass.
            </p>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
