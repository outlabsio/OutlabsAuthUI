<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import type { TableColumn } from '@nuxt/ui'
import { entitiesListQuery, entityDetailQuery, useMoveEntity, useUpdateEntity } from '~/queries/entities'
import { entityMembersQuery } from '~/queries/memberships'
import { getApiErrorMessage } from '~/utils/api'
import type { Entity, EntityClassValue, EntityStatusValue } from '~/types/entity'
import type { EntityMember } from '~/types/membership'
import type { UserStatusValue } from '~/types/user'

// The entity detail panel — the right column of the entities master-detail (and reused for the
// deep-link route). entityId is a prop so it swaps as the tree selection changes.
const props = defineProps<{ entityId: string }>()
const toast = useToast()
const { hasPermission } = useAuth()

const entityId = computed(() => props.entityId)
const canRead = computed(() => hasPermission('entity:read'))
const canManage = computed(() => hasPermission('entity:update'))
const { data: entity, status, error } = useQuery(() => ({ ...entityDetailQuery(entityId.value), enabled: canRead.value }))
const { data: childrenData, status: childrenStatus } = useQuery(() => ({
  ...entitiesListQuery({ parentId: entityId.value, limit: 100 }),
  enabled: canRead.value
}))
// The full hierarchy for the move-target picker (the USelectMenu searches it client-side).
const { data: parentPool } = useQuery(() => ({ ...entitiesListQuery({ limit: 1000 }), enabled: canRead.value }))
const moveParentOptions = computed<Entity[]>(() => (parentPool.value?.items ?? []).filter(e => e.id !== entityId.value))

// Members of this entity (users + their roles) for the Users card. Needs membership:read
// (superusers pass); gated so a denied actor fires no guaranteed-403 call.
const canReadMembers = computed(() => hasPermission('membership:read'))
const { data: membersData, status: membersStatus } = useQuery(() => ({
  ...entityMembersQuery(entityId.value),
  enabled: canReadMembers.value
}))
const members = computed<EntityMember[]>(() => membersData.value ?? [])

const entityStatusItems = [
  { label: 'Active', value: 'active' as EntityStatusValue },
  { label: 'Inactive', value: 'inactive' as EntityStatusValue },
  { label: 'Archived', value: 'archived' as EntityStatusValue }
]
// "Root" uses a sentinel — Reka's Combobox reserves the empty string (an empty-value item throws).
const ROOT_PARENT = '__root__'
const moveParentSelectItems = computed(() => [
  { label: 'None (root)', value: ROOT_PARENT },
  ...moveParentOptions.value.map(e => ({ label: e.display_name, value: e.id }))
])

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

// Deterministic badge colour per entity_type, so the same type reads the same everywhere.
const TYPE_COLORS = ['info', 'success', 'warning', 'secondary', 'accent', 'special'] as const
function typeColor(type: string): (typeof TYPE_COLORS)[number] {
  let hash = 0
  for (let i = 0; i < type.length; i++) hash = (hash * 31 + type.charCodeAt(i)) >>> 0
  return TYPE_COLORS[hash % TYPE_COLORS.length]!
}

const memberColumns: TableColumn<EntityMember>[] = [
  { id: 'name', header: 'Name' },
  { accessorKey: 'user_email', header: 'Email' },
  { id: 'roles', header: 'Roles' },
  { accessorKey: 'user_status', header: 'Status' }
]
const memberStatusColor: Record<UserStatusValue, 'success' | 'info' | 'warning' | 'error' | 'neutral'> = {
  active: 'success',
  invited: 'info',
  suspended: 'warning',
  banned: 'error',
  deleted: 'neutral'
}
function memberName(m: EntityMember) {
  return [m.user_first_name, m.user_last_name].filter(Boolean).join(' ').trim() || m.user_email
}

// --- Edit ---
const editOpen = ref(false)
const editState = reactive({ displayName: '', description: '', status: 'active' as EntityStatusValue, allowedChildClasses: [] as EntityClassValue[], allowedChildTypes: '' })
const updateEntity = useUpdateEntity()
const saving = ref(false)

function toggleChildClass(value: EntityClassValue) {
  const idx = editState.allowedChildClasses.indexOf(value)
  if (idx === -1) editState.allowedChildClasses.push(value)
  else editState.allowedChildClasses.splice(idx, 1)
}

