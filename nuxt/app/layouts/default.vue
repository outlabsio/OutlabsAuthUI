<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { useLogout } from '~/queries/session'
import type { RuntimeConfig } from '~/utils/runtime-config'

// The app shell (A5). Vanilla UDashboard components, no custom styling. Nav adapts to the
// capabilities discovered from /auth/config (A1) — a minimal backend hides entities/audit.
const { can, displayName, user, hasPermission } = useAuth()
const logout = useLogout()
const runtimeConfig = useState<RuntimeConfig | null>('app:runtime-config')

const items = computed<NavigationMenuItem[][]>(() => {
  // Dashboard is unguarded; admin resources appear only when the actor holds the read
  // permission (superusers always do). Capability gates layer on top for backend-optional
  // surfaces. Nav visibility must mirror the page-level AppPermissionGate so a hidden item
  // is never reachable via the sidebar.
  const primary: NavigationMenuItem[] = [
    { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/app/dashboard' }
  ]
  if (hasPermission('user:read')) {
    primary.push({ label: 'Users', icon: 'i-lucide-users', to: '/app/users' })
  }
  if (hasPermission('role:read')) {
    primary.push({ label: 'Roles', icon: 'i-lucide-shield', to: '/app/roles' })
  }
  if (hasPermission('permission:read')) {
    primary.push({ label: 'Permissions', icon: 'i-lucide-key-round', to: '/app/permissions' })
  }
  if (can('api_keys')) {
    primary.push({ label: 'API Keys', icon: 'i-lucide-key', to: '/app/api-keys' })
  }
  // System (service-account) keys are an admin surface — gate on apikey:read (superusers pass).
  if (can('api_keys') && hasPermission('apikey:read')) {
    primary.push({ label: 'System API Keys', icon: 'i-lucide-server-cog', to: '/app/users/api-keys' })
  }
  if (can('entity_hierarchy') && hasPermission('entity:read')) {
    primary.push({ label: 'Entities', icon: 'i-lucide-building-2', to: '/app/entities' })
  }
  if (can('activity_tracking')) {
    primary.push({ label: 'Audit', icon: 'i-lucide-scroll-text', to: '/app/audit' })
  }

  const secondary: NavigationMenuItem[] = [
    { label: 'Settings', icon: 'i-lucide-settings', to: '/app/settings' },
    { label: 'Account', icon: 'i-lucide-circle-user', to: '/app/account' }
  ]

  return [primary, secondary]
})

async function signOut() {
  await logout.mutateAsync()
  await navigateTo('/auth/login')
}
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar collapsible resizable>
      <template #header="{ collapsed }">
        <div class="flex items-center gap-2 font-semibold">
          <UIcon name="i-lucide-shield-check" class="size-6 text-primary shrink-0" />
          <span v-if="!collapsed" class="truncate">{{ runtimeConfig?.authBrand ?? 'OutlabsAuth' }}</span>
        </div>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :items="items[0]"
          orientation="vertical"
          :collapsed="collapsed"
          tooltip
          popover
        />
        <UNavigationMenu
          :items="items[1]"
          orientation="vertical"
          :collapsed="collapsed"
          tooltip
          class="mt-auto"
        />
      </template>

      <template #footer="{ collapsed }">
        <div class="flex w-full items-center gap-2" :class="collapsed ? 'justify-center' : ''">
          <UAvatar :alt="displayName || 'User'" size="sm" icon="i-lucide-user" />
          <div v-if="!collapsed" class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-default">
              {{ displayName }}
            </p>
            <p class="truncate text-xs text-muted">
              {{ user?.email }}
            </p>
          </div>
          <UButton
            v-if="!collapsed"
            icon="i-lucide-log-out"
            color="neutral"
            variant="ghost"
            aria-label="Sign out"
            @click="signOut"
          />
        </div>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
