import type { Ref } from 'vue'
import type { ButtonProps, DropdownMenuItem } from '@nuxt/ui'
import { useQuery } from '@pinia/colada'
import { entityKeyInventoryQuery, useRevokeInventoryKey } from '~/queries/api-keys'
import type { ApiKey, ApiKeyKind } from '~/types/api-key'
import type { PaginatedResponse } from '~/types/auth'
import {
  apiKeyActionStates,
  apiKeyMenuItems,
  KEY_INVENTORY_STATUS_ITEMS,
  KEY_INVENTORY_STATUSES,
  keyInventoryEmptyCopy,
  type KeyInventoryStatus
} from '~/utils/api-keys'

// The key inventory of one entity (F-081): every key anchored exactly at it — personal keys and
// service-account keys; child entities' keys are not included — for inventory and incident
// response. Search, kind and status are server filters kept in the route query (kq, kind,
// kstatus, kpage), with the true total and pages. The status filter is the STORED status, so the
// default "Active (includes expired)" lists keys past their expiry too, each with its effective
// badge, and there is no Expired choice (KEY_INVENTORY_STATUS_ITEMS in utils/api-keys.ts says
// why). A key's name opens its detail (AppApiKeyDetail, owner named by AppApiKeyOwner in the
// page). Revoke (a live key, api_key:delete at the entity) is confirmed. Served by the
// api_key_admin router (EnterpriseRBAC).

export type InventoryKindFilter = 'all' | ApiKeyKind
export type InventoryStatusFilter = KeyInventoryStatus

const KINDS = ['all', 'personal', 'system_integration'] as const satisfies readonly InventoryKindFilter[]

export function useKeyInventory(entityId: Ref<string | null>, enabled: Ref<boolean>) {
  const { canDelete } = useServiceAccountGrants()
  const list = useListQueryState({
    filters: { kind: 'all' as InventoryKindFilter, kstatus: 'active' as InventoryStatusFilter },
    allowed: { kind: KINDS, kstatus: KEY_INVENTORY_STATUSES },
    searchParam: 'kq',
    pageParam: 'kpage',
    pageSize: 25
  })
  const { search, searchTerm, page, pageSize, filters: { kind, kstatus }, isFiltered } = list

  const query = useQuery(() => ({
    ...entityKeyInventoryQuery({
      entityId: entityId.value ?? '',
      filters: {
        page: page.value,
        limit: pageSize.value,
        search: searchTerm.value || undefined,
        status: kstatus.value === 'all' ? undefined : kstatus.value,
        keyKind: kind.value === 'all' ? undefined : kind.value
      }
    }),
    placeholderData: keepPreviousData<PaginatedResponse<ApiKey>>,
    enabled: enabled.value && Boolean(entityId.value)
  }))
  const rows = computed<ApiKey[]>(() => query.data.value?.items ?? [])
  const total = computed(() => query.data.value?.total ?? 0)
  list.syncTotal(() => query.data.value?.total)

  const kindItems: { label: string, value: InventoryKindFilter }[] = [
    { label: 'All kinds', value: 'all' },
    { label: 'Personal', value: 'personal' },
    { label: 'Service account', value: 'system_integration' }
  ]
  const statusItems = KEY_INVENTORY_STATUS_ITEMS

  // --- Revoke (incident response) ---
  const revokeKey = useRevokeInventoryKey()
  const revoke = useConfirmAction<ApiKey>({
    describe: key => ({
      title: `Revoke key ${key.name}`,
      effects: [
        ...API_KEY_REVOKE_EFFECTS,
        key.key_kind === 'personal'
          ? 'It is a personal key: its owner keeps their account and their other keys.'
          : 'Its service account keeps its other keys.'
      ],
      confirmLabel: 'Revoke key'
    }),
    action: key => revokeKey.mutateAsync({ entityId: entityId.value ?? '', keyId: key.id }),
    success: 'Key revoked',
    error: 'Could not revoke key'
  })

  // --- Detail (AppApiKeyDetail) and the row menu: Revoke on a live key (not revoked or expired) ---
  const now = useRelativeNow()
  const detailId = ref<string | null>(null)
  const detailOpen = ref(false)
  const detailKey = computed(() => rows.value.find(key => key.id === detailId.value) ?? null)
  function openDetail(key: ApiKey) {
    detailId.value = key.id
    detailOpen.value = true
  }
  const actionStates = (key: ApiKey) => apiKeyActionStates(key, { canUpdate: false, canDelete: canDelete.value }, now.value.getTime())
  function rowMenu(key: ApiKey): DropdownMenuItem[] {
    return apiKeyMenuItems(actionStates(key), { view: () => openDetail(key), revoke: () => revoke.ask(key) })
  }
  function onDetailAction() {
    const key = detailKey.value
    detailOpen.value = false
    if (key) revoke.ask(key)
  }

  // Show all statuses keeps the search and the kind: only the status widens.
  const emptyState = computed(() => {
    const copy = keyInventoryEmptyCopy({ filtered: isFiltered.value, status: kstatus.value })
    const actions: ButtonProps[] = [
      ...(copy.showAllStatuses ? [{ label: 'Show all statuses', icon: 'i-lucide-list', color: 'neutral', variant: 'outline', onClick: () => { kstatus.value = 'all' } } satisfies ButtonProps] : []),
      ...(copy.clearFilters ? [{ label: 'Clear filters', icon: 'i-lucide-x', color: 'neutral', variant: 'outline', onClick: list.reset } satisfies ButtonProps] : [])
    ]
    return { title: copy.title, description: copy.description, actions }
  })

  return {
    search,
    kind,
    kindItems,
    kstatus,
    statusItems,
    rows,
    total,
    page,
    pageSize,
    status: query.status,
    error: query.error,
    fetching: computed(() => query.asyncStatus.value === 'loading'),
    retry: () => void query.refetch(),
    rowMenu,
    revoke,
    detailOpen,
    detailKey,
    detailActions: computed(() => (detailKey.value ? actionStates(detailKey.value) : [])),
    openDetail,
    onDetailAction,
    emptyState
  }
}
