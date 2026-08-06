// ABAC (attribute-based access control) — condition groups + conditions attached to a role or
// a permission. Symmetric contract: /{roles|permissions}/{id}/condition-groups and
// /{roles|permissions}/{id}/conditions. Mirrors the React abac feature types.

export type AbacConditionValueType = 'string' | 'integer' | 'float' | 'boolean' | 'list'

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

// Which owner the conditions hang off — used to build the API base path.
export type AbacScopeKind = 'roles' | 'permissions'

export type CreateConditionGroupInput = {
  operator: 'AND' | 'OR'
  description?: string
}

export type CreateConditionInput = {
  attribute: string
  operator: string
  value?: string
  value_type: AbacConditionValueType
  description?: string
  condition_group_id?: string | null
}
