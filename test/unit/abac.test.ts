import { describe, expect, it } from 'vitest'
import {
  ATTRIBUTE_CONTEXTS,
  CONDITION_OPERATORS,
  conditionFormSchema,
  defaultValueType,
  groupFormSchema,
  OPERATOR_META,
  type ConditionFormState
} from '../../app/schemas/abac'
import {
  ABAC_UNGROUPED,
  abacConditionCreateBody,
  abacConditionFormState,
  abacConditionIssue,
  abacConditionPatch,
  abacConditionPayload,
  abacDeleteEffects,
  abacMoveDestinations,
  abacReadOnlyReason,
  abacValueDisplay,
  emptyAbacConditionForm,
  groupAbacConditions,
  parseAbacStoredValue
} from '../../app/utils/abac'
import type { AbacCondition, AbacConditionGroup } from '../../app/types/abac'

// The ConditionOperator enum from outlabs_auth/models/sql/enums.py (0.1.0a34).
const BACKEND_OPERATORS = [
  'equals', 'not_equals', 'less_than', 'less_than_or_equal', 'greater_than', 'greater_than_or_equal',
  'in', 'not_in', 'contains', 'not_contains', 'starts_with', 'ends_with', 'matches',
  'exists', 'not_exists', 'is_true', 'is_false', 'before', 'after'
]

function form(overrides: Partial<ConditionFormState> = {}): ConditionFormState {
  return { ...emptyAbacConditionForm(), path: 'department', text_value: 'sales', ...overrides }
}

// First message per field — what UFormField shows.
function issuesOf(state: ConditionFormState) {
  const result = conditionFormSchema.safeParse(state)
  const out: Record<string, string> = {}
  if (!result.success) {
    for (const issue of result.error.issues) out[issue.path.join('.')] ??= issue.message
  }
  return out
}

function condition(overrides: Partial<AbacCondition> = {}): AbacCondition {
  return { id: 'c1', attribute: 'resource.department', operator: 'equals', value: 'sales', value_type: 'string', description: null, condition_group_id: null, ...overrides }
}

describe('operator + context contract', () => {
  it('offers exactly the 19 backend operators', () => {
    expect([...CONDITION_OPERATORS]).toEqual(BACKEND_OPERATORS)
    expect(Object.keys(OPERATOR_META).sort()).toEqual([...BACKEND_OPERATORS].sort())
  })

  it('offers exactly the attribute contexts the write API accepts (no request.)', () => {
    expect([...ATTRIBUTE_CONTEXTS].sort()).toEqual(['env', 'resource', 'time', 'user'])
  })

  it('describes the fail-closed evaluation: a missing attribute is never false, a text one never lacks an item', () => {
    expect(OPERATOR_META.is_false.help).toMatch(/Fails when it is missing/)
    expect(OPERATOR_META.not_contains.help).toMatch(/Fails for text attributes and when the attribute is missing/)
  })

  it('forces list for in / not_in and numbers for comparisons', () => {
    expect(defaultValueType('in')).toBe('list')
    expect(defaultValueType('not_in')).toBe('list')
    expect(defaultValueType('less_than')).toBe('integer')
    expect(defaultValueType('is_true')).toBe('boolean')
    expect(defaultValueType('equals')).toBe('string')
  })
})

