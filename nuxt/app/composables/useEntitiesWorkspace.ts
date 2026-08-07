import { useQuery } from '@pinia/colada'
import { entitiesListQuery, useCreateEntity } from '~/queries/entities'
import { getApiErrorMessage } from '~/api/client'
import { buildEntityTree, filterEntityTree, type EntityTreeNode } from '~/utils/entity-tree'
import type { CreateEntityInput, Entity, EntityClassValue, EntityStatusValue } from '~/types/entity'

// Feature logic for the entities workspace (the tree / search / create left panel). The SFC
// binds this and renders — no queries, handlers, or business rules in the template.

// "Root" uses a sentinel because Reka's Combobox reserves the empty string for clearing.
const ROOT_PARENT = '__root__'

type EntityTreeItem = {
  value: string
  label: string
  entityClass: EntityClassValue
  status: EntityStatusValue
  children?: EntityTreeItem[]
}

export function useEntitiesWorkspace() {
  const toast = useToast()
  const route = useRoute()
  const { hasPermission } = useAuth()

  const canRead = computed(() => hasPermission('entity:read'))
  const canCreate = computed(() => hasPermission('entity:create'))

  // One query loads the whole hierarchy — the tree, search, and the parent picker all derive
  // from it (built + filtered client-side, no server pagination).
  const { data, status, error } = useQuery(() => ({ ...entitiesListQuery({ limit: 1000 }), enabled: canRead.value }))
  const allEntities = computed<Entity[]>(() => data.value?.items ?? [])
  const errorMessage = computed(() => getApiErrorMessage(error.value))

  // The selected entity (right panel) lives in the URL (?entity=id) so it's deep-linkable and
  // the back button works; tree nodes are links that set it.
  const selectedId = computed(() => (typeof route.query.entity === 'string' ? route.query.entity : ''))

  const search = ref('')
  const fullTree = computed(() => buildEntityTree(allEntities.value))
  const filtered = computed(() => filterEntityTree(fullTree.value, search.value))
  const entityById = computed(() => new Map(allEntities.value.map(e => [e.id, e])))

  function ancestorIds(id: string): string[] {
    const out: string[] = []
    let current = entityById.value.get(id)
    while (current?.parent_entity_id) {
      out.push(current.parent_entity_id)
      current = entityById.value.get(current.parent_entity_id)
    }
    return out
  }

  // Expanded state — driven by the search filter (reveal matches) or the selected entity's
  // ancestor path (reveal the selection), without collapsing branches the user opened manually.
  const expanded = ref<string[]>([])
  watch(() => filtered.value.expandedIds, (ids) => {
    if (search.value.trim()) expanded.value = ids
  })
  watch([selectedId, () => allEntities.value.length], () => {
    if (selectedId.value && !search.value.trim()) {
      expanded.value = [...new Set([...expanded.value, ...ancestorIds(selectedId.value)])]
    }
  }, { immediate: true })

  // UTree items — value = id (key), label = display name; children omitted for leaves so they
  // render without an expand toggle.
  function toTreeItems(nodes: EntityTreeNode[]): EntityTreeItem[] {
    return nodes.map(n => ({
      value: n.id,
      label: n.display_name,
      entityClass: n.entity_class,
      status: n.status,
      ...(n.children.length ? { children: toTreeItems(n.children) } : {})
    }))
  }
  const treeItems = computed(() => toTreeItems(filtered.value.tree))

  // --- Create ---
  const parentSelectItems = computed(() => [
    { label: 'None (root)', value: ROOT_PARENT },
    ...allEntities.value.map(e => ({ label: e.display_name, value: e.id }))
  ])
  const entityClassItems = [
    { label: 'Structural', value: 'structural' as EntityClassValue },
    { label: 'Access group', value: 'access_group' as EntityClassValue }
  ]

  const createOpen = ref(false)
  const createState = reactive({
    parentId: ROOT_PARENT,
    name: '',
    displayName: '',
    slug: '',
    description: '',
    entityClass: 'structural' as EntityClassValue,
    entityType: '',
    allowedChildClasses: [] as EntityClassValue[],
    allowedChildTypes: ''
  })
  const createErrors = reactive({ name: '', displayName: '', slug: '', entityType: '' })
  const createEntity = useCreateEntity()
  const creating = ref(false)

  function parseChildTypes(raw: string): string[] {
    return raw.split(',').map(t => t.trim()).filter(Boolean)
  }
  function toggleChildClass(value: EntityClassValue) {
    const idx = createState.allowedChildClasses.indexOf(value)
    if (idx === -1) createState.allowedChildClasses.push(value)
    else createState.allowedChildClasses.splice(idx, 1)
  }

  // Governance of the chosen parent — surfaced as guidance (the backend enforces on submit).
  const selectedParent = computed(() => allEntities.value.find(e => e.id === createState.parentId) ?? null)
  const parentAllowedTypes = computed(() => selectedParent.value?.allowed_child_types ?? [])
  const parentAllowedClasses = computed(() => selectedParent.value?.allowed_child_classes ?? [])
  const hasParentGovernance = computed(() => Boolean(parentAllowedTypes.value?.length || parentAllowedClasses.value?.length))

  function openCreate() {
    Object.assign(createState, { parentId: ROOT_PARENT, name: '', displayName: '', slug: '', description: '', entityClass: 'structural', entityType: '', allowedChildClasses: [], allowedChildTypes: '' })
    Object.assign(createErrors, { name: '', displayName: '', slug: '', entityType: '' })
    createOpen.value = true
  }

  async function onCreate() {
    createErrors.name = createState.name.trim() ? '' : 'System name is required.'
    createErrors.displayName = createState.displayName.trim() ? '' : 'Display name is required.'
    createErrors.slug = createState.slug.trim() ? '' : 'Slug is required.'
    createErrors.entityType = createState.entityType.trim() ? '' : 'Entity type is required.'
    if (createErrors.name || createErrors.displayName || createErrors.slug || createErrors.entityType) return

    creating.value = true
    try {
      const input: CreateEntityInput = {
        name: createState.name.trim(),
        display_name: createState.displayName.trim(),
        slug: createState.slug.trim(),
        entity_class: createState.entityClass,
        entity_type: createState.entityType.trim()
      }
      if (createState.description.trim()) input.description = createState.description.trim()
      if (createState.parentId && createState.parentId !== ROOT_PARENT) input.parent_entity_id = createState.parentId
      if (createState.allowedChildClasses.length) input.allowed_child_classes = [...createState.allowedChildClasses]
      const childTypes = parseChildTypes(createState.allowedChildTypes)
      if (childTypes.length) input.allowed_child_types = childTypes

      await createEntity.mutateAsync(input)
      toast.add({ title: 'Entity created', color: 'success', icon: 'i-lucide-check' })
      createOpen.value = false
    } catch (err) {
      toast.add({ title: 'Could not create entity', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
    } finally {
      creating.value = false
    }
  }

  return {
    canCreate,
    status,
    errorMessage,
    treeItems,
    expanded,
    selectedId,
    search,
    createOpen,
    createState,
    createErrors,
    creating,
    parentSelectItems,
    entityClassItems,
    hasParentGovernance,
    parentAllowedTypes,
    parentAllowedClasses,
    openCreate,
    onCreate,
    toggleChildClass
  }
}
