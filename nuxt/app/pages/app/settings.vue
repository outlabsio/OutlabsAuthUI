<script setup lang="ts">
// Settings — logic in useSettings; this file is display only.
const {
  capabilities,
  features,
  authMethods,
  entityHierarchyOn,
  entityConfig,
  configStatus,
  configErrorMessage
} = useSettings()
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
                {{ capabilities?.preset ?? 'unknown' }}
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
              <span v-if="capabilities?.available_permissions">{{ capabilities.available_permissions.length }} permissions available</span>
              <span v-if="capabilities?.library_version">Library <span class="text-default">{{ capabilities.library_version }}</span></span>
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
            :description="configErrorMessage"
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