describe('conditionFormSchema', () => {
  it('accepts a valid equals condition', () => {
    expect(issuesOf(form())).toEqual({})
  })

  it('rejects an unknown operator and a missing context', () => {
    const issues = issuesOf(form({ operator: 'eq' as never, context: undefined }))
    expect(issues.operator).toBe('Choose an operator.')
    expect(issues.context).toBe('Choose where the attribute comes from.')
  })

  it('rejects malformed attribute paths', () => {
    expect(issuesOf(form({ path: '' })).path).toBe('Enter the attribute path.')
    expect(issuesOf(form({ path: 'a..b' })).path).toMatch(/dot-separated/)
    expect(issuesOf(form({ path: 'has space' })).path).toMatch(/dot-separated/)
    // Each key as the write API requires: a letter or _, then letters, digits, _ or -.
    expect(issuesOf(form({ path: '1st' })).path).toMatch(/dot-separated/)
    expect(issuesOf(form({ path: 'cost#center' })).path).toMatch(/dot-separated/)
    expect(issuesOf(form({ path: 'address.city' }))).toEqual({})
    expect(issuesOf(form({ path: '_meta.cost-center_2' }))).toEqual({})
  })

  it('requires a non-empty list for in / not_in', () => {
    expect(issuesOf(form({ operator: 'not_in', value_type: 'list', list_value: [] })).value).toBe('Add at least one value.')
    expect(issuesOf(form({ operator: 'not_in', value_type: 'list', list_value: ['west', 'east'] }))).toEqual({})
  })

  it('rejects a non-list value type for in', () => {
    expect(issuesOf(form({ operator: 'in', value_type: 'string', list_value: ['a'] })).value_type).toMatch(/list/)
  })

  it('checks numeric list items', () => {
    expect(issuesOf(form({ operator: 'in', value_type: 'list', list_item_type: 'number', list_value: ['1', 'x'] })).value).toBe('Every item must be a number.')
    expect(issuesOf(form({ operator: 'in', value_type: 'list', list_item_type: 'number', list_value: ['1', '2.5'] }))).toEqual({})
  })

  it('types scalar values by value_type', () => {
    expect(issuesOf(form({ value_type: 'integer', number_value: 1.5 })).value).toBe('Enter a whole number.')
    expect(issuesOf(form({ value_type: 'integer', number_value: null })).value).toBe('Enter a whole number.')
    expect(issuesOf(form({ value_type: 'integer', number_value: 3 }))).toEqual({})
    expect(issuesOf(form({ value_type: 'float', number_value: 2.5 }))).toEqual({})
    expect(issuesOf(form({ value_type: 'string', text_value: '  ' })).value).toBe('Enter a value.')
    expect(issuesOf(form({ value_type: 'boolean' }))).toEqual({})
  })

  it('restricts comparisons to numbers and text operators to strings', () => {
    expect(issuesOf(form({ operator: 'less_than', value_type: 'string' })).value_type).toMatch(/whole number or decimal number/)
    expect(issuesOf(form({ operator: 'starts_with', value_type: 'integer' })).value_type).toMatch(/text/)
  })

  it('needs no value for presence and boolean operators', () => {
    for (const operator of ['exists', 'not_exists', 'is_true', 'is_false'] as const) {
      expect(issuesOf(form({ operator, value_type: defaultValueType(operator), text_value: '' }))).toEqual({})
    }
  })

  it('requires a timezone-qualified ISO date-time for before / after', () => {
    expect(issuesOf(form({ operator: 'before', text_value: '2026-12-31' })).value).toMatch(/ISO 8601/)
    expect(issuesOf(form({ operator: 'before', text_value: '2026-12-31T17:00:00' })).value).toMatch(/ISO 8601/)
    expect(issuesOf(form({ operator: 'after', text_value: '2026-12-31T17:00:00Z' }))).toEqual({})
    expect(issuesOf(form({ operator: 'after', text_value: '2026-12-31T17:00:00+02:00' }))).toEqual({})
  })

  it('validates the group form', () => {
    expect(groupFormSchema.safeParse({ operator: 'OR', description: '' }).success).toBe(true)
    expect(groupFormSchema.safeParse({ operator: 'XOR', description: '' }).success).toBe(false)
  })
})

