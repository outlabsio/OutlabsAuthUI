import { useQuery } from '@pinia/colada'
import { breakpointsTailwind, refDebounced, useBreakpoints } from '@vueuse/core'
import type { ButtonProps } from '@nuxt/ui'
import type { TreeItemSelectEvent, TreeItemToggleEvent } from 'reka-ui'
import type { LocationQuery } from 'vue-router'
import { entitiesListQuery, entityDescendantsQuery, entityDetailQuery, entityPathQuery } from '~/queries/entities'
import { buildEntityTree, entityAncestors, filterEntityTree, indexEntities, type EntityTreeNode } from '~/utils/entity-tree'
import type { EntitiesListResponse, Entity, EntityClassValue, EntityStatusValue } from '~/types/entity'

// Feature logic for the entities workspace: the organisation switcher, the hierarchy tree with
// search and the "Show inactive" toggle (left panel), the selection (?entity=) that drives the
// detail panel (beside the tree from lg, in a slideover below it), and the create dialog's
// opening. The SFC binds this and renders.
//
// The tree is one organisation at a time: GET /entities/{root} + /entities/{root}/descendants,
// which (unlike the paginated list) includes inactive entities and is never truncated (F-022,
// F-126). Delegated admins are anchored on their own organisation (useEntityScope, F-020).

export type EntityTreeItem = {
  value: string
  label: string
  entityType: string
  entityClass: EntityClassValue
  status: EntityStatusValue
  detached: boolean
  children?: EntityTreeItem[]
}

// Inactive entities (and everything beneath them) are pruned unless "Show inactive" is on.
function pruneInactive(nodes: EntityTreeNode[]): { tree: EntityTreeNode[], hidden: number } {
  let hidden = 0
  const count = (node: EntityTreeNode): number => 1 + node.children.reduce((sum, child) => sum + count(child), 0)
  const walk = (list: EntityTreeNode[]): EntityTreeNode[] => list.flatMap((node) => {
    if (node.status !== 'active') {
      hidden += count(node)
      return []
    }
    return [{ ...node, children: walk(node.children) }]
  })
  return { tree: walk(nodes), hidden }
}

function toTreeItems(nodes: EntityTreeNode[]): EntityTreeItem[] {
  return nodes.map(n => ({
    value: n.id,
    label: n.display_name,
    entityType: n.entity_type,
    entityClass: n.entity_class,
    status: n.status,
    detached: n.detached,
    ...(n.children.length ? { children: toTreeItems(n.children) } : {})
  }))
}

