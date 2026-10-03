<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Entity } from '~/types/entity'

// The entity detail panel: beside the tree from lg, inside a slideover below it. Display only:
// the record, its hierarchy and the archive flow come from useEntityDetail; the member list,
// activity and the edit / governance / move dialogs are components with their own composables.
// `create-child` asks the workspace to open its create dialog under this entity.
const props = defineProps<{ entityId: string }>()
const emit = defineEmits<{ 'create-child': [parentId: string] }>()
const entityId = computed(() => props.entityId)

const {
  entity,
  detailStatus,
  detailError,
  notFound,
  outOfScope,
  scopeReady,
  retry,
  archived,
  residualAccess,
  residualAccessDescription,
  canFinishArchive,
  askArchive,
  isRoot,
  rootEntity,
  parentEntity,
  breadcrumb,
  closeTo,
  entityLink,
  overviewItems,
  validityState,
  governanceItems,
  namingSetByRoot,
  activeMemberCount,
  capacityPercent,
  atCapacity,
  children,
  descendants,
  subtreeStatus,
  subtreeError,
  refetchSubtree,
  organisationById,
  canUpdate,
  canCreateChild,
  canOpenIntegrations,
  integrations,
  actionItems,
  editOpen,
  governanceOpen,
  moveOpen,
  archive,
  archivePlan,
  cascadeRequired,
  cascadeAcknowledged,
  archiveBlocked
} = useEntityDetail(entityId)
// Document title: the selected entity, under the Entities section; never the name of an entity
// whose scope is unresolved or outside the admin's organisation (F-020).
usePageMeta(() => (scopeReady.value ? entity.value?.display_name : undefined))

// --- Pure display config ---
const childColumns: TableColumn<Entity>[] = [
  { accessorKey: 'display_name', header: 'Name' },
  { accessorKey: 'entity_type', header: 'Type', meta: hideBelowSm },
  { accessorKey: 'entity_class', header: 'Class', meta: hideBelowSm },
  { accessorKey: 'status', header: 'Status' }
]
</script>

