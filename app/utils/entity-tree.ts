import type { Entity } from '~/types/entity'

// `detached`: the entity has a parent that is not in the list (archived, or outside what the
// actor may read). It is listed at the top level, flagged, never passed off as a root (F-022).
export type EntityTreeNode = Entity & { children: EntityTreeNode[], detached: boolean }

// Build a parent→child tree from the flat entity list. Entities whose parent isn't present are
// listed at the top level with `detached: true`. Sorted by display_name at every level.
export function buildEntityTree(entities: Entity[]): EntityTreeNode[] {
  const byId = new Map<string, EntityTreeNode>()
  for (const entity of entities) byId.set(entity.id, { ...entity, children: [], detached: false })

  const roots: EntityTreeNode[] = []
  for (const node of byId.values()) {
    const parent = node.parent_entity_id ? byId.get(node.parent_entity_id) : null
    if (parent) parent.children.push(node)
    else {
      node.detached = Boolean(node.parent_entity_id)
      roots.push(node)
    }
  }

  const sort = (nodes: EntityTreeNode[]) => {
    nodes.sort((a, b) => a.display_name.localeCompare(b.display_name))
    nodes.forEach(n => sort(n.children))
  }
  sort(roots)
  return roots
}

// Filter the tree to nodes matching `term` (display name / slug / type) PLUS their ancestors,
// so a deep match stays reachable. Returns the pruned tree and the ids that must be expanded
// to reveal the matches.
export function filterEntityTree(roots: EntityTreeNode[], term: string): { tree: EntityTreeNode[], expandedIds: string[] } {
  const query = term.trim().toLowerCase()
  if (!query) return { tree: roots, expandedIds: [] }

  const expandedIds: string[] = []
  const matches = (n: EntityTreeNode) => `${n.display_name} ${n.slug} ${n.entity_type}`.toLowerCase().includes(query)

  const walk = (nodes: EntityTreeNode[]): EntityTreeNode[] => {
    const out: EntityTreeNode[] = []
    for (const node of nodes) {
      const keptChildren = walk(node.children)
      if (matches(node) || keptChildren.length) {
        if (keptChildren.length) expandedIds.push(node.id)
        out.push({ ...node, children: keptChildren })
      }
    }
    return out
  }
  return { tree: walk(roots), expandedIds }
}

// --- Ancestry walks -------------------------------------------------------------------------
// The one implementation of "walk up the parent chain" (it used to be repeated in four
// composables). All walks are cycle-safe and stop at the first ancestor missing from `byId`.

export type EntityIndex = ReadonlyMap<string, Entity>

export function indexEntities(entities: Iterable<Entity>): Map<string, Entity> {
  const byId = new Map<string, Entity>()
  for (const entity of entities) byId.set(entity.id, entity)
  return byId
}

// Ancestors of `entityId`, root first, excluding the entity itself. Stops at the first parent
// not in the index, so a partial index yields a partial chain.
export function entityAncestors(entityId: string, byId: EntityIndex): Entity[] {
  const chain: Entity[] = []
  const seen = new Set<string>([entityId])
  let parentId = byId.get(entityId)?.parent_entity_id ?? null
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) break
    chain.unshift(parent)
    parentId = parent.parent_entity_id ?? null
  }
  return chain
}

// "ACME Realty / West Coast Region" — the ancestors' display names (excluding the entity).
export function entityPathLabel(entityId: string, byId: EntityIndex, separator = ' / '): string {
  return entityAncestors(entityId, byId).map(e => e.display_name).join(separator)
}

// Whether `entityId` is `ancestorId` or lies beneath it.
export function isInSubtree(entityId: string, ancestorId: string, byId: EntityIndex): boolean {
  return entityId === ancestorId || entityAncestors(entityId, byId).some(e => e.id === ancestorId)
}

// --- Subtrees, lifecycle and placement rules -------------------------------------------------
// Pure mirrors of the backend's hierarchy rules (services/entity.py), so dialogs only offer what
// the server accepts and state what a write will do. The server stays the final gate.

// Every entity beneath `entityId` (all depths, excluding the entity), cycle-safe.
export function entityDescendants(entityId: string, entities: Iterable<Entity>): Entity[] {
  const childrenOf = new Map<string, Entity[]>()
  for (const entity of entities) {
    if (!entity.parent_entity_id) continue
    const siblings = childrenOf.get(entity.parent_entity_id) ?? []
    siblings.push(entity)
    childrenOf.set(entity.parent_entity_id, siblings)
  }
  const out: Entity[] = []
  const seen = new Set<string>([entityId])
  const queue = [entityId]
  while (queue.length) {
    for (const child of childrenOf.get(queue.shift()!) ?? []) {
      if (seen.has(child.id)) continue
      seen.add(child.id)
      out.push(child)
      queue.push(child.id)
    }
  }
  return out
}

