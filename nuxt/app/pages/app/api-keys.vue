<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import type { TableColumn } from '@nuxt/ui'
import { myApiKeysQuery } from '~/queries/api-keys'
import { getApiErrorMessage } from '~/utils/api'
import type { ApiKey } from '~/types/api-key'

// P2 vertical (read-only) — the current actor's API keys. Mint/rotate/revoke land in a
// later pass (they need the grantable-scope picker).
const { data, status, error } = useQuery(myApiKeysQuery)

const rows = computed<ApiKey[]>(() => data.value ?? [])

const columns: TableColumn<ApiKey>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'prefix', header: 'Prefix' },
  { accessorKey: 'key_kind', header: 'Kind' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'usage_count', header: 'Uses' },
  { accessorKey: 'last_used_at', header: 'Last used' }
]

const statusColor: Record<ApiKey['status'], 'success' | 'warning' | 'error' | 'neutral'> = {
  active: 'success',
  suspended: 'warning',
  revoked: 'error',
  expired: 'neutral'
}
</script>

<template>
  <UDashboardPanel id="api-keys">
    <template #header>
      <UDashboardNavbar title="API Keys">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert
        v-if="status === 'error'"
        color="error"
        icon="i-lucide-triangle-alert"
        title="Could not load API keys"
        :description="getApiErrorMessage(error)"
        class="mb-4"
      />

      <UTable :data="rows" :columns="columns" :loading="status === 'pending'">
        <template #key_kind-cell="{ row }">
          <span class="capitalize">{{ row.original.key_kind.replace('_', ' ') }}</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge :color="statusColor[row.original.status]" variant="subtle" class="capitalize">
            {{ row.original.status }}
          </UBadge>
        </template>
        <template #last_used_at-cell="{ row }">
          {{ row.original.last_used_at ?? '—' }}
        </template>
      </UTable>
    </template>
  </UDashboardPanel>
</template>
