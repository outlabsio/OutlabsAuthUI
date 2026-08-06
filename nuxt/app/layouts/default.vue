<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { useLogout } from '~/queries/session'
import type { RuntimeConfig } from '~/utils/runtime-config'

// The app shell (A5). Vanilla UDashboard components, no custom styling. Nav adapts to the
// capabilities discovered from /auth/config (A1) — a minimal backend hides entities/audit.
const { can, displayName, user } = useAuth()
const logout = useLogout()
const runtimeConfig = useState<RuntimeConfig | null>('app:runtime-config')

const items = computed<NavigationMenuItem[][]>(() => {
  const primary: NavigationMenuItem[] = [
    { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/app/dashboard' },
    { label: 'Users', icon: 'i-lucide-users', to: '/app/users' },
    { label: 'Roles', icon: 'i-lucide-shield', to: '/app/roles' },
    { label: 'Permissions', icon: 'i-lucide-key-round', to: '/app/permissions' }
  ]
  if (can('api_keys')) {
    primary.push({ label: 'API Keys', icon: 'i-lucide-key', to: '/app/api-keys' })
  }
  if (can('entity_hierarchy')) {
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
