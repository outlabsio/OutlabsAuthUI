<script setup lang="ts">
import { entityTypeConfigSchema } from '~/schemas/settings'

// Settings — logic in useSettings; this file is display only. Admins only (the 'settings'
// section requirement guards nav, route and body alike).
const {
  contractNotice,
  serverItems,
  mountedSurfaces,
  features,
  entityTypesOn,
  entityConfig,
  configStatus,
  configLoadError,
  refetchConfig,
  entityTypeItems,
  entityTypeLists,
  canEditConfig,
  configOpen,
  configState,
  configDirty,
  saveError,
  openConfigEdit,
  onSaveConfig
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
      <AppPermissionGate section="settings">
        <div class="mx-auto w-full max-w-3xl space-y-6">
          <UCard>
            <template #header>
              <h2 class="font-semibold text-highlighted">
                Auth server
              </h2>
              <p class="mt-1 text-sm text-muted">
                What the connected outlabs-auth server offers. The console shows only what it reports.
              </p>
            </template>

            <div class="space-y-4">
              <UAlert
                v-if="contractNotice"
                color="warning"
                variant="subtle"
                icon="i-lucide-triangle-alert"
                :title="contractNotice.title"
                :description="contractNotice.description"
              />
              <AppDetailList :items="serverItems">
                <template #value-surfaces>
                  <div v-if="mountedSurfaces" class="mt-1 flex flex-wrap gap-1.5">
                    <UBadge
                      v-for="surface in mountedSurfaces"
                      :key="surface.key"
                      color="neutral"
                      variant="outline"
                      :title="surface.key"
                    >
                      {{ surface.label }}
                    </UBadge>
                  </div>
                  <span v-else class="text-muted">Not reported by this server (an older library); pages follow the feature flags.</span>
                </template>
                <template #value-features>
                  <ul class="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Features">
                    <li v-for="feature in features" :key="feature.key" class="flex items-start gap-2">
                      <UIcon
                        :name="feature.on ? 'i-lucide-check' : 'i-lucide-minus'"
                        class="mt-0.5 size-4 shrink-0"
                        :class="feature.on ? 'text-success' : 'text-muted'"
                      />
                      <span class="min-w-0">
                        <span class="text-default">{{ feature.label }}</span>
                        <span class="sr-only">: {{ feature.on ? 'on' : 'off' }}</span>
                        <span v-if="!feature.on" class="text-muted"> (off)</span>
                        <span v-if="feature.description" class="block text-xs text-muted">{{ feature.description }}</span>
                      </span>
                    </li>
                  </ul>
                </template>
              </AppDetailList>
            </div>
          </UCard>

          <UCard v-if="entityTypesOn">
            <template #header>
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <h2 class="font-semibold text-highlighted">
                    Entity types
                  </h2>
                  <p class="mt-1 text-sm text-muted">
                    The types an organization (root entity) may have, and the types offered when adding a child, per entity class.
                  </p>
                </div>
                <UButton
                  v-if="canEditConfig && entityConfig"
                  icon="i-lucide-pencil"
                  size="sm"
                  variant="outline"
                  color="neutral"
                  label="Edit"
                  aria-label="Edit entity types"
                  @click="openConfigEdit"
                />
              </div>
            </template>

            <AppQueryState
              :status="configStatus"
              :error="configLoadError"
              error-title="Could not load entity types"
              skeleton="detail"
              loading-label="Loading entity types"
              compact
              @retry="refetchConfig()"
            >
              <AppDetailList :items="entityTypeItems">
                <template v-for="item in entityTypeItems" :key="item.key" #[`value-${item.key}`]>
                  <div v-if="entityTypeLists[item.key!]?.length" class="mt-1 flex flex-wrap gap-1.5">
                    <UBadge
                      v-for="type in entityTypeLists[item.key!]"
                      :key="type"
                      color="neutral"
                      variant="subtle"
                    >
                      {{ type }}
                    </UBadge>
                  </div>
                  <span v-else class="text-muted">None</span>
                </template>
              </AppDetailList>
            </AppQueryState>
          </UCard>
        </div>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>

  <AppFormDialog
    ref="entityTypesDialog"
    v-model:open="configOpen"
    title="Edit entity types"
    description="Changes apply to entities created from now on. Existing entities keep their type."
    :schema="entityTypeConfigSchema"
    :state="configState"
    :error="saveError"
    :dirty="configDirty"
    require-changes
    size="lg"
    submit-label="Save changes"
    @submit="onSaveConfig"
  >
    <fieldset class="space-y-3">
      <legend class="text-sm font-medium text-highlighted">
        Structural
      </legend>
      <UFormField
        name="structuralRootTypes"
        label="Root types"
        description="Types a new organization may have."
        help="Press Enter after each type."
      >
        <UInputTags
          v-model="configState.structuralRootTypes"
          placeholder="Add a type"
          add-on-blur
          add-on-paste
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="structuralChildTypes"
        label="Default child types"
        description="Offered when adding a structural child entity."
        hint="Optional"
      >
        <UInputTags
          v-model="configState.structuralChildTypes"
          placeholder="Add a type"
          add-on-blur
          add-on-paste
          class="w-full"
        />
      </UFormField>
    </fieldset>
    <fieldset class="space-y-3">
      <legend class="text-sm font-medium text-highlighted">
        Access group
      </legend>
      <UFormField
        name="accessGroupRootTypes"
        label="Root types"
        description="Types a new top-level access group may have."
        hint="Optional"
      >
        <UInputTags
          v-model="configState.accessGroupRootTypes"
          placeholder="Add a type"
          add-on-blur
          add-on-paste
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="accessGroupChildTypes"
        label="Default child types"
        description="Offered when adding an access-group child entity."
        hint="Optional"
      >
        <UInputTags
          v-model="configState.accessGroupChildTypes"
          placeholder="Add a type"
          add-on-blur
          add-on-paste
          class="w-full"
        />
      </UFormField>
    </fieldset>
  </AppFormDialog>
</template>
