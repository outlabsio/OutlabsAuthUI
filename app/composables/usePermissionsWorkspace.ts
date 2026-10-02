import { useQuery } from '@pinia/colada'
import type { ButtonProps, FormSubmitEvent } from '@nuxt/ui'
import { permissionCatalogQuery, permissionsListQuery, useCreatePermission } from '~/queries/permissions'
import type { CreatePermissionSchema } from '~/schemas/permission'
import type { ActionError } from '~/composables/useApiAction'
import type { CreatePermissionInput, Permission, PermissionOriginFilter, PermissionsListResponse } from '~/types/permission'
import { slicePage } from '~/utils/pagination'

// Feature logic for the permissions workspace — the reference list for the shared list
// conventions (useListQueryState + AppQueryState + AppListPagination):
// - search, resource, origin and page live in the route query (reload, Back and links keep them);
// - browsing pages on the server: GET /permissions?page&limit&resource, with the previous page
//   kept on screen while the next loads;
// - GET /permissions has no search or is_system parameter, so a search term or an origin filter
//   switches to the complete catalogue (every page, permissionCatalogQuery) filtered and paged
//   in the browser. The total is always the true count; nothing is capped silently.
// - The catalogue is a PERMISSIONS-ONLY exception, and it is loaded lazily: only in that local
//   mode, or once the resource filter is opened (its options are the catalogue's resources).
//   Plain browsing fetches one page. Lists whose API can search and filter (users, roles, keys)
//   send every filter to the server and never fetch the whole collection.
// Row actions (Edit, Archive) come from usePermissionActions, shared with the detail page. The
// create dialog is the reference AppFormDialog (see ARCHITECTURE.md, "Forms and dialogs").

const PAGE_SIZE = 25
const ORIGINS = ['all', 'system', 'custom'] as const satisfies readonly PermissionOriginFilter[]

