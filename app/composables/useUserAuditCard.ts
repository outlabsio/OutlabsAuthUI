import type { Ref } from 'vue'
import { useQuery } from '@pinia/colada'
import { USER_HISTORY_PAGE_SIZE, userAuditEventsQuery } from '~/queries/users'
import { AUDIT_ACCOUNT_CATEGORIES } from '~/utils/audit'
import type { UserAuditEvent } from '~/types/audit'
import type { User } from '~/types/user'

// The History tab's Audit timeline card (AppUserAuditCard), where the server tracks activity:
// the account's retained audit events, newest first, narrowed by category (F-192). The Audit
// workspace takes the search further, for events about this account or actions it took.

const ALL = 'all'

export function useUserAuditCard(user: Ref<User>) {
  const { canAccess } = useAuth()
  const userId = computed(() => user.value.id)
  const canRead = computed(() => canAccess('users'))
  const canOpenAudit = computed(() => canAccess('audit'))

  const category = ref(ALL)
  const page = ref(1)
  watch(category, () => {
    page.value = 1
  })
  const categoryItems = [{ label: 'All categories', value: ALL }, ...AUDIT_ACCOUNT_CATEGORIES]

  const { data, status, error, isLoading, refetch } = useQuery(() => ({
    ...userAuditEventsQuery({
      userId: userId.value,
      page: page.value,
      limit: USER_HISTORY_PAGE_SIZE,
      category: category.value === ALL ? undefined : category.value
    }),
    enabled: canRead.value
  }))
  const events = computed<UserAuditEvent[]>(() => data.value?.items ?? [])
  const total = computed(() => data.value?.total ?? 0)
  const hasData = computed(() => data.value !== undefined)
  const filtered = computed(() => category.value !== ALL)

  const auditLinks = computed(() => [[
    { label: 'Events about this user', icon: 'i-lucide-user-search', to: { path: '/app/audit', query: { subjectUserId: userId.value } } },
    { label: 'Actions by this user', icon: 'i-lucide-mouse-pointer-click', to: { path: '/app/audit', query: { actorUserId: userId.value } } }
  ]])

  return {
    category,
    categoryItems,
    filtered,
    clearCategory: () => {
      category.value = ALL
    },
    page,
    pageSize: USER_HISTORY_PAGE_SIZE,
    events,
    total,
    status,
    error,
    isLoading,
    hasData,
    refetch,
    canOpenAudit,
    auditLinks
  }
}
