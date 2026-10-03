import { useQuery } from '@pinia/colada'
import { getLocalTimeZone, parseDate, today, type CalendarDate } from '@internationalized/date'
import { auditEventsQuery, exportAuditEvents } from '~/queries/audit'
import { keepPreviousData } from '~/composables/useListQueryState'
import {
  AUDIT_DEFAULT_PAGE_SIZE,
  AUDIT_EXPORT_MAX_EVENTS,
  AUDIT_PAGE_SIZES,
  AUDIT_RANGE_PRESETS,
  AUDIT_RANGE_VALUES,
  auditCategoriesFor,
  auditCategoryLabel,
  auditEventLabel,
  auditEventsToCsv,
  auditEventsToJson,
  auditEventTypeItems,
  auditExportFileName,
  auditRangeLabel,
  invalidAuditIdFilters
} from '~/utils/audit'
import { isDateInput } from '~/utils/validity'
import type { AuditEventsResponse, AuditFilters } from '~/types/audit'

// The Audit workspace (F-090/F-091/F-092/F-190/F-191). Filters, page and page size live in the
// route query (useListQueryState): every view is a shareable, reloadable, Back-able address, and
// the pivots on an event (links to /app/audit?actorUserId=…) land here as plain navigation.
// Gated by the Audit section requirement (audit router + activity_tracking + user:read), the same
// one the nav item, route guard and page gate use.

const ALL = 'all'
type IdFilter = 'subjectUserId' | 'actorUserId' | 'entityId'
const ID_FILTER_LABEL: Record<IdFilter, string> = { subjectUserId: 'About', actorUserId: 'Actor', entityId: 'Entity' }

export type AuditActiveFilter = { key: string, label: string, value: string, clear: () => void }

