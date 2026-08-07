import { useQuery } from '@pinia/colada'
import { auditEventsQuery } from '~/queries/audit'
import { auditFiltersFromQuery, auditFiltersToQuery, emptyAuditFilters, type AuditFilters } from '~/types/audit'
import { getApiErrorMessage } from '~/api/client'

// Feature logic for the audit workspace. Filters live in the route query so the view is
// deep-linkable; page is local state and resets whenever the applied filters change. Gated by
// user:read (superusers pass); the activity_tracking capability guards the nav/route upstream.

const LIMIT = 20

export function useAuditWorkspace() {
  const route = useRoute()
  const router = useRouter()
  const { hasPermission } = useAuth()

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
  const errorMessage = computed(() => getApiErrorMessage(error.value))

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

  return {
    draft,
    status,
    errorMessage,
    events,
    total,
    currentPage,
    pages,
    applyFilters,
    resetFilters,
    filterBy,
    prevPage,
    nextPage,
    guideOpen
  }
}
