import type { AbacCondition, AbacConditionGroup } from '@/features/abac/types/abac.types'
import type { AbacConditionFormValues } from '@/features/abac/schemas/abac-condition-form.schema'

export const abacConditionOperatorOptions = [
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
  'after',
] as const

export function parseAbacConditionValue(values: AbacConditionFormValues) {
  if (!values.value) {
    return undefined
  }

  if (values.valueType === 'integer' || values.valueType === 'float') {
    return Number(values.value)
  }

  if (values.valueType === 'boolean') {
    return values.value === 'true'
  }

  if (values.valueType === 'list') {
    return values.value
      .split(/[\n,]/g)
      .map((value) => value.trim())
      .filter(Boolean)
  }

  return values.value
}

export function formatAbacConditionValue(condition: AbacCondition) {
  if (!condition.value) {
    return 'No value'
  }

  if (condition.value_type === 'list') {
    try {
      const parsedValue = JSON.parse(condition.value) as string[]
      return parsedValue.join(', ')
    } catch {
      return condition.value
    }
  }

  return condition.value
}

export function getAbacConditionGroupLabel(group?: AbacConditionGroup | null) {
  if (!group) {
    return 'Ungrouped'
  }

  return `${group.operator} group`
}
