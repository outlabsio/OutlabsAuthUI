import { describe, expect, it } from 'vitest'
import type { DefinitionHistoryEvent } from '../../app/types/definition-history'
import {
  conditionText,
  definitionEventLabel,
  definitionFieldChanges,
  definitionHistoryView,
  definitionValueText
} from '../../app/utils/definition-history'

// How the role and permission History cards read outlabs-auth 0.1.0a35 definition events
// (services/role.py and services/permission.py history writers).

function event(overrides: Partial<DefinitionHistoryEvent>): DefinitionHistoryEvent {
  return {
    id: 'e1',
    definition_kind: 'role',
    definition_id: 'r1',
    event_type: 'updated',
    event_source: 'role_service.update_role',
    occurred_at: '2026-10-03T10:00:00Z',
    actor_user_id: null,
    name: 'probe',
    display_name: 'Probe',
    status: 'active',
    permission_names: [],
    before: null,
    after: null,
    metadata: null,
    ...overrides
  }
}

const roleSnapshot = (overrides: Record<string, unknown> = {}) => ({
  role_name: 'probe',
  role_display_name: 'Probe',
  role_description: 'probe',
  is_system_role: false,
  is_global: true,
  status: 'active',
  root_entity_id: null,
  root_entity_name: null,
  scope_entity_id: null,
  scope_entity_name: null,
  scope: 'hierarchy',
  is_auto_assigned: false,
  assignable_at_types: [],
  permission_names: ['user:read'],
  conditions: [],
  condition_groups: [],
  ...overrides
})

describe('event labels', () => {
  it('names every event type the backend records, and humanizes an unknown one', () => {
    expect(definitionEventLabel('created')).toBe('Created')
    expect(definitionEventLabel('deleted')).toBe('Archived')
    expect(definitionEventLabel('permissions_replaced')).toBe('Permissions changed')
    expect(definitionEventLabel('entity_type_permissions_replaced')).toBe('Entity-type permissions changed')
    expect(definitionEventLabel('condition_group_deleted')).toBe('Condition group removed')
    expect(definitionEventLabel('policy_imported')).toBe('Policy imported')
  })
})

describe('updated events', () => {
  it('pairs each changed field with its before and after values', () => {
    const changes = definitionFieldChanges(event({
      before: roleSnapshot(),
      after: roleSnapshot({ role_display_name: 'Probe 2', assignable_at_types: ['team', 'branch'], status: 'inactive', is_auto_assigned: true }),
      metadata: { changed_fields: ['role_display_name', 'assignable_at_types', 'status', 'is_auto_assigned'] }
    }))
    expect(changes).toEqual([
      { label: 'Display name', from: 'Probe', to: 'Probe 2' },
      { label: 'Assignable at', from: 'none', to: 'team, branch' },
      { label: 'Status', from: 'Active', to: 'Inactive' },
      { label: 'Auto-assigned', from: 'no', to: 'yes' }
    ])
  })

  it('says an id changed only through its name, and lists of objects without their values', () => {
    const changes = definitionFieldChanges(event({
      before: roleSnapshot({ scope: 'hierarchy', scope_entity_id: 'a', scope_entity_name: 'Office A' }),
      after: roleSnapshot({ scope: 'entity_only', scope_entity_id: 'b', scope_entity_name: 'Office B' }),
      metadata: { changed_fields: ['scope_entity_id', 'scope_entity_name', 'scope', 'root_entity_id', 'conditions'] }
    }))
    expect(changes).toEqual([
      { label: 'Defined at', from: 'Office A', to: 'Office B' },
      { label: 'Applies to', from: 'Entity and below', to: 'Entity only' },
      { label: 'Organization' },
      { label: 'Conditions' }
    ])
  })

  it('reads permission fields and clips long text', () => {
    const long = 'x'.repeat(200)
    const changes = definitionFieldChanges(event({
      definition_kind: 'permission',
      before: { permission_description: '', tag_names: ['a'] },
      after: { permission_description: long, tag_names: ['a', 'b'] },
      metadata: { changed_fields: ['permission_description', 'tag_names'] }
    }))
    expect(changes[0]).toEqual({ label: 'Description', from: 'none', to: `${'x'.repeat(119)}…` })
    expect(changes[1]).toEqual({ label: 'Tags', from: 'a', to: 'a, b' })
    // Permissions have no "Applies to": their scope is shown as stored.
    expect(definitionValueText('scope', 'tree', 'permission')).toBe('tree')
  })

  it('reads nothing from an event without changed fields', () => {
    expect(definitionFieldChanges(event({ metadata: null }))).toEqual([])
  })
})

