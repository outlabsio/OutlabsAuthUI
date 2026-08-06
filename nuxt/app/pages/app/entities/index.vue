<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { entitiesListQuery, useCreateEntity } from '~/queries/entities'
import { getApiErrorMessage } from '~/utils/api'
import { buildEntityTree, filterEntityTree, type EntityTreeNode } from '~/utils/entity-tree'
import type { CreateEntityInput, Entity, EntityClassValue, EntityStatusValue } from '~/types/entity'

// Entities vertical — the hierarchy as a navigable TREE (parity with the React tree panel):
// expand/collapse to explore, each node links to its detail, client-side search filters and
// reveals matches. Plus a hierarchy-aware create. Gates on entity:read / entity:create.
const toast = useToast()
const { hasPermission } = useAuth()

// One query loads the whole hierarchy — the tree, search, and the parent picker all derive
// from it (built + filtered client-side, no server pagination).
const { data, status, error } = useQuery(() => ({ ...entitiesListQuery({ limit: 1000 }), enabled: hasPermission('entity:read') }))
const allEntities = computed<Entity[]>(() => data.value?.items ?? [])

const search = ref('')
const fullTree = computed(() => buildEntityTree(allEntities.value))
const filtered = computed(() => filterEntityTree(fullTree.value, search.value))
const expanded = ref<string[]>([])
watch(() => filtered.value.expandedIds, (ids) => {
  expanded.value = ids
})

// UTree items — value = id (key), label = display name; children omitted for leaves so they
// render without an expand toggle.
type EntityTreeItem = {
  value: string
  label: string
  entityClass: EntityClassValue
  status: EntityStatusValue
  children?: EntityTreeItem[]
}
function toTreeItems(nodes: EntityTreeNode[]): EntityTreeItem[] {
  return nodes.map(n => ({
    value: n.id,
    label: n.display_name,
    entityClass: n.entity_class,
    status: n.status,
    ...(n.children.length ? { children: toTreeItems(n.children) } : {})
  }))
}
const treeItems = computed(() => toTreeItems(filtered.value.tree))

// Parent picker options (searchable USelectMenu). "Root" uses a sentinel because Reka's
// Combobox reserves the empty string for clearing (an empty-value item throws).
const ROOT_PARENT = '__root__'
const parentSelectItems = computed(() => [
  { label: 'None (root)', value: ROOT_PARENT },
  ...allEntities.value.map(e => ({ label: e.display_name, value: e.id }))
])
const entityClassItems = [
  { label: 'Structural', value: 'structural' as EntityClassValue },
  { label: 'Access group', value: 'access_group' as EntityClassValue }
]

// --- Create ---
const createOpen = ref(false)
const createState = reactive({
  parentId: ROOT_PARENT,
  name: '',
  displayName: '',
  slug: '',
  description: '',
  entityClass: 'structural' as EntityClassValue,
  entityType: '',
  allowedChildClasses: [] as EntityClassValue[],
  allowedChildTypes: ''
})
const createErrors = reactive({ name: '', displayName: '', slug: '', entityType: '' })
const createEntity = useCreateEntity()
const creating = ref(false)

function parseChildTypes(raw: string): string[] {
  return raw.split(',').map(t => t.trim()).filter(Boolean)
}
function toggleChildClass(value: EntityClassValue) {
  const idx = createState.allowedChildClasses.indexOf(value)
  if (idx === -1) createState.allowedChildClasses.push(value)
  else createState.allowedChildClasses.splice(idx, 1)
}

// Governance of the chosen parent — surfaced as guidance (the backend enforces on submit).
const selectedParent = computed(() => allEntities.value.find(e => e.id === createState.parentId) ?? null)
const parentAllowedTypes = computed(() => selectedParent.value?.allowed_child_types ?? [])
const parentAllowedClasses = computed(() => selectedParent.value?.allowed_child_classes ?? [])
const hasParentGovernance = computed(() => Boolean(parentAllowedTypes.value?.length || parentAllowedClasses.value?.length))

function openCreate() {
  Object.assign(createState, { parentId: ROOT_PARENT, name: '', displayName: '', slug: '', description: '', entityClass: 'structural', entityType: '', allowedChildClasses: [], allowedChildTypes: '' })
  Object.assign(createErrors, { name: '', displayName: '', slug: '', entityType: '' })
  createOpen.value = true
}

async function onCreate() {
  createErrors.name = createState.name.trim() ? '' : 'System name is required.'
  createErrors.displayName = createState.displayName.trim() ? '' : 'Display name is required.'
  createErrors.slug = createState.slug.trim() ? '' : 'Slug is required.'
  createErrors.entityType = createState.entityType.trim() ? '' : 'Entity type is required.'
  if (createErrors.name || createErrors.displayName || createErrors.slug || createErrors.entityType) return

  creating.value = true
  try {
    const input: CreateEntityInput = {
      name: createState.name.trim(),
      display_name: createState.displayName.trim(),
      slug: createState.slug.trim(),
      entity_class: createState.entityClass,
      entity_type: createState.entityType.trim()
    }
    if (createState.description.trim()) input.description = createState.description.trim()
    if (createState.parentId && createState.parentId !== ROOT_PARENT) input.parent_entity_id = createState.parentId
    if (createState.allowedChildClasses.length) input.allowed_child_classes = [...createState.allowedChildClasses]
    const childTypes = parseChildTypes(createState.allowedChildTypes)
    if (childTypes.length) input.allowed_child_types = childTypes

    await createEntity.mutateAsync(input)
    toast.add({ title: 'Entity created', color: 'success', icon: 'i-lucide-check' })
    createOpen.value = false
  } catch (err) {
    toast.add({ title: 'Could not create entity', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="entities">
    <template #header>
      <UDashboardNavbar title="Entities">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            v-if="hasPermission('entity:create')"
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
          :description="getApiErrorMessage(error)"
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
          color="neutral"
          class="max-w-2xl"
        >
          <template #item-label="{ item }">
            <ULink :to="`/app/entities/${item.value}`" class="truncate font-medium text-highlighted hover:underline">
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
