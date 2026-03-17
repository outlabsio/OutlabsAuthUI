export type AbacConditionValueType =
  | 'string'
  | 'integer'
  | 'float'
  | 'boolean'
  | 'list'

export type AbacConditionGroup = {
  id: string
  operator: 'AND' | 'OR'
  description?: string | null
  role_id?: string | null
  permission_id?: string | null
}

export type AbacCondition = {
  id: string
  attribute: string
  operator: string
  value?: string | null
  value_type: AbacConditionValueType
  description?: string | null
  condition_group_id?: string | null
}
