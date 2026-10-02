import { describe, expect, it } from 'vitest'
import {
  entityAncestors,
  entityPathLabel,
  indexEntities,
  isInSubtree
} from '~/utils/entity-tree'
import type { Entity } from '~/types/entity'

function entity(id: string, displayName: string, parent: string | null = null): Entity {
  return {
    id,
    name: id,
    display_name: displayName,
    slug: id,
    entity_class: 'structural',
    entity_type: 'office',
    parent_entity_id: parent,
    status: 'active'
  } as Entity
}

const acme = entity('acme', 'ACME Realty')
const west = entity('west', 'West Coast', 'acme')
const sf = entity('sf', 'SF Office', 'west')
const team = entity('team', 'SF Team', 'sf')
const summit = entity('summit', 'Summit')
const byId = indexEntities([acme, west, sf, team, summit])

describe('entity ancestry', () => {
  it('lists ancestors root first', () => {
    expect(entityAncestors('team', byId).map(e => e.id)).toEqual(['acme', 'west', 'sf'])
    expect(entityAncestors('acme', byId)).toEqual([])
    expect(entityAncestors('missing', byId)).toEqual([])
  })

  it('builds a path label', () => {
    expect(entityPathLabel('team', byId)).toBe('ACME Realty / West Coast / SF Office')
    expect(entityPathLabel('acme', byId)).toBe('')
  })

  it('checks subtree membership', () => {
    expect(isInSubtree('team', 'west', byId)).toBe(true)
    expect(isInSubtree('west', 'west', byId)).toBe(true)
    expect(isInSubtree('summit', 'acme', byId)).toBe(false)
  })

  it('stops at a missing ancestor', () => {
    const partial = indexEntities([sf, team])
    expect(entityAncestors('team', partial).map(e => e.id)).toEqual(['sf'])
  })

  it('survives a parent cycle', () => {
    const a = entity('a', 'A', 'b')
    const b = entity('b', 'B', 'a')
    const cyclic = indexEntities([a, b])
    expect(entityAncestors('a', cyclic).map(e => e.id)).toEqual(['b'])
  })
})