export type ArchivePlan = {
  // Active direct children: the server refuses to archive without cascade while any exist.
  activeChildren: Entity[]
  // Descendants a cascade archives with it: active ones reached through active parents only.
  archived: Entity[]
  // Descendants the cascade leaves as they are (inactive ones and everything beneath them).
  // They keep their parent link to an archived entity and show as detached afterwards.
  leftBehind: Entity[]
}

// What DELETE /entities/{id}?cascade=true archives: the server recurses into ACTIVE children
// only (services/entity.py delete_entity), so an inactive branch is not archived.
export function entityArchivePlan(entityId: string, entities: Iterable<Entity>): ArchivePlan {
  const all = [...entities].filter(e => e.status !== 'archived')
  const childrenOf = (id: string) => all.filter(e => e.parent_entity_id === id)
  const activeChildren = childrenOf(entityId).filter(e => e.status === 'active')
  const archived: Entity[] = []
  const seen = new Set<string>([entityId])
  const queue = [...activeChildren]
  while (queue.length) {
    const next = queue.shift()!
    if (seen.has(next.id)) continue
    seen.add(next.id)
    archived.push(next)
    queue.push(...childrenOf(next.id).filter(e => e.status === 'active'))
  }
  const archivedIds = new Set(archived.map(e => e.id))
  const leftBehind = entityDescendants(entityId, all).filter(e => !archivedIds.has(e.id))
  return { activeChildren, archived, leftBehind }
}

// The child types a parent accepts: its own list, else its root organisation's, else any ([]).
// The server applies the same priority (_get_allowed_child_types).
export function effectiveAllowedChildTypes(parent: Entity, byId: EntityIndex): string[] {
  if (parent.allowed_child_types?.length) return [...parent.allowed_child_types]
  const root = entityAncestors(parent.id, byId)[0]
  return root?.allowed_child_types?.length ? [...root.allowed_child_types] : []
}

// The entity whose list effectiveAllowedChildTypes applies (the parent's own, else its root
// organisation's), or null when no list applies.
export function allowedChildTypesOwner(parent: Entity, byId: EntityIndex): Entity | null {
  if (parent.allowed_child_types?.length) return parent
  const root = entityAncestors(parent.id, byId)[0]
  return root?.allowed_child_types?.length ? root : null
}

type ListOwner = Pick<Entity, 'display_name' | 'allowed_child_types'>

// What leaving an entity's "Allowed child types" empty means, for Create and Governance alike.
// The server falls back from an entity's own list to its root organisation's (never to anything
// in between), so a root's list also governs every descendant that sets none.
// - A root (existing, or being created): empty allows any type; a list cascades.
// - Anything beneath a root: empty means the root's list when it sets one, else any type.
export function allowedChildTypesHelp(input: { isRoot: boolean, root: ListOwner | null }): string {
  const enter = 'Press Enter after each type.'
  if (input.isRoot) return `Leave empty to allow any type. A list here also applies beneath every entity that sets no list of its own. ${enter}`
  const inherited = input.root?.allowed_child_types ?? []
  return inherited.length
    ? `Leave empty to use ${input.root!.display_name}'s list: ${inherited.join(', ')}. ${enter}`
    : `Leave empty to allow any type. ${enter}`
}

// The Type field's help when a list restricts what may be created under a parent.
export function enforcedTypesHelp(owner: Pick<Entity, 'display_name'> | null): string {
  return owner ? `Only these types are allowed here (set by ${owner.display_name}).` : 'Only these types are allowed here.'
}

// Why `entity` cannot go under `target` (null when the server would accept the placement as
// far as the loaded hierarchy tells). Used to filter move targets and parent pickers.
export function placementProblem(
  child: { id?: string, entity_class: Entity['entity_class'], entity_type: string },
  target: Entity,
  byId: EntityIndex
): string | null {
  if (target.status === 'archived') return 'Archived entities cannot hold children.'
  if (child.id && isInSubtree(target.id, child.id, byId)) return 'An entity cannot move under itself or its own descendants.'
  if (target.entity_class === 'access_group' && child.entity_class === 'structural') return 'Access groups cannot hold structural entities.'
  const allowed = effectiveAllowedChildTypes(target, byId)
  if (allowed.length && child.entity_type && !allowed.some(t => t.toLowerCase() === child.entity_type.toLowerCase())) {
    return `Accepts only: ${allowed.join(', ')}.`
  }
  return null
}

export type ValidityState = 'scheduled' | 'expired' | 'current'

// Where `now` falls in an entity's validity window (null when it has none).
export function entityValidityState(entity: Pick<Entity, 'valid_from' | 'valid_until'>, now: Date = new Date()): ValidityState | null {
  const from = entity.valid_from ? Date.parse(entity.valid_from) : Number.NaN
  const until = entity.valid_until ? Date.parse(entity.valid_until) : Number.NaN
  if (Number.isNaN(from) && Number.isNaN(until)) return null
  if (!Number.isNaN(from) && now.getTime() < from) return 'scheduled'
  if (!Number.isNaN(until) && now.getTime() > until) return 'expired'
  return 'current'
}
