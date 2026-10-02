import { describe, expect, it } from 'vitest'
import {
  allowedChildTypesHelp,
  allowedChildTypesOwner,
  buildEntityTree,
  effectiveAllowedChildTypes,
  enforcedTypesHelp,
  entityArchivePlan,
  entityDescendants,
  entityValidityState,
  indexEntities,
  placementProblem
} from '~/utils/entity-tree'
import {
  breaksPattern,
  createEntitySchema,
  editEntitySchema,
  governanceSchemaFor,
  hasPythonOnlySyntax,
  isPortablePattern,
  isValidPattern,
  moveEntitySchema,
  patternFieldHelp,
  slugFrom,
  systemNameFrom
} from '~/schemas/entity'
import { entityTypeBadge } from '~/utils/status'
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

// root ─┬─ a ─┬─ a1
//       │     └─ a2 (inactive) ── a2x (active, under an inactive parent)
//       ├─ b (access group)
//       └─ c (archived)
const org = [
  entity('root', null, { entity_type: 'organization', allowed_child_types: ['region', 'team'] }),
  entity('a', 'root', { entity_type: 'region' }),
  entity('a1', 'a'),
  entity('a2', 'a', { status: 'inactive' }),
  entity('a2x', 'a2'),
  entity('b', 'root', { entity_class: 'access_group', entity_type: 'team' }),
  entity('c', 'root', { status: 'archived' })
]
const byId = indexEntities(org)

describe('entity tree (F-022)', () => {
  it('flags a node whose parent is missing as detached instead of passing it off as a root', () => {
    const tree = buildEntityTree([entity('root', null), entity('orphan', 'gone'), entity('kid', 'root')])
    expect(tree.map(n => [n.id, n.detached])).toEqual([['orphan', true], ['root', false]])
    expect(tree.find(n => n.id === 'root')!.children.map(n => n.id)).toEqual(['kid'])
  })

  it('lists every descendant, cycle-safe', () => {
    expect(entityDescendants('a', org).map(e => e.id).sort()).toEqual(['a1', 'a2', 'a2x'])
    const cyclic = [entity('x', 'y'), entity('y', 'x')]
    expect(entityDescendants('x', cyclic).map(e => e.id)).toEqual(['y'])
  })
})

describe('archive plan (F-004, F-021)', () => {
  it('cascades through active children only, like DELETE /entities/{id}?cascade=true', () => {
    const plan = entityArchivePlan('a', org)
    expect(plan.activeChildren.map(e => e.id)).toEqual(['a1'])
    expect(plan.archived.map(e => e.id)).toEqual(['a1'])
    // The inactive branch is left behind, including the active entity beneath it.
    expect(plan.leftBehind.map(e => e.id).sort()).toEqual(['a2', 'a2x'])
  })

  it('needs no cascade without active children, and ignores archived ones', () => {
    expect(entityArchivePlan('a1', org)).toEqual({ activeChildren: [], archived: [], leftBehind: [] })
    expect(entityArchivePlan('root', org).archived.map(e => e.id).sort()).toEqual(['a', 'a1', 'b'])
  })
})

