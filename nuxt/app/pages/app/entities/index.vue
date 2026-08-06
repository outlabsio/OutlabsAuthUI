<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import type { TableColumn } from '@nuxt/ui'
import { entitiesListQuery } from '~/queries/entities'
import { getApiErrorMessage } from '~/utils/api'
import type { EntitiesListFilters, Entity } from '~/types/entity'

// P2 vertical (read-only) — the entity hierarchy. Create/move is hierarchy-constrained and
// lands in a later pass with a tree-aware form.
const filters = reactive<EntitiesListFilters>({ page: 1, limit: 100, search: '' })
const { data, status, error } = useQuery(() => entitiesListQuery({ ...filters }))

const rows = computed<Entity[]>(() => data.value?.items ?? [])

const columns: TableColumn<Entity>[] = [
  { accessorKey: 'display_name', header: 'Display name' },
  { accessorKey: 'slug', header: 'Slug' },
  { accessorKey: 'entity_type', header: 'Type' },
  { accessorKey: 'entity_class', header: 'Class' },
  { accessorKey: 'status', header: 'Status' }
]
</script>

<template>
  <UDashboardPanel id="entities">
    <template #header>
      <UDashboardNavbar title="Entities">
        <template #leading>
          <UDashboardSidebarCollapse />
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
    </template>
  </UDashboardPanel>
</template>
