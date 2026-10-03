import type { AbacCondition } from '~/types/abac'
import type { DefinitionHistoryEvent } from '~/types/definition-history'
import { abacOperatorLabel, abacValueDisplay } from '~/utils/abac'
import { ROLE_SCOPE_LABELS } from '~/utils/role-definitions'
import { statusLabel } from '~/utils/status'

// How the role and permission History cards read one definition event (outlabs-auth 0.1.0a35
// GET /roles/{id}/history, GET /permissions/{id}/history). Pure, unit-tested in
// test/unit/definition-history.test.ts.
//
// Event types (services/role.py, services/permission.py): created, updated (metadata
// changed_fields, with whole before/after snapshots), deleted (archived), and for roles
// permissions_replaced / permissions_added / permissions_removed (metadata added_ and
// removed_permission_names) and entity_type_permissions_replaced; both kinds record ABAC
// condition_* and condition_group_* events (metadata condition, before_/after_condition,
// deleted_condition, condition_group, before_/after_group, deleted_group).

const EVENT_LABELS: Record<string, string> = {
  created: 'Created',
  updated: 'Updated',
  deleted: 'Archived',
  permissions_replaced: 'Permissions changed',
  permissions_added: 'Permissions added',
  permissions_removed: 'Permissions removed',
  entity_type_permissions_replaced: 'Entity-type permissions changed',
  condition_created: 'Condition added',
  condition_updated: 'Condition changed',
  condition_deleted: 'Condition removed',
  condition_group_created: 'Condition group added',
  condition_group_updated: 'Condition group changed',
  condition_group_deleted: 'Condition group removed'
}

const EVENT_ICONS: Record<string, string> = {
  created: 'i-lucide-plus',
  updated: 'i-lucide-pencil',
  deleted: 'i-lucide-archive',
  permissions_replaced: 'i-lucide-key-round',
  permissions_added: 'i-lucide-key-round',
  permissions_removed: 'i-lucide-key-round',
  entity_type_permissions_replaced: 'i-lucide-key-round'
}

/** "Created", "Permissions added", …; an event type the console does not know, humanized. */
export function definitionEventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? statusLabel(eventType)
}

export function definitionEventIcon(eventType: string): string {
  if (EVENT_ICONS[eventType]) return EVENT_ICONS[eventType]
  return eventType.startsWith('condition') ? 'i-lucide-filter' : 'i-lucide-history'
}

// The snapshot fields an `updated` event names in metadata.changed_fields, as the detail pages
// word them. An id is said through its name's change when both changed; fields not listed here
// are named from their key.
const FIELD_LABELS: Record<string, string> = {
  role_name: 'Name',
  role_display_name: 'Display name',
  role_description: 'Description',
  permission_name: 'Name',
  permission_display_name: 'Display name',
  permission_description: 'Description',
  is_system_role: 'System role',
  is_system: 'System permission',
  is_global: 'System-wide',
  status: 'Status',
  is_active: 'Active',
  root_entity_name: 'Organization',
  root_entity_id: 'Organization',
  scope_entity_name: 'Defined at',
  scope_entity_id: 'Defined at',
  scope: 'Applies to',
  is_auto_assigned: 'Auto-assigned',
  assignable_at_types: 'Assignable at',
  resource: 'Resource',
  action: 'Action',
  tag_names: 'Tags',
  condition_groups: 'Condition groups',
  conditions: 'Conditions'
}
// Their name says it; an id alone is shown only when no name changed with it.
const ID_FIELDS: Record<string, string> = { root_entity_id: 'root_entity_name', scope_entity_id: 'scope_entity_name' }
// Lists of objects: what changed is said, not the before and after.
const STRUCTURED_FIELDS = new Set(['condition_groups', 'conditions', 'entity_type_permissions'])

const MAX_TEXT = 120

function clip(text: string): string {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text
}

/** One snapshot value as the change line shows it. */
export function definitionValueText(field: string, value: unknown, kind: DefinitionHistoryEvent['definition_kind'] = 'role'): string {
  if (value === null || value === undefined || value === '') return 'none'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (Array.isArray(value)) return value.length ? clip(value.map(item => String(item)).join(', ')) : 'none'
  if (field === 'status') return statusLabel(String(value))
  if (field === 'scope' && kind === 'role' && (value === 'hierarchy' || value === 'entity_only')) return ROLE_SCOPE_LABELS[value]
  if (typeof value === 'object') return 'changed'
  return clip(String(value))
}

export type DefinitionChange = {
  label: string
  /** Absent for a change said without its values (a list of conditions, an id). */
  from?: string
  to?: string
}