describe('placement rules (F-073, F-076)', () => {
  it('uses the parent\'s own child types, else its root organisation\'s, else any', () => {
    expect(effectiveAllowedChildTypes(byId.get('root')!, byId)).toEqual(['region', 'team'])
    expect(effectiveAllowedChildTypes(byId.get('a')!, byId)).toEqual(['region', 'team'])
    const own = entity('own', 'root', { allowed_child_types: ['desk'] })
    expect(effectiveAllowedChildTypes(own, indexEntities([...org, own]))).toEqual(['desk'])
    expect(effectiveAllowedChildTypes(entity('free', null), indexEntities([entity('free', null)]))).toEqual([])
  })

  it('names whose list applies, and says what an empty list means on a root and beneath it (v-access-02)', () => {
    expect(allowedChildTypesOwner(byId.get('a')!, byId)?.id).toBe('root')
    const own = entity('own', 'root', { allowed_child_types: ['desk'] })
    expect(allowedChildTypesOwner(own, indexEntities([...org, own]))?.id).toBe('own')
    expect(allowedChildTypesOwner(entity('free', null), indexEntities([entity('free', null)]))).toBeNull()
    expect(enforcedTypesHelp(byId.get('root')!)).toBe('Only these types are allowed here (set by ROOT).')

    // Beneath a root that sets a list: empty means the root's list, not any type.
    expect(allowedChildTypesHelp({ isRoot: false, root: byId.get('root')! })).toBe('Leave empty to use ROOT\'s list: region, team. Press Enter after each type.')
    expect(allowedChildTypesHelp({ isRoot: false, root: entity('bare', null) })).toBe('Leave empty to allow any type. Press Enter after each type.')
    // On a root (existing or new): the list cascades to every descendant without its own.
    expect(allowedChildTypesHelp({ isRoot: true, root: null })).toMatch(/^Leave empty to allow any type\. A list here also applies beneath every entity that sets no list of its own\./)
  })

  it('refuses its own branch, access groups for structural entities, other types and archived parents', () => {
    const moving = byId.get('a')!
    expect(placementProblem(moving, byId.get('a1')!, byId)).toMatch(/own descendants/)
    expect(placementProblem(moving, moving, byId)).toMatch(/own descendants/)
    expect(placementProblem(moving, byId.get('b')!, byId)).toMatch(/Access groups/)
    expect(placementProblem(moving, byId.get('c')!, byId)).toMatch(/Archived/)
    // a1 accepts the root's types (region, team): an office cannot go there, a region can.
    expect(placementProblem(entity('n', null, { entity_type: 'office' }), byId.get('a1')!, byId)).toBe('Accepts only: region, team.')
    expect(placementProblem(entity('n', null, { entity_type: 'Region' }), byId.get('a1')!, byId)).toBeNull()
    // An access group may sit under an access group.
    expect(placementProblem(entity('g', null, { entity_class: 'access_group', entity_type: 'team' }), byId.get('b')!, byId)).toBeNull()
  })
})

describe('entity badges (v-access-05)', () => {
  it('draws an entity type as one neutral badge everywhere (tree, detail, Children table)', () => {
    expect(entityTypeBadge('team')).toEqual({ color: 'neutral', variant: 'subtle', label: 'team' })
  })
})

describe('validity state (F-078)', () => {
  const now = new Date('2026-06-15T12:00:00Z')
  it.each([
    [null, null, null],
    ['2026-07-01T00:00:00Z', null, 'scheduled'],
    [null, '2026-06-01T00:00:00Z', 'expired'],
    ['2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z', 'current']
  ] as const)('from=%s until=%s -> %s', (from, until, expected) => {
    expect(entityValidityState({ valid_from: from, valid_until: until }, now)).toBe(expected)
  })
})

