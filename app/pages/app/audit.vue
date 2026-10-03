<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import type { UserAuditEvent } from '~/types/audit'
import { auditEventBadge, auditEventLabel, auditEntityName, auditCategoryLabel, auditToneLabel, auditEventTone } from '~/utils/audit'
import { hideBelowLg, hideBelowMd, hideBelowSm, srOnlyHeader } from '~/utils/table'

// Audit workspace — logic in useAuditWorkspace; this file is display only. The Audit section
// requirement (audit surface + activity_tracking + user:read) guards nav, route and body alike.
const {
  canRead,
  isEnterprise,
  canFilterByEntity,
  anchoredRootId,
  page,
  pageSize,
  pageSizeModel,
  pageSizeItems,
  events,
  total,
  status,
  error,
  fetching,
  retry,
  categoryItems,
  category,
  eventTypeItems,
  eventTypeSearchInput,
  eventType,
  createEventType,
  subjectUserId,
  actorUserId,
  entityId,
  rangeLabel,
  rangePresets,
  rangePreset,
  calendarRange,
  calendarMax,
  setRangePreset,
  clearRange,
  activeFilters,
  moreFilterCount,
  invalidIds,
  resetFilters,
  scopeNotice,
  emptyState,
  exporting,
  exportProgress,
  exportItems,
  cancelExport,
  guideOpen,
  filtersOpen
} = useAuditWorkspace()

const columns = computed<TableColumn<UserAuditEvent>[]>(() => [
  { id: 'time', header: 'Time' },
  { id: 'event', header: 'Event' },
  { id: 'subject', header: 'About', meta: hideBelowSm },
  { id: 'actor', header: 'Actor', meta: hideBelowMd },
  ...(isEnterprise.value ? [{ id: 'entity', header: 'Entity', meta: hideBelowLg }] : []),
  { id: 'details', header: srOnlyHeader('Details') }
])
const columnPinning = { left: [], right: ['details'] }
const expanded = ref<Record<string, boolean>>({})
const subjectPath = (event: UserAuditEvent) => (event.subject_user_id ? `/app/users/${event.subject_user_id}` : undefined)

// Below xl the account and entity pickers move into the Filters slideover; below sm the event
// type and dates do too.
const breakpoints = useBreakpoints(breakpointsTailwind)
const compact = breakpoints.smaller('sm')
</script>