describe('request bodies', () => {
  it('sends not_in as a typed JSON array with value_type list', () => {
    const data = conditionFormSchema.parse(form({ operator: 'not_in', value_type: 'list', list_value: [' west', 'east '] }))
    expect(abacConditionPayload(data)).toMatchObject({ attribute: 'resource.department', operator: 'not_in', value_type: 'list', value: ['west', 'east'] })
  })

  it('sends numeric list items as numbers', () => {
    const data = conditionFormSchema.parse(form({ operator: 'in', value_type: 'list', list_item_type: 'number', list_value: ['1', '2.5'] }))
    expect(abacConditionPayload(data).value).toEqual([1, 2.5])
  })

  it('sends typed scalars and null for no-value operators', () => {
    expect(abacConditionPayload(conditionFormSchema.parse(form({ value_type: 'integer', number_value: 7 }))).value).toBe(7)
    expect(abacConditionPayload(conditionFormSchema.parse(form({ value_type: 'boolean', boolean_value: false }))).value).toBe(false)
    const exists = abacConditionPayload(conditionFormSchema.parse(form({ operator: 'exists', text_value: 'ignored' })))
    expect(exists.value).toBeNull()
  })

  it('maps the ungrouped sentinel to null and omits empty optionals on create', () => {
    const data = conditionFormSchema.parse(form({ group_id: ABAC_UNGROUPED, operator: 'exists' }))
    const body = abacConditionCreateBody(data)
    expect(body.condition_group_id).toBeNull()
    expect('value' in body).toBe(false)
    expect('description' in body).toBe(false)
  })
})

describe('stored values', () => {
  it('mirrors the engine value parser', () => {
    expect(parseAbacStoredValue('["west", "east"]', 'list')).toEqual({ ok: true, value: ['west', 'east'] })
    expect(parseAbacStoredValue('west,east', 'list')).toEqual({ ok: true, value: ['west,east'] })
    expect(parseAbacStoredValue('5', 'integer')).toEqual({ ok: true, value: 5 })
    expect(parseAbacStoredValue('high', 'integer').ok).toBe(false)
    expect(parseAbacStoredValue('1.5', 'integer').ok).toBe(false)
    expect(parseAbacStoredValue('True', 'boolean')).toEqual({ ok: true, value: true })
    expect(parseAbacStoredValue(null, 'string')).toEqual({ ok: true, value: null })
  })

  it('flags stored rows that break evaluation', () => {
    expect(abacConditionIssue(condition())).toBeNull()
    expect(abacConditionIssue(condition({ operator: 'eq' }))?.severity).toBe('error')
    expect(abacConditionIssue(condition({ attribute: 'department' }))?.severity).toBe('error')
    expect(abacConditionIssue(condition({ operator: 'in', value: 'a,b', value_type: 'string' }))?.severity).toBe('error')
    expect(abacConditionIssue(condition({ value: 'high', value_type: 'integer' }))?.severity).toBe('error')
    expect(abacConditionIssue(condition({ operator: 'not_in', value: 'west,east', value_type: 'list' }))?.severity).toBe('warning')
    // Evaluated fail-closed: not_in without a list never passes.
    expect(abacConditionIssue(condition({ operator: 'not_in', value: null, value_type: 'list' }))?.message).toMatch(/never passes/)
    expect(abacConditionIssue(condition({ attribute: 'request.origin' }))?.severity).toBe('error')
    expect(abacConditionIssue(condition({ operator: 'eq' }))?.message).toMatch(/never passes until it is fixed/)
    expect(abacConditionIssue(condition({ operator: 'is_true', value: null, value_type: 'boolean' }))).toBeNull()
  })

  it('renders values by type', () => {
    expect(abacValueDisplay(condition())).toEqual({ kind: 'text', text: 'sales', quoted: true })
    expect(abacValueDisplay(condition({ operator: 'in', value: '["a", 1]', value_type: 'list' }))).toEqual({ kind: 'list', items: ['a', '1'] })
    expect(abacValueDisplay(condition({ value: '17', value_type: 'integer', operator: 'less_than' }))).toEqual({ kind: 'text', text: '17', quoted: false })
    expect(abacValueDisplay(condition({ operator: 'is_true', value: null }))).toEqual({ kind: 'none' })
  })
})