describe('entity form schemas', () => {
  const base = {
    parentId: 'root',
    entityClass: 'structural' as const,
    entityType: 'region',
    displayName: 'West Coast',
    name: 'west_coast',
    slug: 'west-coast',
    description: '',
    status: 'active' as const,
    validFrom: '',
    validUntil: '',
    allowedChildClasses: [],
    allowedChildTypes: [],
    maxMembers: null,
    childNamePattern: '',
    childDisplayNamePattern: '',
    childSlugPattern: '',
    childNamingGuidance: ''
  }

  it('derives the slug and system name from the display name', () => {
    expect(slugFrom('  ACME — West Coast Región ')).toBe('acme-west-coast-region')
    expect(systemNameFrom('ACME West Coast')).toBe('acme_west_coast')
  })

  it('matches portable naming patterns in full, like Python re.fullmatch', () => {
    expect(breaksPattern('abc', '[a-z]+')).toBe(false)
    expect(breaksPattern('abc1', '[a-z]+')).toBe(true)
    expect(breaksPattern('xabc', 'abc|x')).toBe(true)
    expect(breaksPattern('ab', 'a|ab')).toBe(false)
  })

  // v-access-03: the server's Python re is the authority; the console blocks only what it can
  // match faithfully.
  it('leaves Python-only patterns to the server instead of blocking valid names', () => {
    // Inline flags, \A…\Z anchors and named groups: valid in Python, refused or misread by RegExp.
    for (const pattern of ['(?i)[a-z]+', '(?i:[a-z]+)', '\\A[a-z]+\\Z', '(?P<x>[a-z]+)', '(?P<x>a)(?P=x)', '[]a]+', '(?#note)[a-z]+', 'a{,3}']) {
      expect(isPortablePattern(pattern), pattern).toBe(false)
      expect(breaksPattern('Abc', pattern), pattern).toBe(false)
    }
    // \A in JavaScript's loose mode is a literal A, so a naive check would refuse every name.
    expect(breaksPattern('abc', '\\A[a-z]+\\Z')).toBe(false)
    // Unicode-sensitive classes: Python's \w matches accented letters, JavaScript's does not.
    expect(breaksPattern('Región', '\\w+')).toBe(false)
    expect(breaksPattern('Región sur', '[A-Z][a-zó ]+')).toBe(false)
    expect(breaksPattern('Región Sur', '[A-Z][a-zó ]+')).toBe(true)
    // An escaped backslash is not an anchor.
    expect(hasPythonOnlySyntax('\\\\A')).toBe(false)
    expect(hasPythonOnlySyntax('(?:x)(?=y)(?!z)(?<=w)')).toBe(false)
  })

  it('accepts Python-only patterns as valid (with a hint) and refuses only what both engines reject', () => {
    for (const pattern of ['(?i)[a-z]+', '\\A[a-z]+\\Z', '(?P<x>[a-z]+)', 'a++']) {
      expect(isValidPattern(pattern), pattern).toBe(true)
      expect(patternFieldHelp(pattern), pattern).toMatch(/server checks it/)
    }
    expect(isValidPattern('([a-z]')).toBe(false)
    expect(isValidPattern('[a-')).toBe(false)
    expect(patternFieldHelp('[a-z]+')).toBeUndefined()
    // The create dialog never blocks a child over a Python-only root rule.
    const schema = createEntitySchema({ name: '(?i)[a-z_]+', displayName: '\\A[A-Z].*\\Z', slug: '(?P<s>[a-z-]+)' })
    expect(schema.safeParse({ ...base, name: 'West_coast', displayName: 'West Coast', slug: 'west-coast' }).success).toBe(true)
  })

  it('requires a parent for a child and checks the root\'s naming rules on the fields', () => {
    expect(createEntitySchema().safeParse(base).success).toBe(true)
    const noParent = createEntitySchema().safeParse({ ...base, parentId: '' })
    expect(noParent.error?.issues.map(i => i.path.join('.'))).toEqual(['parentId'])
    expect(createEntitySchema({}, { requireParent: false }).safeParse({ ...base, parentId: '' }).success).toBe(true)

    const named = createEntitySchema({ displayName: '[A-Z].*', slug: '[a-z-]+' }).safeParse({ ...base, displayName: 'west coast', slug: 'west_coast' })
    expect(named.error?.issues.map(i => i.path.join('.')).sort()).toEqual(['displayName', 'slug'])
  })

  it('mirrors the API limits and refuses an invalid pattern or member cap', () => {
    const result = createEntitySchema().safeParse({ ...base, entityType: 'x'.repeat(51), childSlugPattern: '[a-', maxMembers: 0 })
    expect(result.error?.issues.map(i => i.path.join('.')).sort()).toEqual(['childSlugPattern', 'entityType', 'maxMembers'])
    expect(governanceSchemaFor().safeParse({ ...base, maxMembers: 2.5 }).success).toBe(false)
  })

  it('Governance checks only the patterns the admin changed', () => {
    // A stored pattern the console cannot compile never blocks another change (Max members).
    const stored = { ...base, childNamePattern: '[a-', maxMembers: 5 }
    expect(governanceSchemaFor([]).safeParse(stored).success).toBe(true)
    const changed = governanceSchemaFor(['childNamePattern']).safeParse(stored)
    expect(changed.error?.issues.map(i => i.path.join('.'))).toEqual(['childNamePattern'])
  })

  it('edit offers active and inactive only (archiving is its own action)', () => {
    const edit = { displayName: 'X', description: '', status: 'archived', validFrom: '', validUntil: '' }
    expect(editEntitySchema.safeParse(edit).success).toBe(false)
    expect(editEntitySchema.safeParse({ ...edit, status: 'inactive' }).success).toBe(true)
    expect(editEntitySchema.safeParse({ ...edit, displayName: '  ' }).success).toBe(false)
  })

  it('move needs a parent unless it goes to the top level', () => {
    expect(moveEntitySchema.safeParse({ destination: 'parent', parentId: '' }).success).toBe(false)
    expect(moveEntitySchema.safeParse({ destination: 'top', parentId: '' }).success).toBe(true)
  })
})
