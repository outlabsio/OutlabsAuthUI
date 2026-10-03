import { z } from 'zod'
import type { AbacConditionValueType, AbacGroupOperator } from '~/types/abac'

// ABAC condition + condition-group forms. The backend write API validates every condition
// (outlabs-auth services/abac_validation.py) and refuses anything else with 400 (details.reason
// invalid_abac_condition, details.field naming the field), and the policy engine evaluates a
// stored row it cannot interpret as false. The editor encodes the same contract so it never
// sends a condition the API refuses:
// - operators: the ConditionOperator enum (models/sql/enums.py), 19 values;
// - attribute: "<context>.<path>" with context one the engine fills in (user, resource, env,
//   time: ABAC_ATTRIBUTE_CONTEXTS) and every key a letter or _ followed by letters, digits, _ or -;
// - value: typed by value_type (services/policy_engine.py _parse_value), a non-empty JSON array
//   for in/not_in.

export const CONDITION_OPERATORS = [
  'equals',
  'not_equals',
  'less_than',
  'less_than_or_equal',
  'greater_than',
  'greater_than_or_equal',
  'in',
  'not_in',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'matches',
  'exists',
  'not_exists',
  'is_true',
  'is_false',
  'before',
  'after'
] as const
export type ConditionOperator = typeof CONDITION_OPERATORS[number]

export const CONDITION_VALUE_TYPES = ['string', 'integer', 'float', 'boolean', 'list'] as const satisfies readonly AbacConditionValueType[]

// The contexts the permission service fills in. The engine's model also names `request`, but
// nothing supplies it and the write API refuses it.
export const ATTRIBUTE_CONTEXTS = ['user', 'resource', 'env', 'time'] as const
export type AttributeContext = typeof ATTRIBUTE_CONTEXTS[number]

export const GROUP_OPERATORS = ['AND', 'OR'] as const satisfies readonly AbacGroupOperator[]

// List items are sent as strings or numbers; the engine compares with Python `in`, so "5" never
// matches 5 — the item type has to be chosen explicitly.
export const LIST_ITEM_TYPES = ['string', 'number'] as const
export type ListItemType = typeof LIST_ITEM_TYPES[number]

// How an operator uses its value:
// none     — exists / not_exists / is_true / is_false: no value is stored
// scalar   — one text, number or boolean value
// number   — numeric comparison
// text     — string operations
// datetime — ISO 8601 date-time compared with dateutil
// list     — in / not_in: a non-empty JSON array
export type OperatorValueKind = 'none' | 'scalar' | 'number' | 'text' | 'datetime' | 'list'

export type OperatorMeta = {
  label: string
  group: string
  kind: OperatorValueKind
  valueTypes: readonly AbacConditionValueType[]
  help: string
}

const SCALAR_TYPES = ['string', 'integer', 'float', 'boolean'] as const
const NUMBER_TYPES = ['integer', 'float'] as const
const MISSING_FAILS = 'Fails when the attribute is missing.'

