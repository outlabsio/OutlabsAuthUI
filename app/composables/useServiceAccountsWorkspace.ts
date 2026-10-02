import type { ButtonProps, NavigationMenuItem } from '@nuxt/ui'
import { useQuery } from '@pinia/colada'
import { principalsQuery } from '~/queries/api-keys'
import type { IntegrationPrincipal, IntegrationPrincipalsListResponse, IntegrationPrincipalStatus } from '~/types/api-key'
import { resolveServiceAccountScope, serviceAccountPath, SERVICE_ACCOUNT_STATUSES, type ServiceAccountScopeFilter } from '~/utils/service-accounts'
import { entityPickBlocked } from '~/utils/entity-scope'

// The Service accounts list (F-025, F-026, F-081, F-085, F-129, F-185, F-219).
// - Scope: SimpleRBAC has platform-wide accounts only. On EnterpriseRBAC superusers choose
//   Platform-wide or an entity; anyone else works at entity scope (the platform routes are
//   superuser-only), starting at their own organization: inside it only for a delegated admin
//   (AppEntityPicker anchors itself), at any entity for a system-wide admin (useEntityScope).
//   Scope, entity and view live in the route query (?scope=entity&entity=<id>&view=…, replaced,
//   not pushed), so a reload, Back from an account and the entity page's Manage link land on the
//   same view.
// - Accounts: one server page at a time (search on name or description, status filter, active by
//   default) with the true total; rows open the account.
// - Key inventory (entity scope, api_key_admin router): useKeyInventory.
// Row and navbar actions: useServiceAccountActions.

export type ServiceAccountView = 'accounts' | 'inventory'
export type ServiceAccountStatusFilter = IntegrationPrincipalStatus | 'all'

const PAGE_SIZE = 25