<template>
  <UDashboardPanel id="entity-detail">
    <template #header>
      <UDashboardNavbar :title="scopeReady ? entity?.display_name ?? 'Entity' : 'Entity'" :toggle="false">
        <template #leading>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            :to="closeTo"
            aria-label="Close entity detail"
          />
        </template>
        <template #trailing>
          <UBadge
            v-if="scopeReady && entity && entity.status !== 'active'"
            color="neutral"
            variant="outline"
            :label="statusLabel(entity.status)"
          />
        </template>
        <template #right>
          <UButton
            v-if="canUpdate"
            icon="i-lucide-pencil"
            color="neutral"
            variant="outline"
            label="Edit"
            @click="editOpen = true"
          />
          <UDropdownMenu v-if="actionItems.length" :items="actionItems">
            <UTooltip text="More actions">
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
                aria-label="More entity actions"
              />
            </UTooltip>
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar v-if="scopeReady && breadcrumb.length > 1">
        <UBreadcrumb :items="breadcrumb" class="min-w-0" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <AppPermissionGate section="entities">
        <UEmpty
          v-if="notFound"
          icon="i-lucide-search-x"
          title="Entity not found"
          description="It doesn't exist, the link is wrong, or the entity is outside your organization."
          :actions="[{ label: 'Back to entities', color: 'neutral', variant: 'outline', to: closeTo }]"
        />
        <UEmpty
          v-else-if="outOfScope"
          icon="i-lucide-lock"
          title="Outside your organization"
          description="This entity belongs to another organization. You can only manage the entities of your own."
          :actions="[{ label: 'Back to entities', color: 'neutral', variant: 'outline', to: closeTo }]"
        />
        <AppQueryState
          v-else
          :status="detailStatus"
          :error="detailError"
          error-title="Could not load entity"
          skeleton="detail"
          loading-label="Loading entity"
          @retry="retry"
        >
          <div v-if="entity && scopeReady" class="mx-auto w-full max-w-3xl space-y-6">
            <UAlert
              v-if="residualAccess"
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              title="Archived, but its access is still live"
              :description="residualAccessDescription"
              :actions="canFinishArchive ? [{ label: 'Finish archiving', color: 'warning', variant: 'outline', onClick: askArchive }] : []"
              data-testid="entity-archived-residual"
            />
            <UAlert
              v-else-if="archived"
              color="neutral"
              variant="subtle"
              icon="i-lucide-archive"
              title="This entity is archived"
              description="It left the hierarchy and is read-only. Archived entities cannot be restored."
              data-testid="entity-archived"
            />
            <UAlert
              v-else-if="entity.status === 'inactive'"
              color="neutral"
              variant="subtle"
              icon="i-lucide-circle-pause"
              title="Inactive"
              description="Entity-scoped API keys and service accounts are blocked. Members keep their access: to revoke it, archive the entity."
            />
            <UAlert
              v-else-if="validityState === 'expired' || validityState === 'scheduled'"
              color="neutral"
              variant="subtle"
              icon="i-lucide-calendar-clock"
              :title="validityState === 'expired' ? 'Outside its validity window' : 'Not in effect yet'"
              description="Entity-scoped API keys and service accounts are blocked outside the window. Member access is not limited by it."
            />

            <UCard>
              <template #header>
                <h2 class="font-semibold text-highlighted">
                  Details
                </h2>
              </template>
              <AppDetailList :items="overviewItems">
                <template #value-parent>
                  <ULink
                    v-if="parentEntity"
                    :to="entityLink(parentEntity.id)"
                    class="font-medium text-highlighted hover:underline"
                  >
                    {{ parentEntity.display_name }}
                  </ULink>
                  <span v-else class="text-muted">{{ entity.parent_entity_id ? 'Unavailable' : 'None (top-level organization)' }}</span>
                </template>
              </AppDetailList>
            </UCard>

            <UCard>
              <template #header>
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-semibold text-highlighted">
                    Governance
                  </h2>
                  <ULink
                    v-if="namingSetByRoot && rootEntity"
                    :to="entityLink(rootEntity.id)"
                    class="text-sm text-muted hover:underline"
                  >
                    Naming rules are set by {{ rootEntity.display_name }}
                  </ULink>
                </div>
              </template>
              <AppDetailList :items="governanceItems">
                <template #value-members="{ item }">
                  <div class="space-y-1.5">
                    <span>{{ item.value }}</span>
                    <UProgress
                      v-if="capacityPercent != null"
                      :model-value="capacityPercent"
                      :color="atCapacity ? 'warning' : 'primary'"
                      size="sm"
                      :aria-label="`Members: ${item.value}`"
                    />
                  </div>
                </template>
              </AppDetailList>
            </UCard>

            <UCard>
              <template #header>
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <h2 class="font-semibold text-highlighted">
                      Children
                    </h2>
                    <UBadge
                      v-if="subtreeStatus === 'success'"
                      color="neutral"
                      variant="subtle"
                      :label="String(children.length)"
                    />
                  </div>
                  <UButton
                    v-if="canCreateChild"
                    icon="i-lucide-plus"
                    size="sm"
                    color="neutral"
                    variant="outline"
                    label="Add child"
                    @click="emit('create-child', entity.id)"
                  />
                </div>
              </template>
              <AppQueryState
                :status="subtreeStatus"
                :error="subtreeError"
                :enabled="!archived"
                :empty="!children.length"
                error-title="Could not load child entities"
                empty-title="No child entities"
                :empty-description="canCreateChild ? 'Add a child to build the hierarchy beneath it.' : undefined"
                empty-icon="i-lucide-network"
                skeleton="table"
                :skeleton-rows="3"
                compact
                @retry="refetchSubtree()"
              >
                <UTable :data="children" :columns="childColumns">
                  <template #display_name-cell="{ row }">
                    <ULink
                      :to="entityLink(row.original.id)"
                      class="font-medium text-highlighted hover:underline"
                    >
                      {{ row.original.display_name }}
                    </ULink>
                  </template>
                  <template #entity_type-cell="{ row }">
                    <UBadge v-bind="entityTypeBadge(row.original.entity_type)" size="sm" />
                  </template>
                  <template #entity_class-cell="{ row }">
                    <UBadge v-bind="ENTITY_CLASS_BADGE[row.original.entity_class]" size="sm" />
                  </template>
                  <template #status-cell="{ row }">
                    <UBadge
                      :color="DEFINITION_STATUS_COLOR[row.original.status] ?? 'neutral'"
                      variant="subtle"
                      size="sm"
                      :label="statusLabel(row.original.status)"
                    />
                  </template>
                </UTable>
                <p v-if="descendants.length > children.length" class="mt-3 text-xs text-muted">
                  {{ descendants.length }} entities beneath it in total.
                </p>
              </AppQueryState>
            </UCard>

            <AppEntityMembersCard
              :entity="entity"
              :root-id="rootEntity?.id ?? null"
              :read-only="archived"
              :active-count="activeMemberCount ?? null"
              :at-capacity="atCapacity"
            />

            <UCard v-if="canOpenIntegrations">
              <template #header>
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-semibold text-highlighted">
                    Integrations
                  </h2>
                  <UButton
                    :to="integrations.to"
                    label="Manage"
                    color="neutral"
                    variant="outline"
                    size="sm"
                  />
                </div>
              </template>
              <p v-if="integrations.failed" class="text-sm text-muted">
                Could not load this entity's service accounts and keys.
              </p>
              <dl v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="entity-integrations">
                <div>
                  <dt class="text-xs text-muted">
                    Active service accounts
                  </dt>
                  <dd class="text-sm text-default">
                    <USkeleton v-if="integrations.accounts == null" class="h-5 w-8" />
                    <template v-else>
                      {{ integrations.accounts }}
                    </template>
                  </dd>
                </div>
                <div v-if="integrations.showKeys">
                  <dt class="text-xs text-muted">
                    Active keys anchored here
                  </dt>
                  <dd class="text-sm text-default">
                    <USkeleton v-if="integrations.keys == null" class="h-5 w-8" />
                    <template v-else>
                      {{ integrations.keys }}
                    </template>
                  </dd>
                </div>
              </dl>
            </UCard>

            <AppEntityActivityCard :entity-id="entity.id" :entity-name="entity.display_name" />
          </div>
        </AppQueryState>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>

  <template v-if="entity && scopeReady && !archived">
    <AppEntityEditDialog v-model:open="editOpen" :entity="entity" />
    <AppEntityGovernanceDialog
      v-model:open="governanceOpen"
      :entity="entity"
      :root="rootEntity"
      :is-root="isRoot"
    />
    <AppEntityMoveDialog
      v-model:open="moveOpen"
      :entity="entity"
      :root-id="rootEntity?.id ?? null"
      :organisation="organisationById"
      :descendant-count="descendants.length"
      :member-count="activeMemberCount ?? null"
    />
  </template>

  <!-- Archive (DELETE /entities/{id}) -->
  <AppConfirmDialog
    v-model:open="archive.open"
    v-bind="archive.dialog"
    :confirm-disabled="archiveBlocked"
    @confirm="archive.confirm"
  >
    <template v-if="cascadeRequired" #acknowledge>
      <UCheckbox
        v-model="cascadeAcknowledged"
        :label="`Also archive the ${archivePlan.archived.length} active ${archivePlan.archived.length === 1 ? 'entity' : 'entities'} beneath it`"
        description="Required: the server archives an entity with active children only together with them."
        :disabled="archive.pending"
      />
    </template>
  </AppConfirmDialog>
</template>