export const OPERATOR_META: Record<ConditionOperator, OperatorMeta> = {
  equals: { label: 'equals', group: 'Equality', kind: 'scalar', valueTypes: SCALAR_TYPES, help: `Passes when the attribute equals the value. The type matters: 5 and "5" differ. ${MISSING_FAILS}` },
  not_equals: { label: 'does not equal', group: 'Equality', kind: 'scalar', valueTypes: SCALAR_TYPES, help: `Passes when the attribute differs from the value. ${MISSING_FAILS}` },
  less_than: { label: 'is less than', group: 'Comparison', kind: 'number', valueTypes: NUMBER_TYPES, help: `Numeric comparison. Fails when the attribute is missing or not numeric.` },
  less_than_or_equal: { label: 'is at most', group: 'Comparison', kind: 'number', valueTypes: NUMBER_TYPES, help: `Numeric comparison (less than or equal). Fails when the attribute is missing or not numeric.` },
  greater_than: { label: 'is greater than', group: 'Comparison', kind: 'number', valueTypes: NUMBER_TYPES, help: `Numeric comparison. Fails when the attribute is missing or not numeric.` },
  greater_than_or_equal: { label: 'is at least', group: 'Comparison', kind: 'number', valueTypes: NUMBER_TYPES, help: `Numeric comparison (greater than or equal). Fails when the attribute is missing or not numeric.` },
  in: { label: 'is one of', group: 'Lists', kind: 'list', valueTypes: ['list'], help: `Passes when the attribute matches one of the listed values. ${MISSING_FAILS}` },
  not_in: { label: 'is not one of', group: 'Lists', kind: 'list', valueTypes: ['list'], help: `Passes when the attribute matches none of the listed values. ${MISSING_FAILS}` },
  contains: { label: 'contains', group: 'Lists', kind: 'scalar', valueTypes: SCALAR_TYPES, help: `For list attributes: passes when the list includes the value. Fails for text attributes and when the attribute is missing.` },
  not_contains: { label: 'does not contain', group: 'Lists', kind: 'scalar', valueTypes: SCALAR_TYPES, help: `For list attributes: passes when the list does not include the value. Fails for text attributes and when the attribute is missing.` },
  starts_with: { label: 'starts with', group: 'Text', kind: 'text', valueTypes: ['string'], help: `Text prefix match. ${MISSING_FAILS}` },
  ends_with: { label: 'ends with', group: 'Text', kind: 'text', valueTypes: ['string'], help: `Text suffix match. ${MISSING_FAILS}` },
  matches: { label: 'matches pattern', group: 'Text', kind: 'text', valueTypes: ['string'], help: `Python regular expression, matched from the start of the attribute. An invalid pattern never matches. ${MISSING_FAILS}` },
  exists: { label: 'is present', group: 'Presence', kind: 'none', valueTypes: CONDITION_VALUE_TYPES, help: 'Passes when the attribute is present in the context. No value needed.' },
  not_exists: { label: 'is missing', group: 'Presence', kind: 'none', valueTypes: CONDITION_VALUE_TYPES, help: 'Passes when the attribute is absent from the context. No value needed.' },
  is_true: { label: 'is true', group: 'Boolean', kind: 'none', valueTypes: CONDITION_VALUE_TYPES, help: 'Passes when the attribute is true (or any non-empty, non-zero value). Fails when it is missing.' },
  is_false: { label: 'is false', group: 'Boolean', kind: 'none', valueTypes: CONDITION_VALUE_TYPES, help: 'Passes when the attribute is false (or zero or empty). Fails when it is missing.' },
  before: { label: 'is before', group: 'Time', kind: 'datetime', valueTypes: ['string'], help: `Date-time comparison. ${MISSING_FAILS} Values without a timezone never match time.timestamp (UTC).` },
  after: { label: 'is after', group: 'Time', kind: 'datetime', valueTypes: ['string'], help: `Date-time comparison. ${MISSING_FAILS} Values without a timezone never match time.timestamp (UTC).` }
}

export const OPERATOR_GROUP_ORDER = ['Equality', 'Comparison', 'Lists', 'Text', 'Presence', 'Boolean', 'Time'] as const

export const ATTRIBUTE_CONTEXT_META: Record<AttributeContext, { description: string, placeholder: string }> = {
  user: { description: 'The signed-in user: id, email, status, timezone, locale, is_superuser.', placeholder: 'email' },
  resource: { description: 'The resource being checked, supplied by the host application (entity checks add entity_id).', placeholder: 'department' },
  env: { description: 'The request: method, path, client_host, user_agent, plus any values the host application supplies.', placeholder: 'client_host' },
  time: { description: 'Check time in UTC: hour, minute, day_of_week, day_of_month, month, year, is_business_hours, is_weekend, timestamp.', placeholder: 'hour' }
}

export const VALUE_TYPE_LABELS: Record<AbacConditionValueType, string> = {
  string: 'Text',
  integer: 'Whole number',
  float: 'Decimal number',
  boolean: 'True or false',
  list: 'List'
}

export const LIST_ITEM_TYPE_LABELS: Record<ListItemType, string> = {
  string: 'Text items',
  number: 'Number items'
}

export function isConditionOperator(value: unknown): value is ConditionOperator {
  return typeof value === 'string' && (CONDITION_OPERATORS as readonly string[]).includes(value)
}

export function isAttributeContext(value: unknown): value is AttributeContext {
  return typeof value === 'string' && (ATTRIBUTE_CONTEXTS as readonly string[]).includes(value)
}

export function isConditionValueType(value: unknown): value is AbacConditionValueType {
  return typeof value === 'string' && (CONDITION_VALUE_TYPES as readonly string[]).includes(value)
}

