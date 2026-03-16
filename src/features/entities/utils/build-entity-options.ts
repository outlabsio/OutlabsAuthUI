import type { Entity } from '@/features/entities/types/entities.types'

export type EntityOption = {
  id: string
  title: string
  label: string
  pathLabel: string
  parentPathLabel: string
  entityTypeLabel: string
  entityClassLabel: string
  isTopLevel: boolean
}

function formatEntityToken(value: string) {
  return value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function buildEntityOptions(entities: Entity[]) {
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]))

  function getAncestors(entity: Entity) {
    const ancestors: Entity[] = []
    let currentParentId = entity.parent_entity_id ?? null

    while (currentParentId) {
      const parent = entitiesById.get(currentParentId)

      if (!parent) {
        break
      }

      ancestors.unshift(parent)
      currentParentId = parent.parent_entity_id ?? null
    }

    return ancestors
  }

  return entities
    .map((entity) => {
      const ancestors = getAncestors(entity)
      const depth = ancestors.length
      const path = [...ancestors.map((ancestor) => ancestor.display_name), entity.display_name]

      return {
        id: entity.id,
        title: entity.display_name,
        label: `${'  '.repeat(depth)}${entity.display_name}`,
        pathLabel: path.join(' / '),
        parentPathLabel:
          ancestors.length > 0
            ? ancestors.map((ancestor) => ancestor.display_name).join(' / ')
            : 'Top-level entity',
        entityTypeLabel: formatEntityToken(entity.entity_type),
        entityClassLabel: formatEntityToken(entity.entity_class),
        isTopLevel: ancestors.length === 0,
      } satisfies EntityOption
    })
    .sort((left, right) => left.pathLabel.localeCompare(right.pathLabel))
}
