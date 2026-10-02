import type { Ref } from 'vue'
import type { BreadcrumbItem, DropdownMenuItem } from '@nuxt/ui'
import type { LocationQuery } from 'vue-router'
import { useQuery } from '@pinia/colada'
import { entityDescendantsQuery, entityDetailQuery, entityPathQuery, useArchiveEntity } from '~/queries/entities'
import { entityActiveMemberCountQuery } from '~/queries/memberships'
import { entityKeyInventoryQuery, principalsQuery } from '~/queries/api-keys'
import type { Entity } from '~/types/entity'
import type { DetailItem } from '~/types/display'
import { appSection } from '~/utils/capabilities'
import { DEFINITION_STATUS_COLOR, ENTITY_CLASS_BADGE, entityTypeBadge, statusLabel } from '~/utils/status'
import { entityArchivePlan, entityDescendants, entityValidityState, indexEntities } from '~/utils/entity-tree'

// Feature logic for the entity detail panel (beside the tree from lg, in a slideover below it).
// It owns the record, its place in the hierarchy (path, root, subtree), what the actor may do
// with it, the read-only overview, and the archive confirmation. The member list, the activity
// card and the edit / governance / move dialogs are their own components with their own
// composables (useEntityMembers, useEntityActivity, useEntity*Dialog).

const VALIDITY_BADGE = {
  scheduled: { color: 'info', label: 'Scheduled', variant: 'subtle' },
  expired: { color: 'warning', label: 'Expired', variant: 'subtle' },
  current: { color: 'success', label: 'In effect', variant: 'subtle' }
} as const