function openEdit() {
  const e = entity.value
  if (!e) return
  editState.displayName = e.display_name
  editState.description = e.description ?? ''
  editState.status = e.status
  editState.allowedChildClasses = [...(e.allowed_child_classes ?? [])]
  editState.allowedChildTypes = (e.allowed_child_types ?? []).join(', ')
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
        status: editState.status,
        allowed_child_classes: [...editState.allowedChildClasses],
        allowed_child_types: editState.allowedChildTypes.split(',').map(t => t.trim()).filter(Boolean)
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
const moveParentId = ref(ROOT_PARENT)
const moveEntity = useMoveEntity()
const moving = ref(false)

function openMove() {
  moveParentId.value = entity.value?.parent_entity_id ?? ROOT_PARENT
  moveOpen.value = true
}

async function onMove() {
  moving.value = true
  try {
    const newParentId = moveParentId.value === ROOT_PARENT ? null : moveParentId.value
    await moveEntity.mutateAsync({ entityId: entityId.value, newParentId })
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
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            to="/app/entities"
            aria-label="Close entity detail"
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
                <UBadge v-if="entity" :color="entity.entity_class === 'structural' ? 'info' : 'special'" variant="subtle">
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
            >
              <template #display_name-cell="{ row }">
                <ULink
                  :to="{ query: { entity: row.original.id } }"
                  class="font-medium text-highlighted hover:underline"
                >
                  {{ row.original.display_name }}
                </ULink>
              </template>
              <template #entity_type-cell="{ row }">
                <UBadge :color="typeColor(row.original.entity_type)" variant="subtle" size="sm">
                  {{ row.original.entity_type }}
                </UBadge>
              </template>
            </UTable>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="font-semibold text-highlighted">
                  Users
                </h2>
                <span class="text-sm text-muted">{{ members.length }}</span>
              </div>
            </template>
            <AppPermissionGate permission="membership:read">
              <UTable
                :data="members"
                :columns="memberColumns"
                :loading="membersStatus === 'pending'"
                :empty="'No users assigned to this entity.'"
              >
                <template #name-cell="{ row }">
                  <ULink
                    :to="`/app/users/${row.original.user_id}`"
                    class="font-medium text-highlighted hover:underline"
                  >
                    {{ memberName(row.original) }}
                  </ULink>
                </template>
                <template #roles-cell="{ row }">
                  <div class="flex flex-wrap gap-1">
                    <UBadge
                      v-for="r in row.original.roles"
                      :key="r.id"
                      color="neutral"
                      variant="subtle"
                      size="sm"
                    >
                      {{ r.display_name || r.name }}
                    </UBadge>
                    <span v-if="!row.original.roles.length" class="text-sm text-dimmed">—</span>
                  </div>
                </template>
                <template #user_status-cell="{ row }">
                  <UBadge
                    :color="memberStatusColor[row.original.user_status]"
                    variant="subtle"
                    size="sm"
                    class="capitalize"
                  >
                    {{ row.original.user_status }}
                  </UBadge>
                </template>
              </UTable>
            </AppPermissionGate>
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
          <USelect
            id="entity-edit-status"
            v-model="editState.status"
            :items="entityStatusItems"
            class="w-full"
          />
        </div>
        <div class="space-y-2 rounded-lg border border-default p-3">
          <p class="text-sm font-medium text-default">
            Child governance
          </p>
          <div class="space-y-1">
            <span class="block text-xs text-muted">Allowed child classes</span>
            <div class="flex gap-4">
              <UCheckbox
                label="Structural"
                :model-value="editState.allowedChildClasses.includes('structural')"
                @update:model-value="toggleChildClass('structural')"
              />
              <UCheckbox
                label="Access group"
                :model-value="editState.allowedChildClasses.includes('access_group')"
                @update:model-value="toggleChildClass('access_group')"
              />
            </div>
          </div>
          <div class="space-y-1.5">
            <label for="entity-edit-allowed-child-types" class="block text-xs text-muted">Allowed child types (comma-separated)</label>
            <UInput
              id="entity-edit-allowed-child-types"
              v-model="editState.allowedChildTypes"
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
        <USelectMenu
          id="entity-move-parent"
          v-model="moveParentId"
          value-key="value"
          :items="moveParentSelectItems"
          placeholder="None (root)"
          class="w-full"
        />
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
