// ABAC (attribute-based access control) — condition groups + conditions attached to a role or
// a permission. Symmetric contract: /{roles|permissions}/{id}/condition-groups and
// /{roles|permissions}/{id}/conditions (list, create, PATCH, delete).
//
// Wire notes (outlabs-auth 0.1.x):
// - Responses carry `value` as the backend's stored TEXT form: lists are JSON text
//   ('["a","b"]'), scalars are str() of the typed value ('5', '1.5', 'True').
// - Requests carry `value` typed (string, number, boolean or an array); the backend serializes
//   it by `value_type`. The operator/attribute are not validated on write, so the editor must
//   only ever send the enum values and prefixed attributes defined in `~/schemas/abac`.

export type AbacConditionValueType = 'string' | 'integer' | 'float' | 'boolean' | 'list'

export type AbacGroupOperator = 'AND' | 'OR'

export type AbacConditionGroup = {
  id: string
  operator: AbacGroupOperator
  description?: string | null
  role_id?: string | null
  permission_id?: string | null
}

export type AbacCondition = {
  id: string
  attribute: string
  // Stored text — older rows may hold values outside the ConditionOperator enum.
  operator: string
  value?: string | null
  value_type: AbacConditionValueType | string
  description?: string | null
  condition_group_id?: string | null
}

// Which owner the conditions hang off — used to build the API base path.
export type AbacScopeKind = 'roles' | 'permissions'

// Typed request value (serialized server-side according to value_type).
export type AbacConditionValue = string | number | boolean | Array<string | number> | null

export type CreateConditionGroupInput = {
  operator: AbacGroupOperator
  description?: string | null
}

export type UpdateConditionGroupInput = Partial<CreateConditionGroupInput>

export type CreateConditionInput = {
  attribute: string
  operator: string
  value?: AbacConditionValue
  value_type: AbacConditionValueType
  description?: string | null
  condition_group_id?: string | null
}

// PATCH body — only the changed fields. The backend re-serializes `value` whenever `value` or
// `value_type` is present, so the editor always sends both together (see abacConditionPatch in
// utils/abac.ts).
export type UpdateConditionInput = Partial<CreateConditionInput>