export function useEntityDetail(entityId: Ref<string>) {
  const route = useRoute()
  const router = useRouter()
  const { hasPermission, canAccess, hasMemberships, isSuperuser, hasSurface } = useAuth()
  const { anchoredRootId, rootInScope } = useEntityScope()
  const { reachResolving } = useActorReach()

  const canRead = computed(() => canAccess('entities'))
  const canReadMembers = computed(() => hasMemberships.value && hasPermission('membership:read'))

  const { data: entity, status, error, refetch } = useQuery(() => ({ ...entityDetailQuery(entityId.value), enabled: canRead.value }))
  const apiError = useApiError(error)

  // Root-first chain including the entity (F-077). An archived entity has left the hierarchy
  // (no closure rows, so an empty path); its parent's chain locates it instead.
  const { data: pathData, status: pathStatus, error: pathError, refetch: refetchPath } = useQuery(() => ({ ...entityPathQuery(entityId.value), enabled: canRead.value }))
  const parentIdForPath = computed(() => (pathData.value && !pathData.value.length ? entity.value?.parent_entity_id ?? null : null))
  const { data: parentPathData, status: parentPathStatus, error: parentPathError, refetch: refetchParentPath } = useQuery(() => ({
    ...entityPathQuery(parentIdForPath.value ?? ''),
    enabled: canRead.value && Boolean(parentIdForPath.value)
  }))
  const ancestors = computed<Entity[]>(() => {
    if (pathData.value?.length) return pathData.value.filter(e => e.id !== entityId.value)
    return parentPathData.value ?? []
  })
  const rootEntity = computed<Entity | null>(() => ancestors.value[0] ?? (entity.value && !entity.value.parent_entity_id ? entity.value : null))
  const rootId = computed(() => rootEntity.value?.id ?? null)
  const isRoot = computed(() => Boolean(entity.value && !entity.value.parent_entity_id))

  // The organisation's subtree (shared with the tree: the same cached query), for children,
  // descendant counts, the archive plan and move targets. Includes inactive entities. A delegated
  // admin's is always their own organisation's, so a foreign id never loads another tenant's.
  const subtreeRootId = computed(() => anchoredRootId.value ?? rootId.value)
  const { data: subtreeData, status: subtreeStatus, error: subtreeError, refetch: refetchSubtree } = useQuery(() => ({
    ...entityDescendantsQuery(subtreeRootId.value ?? ''),
    enabled: canRead.value && Boolean(subtreeRootId.value)
  }))

  // Delegated admins see their own organisation only (F-020; the API does not scope these reads).
  // Until the entity is known to be theirs nothing about it renders and no card loads: an entity
  // of their organisation's subtree is theirs at once; any other (archived, just created, foreign)
  // waits for its path, and for the admin's reach (a system-wide admin is not anchored once it is
  // known). Superusers, system-wide admins and rootless accounts are never held back.
  const scope = computed<'pending' | 'error' | 'in' | 'out'>(() => {
    const anchored = anchoredRootId.value
    if (!anchored) return 'in'
    if (entityId.value === anchored || subtreeData.value?.some(e => e.id === entityId.value)) return 'in'
    if (!entity.value) return 'pending'
    const needsParentPath = Boolean(parentIdForPath.value)
    if (pathStatus.value === 'error' || (needsParentPath && parentPathStatus.value === 'error')) return 'error'
    if (pathStatus.value !== 'success' || (needsParentPath && parentPathStatus.value !== 'success')) return 'pending'
    if (rootInScope(rootId.value)) return 'in'
    // A system-wide admin is anchored only until their reach is known: never "outside" meanwhile.
    return reachResolving.value ? 'pending' : 'out'
  })
  const outOfScope = computed(() => scope.value === 'out')
  // The record may render, and its cards and actions load: it exists and is within scope.
  const scopeReady = computed(() => Boolean(entity.value) && scope.value === 'in')
  // Detail states: pending, error (not found / denied / failed), out of scope, or the record.
  const notFound = computed(() => apiError.value?.kind === 'not_found' || apiError.value?.status === 422)
  // The detail's own state: the record's, held at pending while its scope is resolved, and the
  // path's failure when the scope cannot be resolved.
  const detailStatus = computed(() => {
    if (status.value !== 'success') return status.value
    if (scope.value === 'pending') return 'pending'
    if (scope.value === 'error') return 'error'
    return status.value
  })
  const detailError = computed(() => error.value ?? (scope.value === 'error' ? pathError.value ?? parentPathError.value : null))
  const organisation = computed<Entity[]>(() => [...(rootEntity.value ? [rootEntity.value] : []), ...(subtreeData.value ?? [])])
  const organisationById = computed(() => indexEntities(organisation.value))
  const children = computed<Entity[]>(() => organisation.value
    .filter(e => e.parent_entity_id === entityId.value && e.status !== 'archived')
    .sort((a, b) => a.display_name.localeCompare(b.display_name)))
  const descendants = computed(() => entityDescendants(entityId.value, organisation.value).filter(e => e.status !== 'archived'))
  const archivePlan = computed(() => entityArchivePlan(entityId.value, organisation.value))

  const archived = computed(() => entity.value?.status === 'archived')
  // Member count and capacity (F-078); the details endpoint carries no total.
  const { data: activeMemberCount } = useQuery(() => ({
    ...entityActiveMemberCountQuery(entityId.value),
    enabled: canReadMembers.value && scopeReady.value
  }))
  // An entity archived by the old "Status: Archived" edit (before F-004) kept its access: the
  // status changed, nothing was revoked. DELETE still runs the revocation on it.
  const residualAccess = computed(() => archived.value && (activeMemberCount.value ?? 0) > 0)
  const residualAccessDescription = computed(() => {
    const count = activeMemberCount.value ?? 0
    return `${count} ${count === 1 ? 'membership is' : 'memberships are'} still active: it was archived by a status change, which revokes nothing. Finishing the archive revokes its memberships, role assignments, keys and service accounts.`
  })
  const atCapacity = computed(() => entity.value?.max_members != null && activeMemberCount.value != null && activeMemberCount.value >= entity.value.max_members)

  // --- What the actor may do (archived entities are read-only, F-004) ---
  const canUpdate = computed(() => scopeReady.value && !archived.value && hasPermission('entity:update'))
  const canArchive = computed(() => scopeReady.value && !archived.value && hasPermission('entity:delete'))
  const canFinishArchive = computed(() => scopeReady.value && residualAccess.value && hasPermission('entity:delete'))
  // Moving a root under another organisation merges tenants: superusers only (F-076).
  const canMove = computed(() => canUpdate.value && (!isRoot.value || isSuperuser.value))
  const canCreateChild = computed(() => scopeReady.value && !archived.value && entity.value?.status === 'active' && hasPermission('entity:create'))

  // --- Navigation within the master-detail (?entity=) ---
  function entityLink(id: string | null): { query: LocationQuery } {
    const query: LocationQuery = { ...route.query }
    if (id) query.entity = id
    else delete query.entity
    return { query }
  }
  const closeTo = computed(() => entityLink(null))
  const breadcrumb = computed<BreadcrumbItem[]>(() => {
    if (!entity.value) return []
    return [
      ...ancestors.value.map(a => ({ label: a.display_name, to: entityLink(a.id) })),
      { label: entity.value.display_name }
    ]
  })

  // --- Read-only overview (F-078) ---
  const validityState = computed(() => (entity.value ? entityValidityState(entity.value) : null))
  const overviewItems = computed<DetailItem[]>(() => {
    const e = entity.value
    if (!e) return []
    const items: DetailItem[] = [
      { key: 'status', label: 'Status', value: e.status, badge: { color: DEFINITION_STATUS_COLOR[e.status] ?? 'neutral', label: statusLabel(e.status) } },
      { key: 'class', label: 'Class', value: e.entity_class, badge: { ...ENTITY_CLASS_BADGE[e.entity_class] } },
      // Types are the organisation's own words: shown as typed, the same badge as the tree and tables.
      { key: 'type', label: 'Type', value: e.entity_type, badge: entityTypeBadge(e.entity_type) },
      { key: 'parent', label: 'Parent', value: ancestors.value.at(-1)?.display_name ?? (e.parent_entity_id ? 'Unavailable' : null), fallback: 'None (top-level organization)' },
      { key: 'name', label: 'System name', value: e.name, type: 'code' },
      { key: 'slug', label: 'Slug', value: e.slug, type: 'code' },
      { key: 'valid_from', label: 'Valid from', value: e.valid_from ?? null, type: 'date', fallback: 'Always' },
      { key: 'valid_until', label: 'Valid until', value: e.valid_until ?? null, type: 'date', fallback: 'No end' }
    ]
    if (validityState.value) items.push({ key: 'validity', label: 'Validity', value: validityState.value, badge: { ...VALIDITY_BADGE[validityState.value] } })
    if (e.description) items.push({ key: 'description', label: 'Description', value: e.description, full: true })
    return items
  })
  const parentEntity = computed(() => ancestors.value.at(-1) ?? null)

  // Governance as it applies to this entity (F-075, F-078): its own child limits, and the naming
  // rules, which only a root organisation sets (they apply to everything beneath it).
  const capacityPercent = computed(() => {
    const max = entity.value?.max_members
    if (!max || activeMemberCount.value == null) return null
    return Math.min(100, Math.round((activeMemberCount.value / max) * 100))
  })
  const governanceItems = computed<DetailItem[]>(() => {
    const e = entity.value
    if (!e) return []
    const classes = e.allowed_child_classes ?? []
    const ownTypes = e.allowed_child_types ?? []
    const inheritedTypes = !ownTypes.length && !isRoot.value ? rootEntity.value?.allowed_child_types ?? [] : []
    const members = activeMemberCount.value
    const items: DetailItem[] = [
      {
        key: 'child_types',
        label: 'Allowed child types',
        value: ownTypes.length
          ? ownTypes.join(', ')
          : inheritedTypes.length ? `${inheritedTypes.join(', ')} (set by ${rootEntity.value?.display_name})` : null,
        fallback: 'Any type'
      },
      {
        key: 'child_classes',
        label: 'Allowed child classes',
        value: classes.length ? `${classes.map(c => ENTITY_CLASS_BADGE[c].label).join(', ')} (advisory)` : null,
        fallback: 'Any class'
      },
      {
        key: 'members',
        label: 'Active members',
        value: e.max_members != null
          ? `${members ?? '…'} of ${e.max_members}`
          : members != null ? `${members} (no limit)` : 'No limit'
      }
    ]
    const source = isRoot.value ? e : rootEntity.value
    const rules = source
      ? [
          { key: 'name_pattern', label: 'Child system-name pattern', value: source.child_name_pattern, type: 'code' as const },
          { key: 'display_name_pattern', label: 'Child display-name pattern', value: source.child_display_name_pattern, type: 'code' as const },
          { key: 'slug_pattern', label: 'Child slug pattern', value: source.child_slug_pattern, type: 'code' as const },
          { key: 'naming_guidance', label: 'Naming guidance', value: source.child_naming_guidance, full: true }
        ].filter(rule => rule.value)
      : []
    if (rules.length) items.push(...rules)
    else items.push({ key: 'naming', label: 'Naming rules', value: null, fallback: 'None' })
    return items
  })
  // Naming rules belong to the root; a descendant shows them read-only and links there.
  const namingSetByRoot = computed(() => !isRoot.value && Boolean(rootEntity.value))

  // --- Integrations anchored here (F-180): service accounts and keys ---
  // Only once the entity itself loaded (a missing or foreign id fires no sub-requests, F-122).
  // Counts of ACTIVE records (one-row pages read only the totals); the key count comes from the
  // entity's key inventory (api_key_admin router), which lists personal and service-account keys
  // anchored exactly here.
  const canOpenIntegrations = computed(() => scopeReady.value && canAccess('service-accounts') && !archived.value)
  const { data: principalsData, status: principalsStatus } = useQuery(() => ({
    ...principalsQuery({ scope: { kind: 'entity', entityId: entityId.value }, filters: { page: 1, limit: 1, status: 'active' } }),
    enabled: canOpenIntegrations.value
  }))
  const inventoryReadable = computed(() => canOpenIntegrations.value && hasSurface('api_key_admin'))
  const { data: inventoryData, status: inventoryStatus } = useQuery(() => ({
    ...entityKeyInventoryQuery({ entityId: entityId.value, filters: { page: 1, limit: 1, status: 'active' } }),
    enabled: inventoryReadable.value
  }))
  const integrations = computed(() => ({
    accounts: principalsStatus.value === 'success' ? principalsData.value?.total ?? 0 : null,
    keys: inventoryStatus.value === 'success' ? inventoryData.value?.total ?? 0 : null,
    showKeys: inventoryReadable.value,
    failed: principalsStatus.value === 'error' || inventoryStatus.value === 'error',
    to: { path: appSection('service-accounts').to, query: { scope: 'entity', entity: entityId.value } }
  }))

  // --- Dialogs ---
  const editOpen = ref(false)
  const governanceOpen = ref(false)
  const moveOpen = ref(false)

  // Archive (DELETE /entities/{id}; F-004, F-021). With active children the server requires
  // cascade, so the admin acknowledges that the descendants go too. On an entity that is already
  // archived but kept its access (residualAccess) the same request finishes the job.
  const archiveEntity = useArchiveEntity()
  const cascadeAcknowledged = ref(false)
  const cascadeRequired = computed(() => archivePlan.value.activeChildren.length > 0)
  const archive = useConfirmAction<Entity>({
    describe: (e) => {
      const plan = archivePlan.value
      const members = activeMemberCount.value
      const effects = [
        members === 0
          ? 'It has no active memberships to archive.'
          : members != null
            ? `Its ${members} active ${members === 1 ? 'membership is' : 'memberships are'} archived: those members lose the roles they hold here and beneath it.`
            : 'Its memberships are archived: members lose the roles they hold here and beneath it.',
        'Role assignments scoped to this entity are revoked.',
        'API keys anchored to this entity are revoked and its service accounts are archived.'
      ]
      if (plan.archived.length) {
        const names = plan.archived.slice(0, 3).map(d => d.display_name).join(', ')
        const more = plan.archived.length > 3 ? ` and ${plan.archived.length - 3} more` : ''
        effects.push(`${plan.archived.length} active ${plan.archived.length === 1 ? 'entity' : 'entities'} beneath it ${plan.archived.length === 1 ? 'is' : 'are'} archived too, with the same effects: ${names}${more}.`)
      }
      if (plan.leftBehind.length) {
        effects.push(`${plan.leftBehind.length} inactive ${plan.leftBehind.length === 1 ? 'entity' : 'entities'} beneath it ${plan.leftBehind.length === 1 ? 'is' : 'are'} not archived (the server archives active ones only) and will show as detached.`)
      }
      effects.push('It leaves the hierarchy. It stays readable by direct link, and there is no restore.')
      const finishing = e.status === 'archived'
      return {
        title: finishing ? `Finish archiving ${e.display_name}` : `Archive ${e.display_name}`,
        description: finishing
          ? 'It is marked archived, but the access it grants was never revoked.'
          : 'Archiving retires the entity and revokes the access it grants.',
        effects,
        confirmLabel: finishing ? 'Finish archiving' : 'Archive entity',
        confirmText: e.slug
      }
    },
    action: e => archiveEntity.mutateAsync({ entityId: e.id, cascade: cascadeRequired.value && cascadeAcknowledged.value }),
    success: e => `${e.display_name} archived`,
    error: 'Could not archive entity',
    notFoundCodes: ['ENTITY_NOT_FOUND'],
    // Land on the parent instead of the archived record; an archived organisation leaves the
    // switcher too, so the tree falls back to another one.
    onSuccess: (_data, e) => {
      // Finishing an archive keeps the record in view, now without residual access.
      if (e.status === 'archived') return
      if (e.parent_entity_id) {
        void router.push(entityLink(e.parent_entity_id))
        return
      }
      const query: LocationQuery = { ...route.query }
      delete query.entity
      delete query.root
      void router.push({ query })
    }
  })
  function askArchive() {
    if (!entity.value) return
    cascadeAcknowledged.value = false
    archive.ask(entity.value)
  }
  const archiveBlocked = computed(() => cascadeRequired.value && !cascadeAcknowledged.value)

  // Navbar: Edit is the primary action; the rest sit in one menu, Archive last (principles).
  const actionItems = computed<DropdownMenuItem[][]>(() => {
    const primary: DropdownMenuItem[] = []
    const openGovernance = () => {
      governanceOpen.value = true
    }
    const openMove = () => {
      moveOpen.value = true
    }
    if (canUpdate.value) primary.push({ label: 'Governance', icon: 'i-lucide-shield-check', onSelect: openGovernance })
    if (canMove.value) primary.push({ label: 'Move', icon: 'i-lucide-move', onSelect: openMove })
    const groups = primary.length ? [primary] : []
    if (canArchive.value) groups.push([{ label: 'Archive', icon: 'i-lucide-archive', color: 'error', onSelect: askArchive }])
    return groups
  })

  function retry() {
    void refetch()
    if (pathStatus.value === 'error') void refetchPath()
    if (parentPathStatus.value === 'error') void refetchParentPath()
  }

  return {
    entity,
    detailStatus,
    detailError,
    notFound,
    outOfScope,
    scopeReady,
    retry,
    archived,
    residualAccess,
    residualAccessDescription,
    canFinishArchive,
    askArchive,
    isRoot,
    rootEntity,
    parentEntity,
    breadcrumb,
    closeTo,
    entityLink,
    overviewItems,
    validityState,
    governanceItems,
    namingSetByRoot,
    activeMemberCount,
    capacityPercent,
    atCapacity,
    children,
    descendants,
    subtreeStatus,
    subtreeError,
    refetchSubtree,
    organisationById,
    canReadMembers,
    canUpdate,
    canMove,
    canCreateChild,
    canOpenIntegrations,
    integrations,
    actionItems,
    editOpen,
    governanceOpen,
    moveOpen,
    archive,
    archivePlan,
    cascadeRequired,
    cascadeAcknowledged,
    archiveBlocked
  }
}