/** What an `updated` event changed, from its changed_fields and the before / after snapshots. */
export function definitionFieldChanges(event: Pick<DefinitionHistoryEvent, 'definition_kind' | 'before' | 'after' | 'metadata'>): DefinitionChange[] {
  const changed = event.metadata?.changed_fields
  const fields = Array.isArray(changed) ? changed.map(String) : []
  const before = event.before ?? {}
  const after = event.after ?? {}
  const changes: DefinitionChange[] = []
  for (const field of fields) {
    const named = ID_FIELDS[field]
    if (named && fields.includes(named)) continue
    const label = FIELD_LABELS[field] ?? statusLabel(field)
    if (named || STRUCTURED_FIELDS.has(field)) {
      changes.push({ label })
      continue
    }
    changes.push({
      label,
      from: definitionValueText(field, before[field], event.definition_kind),
      to: definitionValueText(field, after[field], event.definition_kind)
    })
  }
  return changes
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : []
}

type ConditionSnapshot = Partial<Pick<AbacCondition, 'attribute' | 'operator' | 'value' | 'value_type'>>

/** "user.department equals "sales"": a condition snapshot as one line. */
export function conditionText(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  const condition = snapshot as ConditionSnapshot
  if (!condition.attribute || !condition.operator) return null
  const display = abacValueDisplay({ id: '', attribute: condition.attribute, operator: condition.operator, value: condition.value ?? null, value_type: condition.value_type ?? 'string' })
  const value = display.kind === 'none'
    ? ''
    : display.kind === 'list'
      ? ` ${display.items.join(', ')}`
      : ` ${display.quoted ? `"${display.text}"` : display.text}`
  return clip(`${condition.attribute} ${abacOperatorLabel(condition.operator)}${value}`)
}

function groupText(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  const group = snapshot as { operator?: string, description?: string | null }
  if (!group.operator) return null
  const rule = group.operator === 'OR' ? 'any condition can pass' : 'all conditions must pass'
  return group.description ? `${clip(group.description)} (${rule})` : `A group where ${rule}`
}

export type DefinitionHistoryView = {
  title: string
  icon: string
  /** Field changes (updated events) and ABAC condition lines. */
  changes: DefinitionChange[]
  /** Permissions a role gained or lost with this event. */
  added: string[]
  removed: string[]
  /** A role's permissions when it was created. */
  permissions: string[]
}

/** Everything one History card row says about an event. */
export function definitionHistoryView(event: DefinitionHistoryEvent): DefinitionHistoryView {
  const metadata = event.metadata ?? {}
  const view: DefinitionHistoryView = {
    title: definitionEventLabel(event.event_type),
    icon: definitionEventIcon(event.event_type),
    changes: [],
    added: [],
    removed: [],
    permissions: []
  }
  switch (event.event_type) {
    case 'created':
      if (event.definition_kind === 'role') view.permissions = [...event.permission_names].sort()
      break
    case 'updated':
      view.changes = definitionFieldChanges(event)
      break
    case 'permissions_replaced':
    case 'permissions_added':
    case 'permissions_removed':
      view.added = stringList(metadata.added_permission_names).sort()
      view.removed = stringList(metadata.removed_permission_names).sort()
      break
    case 'condition_created': {
      const text = conditionText(metadata.condition)
      if (text) view.changes = [{ label: 'Condition', to: text }]
      break
    }
    case 'condition_updated': {
      const from = conditionText(metadata.before_condition)
      const to = conditionText(metadata.after_condition)
      if (from || to) view.changes = [{ label: 'Condition', from: from ?? 'none', to: to ?? 'none' }]
      break
    }
    case 'condition_deleted': {
      const text = conditionText(metadata.deleted_condition)
      if (text) view.changes = [{ label: 'Condition', from: text }]
      break
    }
    case 'condition_group_created': {
      const text = groupText(metadata.condition_group)
      if (text) view.changes = [{ label: 'Group', to: text }]
      break
    }
    case 'condition_group_updated': {
      const from = groupText(metadata.before_group)
      const to = groupText(metadata.after_group)
      if (from || to) view.changes = [{ label: 'Group', from: from ?? 'none', to: to ?? 'none' }]
      break
    }
    case 'condition_group_deleted': {
      const text = groupText(metadata.deleted_group)
      const removed = Array.isArray(metadata.deleted_conditions) ? metadata.deleted_conditions.length : 0
      if (text) view.changes = [{ label: 'Group', from: removed ? `${text}, with ${removed} condition${removed === 1 ? '' : 's'}` : text }]
      break
    }
  }
  return view
}
