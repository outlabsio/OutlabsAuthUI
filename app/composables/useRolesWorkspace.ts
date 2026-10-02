import { useQuery } from '@pinia/colada'
import type { ButtonProps } from '@nuxt/ui'
import { entitiesListQuery } from '~/queries/entities'
import { rolesListCatalogQuery, rolesListQuery } from '~/queries/roles'
import type { Role, RolesListResponse } from '~/types/role'
import { slicePage } from '~/utils/pagination'

// Feature logic for the roles list (F-068, F-125, F-126, F-127, F-133), on the shared list
// conventions of the permissions list (useListQueryState + AppQueryState + AppListPagination):
// - search, type, organization, origin and page live in the route query (reload, Back and
//   links keep them);
// - pages come from the server: GET /roles?page&limit&search&is_global&root_entity_id, with the
//   previous page kept on screen while the next loads;
// - GET /roles has no is_system parameter, so the Origin filter switches to every page of the
//   roles the admin can read (rolesListCatalogQuery), filtered and paged in the browser. It
//   loads only while that filter is on. The total is always the true count.
// - Organization filter: for admins who browse every organization (superusers, rootless and
//   global admins); a delegated admin's roles are their organization's already (the API filters).
// Row actions, the create/edit/duplicate dialog and the archive confirmation: useRoleActions.

export type RoleTypeFilter = 'all' | 'global' | 'scoped'
export type RoleOriginFilter = 'all' | 'system' | 'custom'

const PAGE_SIZE = 25
const ALL_ORGS = 'all'
// Organisations offered by the organization filter.
const ROOTS_LIMIT = 100
const TYPES = ['all', 'global', 'scoped'] as const satisfies readonly RoleTypeFilter[]
const ORIGINS = ['all', 'system', 'custom'] as const satisfies readonly RoleOriginFilter[]