export function useServiceAccountsWorkspace() {
  const route = useRoute()
  const router = useRouter()
  const { isEnterprise, isSuperuser, hasSurface, user } = useAuth()
  const { anchoredRootId } = useEntityScope()
  const { isGlobal } = useActorReach()
  const actions = useServiceAccountActions()
  const { canRead, canCreate } = actions

  // --- Scope (route query, replaced) ---
  const ownPath = route.path
  const queryText = (key: string) => (typeof route.query[key] === 'string' ? route.query[key] as string : '')
  function replaceQuery(patch: Record<string, string | undefined>) {
    if (route.path !== ownPath) return
    const changed = new Set(Object.keys(patch))
    // A new scope starts both lists on their first page.
    const kept = Object.entries(route.query).filter(([key]) => !changed.has(key) && key !== 'page' && key !== 'kpage')
    const set = Object.entries(patch).filter(([, value]) => value !== undefined && value !== '')
    void router.replace({ query: Object.fromEntries([...kept, ...set]) })
  }

  const platformAllowed = computed(() => !isEnterprise.value || isSuperuser.value)
  const resolved = computed(() => resolveServiceAccountScope({
    enterprise: isEnterprise.value,
    platformAllowed: platformAllowed.value,
    filter: queryText('scope') === 'entity' ? 'entity' : 'platform',
    entity: queryText('entity'),
    // An admin inside an organisation starts at it (a system-wide one may choose any other).
    defaultEntityId: anchoredRootId.value ?? (isSuperuser.value ? null : user.value?.root_entity_id ?? null)
  }))
  const scope = computed(() => resolved.value.scope)
  const scopeKind = computed<ServiceAccountScopeFilter>({
    get: () => (resolved.value.kind === 'platform_global' ? 'platform' : 'entity'),
    set: value => replaceQuery({ scope: value === 'entity' ? 'entity' : undefined, ...(value === 'platform' ? { view: undefined } : {}) })
  })
  const entityId = computed<string | undefined>({
    get: () => (resolved.value.scope?.kind === 'entity' ? resolved.value.scope.entityId : undefined),
    set: value => replaceQuery({ scope: 'entity', entity: value })
  })
  const scopeItems = computed(() => [
    { label: 'Platform-wide', value: 'platform' as const },
    { label: 'Entity', value: 'entity' as const }
  ])
  // Superusers and system-wide admins search every entity; anyone else is anchored on their
  // organization, and without one (and no global reach) cannot choose an entity, nor reach any
  // service account (the platform-wide ones are superuser-only).
  const entityPickerBlocked = computed(() => entityPickBlocked({ enterprise: isEnterprise.value, superuser: isSuperuser.value, actorIsGlobal: isGlobal.value, anchoredRootId: anchoredRootId.value }))
  const anchor = useEntityPathLabel(entityId)

  // --- View (accounts | key inventory) ---
  const inventoryAvailable = computed(() => resolved.value.kind === 'entity' && Boolean(scope.value) && hasSurface('api_key_admin'))
  const view = computed<ServiceAccountView>(() => (inventoryAvailable.value && queryText('view') === 'inventory' ? 'inventory' : 'accounts'))
  const viewTabs = computed<NavigationMenuItem[]>(() => (['accounts', 'inventory'] as const).map((value) => {
    const query = { ...route.query }
    delete query.kpage
    if (value === 'accounts') delete query.view
    else query.view = value
    const active = view.value === value
    return { 'label': value === 'accounts' ? 'Service accounts' : 'Key inventory', value, 'to': { query }, active, 'aria-current': active ? 'page' : undefined }
  }))

  // --- Accounts ---
  const list = useListQueryState({
    filters: { status: 'active' as ServiceAccountStatusFilter },
    allowed: { status: [...SERVICE_ACCOUNT_STATUSES, 'all'] as const },
    pageSize: PAGE_SIZE
  })
  const { search, searchTerm, page, pageSize, filters: { status: statusFilter }, isFiltered } = list
  const accounts = useQuery(() => ({
    ...principalsQuery({
      scope: scope.value ?? { kind: 'platform_global' },
      filters: {
        page: page.value,
        limit: pageSize.value,
        search: searchTerm.value || undefined,
        status: statusFilter.value === 'all' ? undefined : statusFilter.value
      }
    }),
    placeholderData: keepPreviousData<IntegrationPrincipalsListResponse>,
    enabled: canRead.value && Boolean(scope.value) && view.value === 'accounts'
  }))
  const rows = computed<IntegrationPrincipal[]>(() => accounts.data.value?.items ?? [])
  const total = computed(() => accounts.data.value?.total ?? 0)
  list.syncTotal(() => accounts.data.value?.total)
  const statusItems: { label: string, value: ServiceAccountStatusFilter }[] = [
    { label: 'Active', value: 'active' },
    { label: 'Deactivated', value: 'inactive' },
    { label: 'Archived', value: 'archived' },
    { label: 'All statuses', value: 'all' }
  ]

  // --- New service account (at the scope shown; never at an inactive entity) ---
  const canCreateHere = computed(() => canCreate.value && Boolean(scope.value) && !anchor.inactive.value)
  function openCreateHere() {
    if (scope.value) actions.openCreate(scope.value)
  }
  function openCreated(account: IntegrationPrincipal) {
    void navigateTo(serviceAccountPath(account))
  }

  const emptyState = computed(() => (isFiltered.value
    ? {
        title: 'No service accounts match',
        description: 'Try a different search or clear the filters.',
        actions: [{ label: 'Clear filters', icon: 'i-lucide-x', color: 'neutral', variant: 'outline', onClick: list.reset }] satisfies ButtonProps[]
      }
    : {
        title: 'No active service accounts',
        description: resolved.value.kind === 'entity'
          ? `No active service account is anchored at ${anchor.name.value ?? 'this entity'}.`
          : 'Service accounts let integrations call this API with their own keys, roles and audit trail.',
        actions: canCreateHere.value ? [{ label: 'New service account', icon: 'i-lucide-plus', onClick: openCreateHere }] satisfies ButtonProps[] : []
      }))

  // --- Key inventory ---
  const inventory = reactive(useKeyInventory(computed(() => (inventoryAvailable.value ? entityId.value ?? null : null)), computed(() => canRead.value && view.value === 'inventory')))

  const guideOpen = ref(false)

  return {
    ...actions,
    isEnterprise,
    platformAllowed,
    scope,
    scopeKind,
    scopeItems,
    entityId,
    entityPickerBlocked,
    anchoredRootId,
    anchorLabel: anchor.label,
    anchorInactive: anchor.inactive,
    view,
    viewTabs,
    inventoryAvailable,
    search,
    statusFilter,
    statusItems,
    rows,
    total,
    page,
    pageSize,
    status: accounts.status,
    error: accounts.error,
    fetching: computed(() => accounts.asyncStatus.value === 'loading'),
    retry: () => void accounts.refetch(),
    emptyState,
    canCreateHere,
    openCreateHere,
    openCreated,
    inventory,
    guideOpen
  }
}
