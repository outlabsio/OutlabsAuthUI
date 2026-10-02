import type { Ref } from 'vue'
import { useQuery } from '@pinia/colada'
import type { TimelineItem } from '@nuxt/ui'
import { USER_HISTORY_PAGE_SIZE, userMembershipHistoryQuery } from '~/queries/users'
import { membershipHistoryChanges, type MembershipHistoryChanges } from '~/utils/users'
import type { User, UserMembershipHistoryEvent } from '~/types/user'

// The History tab's Membership history card (AppUserMembershipHistoryCard, EnterpriseRBAC): the
// retained lifecycle of the account's entity memberships as a timeline, with who made each
// change and what changed — roles added and removed, status and validity (F-172).

const EVENT_ICON: Record<string, string> = {
  created: 'i-lucide-user-plus',
  updated: 'i-lucide-pencil',
  suspended: 'i-lucide-pause',
  reactivated: 'i-lucide-user-check',
  revoked: 'i-lucide-user-minus',
  entity_archived: 'i-lucide-archive'
}

export type MembershipHistoryItem = TimelineItem & {
  value: string
  event: UserMembershipHistoryEvent
  entityName: string
  changes: MembershipHistoryChanges
}

export function useUserMembershipHistoryCard(user: Ref<User>) {
  const { canAccess, isEnterprise } = useAuth()
  const userId = computed(() => user.value.id)
  const page = ref(1)

  // The first page is the entry the Access tab reads for role names (same key and `enabled`).
  const { data, status, error, isLoading, refetch } = useQuery(() => ({
    ...userMembershipHistoryQuery({ userId: userId.value, page: page.value, limit: USER_HISTORY_PAGE_SIZE }),
    enabled: canAccess('users') && isEnterprise.value
  }))
  const total = computed(() => data.value?.total ?? 0)
  const hasData = computed(() => data.value !== undefined)

  const items = computed<MembershipHistoryItem[]>(() => (data.value?.items ?? []).map(event => ({
    value: event.id,
    icon: EVENT_ICON[event.event_type] ?? 'i-lucide-history',
    event,
    entityName: event.entity_display_name ?? event.entity_path.at(-1) ?? event.entity_id,
    changes: membershipHistoryChanges(event)
  })))

  return { page, pageSize: USER_HISTORY_PAGE_SIZE, items, total, status, error, isLoading, hasData, refetch }
}