export function useEntitiesWorkspace() {
  const route = useRoute()
  const router = useRouter()
  const { hasPermission, canAccess, user } = useAuth()
  const { anchoredRootId, canBrowseAllRoots } = useEntityScope()

  // Same requirement as the Entities nav item and the page gate (APP_SECTIONS 'entities').
  // entity:create is granted by entity:create_tree for delegated org admins (permission algebra).
  const canRead = computed(() => canAccess('entities'))
  const canCreate = computed(() => canRead.value && hasPermission('entity:create'))

  // Search (q), the organisation (root) and "Show inactive" (inactive) live in the route query;
  // the selection (entity) too, but as navigation (push) so Back steps through selections.
  const list = useListQueryState({ filters: { root: '', inactive: false } })
  const search = list.search
  const showInactive = list.filters.inactive

  const selectedId = computed(() => (typeof route.query.entity === 'string' ? route.query.entity : ''))

  // The current query with some keys set (a value) or removed (null).
  function withQuery(change: Record<string, string | null>): LocationQuery {
    const kept = Object.entries(route.query).filter(([key]) => !(key in change))
    const set = Object.entries(change).filter((entry): entry is [string, string] => Boolean(entry[1]))
    return Object.fromEntries([...kept, ...set])
  }
  function selectEntity(id: string | null) {
    if ((id ?? '') === selectedId.value) return
    void router.push({ query: withQuery({ entity: id }) })
  }

  // --- Organisation (root) ---
  // The selected entity's organisation wins (a deep link opens its own tree); then the root in the
  // URL, the admin's own organisation, and the first organisation listed.
  const { data: selectionPath, status: selectionPathStatus } = useQuery(() => ({
    ...entityPathQuery(selectedId.value),
    enabled: canRead.value && Boolean(selectedId.value)
  }))
  // The selection's own record: the detail panel reads the same key, so it is known as soon as
  // the panel names the entity, often before the tree and the path have loaded.
  const { data: selectionDetail } = useQuery(() => ({
    ...entityDetailQuery(selectedId.value),
    enabled: canRead.value && Boolean(selectedId.value)
  }))
  const selectionRootId = computed(() => (selectedId.value ? selectionPath.value?.[0]?.id ?? null : null))
  // While a deep link's organisation is being resolved, do not load another organisation's tree.
  const resolvingSelection = computed(() => Boolean(selectedId.value) && !selectionPath.value && selectionPathStatus.value === 'pending')

  const rootSearch = ref('')
  const rootSearchTerm = refDebounced(computed(() => rootSearch.value.trim()), 300)
  const { data: rootsData, status: rootsStatus, asyncStatus: rootsAsync } = useQuery(() => ({
    ...entitiesListQuery({ rootOnly: true, limit: 50, search: rootSearchTerm.value || undefined }),
    placeholderData: keepPreviousData<EntitiesListResponse>,
    enabled: canRead.value && canBrowseAllRoots.value
  }))

  // The first organisation of the unfiltered list (searching the switcher does not move the tree).
  const firstRootId = ref<string | null>(null)
  watch(rootsData, (data) => {
    if (!rootSearchTerm.value) firstRootId.value = data?.items[0]?.id ?? null
  }, { immediate: true })
  const rootId = computed<string | null>(() => {
    if (anchoredRootId.value) return anchoredRootId.value
    if (selectionRootId.value) return selectionRootId.value
    if (resolvingSelection.value) return list.filters.root.value || null
    return list.filters.root.value || user.value?.root_entity_id || firstRootId.value
  })

  // --- The tree: the organisation and its whole subtree ---
  const treeEnabled = computed(() => canRead.value && Boolean(rootId.value))
  const rootQuery = useQuery(() => ({ ...entityDetailQuery(rootId.value ?? ''), enabled: treeEnabled.value }))
  const descendantsQuery = useQuery(() => ({ ...entityDescendantsQuery(rootId.value ?? ''), enabled: treeEnabled.value }))
  const rootEntity = computed(() => rootQuery.data.value ?? null)

  const treeStatus = computed<'pending' | 'error' | 'success'>(() => {
    if (!rootId.value) return resolvingSelection.value || (canBrowseAllRoots.value && rootsStatus.value === 'pending') ? 'pending' : 'success'
    if (rootQuery.status.value === 'error' || descendantsQuery.status.value === 'error') return 'error'
    if (rootQuery.status.value === 'pending' || descendantsQuery.status.value === 'pending') return 'pending'
    return 'success'
  })
  const treeError = computed(() => rootQuery.error.value ?? descendantsQuery.error.value ?? null)
  function retryTree() {
    void rootQuery.refetch()
    void descendantsQuery.refetch()
  }

  // Archived entities left the hierarchy; they are reachable by a direct link only.
  const entities = computed<Entity[]>(() => [
    ...(rootEntity.value ? [rootEntity.value] : []),
    ...(descendantsQuery.data.value ?? [])
  ].filter(e => e.status !== 'archived'))
  const entityById = computed(() => indexEntities(entities.value))

  const visible = computed(() => {
    const full = buildEntityTree(entities.value)
    return showInactive.value ? { tree: full, hidden: 0 } : pruneInactive(full)
  })
  const hiddenInactiveCount = computed(() => visible.value.hidden)
  const filtered = computed(() => filterEntityTree(visible.value.tree, list.searchTerm.value))
  const treeItems = computed(() => toTreeItems(filtered.value.tree))
  const entityCount = computed(() => entities.value.length)

  // Expanded state — driven by the search filter (reveal matches) or the selected entity's
  // ancestor path (reveal the selection, also after a move), without collapsing branches the
  // admin opened.
  const expanded = ref<string[]>([])
  watch(() => filtered.value.expandedIds, (ids) => {
    if (list.searchTerm.value) expanded.value = ids
  })
  watch([selectedId, entityById], () => {
    if (!selectedId.value || list.searchTerm.value) return
    const ancestors = entityAncestors(selectedId.value, entityById.value).map(e => e.id)
    if (ancestors.some(id => !expanded.value.includes(id))) expanded.value = [...new Set([...expanded.value, ...ancestors])]
  }, { immediate: true })
  // A roots' first level starts open, so a fresh visit shows more than one row.
  watch(rootId, (id) => {
    if (id && !expanded.value.includes(id)) expanded.value = [...expanded.value, id]
  }, { immediate: true })

  // A (deep-linked) selection is scrolled into view once, when the tree first renders its row;
  // later refetches and searches do not pull the tree back to it.
  let revealedId = ''
  watch([selectedId, treeItems], async () => {
    if (!selectedId.value || revealedId === selectedId.value || !import.meta.client) return
    await nextTick()
    const row = document.querySelector('[data-entity-tree] [role="treeitem"][aria-selected="true"]')
    if (!row) return
    row.scrollIntoView({ block: 'nearest' })
    revealedId = selectedId.value
  }, { flush: 'post' })

  // UTree selection (F-181): the row itself is the control; selecting navigates (?entity=).
  const treeItemById = computed(() => {
    const byId = new Map<string, EntityTreeItem>()
    const walk = (items: EntityTreeItem[]) => items.forEach((item) => {
      byId.set(item.value, item)
      if (item.children) walk(item.children)
    })
    walk(treeItems.value)
    return byId
  })
  const selectedTreeItem = computed<EntityTreeItem | undefined>(() => treeItemById.value.get(selectedId.value))
  function onTreeSelect(event: TreeItemSelectEvent<EntityTreeItem>, item: EntityTreeItem) {
    event.preventDefault()
    selectEntity(item.value)
  }
  // A click selects the row; it collapses an open branch only when the row was already selected.
  function onTreeToggle(event: TreeItemToggleEvent<EntityTreeItem>) {
    if (event.detail.originalEvent?.type === 'click' && event.detail.isExpanded && !event.detail.isSelected) event.preventDefault()
  }

  // Empty states: no match, nothing active (inactive hidden), no organisation at all.
  const emptyState = computed(() => {
    if (list.searchTerm.value) {
      return {
        title: 'No entities match',
        description: 'Try another name, slug or type.',
        actions: [{ label: 'Clear search', color: 'neutral', variant: 'outline', onClick: () => { list.search.value = '' } }] satisfies ButtonProps[]
      }
    }
    if (rootId.value) {
      return {
        title: 'No active entities',
        description: hiddenInactiveCount.value ? 'Turn on Show inactive to see the inactive ones.' : undefined,
        actions: [] as ButtonProps[]
      }
    }
    return {
      title: 'No organizations yet',
      description: canCreate.value ? 'Create the first organization to start the hierarchy.' : undefined,
      actions: (canCreate.value ? [{ label: 'New entity', icon: 'i-lucide-plus', onClick: () => openCreate(null) }] : []) satisfies ButtonProps[]
    }
  })

  // --- Organisation switcher (superusers and accounts without an organisation) ---
  const rootItems = computed(() => {
    const items = (rootsData.value?.items ?? []).map(e => ({ label: e.display_name, value: e.id, description: e.entity_type }))
    const current = rootEntity.value
    if (current && !current.parent_entity_id && !items.some(i => i.value === current.id)) {
      items.unshift({ label: current.display_name, value: current.id, description: current.entity_type })
    }
    return items
  })
  const rootSearchInput = { 'placeholder': 'Search organizations...', 'type': 'search' as const, 'aria-label': 'Search organizations' }
  const rootsLoading = computed(() => rootsStatus.value === 'pending' || rootsAsync.value === 'loading')
  const rootsHint = computed(() => {
    const total = rootsData.value?.total ?? 0
    const shown = rootsData.value?.items.length ?? 0
    return total > shown ? `Showing ${shown} of ${total} organizations. Type to search.` : null
  })
  const selectedRootId = computed<string | undefined>({
    get: () => rootId.value ?? undefined,
    set: (id) => {
      if (!id || id === rootId.value) return
      void router.push({ query: withQuery({ root: id, entity: null }) })
    }
  })

  // --- Detail placement: beside the tree from lg, in a slideover below it (F-023) ---
  const isMobile = useBreakpoints(breakpointsTailwind).smaller('lg')
  const detailSheetOpen = computed({
    get: () => Boolean(selectedId.value),
    set: (open: boolean) => {
      if (!open) selectEntity(null)
    }
  })

  // --- Create (the dialog is AppEntityCreateDialog; this decides where it opens) ---
  const createOpen = ref(false)
  const createParentId = ref<string | null>(null)
  // A fresh dialog per opening (its key): its portal is then the newest in the document, so it
  // stacks above the detail slideover it can be opened from.
  const createSession = ref(0)
  // Preselect the parent: the selected entity (F-074), else the organisation in view. The
  // selection is known from the tree, its own record (what the detail panel shows) or its path
  // (root-first, ending with it); an archived one has left the hierarchy and is never the parent.
  // Before any of them has loaded the selection is still the parent: falling back to the
  // organisation then meant a new top-level organisation for a superuser whose tree had not
  // loaded yet, kept after the selection arrived.
  function defaultCreateParent(): string | null {
    const id = selectedId.value
    if (!id) return rootId.value
    const fromPath = selectionPath.value?.at(-1)
    const fromDetail = selectionDetail.value?.id === id ? selectionDetail.value : undefined
    const selected = entityById.value.get(id) ?? fromDetail ?? (fromPath?.id === id ? fromPath : undefined)
    if (!selected) return id
    return selected.status !== 'archived' ? selected.id : rootId.value
  }
  function openCreate(parentId?: string | null) {
    createParentId.value = parentId !== undefined ? parentId : defaultCreateParent()
    createSession.value += 1
    createOpen.value = true
  }
  // Open what was just created (F-218): a new organisation becomes the tree in view.
  function onCreated(entity: Entity) {
    void router.push({ query: withQuery({ entity: entity.id, root: entity.parent_entity_id ? null : entity.id, q: null }) })
  }

  return {
    canRead,
    canCreate,
    canBrowseAllRoots,
    treeStatus,
    treeError,
    retryTree,
    treeItems,
    emptyState,
    entityCount,
    hiddenInactiveCount,
    expanded,
    selectedId,
    selectedTreeItem,
    onTreeSelect,
    onTreeToggle,
    search,
    showInactive,
    rootItems,
    rootSearch,
    rootSearchInput,
    rootsLoading,
    rootsHint,
    selectedRootId,
    isMobile,
    detailSheetOpen,
    createOpen,
    createParentId,
    createSession,
    openCreate,
    onCreated
  }
}