export function useRolesWorkspace() {
  const { canAccess, isEnterprise } = useAuth()
  const { canBrowseAllRoots } = useEntityScope()
  const actions = useRoleActions()
  const { canRead, canCreate } = actions

  const list = useListQueryState({
    filters: { type: 'all' as RoleTypeFilter, org: ALL_ORGS as string, origin: 'all' as RoleOriginFilter },
    allowed: { type: TYPES, origin: ORIGINS },
    pageSize: PAGE_SIZE
  })
  const { search, searchTerm, page, pageSize, filters: { type: typeFilter, org: orgFilter, origin: originFilter }, isFiltered } = list

  // --- Organizations (EnterpriseRBAC; admins who browse every organization: useEntityScope) ---
  const seesAllRoots = canBrowseAllRoots
  const showOrgFilter = computed(() => isEnterprise.value && canRead.value && seesAllRoots.value && canAccess('entities'))
  const { data: rootsData } = useQuery(() => ({
    ...entitiesListQuery({ rootOnly: true, limit: ROOTS_LIMIT }),
    enabled: showOrgFilter.value
  }))
  const orgItems = computed(() => {
    const roots = (rootsData.value?.items ?? []).map(e => ({ label: e.display_name || e.name, value: e.id }))
    return [
      { label: 'All organizations', value: ALL_ORGS },
      ...roots,
      // An organisation from the URL stays selectable before (or beyond) the loaded roots.
      ...(orgFilter.value !== ALL_ORGS && !roots.some(r => r.value === orgFilter.value) ? [{ label: 'Selected organization', value: orgFilter.value }] : [])
    ]
  })
  const rootEntityId = computed(() => (showOrgFilter.value && orgFilter.value !== ALL_ORGS ? orgFilter.value : undefined))
  // Type (system-wide or not) is an EnterpriseRBAC concept; SimpleRBAC roles are all global.
  const isGlobalFilter = computed(() => (!isEnterprise.value || typeFilter.value === 'all' ? undefined : typeFilter.value === 'global'))

  // --- Rows ---
  const filtersLocally = computed(() => originFilter.value !== 'all')
  const serverPage = useQuery(() => ({
    ...rolesListQuery({
      page: page.value,
      limit: pageSize.value,
      search: searchTerm.value || undefined,
      isGlobal: isGlobalFilter.value,
      rootEntityId: rootEntityId.value
    }),
    placeholderData: keepPreviousData<RolesListResponse>,
    enabled: canRead.value && !filtersLocally.value
  }))
  const catalog = useQuery(() => ({ ...rolesListCatalogQuery(), enabled: canRead.value && filtersLocally.value }))

  const locallyFiltered = computed<Role[]>(() => {
    if (!filtersLocally.value) return []
    const term = searchTerm.value.toLowerCase()
    return (catalog.data.value?.items ?? []).filter((role) => {
      if (term && !`${role.name} ${role.display_name} ${role.description ?? ''}`.toLowerCase().includes(term)) return false
      if (isGlobalFilter.value !== undefined && role.is_global !== isGlobalFilter.value) return false
      if (rootEntityId.value && role.root_entity_id !== rootEntityId.value) return false
      if (originFilter.value === 'system' && !role.is_system_role) return false
      if (originFilter.value === 'custom' && role.is_system_role) return false
      return true
    })
  })

  const total = computed(() => (filtersLocally.value ? locallyFiltered.value.length : serverPage.data.value?.total ?? 0))
  const rows = computed<Role[]>(() => (filtersLocally.value
    ? slicePage(locallyFiltered.value, page.value, pageSize.value)
    : serverPage.data.value?.items ?? []))
  list.syncTotal(() => (filtersLocally.value ? (catalog.status.value === 'success' ? total.value : undefined) : serverPage.data.value?.total))

  // What AppQueryState renders: the query actually feeding the table.
  const active = computed(() => (filtersLocally.value ? catalog : serverPage))
  const status = computed(() => active.value.status.value)
  const error = computed(() => active.value.error.value)
  const fetching = computed(() => active.value.asyncStatus.value === 'loading')
  function retry() {
    void active.value.refetch()
  }
  // Only when the catalogue walk stopped early.
  const catalogIncomplete = computed(() => filtersLocally.value && catalog.data.value?.truncated === true)

  const typeItems: { label: string, value: RoleTypeFilter }[] = [
    { label: 'All types', value: 'all' },
    { label: 'System-wide', value: 'global' },
    { label: 'Organization and entity', value: 'scoped' }
  ]
  const originItems: { label: string, value: RoleOriginFilter }[] = [
    { label: 'All origins', value: 'all' },
    { label: 'System', value: 'system' },
    { label: 'Custom', value: 'custom' }
  ]
  // Filters other than the search box (the mobile Filters button counts them).
  const activeFilterCount = computed(() => [
    isEnterprise.value && typeFilter.value !== 'all',
    Boolean(rootEntityId.value),
    originFilter.value !== 'all'
  ].filter(Boolean).length)

  // Empty state: "no matches" with a way back, or "none yet" with the create action.
  const emptyState = computed(() => (isFiltered.value
    ? {
        title: 'No roles match',
        description: 'Try a different search or clear the filters.',
        actions: [{ label: 'Clear filters', icon: 'i-lucide-x', color: 'neutral', variant: 'outline', onClick: list.reset }] satisfies ButtonProps[]
      }
    : {
        title: 'No roles yet',
        description: 'Roles bundle permissions to grant to users and memberships.',
        actions: canCreate.value ? [{ label: 'Add role', icon: 'i-lucide-plus', onClick: actions.openCreate }] satisfies ButtonProps[] : []
      }))

  return {
    ...actions,
    isEnterprise,
    search,
    typeFilter,
    typeItems,
    orgFilter,
    orgItems,
    showOrgFilter,
    originFilter,
    originItems,
    activeFilterCount,
    rows,
    total,
    page,
    pageSize,
    status,
    error,
    fetching,
    retry,
    catalogIncomplete,
    emptyState
  }
}
