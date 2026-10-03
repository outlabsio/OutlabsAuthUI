import type { MaybeRefOrGetter } from 'vue'
import type { TimelineItem } from '@nuxt/ui'
import { useQuery } from '@pinia/colada'
import { permissionHistoryQuery } from '~/queries/permissions'
import { roleHistoryQuery } from '~/queries/roles'
import type { DefinitionHistoryEvent, DefinitionKind } from '~/types/definition-history'
import { definitionHistoryView, type DefinitionHistoryView } from '~/utils/definition-history'
import { isUuid } from '~/utils/users'

// The History card of a role or permission detail page (AppDefinitionHistoryCard, F-092): the
// definition's append-only change history from outlabs-auth 0.1.0a35, newest first, a page of 10
// at a time, each event with who made it (or "the system"), where it came from and what it
// changed (utils/definition-history.ts). Read with the same requirement as the page itself (the
// Roles or Permissions section); the card is mounted only once the record has loaded, so a
// missing or unreadable definition never fires it. Archived definitions answer 404 for their
// history as for themselves, so it cannot be shown after an archive.

export const DEFINITION_HISTORY_PAGE_SIZE = 10

export type DefinitionHistoryItem = TimelineItem & {
  value: string
  event: DefinitionHistoryEvent
  view: DefinitionHistoryView
}

const COPY: Record<DefinitionKind, { noun: string, section: 'roles' | 'permissions' }> = {
  role: { noun: 'role', section: 'roles' },
  permission: { noun: 'permission', section: 'permissions' }
}

export function useDefinitionHistory(kind: DefinitionKind, definitionId: MaybeRefOrGetter<string>) {
  const { canAccess } = useAuth()
  const page = ref(1)
  const id = computed(() => toValue(definitionId))
  watch(id, () => {
    page.value = 1
  })

  const enabled = computed(() => canAccess(COPY[kind].section) && isUuid(id.value))
  const { data, status, error, isLoading, refetch } = useQuery(() => {
    const params = { page: page.value, limit: DEFINITION_HISTORY_PAGE_SIZE }
    const options = kind === 'role'
      ? roleHistoryQuery({ roleId: id.value, ...params })
      : permissionHistoryQuery({ permissionId: id.value, ...params })
    return { ...options, enabled: enabled.value }
  })
  const total = computed(() => data.value?.total ?? 0)
  const hasData = computed(() => data.value !== undefined)
  const items = computed<DefinitionHistoryItem[]>(() => (data.value?.items ?? []).map((event) => {
    const view = definitionHistoryView(event)
    return { value: event.id, icon: view.icon, event, view }
  }))

  return {
    enabled,
    page,
    pageSize: DEFINITION_HISTORY_PAGE_SIZE,
    items,
    total,
    status,
    error,
    isLoading,
    hasData,
    refetch,
    emptyDescription: `Changes to this ${COPY[kind].noun}'s definition appear here.`
  }
}
