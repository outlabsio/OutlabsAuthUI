<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import type { TableColumn } from '@nuxt/ui'
import { entitiesListQuery, useCreateEntity } from '~/queries/entities'
import { getApiErrorMessage } from '~/utils/api'
import type { CreateEntityInput, EntitiesListFilters, Entity, EntityClassValue } from '~/types/entity'

// Entities vertical — the hierarchy list plus a hierarchy-aware create (pick a parent, or
// none for a root). Create/edit/move gate on entity:update/create (superusers pass).
const toast = useToast()
const { hasPermission } = useAuth()

const filters = reactive<EntitiesListFilters>({ page: 1, limit: 100, search: '' })
// Gate the fetch on the read permission too (see users/index.vue) — no wasted 403 for a
// denied actor; the AppPermissionGate renders the same verdict in-place.
const { data, status, error } = useQuery(() => ({ ...entitiesListQuery({ ...filters }), enabled: hasPermission('entity:read') }))
// A search-independent pool for the parent picker (the table's own list is search-filtered).
const { data: parentPool } = useQuery(() => ({ ...entitiesListQuery({ limit: 100 }), enabled: hasPermission('entity:read') }))

const rows = computed<Entity[]>(() => data.value?.items ?? [])
const parentOptions = computed<Entity[]>(() => parentPool.value?.items ?? [])

const columns: TableColumn<Entity>[] = [
  { accessorKey: 'display_name', header: 'Display name' },
  { accessorKey: 'slug', header: 'Slug' },
  { accessorKey: 'entity_type', header: 'Type' },
  { accessorKey: 'entity_class', header: 'Class' },
  { accessorKey: 'status', header: 'Status' }
]

// --- Create ---
const createOpen = ref(false)
const createState = reactive({
  parentId: '',
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
const selectedParent = computed(() => parentOptions.value.find(e => e.id === createState.parentId) ?? null)
const parentAllowedTypes = computed(() => selectedParent.value?.allowed_child_types ?? [])
const parentAllowedClasses = computed(() => selectedParent.value?.allowed_child_classes ?? [])
const hasParentGovernance = computed(() => Boolean(parentAllowedTypes.value?.length || parentAllowedClasses.value?.length))

function openCreate() {
  Object.assign(createState, { parentId: '', name: '', displayName: '', slug: '', description: '', entityClass: 'structural', entityType: '', allowedChildClasses: [], allowedChildTypes: '' })
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
    if (createState.parentId) input.parent_entity_id = createState.parentId
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
            v-model="filters.search"
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

        <UTable :data="rows" :columns="columns" :loading="status === 'pending'">
          <template #display_name-cell="{ row }">
            <ULink :to="`/app/entities/${row.original.id}`" class="font-medium text-highlighted hover:underline">
              {{ row.original.display_name }}
            </ULink>
          </template>
          <template #entity_class-cell="{ row }">
            <UBadge :color="row.original.entity_class === 'structural' ? 'primary' : 'neutral'" variant="subtle">
              {{ row.original.entity_class.replace('_', ' ') }}
            </UBadge>
          </template>
          <template #status-cell="{ row }">
            <UBadge :color="row.original.status === 'active' ? 'success' : 'neutral'" variant="subtle" class="capitalize">
              {{ row.original.status }}
            </UBadge>
          </template>
        </UTable>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>

  <!-- Create -->
  <UModal v-model:open="createOpen" title="Create entity">
    <template #body>
      <div class="space-y-4">
        <div class="space-y-1.5">
          <label for="entity-parent" class="block text-sm font-medium text-default">Parent</label>
          <select
            id="entity-parent"
            v-model="createState.parentId"
            class="w-full rounded-md border border-default bg-default px-2.5 py-1.5 text-sm text-default"
          >
            <option value="">
              None (root)
            </option>
            <option v-for="entity in parentOptions" :key="entity.id" :value="entity.id">
              {{ entity.display_name }}
            </option>
          </select>
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
            <select
              id="entity-class"
              v-model="createState.entityClass"
              class="w-full rounded-md border border-default bg-default px-2.5 py-1.5 text-sm text-default"
            >
              <option value="structural">
                Structural
              </option>
              <option value="access_group">
                Access group
              </option>
            </select>
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
