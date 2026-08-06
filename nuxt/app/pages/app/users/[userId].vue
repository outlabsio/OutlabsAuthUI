<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import type { TableColumn } from '@nuxt/ui'
import { userDetailQuery, userRolesQuery, userSessionsQuery } from '~/queries/users'
import { getApiErrorMessage } from '~/utils/api'
import type { Role } from '~/types/role'
import type { User } from '~/types/user'
import type { UserSession } from '~/types/account'

// Matches the users list badge palette (invited distinct from suspended).
const statusColor: Record<User['status'], 'success' | 'info' | 'warning' | 'error' | 'neutral'> = {
  active: 'success',
  invited: 'info',
  suspended: 'warning',
  banned: 'error',
  deleted: 'neutral'
}

const route = useRoute()
const userId = computed(() => String(route.params.userId))
const { hasPermission } = useAuth()

// Gate every fetch on the read permission (see users/index.vue) — a denied actor sees the
// AppPermissionGate verdict and fires no 403s.
const canRead = computed(() => hasPermission('user:read'))
const { data: user, status, error } = useQuery(() => ({ ...userDetailQuery(userId.value), enabled: canRead.value }))
const { data: roles } = useQuery(() => ({ ...userRolesQuery(userId.value), enabled: canRead.value }))
const { data: sessions, status: sessionsStatus } = useQuery(() => ({ ...userSessionsQuery(userId.value), enabled: canRead.value }))

const profileItems = computed(() => {
  const u = user.value
  if (!u) return []
  return [
    { label: 'Email', value: u.email },
    { label: 'First name', value: u.first_name },
    { label: 'Last name', value: u.last_name },
    { label: 'Status', value: u.status },
    { label: 'Superuser', value: u.is_superuser ? 'Yes' : 'No' },
    { label: 'Email verified', value: u.email_verified ? 'Yes' : 'No' },
    { label: 'Phone', value: u.phone },
    { label: 'Root entity', value: u.root_entity_name },
    { label: 'Created', value: u.created_at },
    { label: 'Last login', value: u.last_login }
  ]
})

const roleRows = computed<Role[]>(() => roles.value ?? [])
const roleColumns: TableColumn<Role>[] = [
  { accessorKey: 'display_name', header: 'Role' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'scope', header: 'Scope' }
]

const sessionRows = computed<UserSession[]>(() => sessions.value ?? [])
const sessionColumns: TableColumn<UserSession>[] = [
  { accessorKey: 'device_name', header: 'Device' },
  { accessorKey: 'ip_address', header: 'IP address' },
  { accessorKey: 'last_used_at', header: 'Last used' }
]
</script>

<template>
  <UDashboardPanel id="user-detail">
    <template #header>
      <UDashboardNavbar :title="user?.email ?? 'User'">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/app/users"
            aria-label="Back to users"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <AppPermissionGate permission="user:read">
        <UAlert
          v-if="status === 'error'"
          color="error"
          icon="i-lucide-triangle-alert"
          title="Could not load user"
          :description="getApiErrorMessage(error)"
        />

        <div v-else class="mx-auto w-full max-w-3xl space-y-6">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="font-semibold text-highlighted">
                  Profile
                </h2>
                <UBadge
                  v-if="user"
                  :color="statusColor[user.status]"
                  variant="subtle"
                  class="capitalize"
                >
                  {{ user.status }}
                </UBadge>
              </div>
            </template>
            <AppDetailList :items="profileItems" />
          </UCard>

          <UCard>
            <template #header>
              <h2 class="font-semibold text-highlighted">
                Roles
              </h2>
            </template>
            <UTable :data="roleRows" :columns="roleColumns" :empty="'No roles assigned.'">
              <template #scope-cell="{ row }">
                <span class="capitalize">{{ row.original.scope.replace('_', ' ') }}</span>
              </template>
            </UTable>
          </UCard>

          <UCard>
            <template #header>
              <h2 class="font-semibold text-highlighted">
                Active sessions
              </h2>
            </template>
            <UTable :data="sessionRows" :columns="sessionColumns" :loading="sessionsStatus === 'pending'">
              <template #last_used_at-cell="{ row }">
                {{ row.original.last_used_at ?? '—' }}
              </template>
            </UTable>
          </UCard>
        </div>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>
</template>
