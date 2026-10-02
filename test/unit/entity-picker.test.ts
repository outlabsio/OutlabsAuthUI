import { describe, expect, it } from 'vitest'
import { entityPickerItems, UNAVAILABLE_ENTITY_LABEL, type EntityPickerGroupLabel, type EntityPickerItem } from '~/utils/entity-picker'
import { indexEntities } from '~/utils/entity-tree'
import type { Entity } from '~/types/entity'

function entity(id: string, parent: string | null, extra: Partial<Entity> = {}): Entity {
  return {
    id,
    name: id,
    display_name: id.toUpperCase(),
    slug: id,
    description: null,
    entity_class: 'structural',
    entity_type: 'office',
    parent_entity_id: parent,
    status: 'active',
    valid_from: null,
    valid_until: null,
    allowed_child_classes: [],
    allowed_child_types: [],
    max_members: null,
    child_name_pattern: null,
    child_display_name_pattern: null,
    child_slug_pattern: null,
    child_naming_guidance: null,
    ...extra
  } as Entity
}

// acme ─┬─ west ── team (access group)
//       └─ old (archived)
const org = [
  entity('acme', null, { entity_type: 'organization' }),
  entity('west', 'acme', { entity_type: 'region' }),
  entity('team', 'west', { entity_class: 'access_group', entity_type: 'team' }),
  entity('old', 'acme', { status: 'archived' })
]
const byId = indexEntities(org)

const options = (groups: (EntityPickerItem | EntityPickerGroupLabel)[][]) =>
  groups.flat().filter((item): item is EntityPickerItem => !('type' in item))

describe('entity picker options (F-072)', () => {
  it('lists what the filters allow, with the path, and never archived entities', () => {
    const items = options(entityPickerItems(org, byId, { entityClass: 'structural' }))
    expect(items.map(i => i.value)).toEqual(['acme', 'west'])
    expect(items.find(i => i.value === 'west')).toMatchObject({ label: 'WEST', description: 'ACME · region', disabled: false })
  })

  // v-access-01: the bound value stays listed, so the trigger names it instead of its raw id.
  it('keeps the selected entity when a filter excludes it, disabled with the reason first', () => {
    const items = options(entityPickerItems(org, byId, { entityClass: 'structural', selectedId: 'team' }))
    expect(items.find(i => i.value === 'team')).toMatchObject({
      label: 'TEAM',
      description: 'Access groups are not allowed here · ACME / WEST · team',
      disabled: true
    })
    expect(options(entityPickerItems(org, byId, { selectedId: 'old' })).find(i => i.value === 'old')).toMatchObject({ description: 'Archived · ACME · office', disabled: true })
    expect(options(entityPickerItems(org, byId, { allowedTypes: ['region'], selectedId: 'acme' })).find(i => i.value === 'acme')?.description).toBe('Type organization is not allowed here · organization')
    expect(options(entityPickerItems(org, byId, { excludeSubtreeOf: 'west', selectedId: 'team' })).find(i => i.value === 'team')?.disabled).toBe(true)
    // Not selected: excluded entities stay out.
    expect(options(entityPickerItems(org, byId, { entityClass: 'structural', selectedId: 'west' })).map(i => i.value)).toEqual(['acme', 'west'])
  })

  it('names a selection that is not among the candidates once the caller says it will not arrive', () => {
    const loading = options(entityPickerItems(org, byId, { selectedId: 'foreign' }))
    expect(loading.some(i => i.value === 'foreign')).toBe(false)
    const settled = entityPickerItems(org, byId, { selectedId: 'foreign', placeholderForUnknown: true })
    expect(settled[0]).toEqual([expect.objectContaining({ label: UNAVAILABLE_ENTITY_LABEL, value: 'foreign', disabled: true })])
    // A known selection never gets the placeholder.
    expect(options(entityPickerItems(org, byId, { selectedId: 'west', placeholderForUnknown: true })).some(i => i.label === UNAVAILABLE_ENTITY_LABEL)).toBe(false)
  })

  it('groups by organization when more than one is listed', () => {
    const other = entity('summit', null, { entity_type: 'organization' })
    const all = [...org, other]
    const groups = entityPickerItems(all, indexEntities(all))
    expect(groups.map(group => (group[0] as EntityPickerGroupLabel).label)).toEqual(['ACME', 'SUMMIT'])
  })
})
