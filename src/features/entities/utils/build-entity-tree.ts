import type { Entity } from '@/features/entities/types/entities.types'

export type EntityTreeNode = Entity & {
  children: EntityTreeNode[]
  depth: number
}

function sortNodes(nodes: EntityTreeNode[]) {
  nodes.sort((left, right) =>
    left.display_name.localeCompare(right.display_name)
  )

  for (const node of nodes) {
    sortNodes(node.children)
  }
}

export function buildEntityTree(entities: Entity[]) {
  const nodesById = new Map<string, EntityTreeNode>()

  for (const entity of entities) {
    nodesById.set(entity.id, {
      ...entity,
      children: [],
      depth: 0,
    })
  }

  const roots: EntityTreeNode[] = []

  for (const node of nodesById.values()) {
    const parentId = node.parent_entity_id ?? null
    const parentNode = parentId ? nodesById.get(parentId) : null

    if (!parentNode) {
      roots.push(node)
      continue
    }

    node.depth = parentNode.depth + 1
    parentNode.children.push(node)
  }

  sortNodes(roots)

  return roots
}

export function flattenEntityTree(nodes: EntityTreeNode[]) {
  const items: EntityTreeNode[] = []

  function visit(node: EntityTreeNode) {
    items.push(node)
    node.children.forEach(visit)
  }

  nodes.forEach(visit)

  return items
}

export function findEntityPath(nodes: EntityTreeNode[], entityId?: string | null) {
  if (!entityId) {
    return []
  }

  function walk(
    currentNodes: EntityTreeNode[],
    trail: EntityTreeNode[]
  ): EntityTreeNode[] | null {
    for (const node of currentNodes) {
      const nextTrail = [...trail, node]

      if (node.id === entityId) {
        return nextTrail
      }

      const childMatch = walk(node.children, nextTrail)

      if (childMatch) {
        return childMatch
      }
    }

    return null
  }

  return walk(nodes, []) ?? []
}

export function filterEntityTree(nodes: EntityTreeNode[], search: string) {
  const normalizedSearch = search.trim().toLowerCase()

  if (!normalizedSearch) {
    return nodes
  }

  function includeNode(node: EntityTreeNode): EntityTreeNode | null {
    const matchesSelf = [
      node.display_name,
      node.name,
      node.slug,
      node.entity_type,
      node.description ?? '',
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch)

    const matchingChildren = node.children
      .map(includeNode)
      .filter((value): value is EntityTreeNode => value !== null)

    if (!matchesSelf && matchingChildren.length === 0) {
      return null
    }

    return {
      ...node,
      children: matchingChildren,
    }
  }

  return nodes
    .map(includeNode)
    .filter((value): value is EntityTreeNode => value !== null)
}
