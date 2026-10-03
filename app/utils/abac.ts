import type {
  AbacCondition,
  AbacConditionGroup,
  AbacConditionValue,
  AbacConditionValueType,
  AbacScopeKind,
  CreateConditionInput,
  UpdateConditionInput
} from '~/types/abac'
import {
  defaultValueType,
  isAttributeContext,
  isConditionOperator,
  isConditionValueType,
  isNumericText,
  OPERATOR_META,
  type ConditionFormOutput,
  type ConditionFormState,
  type OperatorValueKind
} from '~/schemas/abac'

// Pure ABAC helpers: reading the backend's stored value text, spotting stored conditions that
// break evaluation, and converting between API rows, form state and request bodies.

// USelect rejects an empty-string item value, so "no group" uses a sentinel.
export const ABAC_UNGROUPED = '__ungrouped__'

export type AbacParsedValue = { ok: true, value: unknown } | { ok: false, reason: string }

// Mirrors the policy engine's _parse_value: how a stored row's value text is read back at
// evaluation time. A failure here makes the engine evaluate the row as false.
export function parseAbacStoredValue(raw: string | null | undefined, valueType: string | null | undefined): AbacParsedValue {
  if (raw == null) return { ok: true, value: null }
  const vt = (valueType || 'string').toLowerCase()
  const text = String(raw)
  switch (vt) {
    case 'string':
      return { ok: true, value: text }
    case 'integer': {
      const trimmed = text.trim()
      if (!/^[+-]?\d+(_\d+)*$/.test(trimmed)) return { ok: false, reason: `"${text}" is not a whole number` }
      return { ok: true, value: Number(trimmed.replace(/_/g, '')) }
    }
    case 'float': {
      const trimmed = text.trim()
      if (/^[+-]?(inf|infinity|nan)$/i.test(trimmed)) return { ok: true, value: Number(trimmed.replace(/^\+/, '').replace(/^(-?)inf(inity)?$/i, '$1Infinity')) }
      if (!isNumericText(trimmed.replace(/_/g, ''))) return { ok: false, reason: `"${text}" is not a number` }
      return { ok: true, value: Number(trimmed.replace(/_/g, '')) }
    }
    case 'boolean':
      return { ok: true, value: ['1', 'true', 'yes', 'y', 'on'].includes(text.toLowerCase()) }
    case 'list':
      try {
        const parsed: unknown = JSON.parse(text)
        return { ok: true, value: Array.isArray(parsed) ? parsed : [parsed] }
      } catch {
        return { ok: true, value: [text] }
      }
    default:
      return { ok: true, value: text }
  }
}

export function abacOperatorLabel(operator: string): string {
  return isConditionOperator(operator) ? OPERATOR_META[operator].label : operator
}

export function abacOperatorKind(operator: string): OperatorValueKind | null {
  return isConditionOperator(operator) ? OPERATOR_META[operator].kind : null
}

export type AbacConditionIssue = { severity: 'error' | 'warning', message: string }

// The engine evaluates a row it cannot interpret as false (fail closed).
const NEVER_PASSES = 'It never passes until it is fixed.'

function isJsonArrayText(raw: string): boolean {
  try {
    return Array.isArray(JSON.parse(raw))
  } catch {
    return false
  }
}