// The value_type a freshly chosen operator starts with.
export function defaultValueType(operator: ConditionOperator): AbacConditionValueType {
  if (operator === 'is_true' || operator === 'is_false') return 'boolean'
  if (OPERATOR_META[operator].kind === 'number') return 'integer'
  return OPERATOR_META[operator].valueTypes[0] ?? 'string'
}

// Dot-separated keys ("department", "address.city"), each a letter or _ followed by letters,
// digits, _ or - (the write API's _ATTRIBUTE_SEGMENT).
export const ATTRIBUTE_PATH_PATTERN = /^[A-Z_][\w-]*(\.[A-Z_][\w-]*)*$/i

// ISO 8601 date-time WITH a timezone. dateutil parses looser input, but a naive value compared
// with an aware one (time.timestamp is UTC-aware) raises inside the engine and never matches.
export const ISO_DATETIME_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})$/

const NUMERIC_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/

export function isNumericText(value: string): boolean {
  return NUMERIC_TEXT.test(value.trim())
}

export const conditionFormSchema = z
  .object({
    context: z.enum(ATTRIBUTE_CONTEXTS, { error: 'Choose where the attribute comes from.' }),
    path: z
      .string({ error: 'Enter the attribute path.' })
      .trim()
      .min(1, 'Enter the attribute path.')
      .regex(ATTRIBUTE_PATH_PATTERN, 'Use dot-separated keys of letters, digits, _ or -, each starting with a letter or _, e.g. department or address.city.'),
    operator: z.enum(CONDITION_OPERATORS, { error: 'Choose an operator.' }),
    value_type: z.enum(CONDITION_VALUE_TYPES, { error: 'Choose a value type.' }),
    text_value: z.string(),
    number_value: z.number().nullable().optional(),
    boolean_value: z.boolean(),
    list_value: z.array(z.string()),
    list_item_type: z.enum(LIST_ITEM_TYPES),
    description: z.string().trim().max(500, 'Keep the description under 500 characters.'),
    group_id: z.string()
  })
  .superRefine((v, ctx) => {
    const meta = OPERATOR_META[v.operator]
    if (!meta) return
    if (!meta.valueTypes.includes(v.value_type)) {
      ctx.addIssue({
        code: 'custom',
        path: ['value_type'],
        message: `Use ${meta.valueTypes.map(t => VALUE_TYPE_LABELS[t].toLowerCase()).join(' or ')} with "${meta.label}".`
      })
      return
    }
    const issue = (message: string) => ctx.addIssue({ code: 'custom', path: ['value'], message })
    switch (meta.kind) {
      case 'none':
        return
      case 'list':
        if (!v.list_value.length) return issue('Add at least one value.')
        if (v.list_value.some(item => !item.trim())) return issue('Remove the empty item.')
        if (v.list_item_type === 'number' && v.list_value.some(item => !isNumericText(item))) {
          return issue('Every item must be a number.')
        }
        return
      case 'datetime':
        if (!ISO_DATETIME_WITH_ZONE.test(v.text_value.trim()) || Number.isNaN(Date.parse(v.text_value.trim()))) {
          return issue('Use an ISO 8601 date-time with a timezone, e.g. 2026-12-31T17:00:00Z.')
        }
        return
      default:
        if (v.value_type === 'integer' && (v.number_value == null || !Number.isInteger(v.number_value))) {
          return issue('Enter a whole number.')
        }
        if (v.value_type === 'float' && (v.number_value == null || !Number.isFinite(v.number_value))) {
          return issue('Enter a number.')
        }
        if (v.value_type === 'string' && !v.text_value.trim()) {
          return issue('Enter a value.')
        }
    }
  })

export type ConditionFormInput = z.input<typeof conditionFormSchema>
export type ConditionFormOutput = z.output<typeof conditionFormSchema>

// Form state: the enum fields may be unset while editing a malformed stored condition, so the
// admin has to pick a valid value before saving.
export type ConditionFormState = Omit<ConditionFormInput, 'context' | 'operator'> & {
  context: AttributeContext | undefined
  operator: ConditionOperator | undefined
}

export const groupFormSchema = z.object({
  operator: z.enum(GROUP_OPERATORS, { error: 'Choose how the group combines its conditions.' }),
  description: z.string().trim().max(500, 'Keep the description under 500 characters.')
})

export type GroupFormState = z.input<typeof groupFormSchema>
