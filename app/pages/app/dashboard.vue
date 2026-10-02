<script setup lang="ts">
import { auditEventLabel } from '~/utils/audit'

// Dashboard — logic in useDashboard (admins: counts, failed sign-ins, recent activity; everyone
// else: their access and a launcher); this file is display only.
const {
  displayName,
  configState,
  refetchConfig,
  isAdminView,
  tiles,
  launcher,
  auditOn,
  recentEvents,
  recentStatus,
  recentError,
  refetchRecent,
  auditPath,
  canOpenSettings,
  serverLine,
  contractNotice
} = useDashboard()
</script>

<template>
  <UDashboardPanel id="dashboard">
    <template #header>
      <UDashboardNavbar title="Dashboard">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <div>
          <h2 class="text-base font-medium text-highlighted">
            Welcome back{{ displayName ? `, ${displayName}` : '' }}
          </h2>
          <p v-if="isAdminView && serverLine" class="text-sm text-muted">
            Connected to {{ serverLine }}.
            <ULink v-if="canOpenSettings" to="/app/settings" class="text-primary underline underline-offset-2">Server details</ULink>
          </p>
        </div>

        <UAlert
          v-if="configState === 'error'"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Server capabilities unavailable"
          description="The console could not read what this auth server offers, so pages that depend on it stay hidden."
          :actions="[{ label: 'Retry', icon: 'i-lucide-refresh-cw', color: 'neutral', variant: 'outline', onClick: () => { void refetchConfig() } }]"
        />
        <UAlert
          v-if="isAdminView && contractNotice"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="contractNotice.title"
          :description="contractNotice.description"
        />

        <!-- Admins: live counts, each linking to the list it summarises -->
        <section v-if="isAdminView" aria-labelledby="dashboard-overview" class="space-y-3">
          <h2 id="dashboard-overview" class="text-sm font-medium text-default">
            Overview
          </h2>
          <UPageGrid class="grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <UPageCard
              v-for="tile in tiles"
              :key="tile.key"
              :title="tile.label"
              :description="tile.description"
              :icon="tile.icon"
              :to="tile.to"
              variant="subtle"
              :data-testid="`dashboard-tile-${tile.key}`"
            >
              <USkeleton v-if="tile.status === 'pending'" class="h-8 w-16" />
              <span v-else-if="tile.status === 'error'" class="text-sm text-muted">Could not load</span>
              <span v-else class="text-2xl font-semibold text-highlighted" :data-testid="`tile-value-${tile.key}`">{{ tile.value?.toLocaleString() ?? '—' }}</span>
            </UPageCard>
          </UPageGrid>
        </section>

        <!-- Admins with the audit log: the latest events -->
        <UCard v-if="auditOn">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-semibold text-highlighted">
                Recent activity
              </h2>
              <UButton
                :to="auditPath"
                label="Open Audit"
                color="neutral"
                variant="outline"
                size="sm"
              />
            </div>
          </template>
          <AppQueryState
            :status="recentStatus"
            :error="recentError"
            :empty="!recentEvents.length"
            error-title="Could not load recent activity"
            empty-title="No activity yet"
            empty-description="Account events appear here as they are recorded."
            empty-icon="i-lucide-scroll-text"
            skeleton="list"
            :skeleton-rows="4"
            loading-label="Loading recent activity"
            compact
            @retry="refetchRecent()"
          >
            <ul class="divide-y divide-default" aria-label="Recent audit events">
              <li v-for="event in recentEvents" :key="event.id" class="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-2">
                <div class="min-w-0">
                  <p class="text-sm font-medium text-highlighted">
                    {{ auditEventLabel(event.event_type) }}
                  </p>
                  <p v-if="event.subject_email_snapshot" class="break-words text-xs text-muted">
                    {{ event.subject_email_snapshot }}
                  </p>
                </div>
                <span class="text-xs text-muted"><AppTimestamp :value="event.occurred_at" /></span>
              </li>
            </ul>
          </AppQueryState>
        </UCard>

        <!-- Everyone else: their own access and where they can go -->
        <template v-if="!isAdminView && configState === 'ready'">
          <AppDashboardMyAccessCard />

          <section v-if="launcher.length" aria-labelledby="dashboard-launcher" class="space-y-3">
            <h2 id="dashboard-launcher" class="text-sm font-medium text-default">
              Go to
            </h2>
            <UPageGrid class="gap-3 sm:gap-4">
              <UPageCard
                v-for="item in launcher"
                :key="item.id"
                :title="item.label"
                :description="item.description"
                :icon="item.icon"
                :to="item.to"
                variant="outline"
              />
            </UPageGrid>
          </section>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
