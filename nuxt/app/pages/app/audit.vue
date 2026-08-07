<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { auditEventsQuery } from '~/queries/audit'
import { auditFiltersFromQuery, auditFiltersToQuery, emptyAuditFilters, type AuditFilters } from '~/types/audit'
import { getApiErrorMessage } from '~/api/client'

// Audit workspace (parity with the React audit feature). Two-layer gate: the activity_tracking
// CAPABILITY guards the nav + route (middleware redirects when off), and the user:read
// PERMISSION guards the body + query (superusers pass). Filters live in the route query so the
// view is deep-linkable; page is local state and resets whenever the applied filters change.
const route = useRoute()
const router = useRouter()
const { hasPermission } = useAuth()

const LIMIT = 20

const appliedFilters = computed<AuditFilters>(() => auditFiltersFromQuery(route.query))
const draft = reactive<AuditFilters>({ ...appliedFilters.value })
const page = ref(1)

// Re-sync the draft + reset pagination whenever the applied (URL) filters change — one path
// for deep-links, Apply, Reset, and click-to-filter, all of which push the route query.
watch(appliedFilters, (next) => {
  Object.assign(draft, next)
  page.value = 1
}, { deep: true })

const { data, status, error } = useQuery(() => ({
  ...auditEventsQuery({ page: page.value, limit: LIMIT, filters: appliedFilters.value }),
  enabled: hasPermission('user:read')
}))

const events = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const currentPage = computed(() => data.value?.page ?? page.value)
const pages = computed(() => data.value?.pages ?? 0)

function applyFilters() {
  page.value = 1
  void router.push({ query: auditFiltersToQuery(draft) })
}
function resetFilters() {
  Object.assign(draft, emptyAuditFilters)
  page.value = 1
  void router.push({ query: {} })
}
function filterBy(key: 'actorUserId' | 'subjectUserId' | 'entityId', value: string) {
  // Pivot the whole view onto one id (matches the React card's replace-search behavior).
  void router.push({ query: { [key]: value } })
}
function prevPage() {
  page.value = Math.max(1, currentPage.value - 1)
}
function nextPage() {
  if (pages.value > 0 && currentPage.value < pages.value) page.value = currentPage.value + 1
}

const guideOpen = ref(false)
</script>

<template>
  <UDashboardPanel id="audit">
    <template #header>
      <UDashboardNavbar title="Audit">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-book-open"
            color="neutral"
            variant="outline"
            label="Open Audit guide"
            @click="guideOpen = true"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <AppPermissionGate permission="user:read">
        <div class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="text-sm text-muted">
              <span class="font-medium text-default">{{ total }}</span> events
              <template v-if="pages > 0">
                &middot; Page <span class="font-medium text-default">{{ currentPage }}</span> of {{ pages }}
              </template>
            </div>
            <div class="flex items-center gap-2">
              <UButton
                label="Previous"
                color="neutral"
                variant="outline"
                size="sm"
                :disabled="status === 'pending' || currentPage <= 1"
                @click="prevPage"
              />
              <UButton
                label="Next"
                color="neutral"
                variant="outline"
                size="sm"
                :disabled="status === 'pending' || pages === 0 || currentPage >= pages"
                @click="nextPage"
              />
            </div>
          </div>

          <form class="grid gap-3 md:grid-cols-2 xl:grid-cols-4" @submit.prevent="applyFilters">
            <div class="space-y-1.5">
              <label for="audit-category" class="block text-sm font-medium text-default">Category</label>
              <UInput
                id="audit-category"
                v-model="draft.category"
                placeholder="e.g. auth"
                class="w-full"
              />
            </div>
            <div class="space-y-1.5">
              <label for="audit-event-type" class="block text-sm font-medium text-default">Event type</label>
              <UInput
                id="audit-event-type"
                v-model="draft.eventType"
                placeholder="e.g. user.login"
                class="w-full"
              />
            </div>
            <div class="space-y-1.5">
              <label for="audit-subject-user-id" class="block text-sm font-medium text-default">Subject user ID</label>
              <UInput
                id="audit-subject-user-id"
                v-model="draft.subjectUserId"
                placeholder="Optional UUID"
                class="w-full"
              />
            </div>
            <div class="space-y-1.5">
              <label for="audit-actor-user-id" class="block text-sm font-medium text-default">Actor user ID</label>
              <UInput
                id="audit-actor-user-id"
                v-model="draft.actorUserId"
                placeholder="Optional UUID"
                class="w-full"
              />
            </div>
            <div class="space-y-1.5">
              <label for="audit-entity-id" class="block text-sm font-medium text-default">Entity ID</label>
              <UInput
                id="audit-entity-id"
                v-model="draft.entityId"
                placeholder="Optional UUID"
                class="w-full"
              />
            </div>
            <div class="space-y-1.5">
              <label for="audit-occurred-from" class="block text-sm font-medium text-default">Occurred from</label>
              <UInput
                id="audit-occurred-from"
                v-model="draft.occurredFrom"
                type="datetime-local"
                class="w-full"
              />
            </div>
            <div class="space-y-1.5">
              <label for="audit-occurred-to" class="block text-sm font-medium text-default">Occurred to</label>
              <UInput
                id="audit-occurred-to"
                v-model="draft.occurredTo"
                type="datetime-local"
                class="w-full"
              />
            </div>
            <div class="flex items-end gap-2">
              <UButton type="submit" label="Apply filters" class="flex-1 justify-center" />
              <UButton
                type="button"
                label="Reset"
                color="neutral"
                variant="outline"
                @click="resetFilters"
              />
            </div>
          </form>

          <UAlert
            v-if="status === 'error'"
            color="error"
            icon="i-lucide-triangle-alert"
            title="Could not load audit events"
            :description="getApiErrorMessage(error)"
          />
          <div v-else-if="status === 'pending'" class="py-16 text-center text-sm text-muted">
            Loading audit events...
          </div>
          <div v-else-if="events.length" class="space-y-3">
            <AppAuditEventCard
              v-for="event in events"
              :key="event.id"
              :event="event"
              @filter="filterBy"
            />
          </div>
          <div v-else class="flex flex-col items-center justify-center gap-1 py-16 text-center">
            <h2 class="text-base font-medium text-default">
              No audit events
            </h2>
            <p class="text-sm text-muted">
              No events match the current filters.
            </p>
          </div>
        </div>
      </AppPermissionGate>
    </template>
  </UDashboardPanel>

  <USlideover v-model:open="guideOpen" title="Audit guide">
    <template #body>
      <div class="space-y-4 text-sm text-muted">
        <p>The audit log is an append-only record of recorded actions across the backend.</p>
        <ul class="list-disc space-y-1.5 pl-5">
          <li>Filter by <span class="text-default">category</span> or <span class="text-default">event type</span> to narrow to a kind of action.</li>
          <li>Paste a <span class="text-default">subject</span>, <span class="text-default">actor</span>, or <span class="text-default">entity</span> UUID to trace a single identity.</li>
          <li>Bound a window with <span class="text-default">occurred from / to</span>, then Apply.</li>
          <li>Click any id on an event to pivot the whole view onto it.</li>
          <li>Expand an event to inspect its before / after / metadata payloads.</li>
        </ul>
      </div>
    </template>
  </USlideover>
</template>
