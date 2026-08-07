<script setup lang="ts">
// Entities workspace — tree/search/create (left) + the selected entity's detail (right).
// All logic lives in useEntitiesWorkspace and AppEntityDetail; this file is display only.
const {
  canCreate,
  status,
  errorMessage,
  treeItems,
  expanded,
  selectedId,
  search,
  createOpen,
  createState,
  createErrors,
  creating,
  parentSelectItems,
  entityClassItems,
  hasParentGovernance,
  parentAllowedTypes,
  parentAllowedClasses,
  openCreate,
  onCreate,
  toggleChildClass
} = useEntitiesWorkspace()
</script>

<template>
  <UDashboardPanel
    id="entities"
    :default-size="34"
    :min-size="25"
    :max-size="50"
    resizable
  >
    <template #header>
      <UDashboardNavbar title="Entities">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            v-if="canCreate"
            icon="i-lucide-plus"
            label="New entity"
            @click="openCreate"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Search entities..."
            class="w-64"
          />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <AppPermissionGate permission="entity:read">
        <UAlert
          v-if="status === 'error'"
          color="error"
          icon="i-lucide-triangle-alert"
          title="Could not load entities"
          :description="errorMessage"
          class="mb-4"
        />

        <div v-if="status === 'pending'" class="py-16 text-center text-sm text-muted">
          Loading entities...
        </div>
        <p v-else-if="!treeItems.length" class="py-16 text-center text-sm text-muted">
          {{ search ? 'No entities match your search.' : 'No entities yet.' }}
        </p>
        <UTree
          v-else
          v-model:expanded="expanded"
          :items="treeItems"
          :get-key="(item) => item.value"
          color="primary"
        >
          <template #item-label="{ item }">
            <ULink
              :to="{ query: { entity: item.value } }"
              class="truncate font-medium hover:underline"
              :class="item.value === selectedId ? 'text-primary' : 'text-highlighted'"
            >
              {{ item.label }}
            </ULink>
          </template>
          <template #item-trailing="{ item }">
            <span class="ml-auto flex items-center gap-2 pl-2">
              <UBadge :color="item.entityClass === 'structural' ? 'info' : 'special'" variant="subtle" size="sm">
                {{ item.entityClass.replace('_', ' ') }}
              </UBadge>
              <UBadge
                v-if="item.status !== 'active'"
                color="neutral"
                variant="subtle"
                size="sm"
                class="capitalize"
              >
                {{ item.status }}
              </UBadge>
            </span>
          </template>
        </UTree>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>

  <!-- Detail (right column) — swaps as the tree selection (?entity=) changes -->
  <AppEntityDetail v-if="selectedId" :key="selectedId" :entity-id="selectedId" />
  <div v-else class="hidden flex-1 flex-col items-center justify-center gap-2 text-center lg:flex">
    <UIcon name="i-lucide-building-2" class="size-8 text-dimmed" />
    <p class="text-sm text-muted">
      Select an entity to view its details.
    </p>
  </div>

  <!-- Create -->
  <UModal v-model:open="createOpen" title="Create entity">
    <template #body>
      <div class="space-y-4">
        <div class="space-y-1.5">
          <label for="entity-parent" class="block text-sm font-medium text-default">Parent</label>
          <USelectMenu
            id="entity-parent"
            v-model="createState.parentId"
            value-key="value"
            :items="parentSelectItems"
            placeholder="None (root)"
            class="w-full"
          />
          <p v-if="hasParentGovernance" class="rounded-md bg-muted/40 px-2.5 py-1.5 text-xs text-muted" data-testid="parent-governance">
            <template v-if="parentAllowedTypes?.length">
              This parent allows child types: <span class="font-medium text-default">{{ parentAllowedTypes.join(', ') }}</span>.
            </template>
            <template v-if="parentAllowedClasses?.length">
              Allowed classes: <span class="font-medium text-default">{{ parentAllowedClasses.map(c => c.replace('_', ' ')).join(', ') }}</span>.
            </template>
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label for="entity-name" class="block text-sm font-medium text-default">System name</label>
            <UInput
              id="entity-name"
              v-model="createState.name"
              placeholder="acme-west"
              class="w-full"
            />
            <p v-if="createErrors.name" class="text-xs text-error">
              {{ createErrors.name }}
            </p>
          </div>
          <div class="space-y-1.5">
            <label for="entity-slug" class="block text-sm font-medium text-default">Slug</label>
            <UInput
              id="entity-slug"
              v-model="createState.slug"
              placeholder="acme-west"
              class="w-full"
            />
            <p v-if="createErrors.slug" class="text-xs text-error">
              {{ createErrors.slug }}
            </p>
          </div>
        </div>

        <div class="space-y-1.5">
          <label for="entity-display-name" class="block text-sm font-medium text-default">Display name</label>
          <UInput
            id="entity-display-name"
            v-model="createState.displayName"
            placeholder="ACME West"
            class="w-full"
          />
          <p v-if="createErrors.displayName" class="text-xs text-error">
            {{ createErrors.displayName }}
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label for="entity-class" class="block text-sm font-medium text-default">Class</label>
            <USelect
              id="entity-class"
              v-model="createState.entityClass"
              :items="entityClassItems"
              class="w-full"
            />
          </div>
          <div class="space-y-1.5">
            <label for="entity-type" class="block text-sm font-medium text-default">Type</label>
            <UInput
              id="entity-type"
              v-model="createState.entityType"
              placeholder="region"
              class="w-full"
            />
            <p v-if="createErrors.entityType" class="text-xs text-error">
              {{ createErrors.entityType }}
            </p>
          </div>
        </div>

        <div class="space-y-1.5">
          <label for="entity-description" class="block text-sm font-medium text-default">Description</label>
          <UTextarea
            id="entity-description"
            v-model="createState.description"
            :rows="2"
            class="w-full"
          />
        </div>

        <div class="space-y-2 rounded-lg border border-default p-3">
          <p class="text-sm font-medium text-default">
            Child governance <span class="font-normal text-muted">(optional)</span>
          </p>
          <div class="space-y-1">
            <span class="block text-xs text-muted">Allowed child classes</span>
            <div class="flex gap-4">
              <UCheckbox
                label="Structural"
                :model-value="createState.allowedChildClasses.includes('structural')"
                @update:model-value="toggleChildClass('structural')"
              />
              <UCheckbox
                label="Access group"
                :model-value="createState.allowedChildClasses.includes('access_group')"
                @update:model-value="toggleChildClass('access_group')"
              />
            </div>
          </div>
          <div class="space-y-1.5">
            <label for="entity-allowed-child-types" class="block text-xs text-muted">Allowed child types (comma-separated)</label>
            <UInput
              id="entity-allowed-child-types"
              v-model="createState.allowedChildTypes"
              placeholder="region, office"
              class="w-full"
            />
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="Cancel"
          @click="createOpen = false"
        />
        <UButton label="Create entity" :loading="creating" @click="onCreate" />
      </div>
    </template>
  </UModal>
</template>