<template>
  <UDashboardPanel id="audit">
    <template #header>
      <UDashboardNavbar title="Audit">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <!-- Icon-only so the navbar fits at 390px (the drawer toggle and title stay visible).
               Denied: the lock state alone, no guide to a section the viewer cannot use. -->
          <UTooltip v-if="canRead" text="Open Audit guide">
            <UButton
              icon="i-lucide-book-open"
              color="neutral"
              variant="ghost"
              aria-label="Open Audit guide"
              @click="guideOpen = true"
            />
          </UTooltip>
          <UTooltip v-if="canRead" text="Export" :disabled="!compact">
            <UDropdownMenu :items="exportItems" :disabled="exporting || !total">
              <UButton
                icon="i-lucide-download"
                :label="compact ? undefined : 'Export'"
                aria-label="Export"
                color="neutral"
                variant="outline"
                :loading="exporting"
                :disabled="exporting || !total"
              />
            </UDropdownMenu>
          </UTooltip>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar v-if="canRead">
        <div class="flex w-full flex-wrap items-center gap-2 py-2" role="group" aria-label="Audit filters">
          <USelect
            v-model="category"
            :items="categoryItems"
            value-key="value"
            aria-label="Category"
            class="min-w-0 flex-1 sm:w-44 sm:flex-none"
          />
          <USelectMenu
            v-model="eventType"
            :items="eventTypeItems"
            value-key="value"
            :filter-fields="['label', 'description']"
            create-item
            clear
            placeholder="All events"
            aria-label="Event type"
            :search-input="eventTypeSearchInput"
            class="hidden sm:flex sm:w-48"
            @create="createEventType"
          />
          <AppUserPicker
            v-model="subjectUserId"
            placeholder="About anyone"
            aria-label="About account"
            class="hidden xl:flex xl:w-44"
          />
          <AppUserPicker
            v-model="actorUserId"
            placeholder="By anyone"
            aria-label="Actor"
            class="hidden xl:flex xl:w-44"
          />
          <div v-if="canFilterByEntity" class="hidden xl:block xl:w-52">
            <AppEntityPicker
              v-model="entityId"
              :root-id="anchoredRootId"
              include-inactive
              placeholder="At any entity"
              aria-label="Entity"
            />
          </div>
          <UPopover>
            <UButton
              icon="i-lucide-calendar"
              :label="rangeLabel ?? 'Any time'"
              color="neutral"
              variant="outline"
              class="hidden sm:flex"
              :aria-label="`Date range: ${rangeLabel ?? 'Any time'}`"
            />
            <template #content>
              <div class="flex flex-col gap-3 p-3 sm:flex-row">
                <div class="flex flex-col gap-1" role="group" aria-label="Date range presets">
                  <UButton
                    v-for="preset in rangePresets"
                    :key="preset.value"
                    :label="preset.label"
                    :color="rangePreset === preset.value ? 'primary' : 'neutral'"
                    :variant="rangePreset === preset.value ? 'subtle' : 'ghost'"
                    size="sm"
                    @click="setRangePreset(preset.value)"
                  />
                  <UButton
                    label="Any time"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    @click="clearRange"
                  />
                </div>
                <UCalendar
                  v-model="calendarRange"
                  range
                  :max-value="calendarMax"
                  :number-of-months="1"
                  aria-label="Choose days"
                />
              </div>
            </template>
          </UPopover>
          <UButton
            icon="i-lucide-sliders-horizontal"
            label="Filters"
            color="neutral"
            variant="outline"
            class="xl:hidden"
            :aria-label="moreFilterCount ? `Filters (${moreFilterCount} active)` : 'Filters'"
            @click="filtersOpen = true"
          >
            <template v-if="moreFilterCount" #trailing>
              <UBadge
                :label="String(moreFilterCount)"
                size="sm"
                color="neutral"
                variant="subtle"
              />
            </template>
          </UButton>
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <AppPermissionGate section="audit">
        <div class="space-y-4">
          <p class="text-sm text-muted">
            Account, credential, membership and role-assignment events, newest first.
          </p>

          <UAlert
            v-if="scopeNotice"
            color="neutral"
            variant="subtle"
            icon="i-lucide-info"
            :title="scopeNotice.title"
            :description="scopeNotice.description"
          />
          <UAlert
            v-if="invalidIds.length"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            title="A filter in this link is not a valid ID"
            description="It is ignored, so the results are not narrowed by it. Remove it or choose a value."
          />

          <div
            v-if="activeFilters.length"
            class="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Active filters"
          >
            <UButton
              v-for="filter in activeFilters"
              :key="filter.key"
              :label="`${filter.label}: ${filter.value}`"
              :aria-label="`Remove filter ${filter.label}: ${filter.value}`"
              trailing-icon="i-lucide-x"
              color="neutral"
              variant="subtle"
              size="xs"
              @click="filter.clear()"
            />
            <UButton
              label="Clear all"
              color="neutral"
              variant="link"
              size="xs"
              @click="resetFilters"
            />
          </div>

          <div v-if="exporting" class="space-y-2" role="status">
            <div class="flex items-center justify-between gap-2 text-sm">
              <span class="text-muted">
                {{ exportProgress ? `Exporting ${exportProgress.loaded.toLocaleString()} of ${exportProgress.total.toLocaleString()} events...` : 'Preparing the export...' }}
              </span>
              <UButton
                label="Cancel export"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="cancelExport"
              />
            </div>
            <UProgress :model-value="exportProgress?.loaded ?? null" :max="exportProgress?.total || 100" size="sm" />
          </div>

          <AppQueryState
            :status="status"
            :error="error"
            :empty="!events.length"
            :refreshing="fetching"
            error-title="Could not load audit events"
            :empty-title="emptyState.title"
            :empty-description="emptyState.description"
            :empty-actions="emptyState.actions"
            empty-icon="i-lucide-scroll-text"
            skeleton="table"
            :skeleton-rows="8"
            :skeleton-columns="5"
            loading-label="Loading audit events"
            @retry="retry"
          >
            <div class="space-y-4">
              <UTable
                v-model:expanded="expanded"
                :data="events"
                :columns="columns"
                :column-pinning="columnPinning"
                :get-row-id="(row: UserAuditEvent) => row.id"
                :loading="fetching"
                sticky="header"
              >
                <template #time-cell="{ row }">
                  <span class="text-sm text-muted"><AppTimestamp :value="row.original.occurred_at" fallback="Unknown time" /></span>
                </template>
                <template #event-cell="{ row }">
                  <div class="flex min-w-0 flex-col items-start gap-1 whitespace-normal">
                    <div class="flex flex-wrap items-center gap-1">
                      <UBadge v-bind="auditEventBadge(row.original)" />
                      <UBadge
                        v-if="auditToneLabel(auditEventTone(row.original))"
                        :color="auditEventTone(row.original)"
                        variant="outline"
                        size="sm"
                        :label="auditToneLabel(auditEventTone(row.original)) ?? undefined"
                      />
                    </div>
                    <span class="text-xs text-muted">{{ auditCategoryLabel(row.original.event_category) }}</span>
                    <!-- Phones: who it was about, under the event. wrap-anywhere lets a long email
                         narrow the column instead of running under the pinned details button. -->
                    <span v-if="row.original.subject_email_snapshot" class="wrap-anywhere text-xs text-muted sm:hidden">
                      About {{ row.original.subject_email_snapshot }}
                    </span>
                    <!-- Below md: who did it (the Actor column is hidden), worded as AppAuditEventCard -->
                    <span class="wrap-anywhere text-xs text-muted md:hidden" data-testid="audit-actor-line">
                      <template v-if="row.original.actor_user_id">
                        By <AppUserLabel :user-id="row.original.actor_user_id" :subject-id="row.original.subject_user_id ?? undefined" />
                      </template>
                      <template v-else>Actor not recorded</template>
                    </span>
                  </div>
                </template>
                <template #subject-cell="{ row }">
                  <div class="min-w-0 whitespace-normal">
                    <ULink
                      v-if="row.original.subject_email_snapshot && subjectPath(row.original)"
                      :to="subjectPath(row.original)"
                      class="wrap-anywhere font-medium text-default hover:underline"
                    >
                      {{ row.original.subject_email_snapshot }}
                    </ULink>
                    <span v-else class="wrap-anywhere text-muted">{{ row.original.subject_email_snapshot ?? '—' }}</span>
                  </div>
                </template>
                <template #actor-cell="{ row }">
                  <div class="min-w-0 whitespace-normal text-sm">
                    <AppUserLabel
                      v-if="row.original.actor_user_id"
                      :user-id="row.original.actor_user_id"
                      :subject-id="row.original.subject_user_id ?? undefined"
                    />
                    <span v-else class="text-muted">Not recorded</span>
                  </div>
                </template>
                <template #entity-cell="{ row }">
                  <span class="whitespace-normal break-words text-sm" :class="auditEntityName(row.original) ? 'text-default' : 'text-muted'">
                    {{ auditEntityName(row.original) ?? (row.original.entity_id ? 'An entity' : '—') }}
                  </span>
                </template>
                <template #details-cell="{ row }">
                  <div class="text-right">
                    <UButton
                      :icon="row.getIsExpanded() ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      :aria-expanded="row.getIsExpanded()"
                      :aria-label="`${row.getIsExpanded() ? 'Hide' : 'Show'} details for ${auditEventLabel(row.original.event_type)}`"
                      @click="row.toggleExpanded()"
                    />
                  </div>
                </template>
                <template #expanded="{ row }">
                  <div class="whitespace-normal py-2">
                    <AppAuditEventDetails :event="row.original" />
                  </div>
                </template>
              </UTable>
              <div class="flex flex-wrap items-center justify-between gap-3">
                <AppListPagination
                  v-model:page="page"
                  :total="total"
                  :page-size="pageSize"
                  noun="event"
                />
                <USelect
                  v-model="pageSizeModel"
                  :items="pageSizeItems"
                  value-key="value"
                  aria-label="Events per page"
                  size="sm"
                  class="w-36"
                />
              </div>
            </div>
          </AppQueryState>
        </div>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>

  <!-- Every filter, labelled: the toolbar's overflow below xl (and on phones all but Category). -->
  <USlideover v-model:open="filtersOpen" title="Filters" description="Narrow the audit log. Changes apply immediately.">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Category">
          <USelect
            id="audit-filter-category"
            v-model="category"
            :items="categoryItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Event type" description="Choose a known event, or type one exactly as recorded.">
          <USelectMenu
            id="audit-filter-event-type"
            v-model="eventType"
            aria-label="Event type"
            :items="eventTypeItems"
            value-key="value"
            :filter-fields="['label', 'description']"
            create-item
            clear
            placeholder="All events"
            :search-input="eventTypeSearchInput"
            class="w-full"
            @create="createEventType"
          />
        </UFormField>
        <UFormField label="About account" description="The account the event is about.">
          <AppUserPicker
            id="audit-filter-subject"
            v-model="subjectUserId"
            placeholder="Anyone"
            aria-label="About account"
          />
        </UFormField>
        <UFormField label="Actor" description="The account that did it.">
          <AppUserPicker
            id="audit-filter-actor"
            v-model="actorUserId"
            placeholder="Anyone"
            aria-label="Actor"
          />
        </UFormField>
        <UFormField v-if="canFilterByEntity" label="Entity">
          <AppEntityPicker
            id="audit-filter-entity"
            v-model="entityId"
            aria-label="Entity"
            :root-id="anchoredRootId"
            include-inactive
            placeholder="Any entity"
          />
        </UFormField>
        <UFormField label="When" :description="rangeLabel ?? 'Any time'">
          <div class="space-y-3">
            <div class="flex flex-wrap gap-1" role="group" aria-label="Date range presets">
              <UButton
                v-for="preset in rangePresets"
                :key="preset.value"
                :label="preset.label"
                :color="rangePreset === preset.value ? 'primary' : 'neutral'"
                :variant="rangePreset === preset.value ? 'subtle' : 'outline'"
                size="sm"
                @click="setRangePreset(preset.value)"
              />
              <UButton
                label="Any time"
                color="neutral"
                variant="outline"
                size="sm"
                @click="clearRange"
              />
            </div>
            <UCalendar
              v-model="calendarRange"
              range
              :max-value="calendarMax"
              aria-label="Choose days"
            />
          </div>
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Clear all"
          color="neutral"
          variant="ghost"
          @click="resetFilters"
        />
        <UButton label="Show results" @click="filtersOpen = false" />
      </div>
    </template>
  </USlideover>

  <USlideover v-model:open="guideOpen" title="Audit guide">
    <template #body>
      <div class="space-y-4 text-sm text-muted">
        <p>
          The audit log is an append-only record of account events: sign-ins and sessions, passwords and API keys,
          invitations, memberships, role assignments, superuser changes, profile and status changes.
        </p>
        <p>
          Changes to role and permission definitions are kept with each role and permission: open
          it and see its History. Changes to service accounts and settings are not recorded.
        </p>
        <ul class="list-disc space-y-1.5 pl-5">
          <li>Narrow the log by category, event type, the account an event is about, the actor who did it and the dates.</li>
          <li v-if="canFilterByEntity">
            The entity filter finds events at one entity, such as membership changes.
          </li>
          <li>Every filter is kept in the address, so a filtered view can be bookmarked or shared.</li>
          <li>Open an event's details for what changed, its context and links to related events.</li>
          <li>Export the filtered events as CSV or JSON (up to 5,000 events per file). Secrets are never shown or exported.</li>
          <li v-if="isEnterprise">
            Admins whose access is limited to an organization see only that organization's events.
          </li>
        </ul>
      </div>
    </template>
  </USlideover>
</template>