// Stored conditions the engine cannot evaluate (error: it evaluates the row as false) or
// evaluates differently from what the row suggests (warning). The write API refuses both now
// (400), but rows written before it validated conditions can be in either state.
export function abacConditionIssue(condition: AbacCondition): AbacConditionIssue | null {
  if (!isConditionOperator(condition.operator)) {
    return { severity: 'error', message: `"${condition.operator}" is not a supported operator. ${NEVER_PASSES}` }
  }
  const [context, ...rest] = condition.attribute.split('.')
  if (!rest.length || !isAttributeContext(context) || rest.some(part => !part)) {
    return { severity: 'error', message: `The attribute must start with user., resource., env. or time.: the server fills in no other context. ${NEVER_PASSES}` }
  }
  const parsed = parseAbacStoredValue(condition.value, String(condition.value_type))
  if (!parsed.ok) return { severity: 'error', message: `${parsed.reason}. ${NEVER_PASSES}` }

  const meta = OPERATOR_META[condition.operator]
  if (meta.kind === 'none') return null
  if (meta.kind === 'list') {
    if (condition.value == null) {
      return { severity: 'warning', message: 'No list is set, so this condition never passes.' }
    }
    if (condition.value_type !== 'list') {
      return { severity: 'error', message: `"${meta.label}" needs a list value, but this one is stored as ${condition.value_type}. ${NEVER_PASSES}` }
    }
    if (!isJsonArrayText(condition.value)) {
      return { severity: 'warning', message: `The stored list is not a JSON array, so it is read as the single item "${condition.value}". Edit it and enter each value separately.` }
    }
    if (Array.isArray(parsed.value) && !parsed.value.length) {
      return {
        severity: 'warning',
        message: condition.operator === 'in'
          ? 'The list is empty, so this condition never passes.'
          : 'The list is empty, so this condition passes whenever the attribute is present.'
      }
    }
    return null
  }
  if (condition.value == null) {
    return { severity: 'warning', message: 'No value is set, so this condition has nothing to compare. Edit it and add a value.' }
  }
  return null
}

export type AbacValueDisplay
  = | { kind: 'none' }
    | { kind: 'list', items: string[] }
    | { kind: 'text', text: string, quoted: boolean }

// How a stored value reads next to its operator: nothing for presence/boolean checks, chips for
// lists, quoted text for strings (so 5 and "5" read differently), plain text otherwise.
export function abacValueDisplay(condition: AbacCondition): AbacValueDisplay {
  if (abacOperatorKind(condition.operator) === 'none' || condition.value == null) return { kind: 'none' }
  const parsed = parseAbacStoredValue(condition.value, String(condition.value_type))
  if (!parsed.ok) return { kind: 'text', text: condition.value, quoted: false }
  if (Array.isArray(parsed.value)) {
    return { kind: 'list', items: parsed.value.map(item => (typeof item === 'string' ? item : JSON.stringify(item))) }
  }
  if (typeof parsed.value === 'string') return { kind: 'text', text: parsed.value, quoted: true }
  return { kind: 'text', text: String(parsed.value), quoted: false }
}

// Groups have no name of their own; they are numbered in list order.
export function abacGroupTitle(index: number): string {
  return `Group ${index + 1}`
}

export function abacGroupRule(operator: string): string {
  return operator === 'OR' ? 'Any condition can pass' : 'All conditions must pass'
}

export type AbacGroupedConditions = {
  ungrouped: AbacCondition[]
  groups: Array<{ group: AbacConditionGroup, conditions: AbacCondition[] }>
}

// Conditions arranged the way the engine evaluates them. A condition pointing at a group that no
// longer exists is evaluated as its own AND group, which is the same as ungrouped.
export function groupAbacConditions(groups: AbacConditionGroup[], conditions: AbacCondition[]): AbacGroupedConditions {
  const byGroup = new Map<string, AbacCondition[]>(groups.map(g => [g.id, []]))
  const ungrouped: AbacCondition[] = []
  for (const condition of conditions) {
    const bucket = condition.condition_group_id ? byGroup.get(condition.condition_group_id) : undefined
    if (bucket) bucket.push(condition)
    else ungrouped.push(condition)
  }
  return { ungrouped, groups: groups.map(group => ({ group, conditions: byGroup.get(group.id) ?? [] })) }
}

export function emptyAbacConditionForm(groupId: string | null = null): ConditionFormState {
  return {
    context: 'resource',
    path: '',
    operator: 'equals',
    value_type: 'string',
    text_value: '',
    number_value: null,
    boolean_value: true,
    list_value: [],
    list_item_type: 'string',
    description: '',
    group_id: groupId ?? ABAC_UNGROUPED
  }
}