describe('editing', () => {
  it('loads a stored list condition into form state', () => {
    const state = abacConditionFormState(condition({ operator: 'not_in', value: '["west", "east"]', value_type: 'list', condition_group_id: 'g1' }))
    expect(state).toMatchObject({ context: 'resource', path: 'department', operator: 'not_in', value_type: 'list', list_value: ['west', 'east'], list_item_type: 'string', group_id: 'g1' })
  })

  it('leaves malformed operator / context unset so they must be fixed', () => {
    const state = abacConditionFormState(condition({ operator: 'eq', attribute: 'department' }))
    expect(state.operator).toBeUndefined()
    expect(state.context).toBeUndefined()
    expect(state.path).toBe('department')
  })

  it('patches only changed fields, keeping operator/value/value_type together', () => {
    const original = condition()
    const unchanged = abacConditionPayload(conditionFormSchema.parse(abacConditionFormState(original)))
    expect(abacConditionPatch(original, unchanged)).toEqual({})

    const moved = { ...unchanged, condition_group_id: 'g2' }
    expect(abacConditionPatch(original, moved)).toEqual({ condition_group_id: 'g2' })

    const retyped = abacConditionPayload(conditionFormSchema.parse({ ...abacConditionFormState(original), operator: 'in', value_type: 'list', list_value: ['sales', 'ops'] }))
    expect(abacConditionPatch(original, retyped)).toEqual({ operator: 'in', value_type: 'list', value: ['sales', 'ops'] })
  })

  it('always rewrites the value of a flagged row, even when it reads back the same', () => {
    // A list stored as non-JSON text reads back as ['west'], exactly what the form sends.
    const original = condition({ operator: 'in', value: 'west', value_type: 'list' })
    const next = abacConditionPayload(conditionFormSchema.parse(abacConditionFormState(original)))
    expect(next.value).toEqual(['west'])
    expect(abacConditionPatch(original, next)).toEqual({ operator: 'in', value_type: 'list', value: ['west'] })

    // An "in" row stored as a string is loaded as a list; the fix is the value_type change.
    const mistyped = condition({ operator: 'in', value: 'west', value_type: 'string' })
    const fixed = abacConditionPayload(conditionFormSchema.parse(abacConditionFormState(mistyped)))
    expect(abacConditionPatch(mistyped, fixed)).toEqual({ operator: 'in', value_type: 'list', value: ['west'] })
  })

  it('treats an equivalent stored number as unchanged', () => {
    const original = condition({ operator: 'less_than', attribute: 'time.hour', value: '17', value_type: 'integer' })
    const next = abacConditionPayload(conditionFormSchema.parse(abacConditionFormState(original)))
    expect(abacConditionPatch(original, next)).toEqual({})
  })
})