describe('event views', () => {
  it('lists a new role\'s permissions', () => {
    const view = definitionHistoryView(event({ event_type: 'created', permission_names: ['user:read', 'entity:read'] }))
    expect(view).toMatchObject({ title: 'Created', permissions: ['entity:read', 'user:read'], changes: [], added: [], removed: [] })
    // A permission has no permission list.
    expect(definitionHistoryView(event({ event_type: 'created', definition_kind: 'permission', permission_names: [] })).permissions).toEqual([])
  })

  it('lists permissions added and removed', () => {
    expect(definitionHistoryView(event({ event_type: 'permissions_added', metadata: { added_permission_names: ['role:read'] } }))).toMatchObject({ title: 'Permissions added', added: ['role:read'], removed: [] })
    expect(definitionHistoryView(event({ event_type: 'permissions_removed', metadata: { removed_permission_names: ['user:read'] } }))).toMatchObject({ added: [], removed: ['user:read'] })
    expect(definitionHistoryView(event({
      event_type: 'permissions_replaced',
      metadata: { added_permission_names: ['b:read', 'a:read'], removed_permission_names: ['c:read'] }
    }))).toMatchObject({ title: 'Permissions changed', added: ['a:read', 'b:read'], removed: ['c:read'] })
  })

  it('reads condition and condition group events', () => {
    const condition = { attribute: 'user.department', operator: 'equals', value: 'sales', value_type: 'string' }
    expect(conditionText(condition)).toBe('user.department equals "sales"')
    expect(conditionText({ attribute: 'resource.tags', operator: 'in', value: '["a","b"]', value_type: 'list' })).toBe('resource.tags is one of a, b')
    expect(conditionText({ attribute: 'user.is_superuser', operator: 'is_true', value: null, value_type: 'boolean' })).toBe('user.is_superuser is true')
    expect(conditionText(null)).toBeNull()

    expect(definitionHistoryView(event({ event_type: 'condition_created', metadata: { condition } })).changes).toEqual([{ label: 'Condition', to: 'user.department equals "sales"' }])
    expect(definitionHistoryView(event({
      event_type: 'condition_updated',
      metadata: { changed_fields: ['value'], before_condition: condition, after_condition: { ...condition, value: 'ops' } }
    })).changes).toEqual([{ label: 'Condition', from: 'user.department equals "sales"', to: 'user.department equals "ops"' }])
    expect(definitionHistoryView(event({ event_type: 'condition_deleted', metadata: { deleted_condition: condition } })).changes).toEqual([{ label: 'Condition', from: 'user.department equals "sales"' }])

    expect(definitionHistoryView(event({ event_type: 'condition_group_created', metadata: { condition_group: { operator: 'OR', description: null } } })).changes)
      .toEqual([{ label: 'Group', to: 'A group where any condition can pass' }])
    expect(definitionHistoryView(event({
      event_type: 'condition_group_deleted',
      metadata: { deleted_group: { operator: 'AND', description: 'Office hours' }, deleted_conditions: [condition, condition] }
    })).changes).toEqual([{ label: 'Group', from: 'Office hours (all conditions must pass), with 2 conditions' }])
  })

  it('shows an unknown event by its humanized type, with nothing guessed', () => {
    expect(definitionHistoryView(event({ event_type: 'policy_imported', metadata: { anything: 1 } }))).toMatchObject({
      title: 'Policy imported',
      icon: 'i-lucide-history',
      changes: [],
      added: [],
      removed: [],
      permissions: []
    })
  })
})