// A stored condition as form state. Unsupported operators and unprefixed attributes are left
// unset so the admin has to pick a valid value before saving; a value type the operator cannot
// use is replaced by the operator's default and the stored value carried over where it parses.
export function abacConditionFormState(condition: AbacCondition): ConditionFormState {
  const state = emptyAbacConditionForm(condition.condition_group_id ?? null)
  const dot = condition.attribute.indexOf('.')
  const prefix = dot > 0 ? condition.attribute.slice(0, dot) : ''
  if (isAttributeContext(prefix)) {
    state.context = prefix
    state.path = condition.attribute.slice(dot + 1)
  } else {
    state.context = undefined
    state.path = condition.attribute
  }

  const operator = isConditionOperator(condition.operator) ? condition.operator : undefined
  state.operator = operator
  const storedType = isConditionValueType(condition.value_type) ? condition.value_type : null
  const allowed = operator ? OPERATOR_META[operator].valueTypes : null
  state.value_type = storedType && (!allowed || allowed.includes(storedType))
    ? storedType
    : operator ? defaultValueType(operator) : 'string'
  state.description = condition.description ?? ''

  const parsed = parseAbacStoredValue(condition.value, String(condition.value_type))
  const typed = parsed.ok ? parsed.value : condition.value ?? null
  if (Array.isArray(typed)) {
    state.list_value = typed.map(item => (typeof item === 'string' ? item : JSON.stringify(item)))
    state.list_item_type = typed.length > 0 && typed.every(item => typeof item === 'number') ? 'number' : 'string'
  } else if (typed != null && operator && OPERATOR_META[operator].kind === 'list') {
    state.list_value = [String(typed)]
  }
  if (typeof typed === 'string') {
    state.text_value = typed
    if (isNumericText(typed)) {
      state.number_value = Number(typed)
      if (state.value_type === 'integer' && !Number.isInteger(state.number_value)) state.value_type = 'float'
    }
  } else if (typeof typed === 'number') {
    state.number_value = typed
    state.text_value = String(typed)
  } else if (typeof typed === 'boolean') {
    state.boolean_value = typed
  }
  return state
}

export type AbacConditionBody = CreateConditionInput & {
  value: AbacConditionValue
  description: string | null
  condition_group_id: string | null
}

// Validated form output -> the typed request body. Values are trimmed; lists are always
// value_type "list" with string or number items; no-value operators send null.
export function abacConditionPayload(v: ConditionFormOutput): AbacConditionBody {
  const meta = OPERATOR_META[v.operator]
  let value: AbacConditionValue = null
  let valueType: AbacConditionValueType = v.value_type
  switch (meta.kind) {
    case 'none':
      break
    case 'list':
      valueType = 'list'
      value = v.list_item_type === 'number'
        ? v.list_value.map(item => Number(item.trim()))
        : v.list_value.map(item => item.trim())
      break
    case 'text':
    case 'datetime':
      value = v.text_value.trim()
      break
    default:
      if (v.value_type === 'boolean') value = v.boolean_value
      else if (v.value_type === 'string') value = v.text_value.trim()
      else value = v.number_value ?? null
  }
  return {
    attribute: `${v.context}.${v.path.trim()}`,
    operator: v.operator,
    value_type: valueType,
    value,
    description: v.description.trim() || null,
    condition_group_id: v.group_id === ABAC_UNGROUPED ? null : v.group_id
  }
}

