import type { Entity } from '~/types/entity'

export type EntityTreeNode = Entity & { children: EntityTreeNode[] }

// Build a parent→child tree from the flat entity list. Entities whose parent isn't present
// become roots (orphans). Sorted by display_name at every level. Mirrors the React
// buildEntityTree util.
export function buildEntityTree(entities: Entity[]): EntityTreeNode[] {
  const byId = new Map<string, EntityTreeNode>()
  for (const entity of entities) byId.set(entity.id, { ...entity, children: [] })

  const roots: EntityTreeNode[] = []
  for (const node of byId.values()) {
    const parent = node.parent_entity_id ? byId.get(node.parent_entity_id) : null
    if (parent) parent.children.push(node)
    else roots.push(node)
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