describe('delete effects', () => {
  const orGroup: AbacConditionGroup = { id: 'or', operator: 'OR' }
  const andGroup: AbacConditionGroup = { id: 'and', operator: 'AND' }
  const groups = [andGroup, orGroup]
  const loosens = /will no longer need this condition to pass, so they may gain access they don't have today/

  it('says an ungrouped or AND-group condition loosens access', () => {
    const rows = [condition({ id: 'a' }), condition({ id: 'b', condition_group_id: 'and' }), condition({ id: 'c', condition_group_id: 'and' })]
    const ungrouped = abacDeleteEffects('permissions', { type: 'condition', condition: rows[0]! }, groups, rows)
    expect(ungrouped[0]).toMatch(/^Holders of this permission /)
    expect(ungrouped[0]).toMatch(loosens)
    expect(ungrouped).toContain('The condition is deleted permanently.')
    expect(abacDeleteEffects('roles', { type: 'condition', condition: rows[1]! }, groups, rows)[0]).toMatch(/^Holders of this role .*may gain access/)
  })

  it('says removing one of several OR alternatives tightens access', () => {
    const rows = [condition({ id: 'a', condition_group_id: 'or' }), condition({ id: 'b', condition_group_id: 'or' }), condition({ id: 'c', condition_group_id: 'or' })]
    const effects = abacDeleteEffects('permissions', { type: 'condition', condition: rows[0]! }, groups, rows)
    expect(effects[0]).toBe('Group 2 passes when any one of its conditions passes. Holders of this permission who meet only this condition in the group will lose access they have today.')
    expect(effects[1]).toBe('Holders who meet one of the other 2 conditions in Group 2 are not affected.')
    expect(effects.join(' ')).not.toMatch(/gain access/)
    const pair = abacDeleteEffects('permissions', { type: 'condition', condition: rows[0]! }, groups, rows.slice(0, 2))
    expect(pair[1]).toBe('Holders who meet the other condition in Group 2 are not affected.')
  })

  it('says deleting the last condition of an OR group empties it and loosens access', () => {
    const rows = [condition({ id: 'a', condition_group_id: 'or' }), condition({ id: 'b' })]
    const effects = abacDeleteEffects('permissions', { type: 'condition', condition: rows[0]! }, groups, rows)
    expect(effects[0]).toMatch(/last condition in Group 2, so the group will be empty, and an empty group does not restrict access/)
    expect(effects[1]).toMatch(loosens)
  })

  it('treats a condition whose group no longer exists as ungrouped', () => {
    const rows = [condition({ id: 'a', condition_group_id: 'gone' }), condition({ id: 'b', condition_group_id: 'gone' })]
    const effects = abacDeleteEffects('permissions', { type: 'condition', condition: rows[0]! }, groups, rows)
    expect(effects[0]).toMatch(loosens)
    expect(effects.join(' ')).not.toMatch(/lose access/)
  })

  it('states the cascade for a group and loosens access', () => {
    const rows = [condition({ id: 'a', condition_group_id: 'or' }), condition({ id: 'b', condition_group_id: 'or' }), condition({ id: 'c', condition_group_id: 'and' })]
    const or = abacDeleteEffects('roles', { type: 'group', group: orGroup }, groups, rows)
    expect(or).toEqual([
      'Its 2 conditions will be deleted with it.',
      'Holders of this role will no longer need any of these conditions to pass, so they may gain access they don\'t have today.',
      'The group and its conditions are deleted permanently.'
    ])
    const and = abacDeleteEffects('roles', { type: 'group', group: andGroup }, groups, rows)
    expect(and[0]).toBe('Its 1 condition will be deleted with it.')
    expect(and[1]).toMatch(/no longer need this condition to pass/)
    expect(abacDeleteEffects('roles', { type: 'group', group: andGroup }, groups, [])).toEqual(['This group has no conditions, so deleting it does not change access.'])
  })
})

describe('grouping, read-only and server errors', () => {
  it('arranges conditions as the engine evaluates them', () => {
    const groups = [{ id: 'g1', operator: 'OR' as const }]
    const rows = [condition({ id: 'a' }), condition({ id: 'b', condition_group_id: 'g1' }), condition({ id: 'c', condition_group_id: 'gone' })]
    const grouped = groupAbacConditions(groups, rows)
    expect(grouped.ungrouped.map(c => c.id)).toEqual(['a', 'c'])
    expect(grouped.groups[0]?.conditions.map(c => c.id)).toEqual(['b'])
  })

  it('offers every other destination, including Ungrouped for a condition whose group is gone', () => {
    const groups = [{ id: 'g1', operator: 'OR' as const }, { id: 'g2', operator: 'AND' as const }]
    expect(abacMoveDestinations(condition(), groups)).toEqual(['g1', 'g2'])
    expect(abacMoveDestinations(condition({ condition_group_id: 'g1' }), groups)).toEqual([null, 'g2'])
    expect(abacMoveDestinations(condition({ condition_group_id: 'gone' }), groups)).toEqual([null, 'g1', 'g2'])
  })

  it('explains why the editor is read-only', () => {
    expect(abacReadOnlyReason({ kind: 'permissions', isSystem: true, canUpdate: true })).toMatch(/system permission/)
    expect(abacReadOnlyReason({ kind: 'roles', isSystem: false, canUpdate: false })).toMatch(/role:update/)
    expect(abacReadOnlyReason({ kind: 'roles', isSystem: false, canUpdate: true })).toBeNull()
  })
})