export function usePermissionsWorkspace() {
  const { canAccess } = useAuth()
  // Same requirement as the Permissions nav item and the page gate (APP_SECTIONS 'permissions').
  const canRead = computed(() => canAccess('permissions'))

  const list = useListQueryState({
    filters: { resource: 'all', origin: 'all' as PermissionOriginFilter },
    allowed: { origin: ORIGINS },
    pageSize: PAGE_SIZE
  })
  const { search, searchTerm, page, pageSize, filters: { resource: resourceFilter, origin: originFilter }, isFiltered } = list

  // Search and origin cannot be sent to the API; either one filters the catalogue locally.
  const filtersLocally = computed(() => Boolean(searchTerm.value) || originFilter.value !== 'all')

  const serverPage = useQuery(() => ({
    ...permissionsListQuery({
      page: page.value,
      limit: pageSize.value,
      resource: resourceFilter.value === 'all' ? undefined : resourceFilter.value
    }),
    placeholderData: keepPreviousData<PermissionsListResponse>,
    enabled: canRead.value && !filtersLocally.value
  }))
  // The catalogue feeds the local filtering and the resource filter's options; it loads only
  // when one of them needs it (see the header).
  const resourceOptionsWanted = ref(false)
  const catalog = useQuery(() => ({ ...permissionCatalogQuery, enabled: canRead.value && (filtersLocally.value || resourceOptionsWanted.value) }))
  // Bound to the resource USelect's update:open.
  function onResourceFilterOpen(open: boolean) {
    if (open) resourceOptionsWanted.value = true
  }
  const resourceOptionsLoading = computed(() => catalog.status.value === 'pending' && catalog.asyncStatus.value === 'loading')

  const resourceOf = (p: Permission) => p.resource || p.name.split(':')[0] || 'other'

  const locallyFiltered = computed<Permission[]>(() => {
    if (!filtersLocally.value) return []
    const term = searchTerm.value.toLowerCase()
    return (catalog.data.value?.items ?? []).filter((p) => {
      if (term && !`${p.name} ${p.display_name} ${p.description ?? ''}`.toLowerCase().includes(term)) return false
      if (resourceFilter.value !== 'all' && resourceOf(p) !== resourceFilter.value) return false
      if (originFilter.value === 'system' && !p.is_system) return false
      if (originFilter.value === 'custom' && p.is_system) return false
      return true
    })
  })

  const total = computed(() => (filtersLocally.value ? locallyFiltered.value.length : serverPage.data.value?.total ?? 0))
  const rows = computed<Permission[]>(() => (filtersLocally.value
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
  // Only when the catalogue walk stopped early (tens of thousands of permissions).
  const catalogIncomplete = computed(() => filtersLocally.value && catalog.data.value?.complete === false)

  const resourceItems = computed(() => {
    const resources = new Set((catalog.data.value?.items ?? []).map(resourceOf))
    // A resource from the URL stays selectable even before the catalogue has loaded.
    if (resourceFilter.value !== 'all') resources.add(resourceFilter.value)
    return [{ label: 'All resources', value: 'all' }, ...[...resources].sort().map(r => ({ label: r, value: r }))]
  })
  const originItems: { label: string, value: PermissionOriginFilter }[] = [
    { label: 'All origins', value: 'all' },
    { label: 'System', value: 'system' },
    { label: 'Custom', value: 'custom' }
  ]

  // --- Row actions: Edit (custom permissions) and Archive, shared with the detail page ---
  const actions = usePermissionActions()
  const { canCreate } = actions
  const { run } = useApiAction()

  // Empty state: "no matches" with a way back, or "none yet" with the create action.
  const emptyState = computed(() => (isFiltered.value
    ? {
        title: 'No permissions match',
        description: 'Try a different search or clear the filters.',
        actions: [{ label: 'Clear filters', icon: 'i-lucide-x', color: 'neutral', variant: 'outline', onClick: list.reset }] satisfies ButtonProps[]
      }
    : {
        title: 'No permissions yet',
        description: 'Permissions define the actions roles can grant.',
        actions: canCreate.value ? [{ label: 'Create permission', icon: 'i-lucide-plus', onClick: openCreate }] satisfies ButtonProps[] : []
      }))

  // --- Create (the reference AppFormDialog) ---
  // Reset on every open; server problems land on the matching field (useDialogForm) or in the
  // dialog's alert (createError); the dialog stays open until the permission exists.
  const createOpen = ref(false)
  const createError = ref<ActionError | null>(null)
  const createForm = useDialogForm('createDialog')
  const blankPermission = (): CreatePermissionSchema => ({ resource: '', action: '', display_name: '', description: '', tags: [], is_active: true })
  const createState = reactive<CreatePermissionSchema>(blankPermission())
  // Live preview of the resource:action name the two inputs will produce.
  const namePreview = computed(() => `${createState.resource || 'resource'}:${createState.action || 'action'}`)
  const createPermission = useCreatePermission()
  function openCreate() {
    Object.assign(createState, blankPermission())
    createError.value = null
    createOpen.value = true
  }
  async function onCreate(event: FormSubmitEvent<CreatePermissionSchema>) {
    const d = event.data
    // The backend takes a single resource:action `name` and derives the parts. is_system is NOT sent:
    // the API rejects `is_system: true` (system permissions are seeder-owned), so admin-created
    // permissions are always custom — the create form doesn't expose the flag.
    const input: CreatePermissionInput = {
      name: `${d.resource}:${d.action}`,
      display_name: d.display_name,
      is_active: d.is_active
    }
    if (d.description) input.description = d.description
    if (d.tags.length) input.tags = d.tags

    const res = await run(() => createPermission.mutateAsync(input), {
      success: 'Permission created',
      error: 'Could not create permission',
      form: createForm,
      // The combined name is validated server-side; its problems belong to the Action input.
      fieldMap: { name: 'action' },
      inline: createError
    })
    if (res.ok) createOpen.value = false
  }

  return {
    canRead,
    canCreate,
    search,
    resourceFilter,
    originFilter,
    resourceItems,
    resourceOptionsLoading,
    onResourceFilterOpen,
    originItems,
    rows,
    total,
    page,
    pageSize,
    status,
    error,
    fetching,
    retry,
    catalogIncomplete,
    emptyState,
    menuItems: actions.menuItems,
    editOpen: actions.editOpen,
    editTarget: actions.editTarget,
    createOpen,
    createState,
    createError,
    namePreview,
    openCreate,
    onCreate,
    archivePermission: actions.archive
  }
}
