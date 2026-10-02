import type { Entity, EntityClassValue } from '~/types/entity'
import { entityPathLabel, isInSubtree, type EntityIndex } from '~/utils/entity-tree'

// The options AppEntityPicker lists (pure; the data comes from useEntityPicker). Unit-tested in
// test/unit/entity-picker.test.ts.
//
// The bound value is never dropped: USelectMenu names its trigger from the items, so a selection
// missing from them would show its raw id. When a filter excludes the selected entity, it stays
// listed, disabled, with the reason first in its description; when it is not among the
// candidates at all (outside the scope, or no longer readable), a disabled placeholder names it
// "Unavailable entity" once the caller knows it will not arrive.

export type EntityPickerItem = {
  label: string
  value: string
  description: string
  icon: string
  disabled?: boolean
}

// `value` is declared (never set) so USelectMenu's value-key typing sees it on every item.
export type EntityPickerGroupLabel = { type: 'label', label: string, value?: undefined }

export type EntityPickerRules = {
  entityClass?: EntityClassValue | null
  allowedTypes?: readonly string[] | null
  excludeIds?: readonly string[] | null
  excludeSubtreeOf?: string | null
  // Offer inactive entities (listed but disabled otherwise). Archived entities are never offered.
  includeInactive?: boolean
  // The bound value, kept in the list (see above).
  selectedId?: string | null
  // List a placeholder for a selected id that is not among the candidates (the caller sets it
  // once its data has settled, so a selection still loading is not called unavailable).
  placeholderForUnknown?: boolean
}

export const ENTITY_CLASS_ICON: Record<EntityClassValue, string> = {
  structural: 'i-lucide-building-2',
  access_group: 'i-lucide-users'
}

const CLASS_PLURAL: Record<EntityClassValue, string> = {
  structural: 'Structural entities',
  access_group: 'Access groups'
}

export const UNAVAILABLE_ENTITY_LABEL = 'Unavailable entity'

// Why a filter keeps `entity` out of the options, or null when it is offered.
export function entityPickerExclusion(entity: Entity, rules: EntityPickerRules, byId: EntityIndex): string | null {
  if (entity.status === 'archived') return 'Archived'
  if (rules.entityClass && entity.entity_class !== rules.entityClass) return `${CLASS_PLURAL[entity.entity_class] ?? 'Entities of this class'} are not allowed here`
  if (rules.allowedTypes && !rules.allowedTypes.includes(entity.entity_type)) return `Type ${entity.entity_type} is not allowed here`
  if (rules.excludeIds?.includes(entity.id)) return 'Not available here'
  if (rules.excludeSubtreeOf && isInSubtree(entity.id, rules.excludeSubtreeOf, byId)) return 'Not available here'
  return null
}

// One group per organisation (headed by its name when there is more than one), sorted by path.
export function entityPickerItems(candidates: readonly Entity[], byId: EntityIndex, rules: EntityPickerRules = {}): (EntityPickerItem | EntityPickerGroupLabel)[][] {
  const selectedId = rules.selectedId || null
  const includeInactive = rules.includeInactive ?? false

  const options = candidates.flatMap((e) => {
    const excluded = entityPickerExclusion(e, rules, byId)
    if (excluded && e.id !== selectedId) return []
    const path = entityPathLabel(e.id, byId)
    const inactive = e.status !== 'active'
    const rootName = path.split(' / ')[0] || e.display_name
    // The reason (or "Inactive") leads, so it is not the part a long path truncates.
    const note = excluded ?? (inactive ? 'Inactive' : '')
    return [{
      rootName,
      sortKey: `${path} / ${e.display_name}`.toLowerCase(),
      item: {
        label: e.display_name,
        value: e.id,
        description: [note, path, e.entity_type].filter(Boolean).join(' · '),
        icon: ENTITY_CLASS_ICON[e.entity_class] ?? ENTITY_CLASS_ICON.structural,
        disabled: Boolean(excluded) || (inactive && !includeInactive)
      } satisfies EntityPickerItem
    }]
  }).sort((a, b) => a.sortKey.localeCompare(b.sortKey))

  const groups = new Map<string, EntityPickerItem[]>()
  for (const option of options) {
    const group = groups.get(option.rootName) ?? []
    group.push(option.item)
    groups.set(option.rootName, group)
  }
  const grouped: (EntityPickerItem | EntityPickerGroupLabel)[][] = groups.size <= 1
    ? [[...groups.values()].flat()]
    : [...groups.entries()].map(([root, group]) => [{ type: 'label', label: root } as EntityPickerGroupLabel, ...group])

  if (selectedId && rules.placeholderForUnknown && !candidates.some(e => e.id === selectedId)) {
    const placeholder: EntityPickerItem = {
      label: UNAVAILABLE_ENTITY_LABEL,
      value: selectedId,
      description: 'Not among the entities you can choose here',
      icon: 'i-lucide-circle-help',
      disabled: true
    }
    return grouped.length === 1 && !grouped[0]!.length ? [[placeholder]] : [[placeholder], ...grouped]
  }
  return grouped
}
