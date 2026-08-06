<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import type { TableColumn } from '@nuxt/ui'
import { entitiesListQuery, entityDetailQuery } from '~/queries/entities'
import { getApiErrorMessage } from '~/utils/api'
import type { Entity } from '~/types/entity'

const route = useRoute()
const entityId = computed(() => String(route.params.entityId))
const { hasPermission } = useAuth()

// Gate every fetch on the read permission (see users/index.vue).
const canRead = computed(() => hasPermission('entity:read'))
const { data: entity, status, error } = useQuery(() => ({ ...entityDetailQuery(entityId.value), enabled: canRead.value }))
const { data: childrenData, status: childrenStatus } = useQuery(() => ({
  ...entitiesListQuery({ parentId: entityId.value, limit: 100 }),
  enabled: canRead.value
}))

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
</template>
