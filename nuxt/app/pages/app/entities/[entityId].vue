<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import type { TableColumn } from '@nuxt/ui'
import { entitiesListQuery, entityDetailQuery, useMoveEntity, useUpdateEntity } from '~/queries/entities'
import { getApiErrorMessage } from '~/utils/api'
import type { Entity, EntityStatusValue } from '~/types/entity'

const route = useRoute()
const entityId = computed(() => String(route.params.entityId))
const toast = useToast()
const { hasPermission } = useAuth()

// Gate every fetch on the read permission (see users/index.vue).
const canRead = computed(() => hasPermission('entity:read'))
const canManage = computed(() => hasPermission('entity:update'))
const { data: entity, status, error } = useQuery(() => ({ ...entityDetailQuery(entityId.value), enabled: canRead.value }))
const { data: childrenData, status: childrenStatus } = useQuery(() => ({
  ...entitiesListQuery({ parentId: entityId.value, limit: 100 }),
  enabled: canRead.value
}))
// Search-independent pool for the move-target picker (excludes this entity).
const { data: parentPool } = useQuery(() => ({ ...entitiesListQuery({ limit: 100 }), enabled: canRead.value }))
const moveParentOptions = computed<Entity[]>(() => (parentPool.value?.items ?? []).filter(e => e.id !== entityId.value))

const detailItems = computed(() => {
  const e = entity.value
  if (!e) return []
  return [
    { label: 'Name', value: e.name },
    { label: 'Slug', value: e.slug },
    { label: 'Type', value: e.entity_type },
    { label: 'Class', value: e.entity_class.replace('_', ' ') },
    { label: 'Status', value: e.status }
  ]
})

const children = computed<Entity[]>(() => childrenData.value?.items ?? [])
const childColumns: TableColumn<Entity>[] = [
  { accessorKey: 'display_name', header: 'Display name' },
  { accessorKey: 'slug', header: 'Slug' },
  { accessorKey: 'entity_type', header: 'Type' }
]

// --- Edit ---
const editOpen = ref(false)
const editState = reactive({ displayName: '', description: '', status: 'active' as EntityStatusValue })
const updateEntity = useUpdateEntity()
const saving = ref(false)

function openEdit() {
  const e = entity.value
  if (!e) return
  editState.displayName = e.display_name
  editState.description = e.description ?? ''
  editState.status = e.status
  editOpen.value = true
}

async function onEdit() {
  saving.value = true
  try {
    await updateEntity.mutateAsync({
      entityId: entityId.value,
      input: {
        display_name: editState.displayName.trim(),
        description: editState.description.trim() ? editState.description.trim() : null,
        status: editState.status
      }
    })
    toast.add({ title: 'Entity updated', color: 'success', icon: 'i-lucide-check' })
    editOpen.value = false
  } catch (err) {
    toast.add({ title: 'Could not update entity', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    saving.value = false
  }
}

// --- Move ---
const moveOpen = ref(false)
const moveParentId = ref('')
const moveEntity = useMoveEntity()
const moving = ref(false)

function openMove() {
  moveParentId.value = entity.value?.parent_entity_id ?? ''
  moveOpen.value = true
}

async function onMove() {
  moving.value = true
  try {
    await moveEntity.mutateAsync({ entityId: entityId.value, newParentId: moveParentId.value || null })
    toast.add({ title: 'Entity moved', color: 'success', icon: 'i-lucide-check' })
    moveOpen.value = false
  } catch (err) {
    toast.add({ title: 'Could not move entity', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    moving.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="entity-detail">
    <template #header>
      <UDashboardNavbar :title="entity?.display_name ?? 'Entity'">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/app/entities"
            aria-label="Back to entities"
          />
        </template>
        <template #right>
          <div v-if="entity && canManage" class="flex items-center gap-2">
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="outline"
              label="Edit"
              @click="openEdit"
            />
            <UButton
              icon="i-lucide-move"
              color="neutral"
              variant="outline"
              label="Move"
              @click="openMove"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <AppPermissionGate permission="entity:read">
        <UAlert
          v-if="status === 'error'"
          color="error"
          icon="i-lucide-triangle-alert"
          title="Could not load entity"
          :description="getApiErrorMessage(error)"
        />

        <div v-else class="mx-auto w-full max-w-3xl space-y-6">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="font-semibold text-highlighted">
                  Details
                </h2>
                <UBadge v-if="entity" variant="subtle">
                  {{ entity.entity_class.replace('_', ' ') }}
                </UBadge>
              </div>
            </template>
            <AppDetailList :items="detailItems" />
            <p v-if="entity?.description" class="mt-4 text-sm text-muted">
              {{ entity.description }}
            </p>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="font-semibold text-highlighted">
                  Children
                </h2>
                <span class="text-sm text-muted">{{ children.length }}</span>
              </div>
            </template>
            <UTable
              :data="children"
              :columns="childColumns"
              :loading="childrenStatus === 'pending'"
              :empty="'No child entities.'"
            />
          </UCard>
        </div>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>

  <!-- Edit -->
  <UModal v-model:open="editOpen" title="Edit entity">
    <template #body>
      <div class="space-y-4">
        <div class="space-y-1.5">
          <label for="entity-edit-display-name" class="block text-sm font-medium text-default">Display name</label>
          <UInput id="entity-edit-display-name" v-model="editState.displayName" class="w-full" />
        </div>
        <div class="space-y-1.5">
          <label for="entity-edit-description" class="block text-sm font-medium text-default">Description</label>
          <UTextarea
            id="entity-edit-description"
            v-model="editState.description"
            :rows="2"
            class="w-full"
          />
        </div>
        <div class="space-y-1.5">
          <label for="entity-edit-status" class="block text-sm font-medium text-default">Status</label>
          <select
            id="entity-edit-status"
            v-model="editState.status"
            class="w-full rounded-md border border-default bg-default px-2.5 py-1.5 text-sm text-default"
          >
            <option value="active">
              Active
            </option>
            <option value="inactive">
              Inactive
            </option>
            <option value="archived">
              Archived
            </option>
          </select>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="Cancel"
          @click="editOpen = false"
        />
        <UButton label="Save changes" :loading="saving" @click="onEdit" />
      </div>
    </template>
  </UModal>

  <!-- Move -->
  <UModal v-model:open="moveOpen" title="Move entity">
    <template #body>
      <div class="space-y-1.5">
        <label for="entity-move-parent" class="block text-sm font-medium text-default">New parent</label>
        <select
          id="entity-move-parent"
          v-model="moveParentId"
          class="w-full rounded-md border border-default bg-default px-2.5 py-1.5 text-sm text-default"
        >
          <option value="">
            None (root)
          </option>
          <option v-for="option in moveParentOptions" :key="option.id" :value="option.id">
            {{ option.display_name }}
          </option>
        </select>
        <p class="text-xs text-muted">
          Re-parents this entity. Hierarchy rules on the new parent still apply.
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="Cancel"
          @click="moveOpen = false"
        />
        <UButton label="Move entity" :loading="moving" @click="onMove" />
      </div>
    </template>
  </UModal>
</template>
