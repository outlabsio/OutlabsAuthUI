<script setup lang="ts">
// Entities workspace — the organisation's tree (left) and the selected entity's detail: beside
// the tree from lg, in a slideover below it (the dashboard template's inbox pattern). All logic
// lives in useEntitiesWorkspace; this file is display only.
const {
  canRead,
  canCreate,
  canBrowseAllRoots,
  treeStatus,
  treeError,
  retryTree,
  treeItems,
  emptyState,
  entityCount,
  hiddenInactiveCount,
  expanded,
  selectedId,
  selectedTreeItem,
  onTreeSelect,
  onTreeToggle,
  search,
  showInactive,
  rootItems,
  rootSearch,
  rootSearchInput,
  rootsLoading,
  rootsHint,
  selectedRootId,
  isMobile,
  detailSheetOpen,
  createOpen,
  createParentId,
  createSession,
  openCreate,
  onCreated
} = useEntitiesWorkspace()

// Why a node shows "Detached" (a tooltip for pointers, part of the badge's text for assistive tech).
const DETACHED_HINT = 'Its parent is archived or outside what you can see'
</script>

<template>
  <!-- Without entity read the panel holds only the denial: full width and fixed, like every
       other section's (its own id, so a width the admin dragged the tree to does not apply). -->
  <UDashboardPanel
    :id="canRead ? 'entities' : 'entities-denied'"
    :key="canRead ? 'entities' : 'entities-denied'"
    :default-size="canRead ? 34 : undefined"
    :min-size="25"
    :max-size="50"
    :resizable="canRead"
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
            @click="openCreate()"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar v-if="canRead">
        <div class="flex w-full flex-col gap-2 py-2">
          <USelectMenu
            v-if="canBrowseAllRoots"
            v-model="selectedRootId"
            v-model:search-term="rootSearch"
            :items="rootItems"
            value-key="value"
            ignore-filter
            :loading="rootsLoading"
            icon="i-lucide-building-2"
            placeholder="Choose an organization"
            :search-input="rootSearchInput"
            aria-label="Organization"
            class="w-full"
          >
            <template #empty>
              No organization matches.
            </template>
            <template v-if="rootsHint" #content-bottom>
              <p class="border-t border-default px-2 py-1.5 text-xs text-muted">
                {{ rootsHint }}
              </p>
            </template>
          </USelectMenu>
          <div class="flex flex-wrap items-center gap-3">
            <UInput
              v-model="search"
              type="search"
              icon="i-lucide-search"
              placeholder="Search entities..."
              aria-label="Search entities"
              class="min-w-0 flex-1"
            />
            <USwitch v-model="showInactive" label="Show inactive" />
          </div>
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <AppPermissionGate section="entities">
        <AppQueryState
          :status="treeStatus"
          :error="treeError"
          :empty="!treeItems.length"
          error-title="Could not load entities"
          :empty-title="emptyState.title"
          :empty-description="emptyState.description"
          empty-icon="i-lucide-building-2"
          :empty-actions="emptyState.actions"
          skeleton="list"
          :skeleton-rows="6"
          loading-label="Loading entities"
          @retry="retryTree"
        >
          <UTree
            v-model:expanded="expanded"
            :model-value="selectedTreeItem"
            :items="treeItems"
            :get-key="(item) => item.value"
            color="primary"
            aria-label="Entity hierarchy"
            data-entity-tree
            @select="onTreeSelect"
            @toggle="onTreeToggle"
          >
            <template #item-label="{ item }">
              <span class="truncate" :class="item.status === 'active' ? 'text-highlighted' : 'text-muted'">{{ item.label }}</span>
            </template>
            <template #item-trailing="{ item }">
              <span class="ms-auto flex shrink-0 items-center gap-1.5 ps-2">
                <UTooltip v-if="item.detached" :text="DETACHED_HINT">
                  <UBadge color="warning" variant="subtle" size="sm">
                    Detached<span class="sr-only"> ({{ DETACHED_HINT }})</span>
                  </UBadge>
                </UTooltip>
                <UBadge
                  v-if="item.status !== 'active'"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :label="statusLabel(item.status)"
                />
                <UBadge
                  v-bind="entityTypeBadge(item.entityType)"
                  size="sm"
                  class="hidden sm:inline-flex"
                />
              </span>
            </template>
          </UTree>
          <p class="mt-4 text-xs text-muted" role="status">
            {{ entityCount }} {{ entityCount === 1 ? 'entity' : 'entities' }}<template v-if="hiddenInactiveCount">
              &middot; {{ hiddenInactiveCount }} inactive hidden
            </template>
          </p>
        </AppQueryState>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>

  <template v-if="canRead">
    <template v-if="!isMobile">
      <AppEntityDetail
        v-if="selectedId"
        :key="selectedId"
        :entity-id="selectedId"
        @create-child="openCreate"
      />
      <div v-else class="hidden flex-1 items-center justify-center lg:flex">
        <UEmpty
          icon="i-lucide-building-2"
          title="No entity selected"
          description="Select an entity in the tree to see its details, members and activity."
          variant="naked"
        />
      </div>
    </template>
    <USlideover
      v-else
      v-model:open="detailSheetOpen"
      title="Entity details"
      :ui="{ content: 'max-w-2xl' }"
    >
      <template #content>
        <AppEntityDetail
          v-if="selectedId"
          :key="selectedId"
          :entity-id="selectedId"
          @create-child="openCreate"
        />
      </template>
    </USlideover>
  </template>

  <AppEntityCreateDialog
    v-if="canCreate"
    :key="createSession"
    v-model:open="createOpen"
    :parent-id="createParentId"
    @created="onCreated"
  />
</template>