export function useAuditWorkspace() {
  const { canAccess, isEnterprise, user } = useAuth()
  const { isGlobal } = useActorReach()
  const { anchoredRootId } = useEntityScope()
  const { run } = useApiAction()
  const toast = useToast()

  const canRead = computed(() => canAccess('audit'))
  // The entity filter needs entities to pick from: EnterpriseRBAC and an actor who can read them
  // (a global admin with user:read but no entity:read reads the log without it).
  const canFilterByEntity = computed(() => isEnterprise.value && canAccess('entities'))

  const list = useListQueryState({
    filters: {
      category: '',
      eventType: '',
      subjectUserId: '',
      actorUserId: '',
      entityId: '',
      range: '',
      occurredFrom: '',
      occurredTo: '',
      limit: AUDIT_DEFAULT_PAGE_SIZE as number
    },
    allowed: { range: AUDIT_RANGE_VALUES, limit: [...AUDIT_PAGE_SIZES] },
    searchParam: null,
    pageSize: AUDIT_DEFAULT_PAGE_SIZE
  })
  const f = list.filters

  // What the request uses: the entity filter only where entities exist and are readable (F-008).
  const filters = computed<AuditFilters>(() => ({
    category: f.category.value,
    eventType: f.eventType.value,
    subjectUserId: f.subjectUserId.value,
    actorUserId: f.actorUserId.value,
    entityId: canFilterByEntity.value ? f.entityId.value : '',
    range: f.range.value,
    occurredFrom: f.occurredFrom.value,
    occurredTo: f.occurredTo.value
  }))
  const pageSize = computed(() => f.limit.value)

  const { data, status, error, asyncStatus, refetch } = useQuery(() => ({
    ...auditEventsQuery({ page: list.page.value, limit: pageSize.value, filters: filters.value }),
    placeholderData: keepPreviousData<AuditEventsResponse>,
    enabled: canRead.value
  }))
  list.syncTotal(() => data.value?.total)
  const events = computed(() => data.value?.items ?? [])
  const total = computed(() => data.value?.total ?? 0)
  const fetching = computed(() => asyncStatus.value === 'loading')

  // --- Filter controls (v-model) ---
  // Entity and settings events exist only where entities do (EnterpriseRBAC), and settings events
  // only for admins who see every organization (offered once that is known).
  const reach = computed(() => ({ hierarchy: isEnterprise.value, global: isGlobal.value === true }))
  const categoryItems = computed(() => [{ label: 'All categories', value: ALL }, ...auditCategoriesFor(reach.value)])
  const category = computed({
    get: () => f.category.value || ALL,
    set: (value: string) => {
      f.category.value = value === ALL ? '' : value
      // A type from another category would match nothing.
      const type = f.eventType.value
      const known = auditEventTypeItems().find(t => t.value === type)
      if (known && f.category.value && known.category !== f.category.value) f.eventType.value = ''
    }
  })

  const eventTypeItems = computed(() => {
    const items = auditEventTypeItems(f.category.value || null, reach.value).map(t => ({ label: t.label, value: t.value, description: t.value }))
    // A type typed in (or from a link) that the console does not know stays selectable.
    const current = f.eventType.value
    if (current && !items.some(i => i.value === current)) items.unshift({ label: auditEventLabel(current), value: current, description: current })
    return items
  })
  const eventType = computed({
    get: () => f.eventType.value || undefined,
    set: (value: string | undefined) => { f.eventType.value = value?.trim() ?? '' }
  })
  function createEventType(value: string) {
    f.eventType.value = value.trim()
  }

  const idModel = (key: IdFilter) => computed({
    get: () => f[key].value || undefined,
    set: (value: string | undefined) => { f[key].value = value ?? '' }
  })
  const subjectUserId = idModel('subjectUserId')
  const actorUserId = idModel('actorUserId')
  const entityId = idModel('entityId')

  // --- Date range ---
  const rangeLabel = computed(() => auditRangeLabel(filters.value))
  const rangePresets = AUDIT_RANGE_PRESETS.map(preset => ({ value: preset.value, label: preset.label }))
  // The calendar's value: the custom days (YYYY-MM-DD) as CalendarDates.
  const calendarRange = computed({
    get: () => {
      const from = f.occurredFrom.value
      const to = f.occurredTo.value
      return {
        start: isDateInput(from) ? parseDate(from) : undefined,
        end: isDateInput(to) ? parseDate(to) : undefined
      }
    },
    set: (value: { start?: CalendarDate | null, end?: CalendarDate | null } | null) => {
      if (!value?.start || !value?.end) return
      f.range.value = ''
      f.occurredFrom.value = value.start.toString()
      f.occurredTo.value = value.end.toString()
    }
  })
  // The last day a range can end on: today in the admin's time zone (no events in the future).
  const calendarMax = today(getLocalTimeZone())
  function setRangePreset(value: string) {
    f.occurredFrom.value = ''
    f.occurredTo.value = ''
    f.range.value = value
  }
  function clearRange() {
    f.range.value = ''
    f.occurredFrom.value = ''
    f.occurredTo.value = ''
  }

  // --- Active filters (removable) ---
  const subjectLabel = useUserLabel(computed(() => f.subjectUserId.value), ref(undefined)).label
  const actorLabel = useUserLabel(computed(() => f.actorUserId.value), ref(undefined)).label
  const invalidIds = computed(() => invalidAuditIdFilters(filters.value))
  const { name: entityName } = useEntityPathLabel(() => (canFilterByEntity.value && !invalidIds.value.includes('entityId') ? f.entityId.value : null))

  const clearer = (key: 'category' | 'eventType' | IdFilter) => () => {
    f[key].value = ''
  }
  const activeFilters = computed<AuditActiveFilter[]>(() => {
    const out: AuditActiveFilter[] = []
    if (f.category.value) out.push({ key: 'category', label: 'Category', value: auditCategoryLabel(f.category.value), clear: clearer('category') })
    if (f.eventType.value) out.push({ key: 'eventType', label: 'Event', value: auditEventLabel(f.eventType.value), clear: clearer('eventType') })
    const idValue = (key: IdFilter, name: string | null) => (invalidIds.value.includes(key) ? 'invalid ID, ignored' : name ?? 'Unknown')
    if (f.subjectUserId.value) out.push({ key: 'subjectUserId', label: ID_FILTER_LABEL.subjectUserId, value: idValue('subjectUserId', subjectLabel.value), clear: clearer('subjectUserId') })
    if (f.actorUserId.value) out.push({ key: 'actorUserId', label: ID_FILTER_LABEL.actorUserId, value: idValue('actorUserId', actorLabel.value), clear: clearer('actorUserId') })
    if (canFilterByEntity.value && f.entityId.value) out.push({ key: 'entityId', label: ID_FILTER_LABEL.entityId, value: idValue('entityId', entityName.value ?? 'Selected entity'), clear: clearer('entityId') })
    if (rangeLabel.value) out.push({ key: 'range', label: 'When', value: rangeLabel.value, clear: clearRange })
    return out
  })
  // Filters behind the "Filters" button on phones (everything but the category).
  const moreFilterCount = computed(() => activeFilters.value.filter(filter => filter.key !== 'category').length)
  const isFiltered = computed(() => activeFilters.value.length > 0)
  function resetFilters() {
    for (const key of ['category', 'eventType', 'subjectUserId', 'actorUserId', 'entityId', 'range', 'occurredFrom', 'occurredTo'] as const) f[key].value = ''
  }

  // --- Coverage and scope (F-092) ---
  // outlabs-auth limits a non-global admin's search to events in their organization (root entity).
  const scopeNotice = computed(() => {
    if (!isEnterprise.value || isGlobal.value !== false) return null
    const org = user.value?.root_entity_name
    return {
      title: 'Showing events for your organization only',
      description: `Events recorded outside ${org ?? 'your organization'} are not listed. Superusers and system-wide admins see every organization.`
    }
  })

  // What the log holds: account events everywhere; entity lifecycle and entity-type settings
  // where entities exist (outlabs-auth 0.1.0a35, F-241).
  const coverage = computed(() => (isEnterprise.value
    ? 'Account, credential, membership, role-assignment, entity and settings events'
    : 'Account, credential, membership and role-assignment events'))
  const emptyState = computed(() => (isFiltered.value
    ? { title: 'No events match these filters', description: 'Remove a filter or widen the date range.', actions: [{ label: 'Clear filters', color: 'neutral' as const, variant: 'outline' as const, onClick: resetFilters }] }
    : { title: 'No audit events yet', description: `${coverage.value} appear here as they are recorded.`, actions: undefined }))

  // --- Export (F-190) ---
  const exporting = ref(false)
  const exportProgress = ref<{ loaded: number, total: number } | null>(null)
  let exportController: AbortController | null = null

  async function exportEvents(format: 'csv' | 'json') {
    if (exporting.value) return
    exporting.value = true
    exportProgress.value = null
    exportController = new AbortController()
    const applied = { ...filters.value }
    const res = await run(() => exportAuditEvents(applied, {
      maxEvents: AUDIT_EXPORT_MAX_EVENTS,
      signal: exportController?.signal,
      onProgress: (progress) => { exportProgress.value = progress }
    }), { error: err => (err instanceof DOMException && err.name === 'AbortError' ? null : 'Could not export audit events') })
    exporting.value = false
    exportProgress.value = null
    exportController = null
    if (!res.ok) return
    const { events: rows, total: matched, complete } = res.data
    const now = new Date()
    const appliedQuery = Object.fromEntries(Object.entries(applied).filter(([, value]) => value))
    const content = format === 'csv'
      ? auditEventsToCsv(rows)
      : auditEventsToJson(rows, { exportedAt: now.toISOString(), filters: appliedQuery, total: matched, complete })
    downloadFile(auditExportFileName(format, now), content, format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json')
    toast.add({
      title: 'Audit events exported',
      description: complete
        ? `${rows.length.toLocaleString()} ${rows.length === 1 ? 'event' : 'events'}, secrets redacted.`
        : `The first ${rows.length.toLocaleString()} of ${matched.toLocaleString()} events (the export limit), secrets redacted. Narrow the filters for the rest.`,
      color: complete ? 'success' : 'warning'
    })
  }
  function cancelExport() {
    exportController?.abort()
  }
  const exportItems = computed(() => [[
    { label: 'Export as CSV', icon: 'i-lucide-file-spreadsheet', onSelect: () => { void exportEvents('csv') } },
    { label: 'Export as JSON', icon: 'i-lucide-file-json', onSelect: () => { void exportEvents('json') } }
  ]])

  const guideOpen = ref(false)
  const filtersOpen = ref(false)

  return {
    canRead,
    isEnterprise,
    canFilterByEntity,
    anchoredRootId,
    page: list.page,
    pageSize,
    pageSizeModel: f.limit,
    pageSizeItems: AUDIT_PAGE_SIZES.map(size => ({ label: `${size} per page`, value: size as number })),
    eventTypeSearchInput: { 'placeholder': 'Search or type an event type...', 'aria-label': 'Search event types' },
    events,
    total,
    status,
    error,
    fetching,
    retry: () => { void refetch() },
    categoryItems,
    category,
    eventTypeItems,
    eventType,
    createEventType,
    subjectUserId,
    actorUserId,
    entityId,
    rangeLabel,
    rangePresets,
    rangePreset: computed(() => f.range.value),
    calendarRange,
    calendarMax,
    setRangePreset,
    clearRange,
    activeFilters,
    moreFilterCount,
    isFiltered,
    invalidIds,
    resetFilters,
    scopeNotice,
    coverage,
    emptyState,
    exporting,
    exportProgress,
    exportItems,
    cancelExport,
    guideOpen,
    filtersOpen
  }
}

// Hand a generated file to the browser's download.
function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
