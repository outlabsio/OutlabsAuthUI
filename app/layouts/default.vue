<script setup lang="ts">
import { MAIN_CONTENT_ID } from '~/navigation/panel-memory'
import type { RuntimeConfig } from '~/utils/runtime-config'

// The app shell, on the Nuxt UI dashboard template idioms: UDashboardGroup + a collapsible,
// resizable UDashboardSidebar (search button, grouped navigation, Settings at the bottom and the
// user menu in the footer), UDashboardSearch as the command palette, and the page panels inside
// one main landmark behind a skip link. Nav items come from useAppNavigation: APP_SECTIONS
// filtered by surface AND feature AND permission (the same predicate the route guard and each
// page's AppPermissionGate use), so nav visibility equals page visibility.
const { sidebar, sidebarBottom } = useAppNavigation()
useCapabilitiesNotice()
usePermissionsNotice()
const runtimeConfig = useState<RuntimeConfig | null>('app:runtime-config')

// Mobile drawer state; it also closes on every route change (UDashboardSidebar autoClose).
const sidebarOpen = ref(false)

// Skip link: move focus to the main landmark without a hash navigation (the router would treat
// a fragment change as a new history entry).
function skipToMain(event: MouseEvent) {
  event.preventDefault()
  document.getElementById(MAIN_CONTENT_ID)?.focus()
}
</script>

<template>
  <UButton
    :href="`#${MAIN_CONTENT_ID}`"
    external
    label="Skip to main content"
    class="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:start-3 focus-visible:z-50 focus-visible:px-3 focus-visible:py-2"
    @click="skipToMain"
  />

  <UDashboardGroup>
    <UDashboardSidebar
      id="default"
      v-model:open="sidebarOpen"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <div class="flex items-center gap-2 font-semibold">
          <UIcon name="i-lucide-shield-check" class="size-6 text-primary shrink-0" />
          <span v-if="!collapsed" class="truncate">{{ runtimeConfig?.authBrand ?? 'OutlabsAuth' }}</span>
        </div>
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton :collapsed="collapsed" />

        <UNavigationMenu
          :items="sidebar"
          orientation="vertical"
          :collapsed="collapsed"
          tooltip
          aria-label="Console sections"
        />

        <UNavigationMenu
          v-if="sidebarBottom.length"
          :items="sidebarBottom"
          orientation="vertical"
          :collapsed="collapsed"
          tooltip
          aria-label="Console settings"
          class="mt-auto"
        />
      </template>

      <template #footer="{ collapsed }">
        <AppUserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <AppCommandPalette />

    <!-- One main landmark around the page panels (skip-link target). A flex row, so the panels
         inside keep the dashboard group's layout. -->
    <main :id="MAIN_CONTENT_ID" tabindex="-1" class="flex min-w-0 flex-1 focus:outline-none">
      <slot />
    </main>
  </UDashboardGroup>
</template>