// Create body: omit empty optional fields.
export function abacConditionCreateBody(v: ConditionFormOutput): CreateConditionInput {
  const body = abacConditionPayload(v)
  const out: CreateConditionInput = { attribute: body.attribute, operator: body.operator, value_type: body.value_type, condition_group_id: body.condition_group_id }
  if (body.value !== null) out.value = body.value
  if (body.description) out.description = body.description
  return out
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

// PATCH body: only what changed. operator, value_type and value travel together — the backend
// re-serializes the value whenever value or value_type is present, so sending one without the
// other would wipe or mis-type the stored value. A flagged stored row always has its value
// rewritten: some problems (a list stored as non-JSON text) read back the same as the fix.
export function abacConditionPatch(original: AbacCondition, next: AbacConditionBody): UpdateConditionInput {
  const parsed = parseAbacStoredValue(original.value, String(original.value_type))
  const originalValue = original.value == null ? null : parsed.ok ? parsed.value : original.value
  const rewrite = abacConditionIssue(original) !== null
  const patch: UpdateConditionInput = {}
  if (original.attribute !== next.attribute) patch.attribute = next.attribute
  if ((original.description ?? null) !== next.description) patch.description = next.description
  if ((original.condition_group_id ?? null) !== next.condition_group_id) patch.condition_group_id = next.condition_group_id
  if (rewrite || original.operator !== next.operator || original.value_type !== next.value_type || !sameValue(originalValue, next.value)) {
    patch.operator = next.operator
    patch.value_type = next.value_type
    patch.value = next.value
  }
  return patch
}

// Where a condition can be moved: Ungrouped plus every group, minus its stored group. Compared with
// the stored id, so a condition whose group no longer exists (evaluated as ungrouped) can still be
// moved to Ungrouped to clear the dangling reference.
export function abacMoveDestinations(condition: AbacCondition, groups: AbacConditionGroup[]): Array<string | null> {
  const current = condition.condition_group_id ?? null
  return [null, ...groups.map(g => g.id)].filter(target => target !== current)
}

export type AbacDeleteSubject
  = | { type: 'condition', condition: AbacCondition }
    | { type: 'group', group: AbacConditionGroup }

// What deleting a condition or a group does to access, stated before the admin confirms. Follows
// policy_engine.evaluate_sql_conditions: ungrouped conditions and every group are AND-ed, an AND
// group needs all of its conditions, an OR group any one, and a group with no conditions (or a
// condition whose group no longer exists) adds no alternative. So removing a requirement loosens
// access, but removing one of several alternatives in an OR group tightens it.
export function abacDeleteEffects(
  kind: AbacScopeKind,
  subject: AbacDeleteSubject,
  groups: AbacConditionGroup[],
  conditions: AbacCondition[]
): string[] {
  const holders = `Holders of this ${kind === 'roles' ? 'role' : 'permission'}`
  if (subject.type === 'group') {
    const { group } = subject
    const count = conditions.filter(c => c.condition_group_id === group.id).length
    if (count === 0) return ['This group has no conditions, so deleting it does not change access.']
    const which = count === 1 ? 'this condition' : group.operator === 'OR' ? 'any of these conditions' : 'these conditions'
    return [
      `Its ${count === 1 ? '1 condition' : `${count} conditions`} will be deleted with it.`,
      `${holders} will no longer need ${which} to pass, so they may gain access they don't have today.`,
      'The group and its conditions are deleted permanently.'
    ]
  }

  const { condition } = subject
  const permanent = 'The condition is deleted permanently.'
  const index = condition.condition_group_id ? groups.findIndex(g => g.id === condition.condition_group_id) : -1
  const group = index >= 0 ? groups[index] : undefined
  if (group?.operator === 'OR') {
    const title = abacGroupTitle(index)
    const others = conditions.filter(c => c.condition_group_id === group.id && c.id !== condition.id).length
    if (others > 0) {
      return [
        `${title} passes when any one of its conditions passes. ${holders} who meet only this condition in the group will lose access they have today.`,
        `Holders who meet ${others === 1 ? 'the other condition' : `one of the other ${others} conditions`} in ${title} are not affected.`,
        permanent
      ]
    }
    return [
      `This is the last condition in ${title}, so the group will be empty, and an empty group does not restrict access.`,
      `${holders} will no longer need this condition to pass, so they may gain access they don't have today.`,
      permanent
    ]
  }
  return [`${holders} will no longer need this condition to pass, so they may gain access they don't have today.`, permanent]
}

// Why the editor is read-only, stated to the admin instead of silently hiding the controls.
export function abacReadOnlyReason(opts: { kind: AbacScopeKind, isSystem: boolean, canUpdate: boolean }): string | null {
  const noun = opts.kind === 'roles' ? 'role' : 'permission'
  if (opts.isSystem) {
    return `This is a system ${noun}. System ${noun}s are defined by the application, so their conditions can't be changed here.`
  }
  if (!opts.canUpdate) return `You need the ${noun}:update permission to change these conditions.`
  return null
}
