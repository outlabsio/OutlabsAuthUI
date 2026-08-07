import type { UserStatusValue } from '~/types/user'

// Shapes for entity membership (the user<->entity link). Mirrors the backend
// EntityMemberResponse from GET /memberships/entity/{id}/details.

export type MemberRoleSummary = {
  id: string
  name: string
  display_name: string
}

export type EntityMember = {
  id: string // membership id
  user_id: string
  user_email: string
  user_first_name?: string | null
  user_last_name?: string | null
  user_status: UserStatusValue
  roles: MemberRoleSummary[]
  status: string
  effective_status: string
  joined_at?: string | null
  valid_from?: string | null
  valid_until?: string | null
}

// A user's membership in an entity (entity-centric), from GET /memberships/user/{id}. Roles are IDs
// here (map via the roles pool); the entity is an ID (map via the entities pool).
export type Membership = {
  id: string
  entity_id: string
  user_id: string
  role_ids: string[]
  status: string
  effective_status: string
  valid_from?: string | null
  valid_until?: string | null
  is_currently_valid: boolean
}

// Only 'active'/'suspended' are set directly on create/update — the backend rejects the rest
// (DELETE handles revocation). See schemas/membership.py MembershipCreateRequest/UpdateRequest.
export type MembershipStatusValue = 'active' | 'suspended'

// POST /memberships/ — add an existing user to an entity with roles + lifecycle.
export type AddMemberInput = {
  user_id: string
  entity_id: string
  role_ids: string[]
  status: MembershipStatusValue
  valid_from?: string | null
  valid_until?: string | null
  reason?: string | null
}

// PATCH /memberships/{entity_id}/{user_id} — every field optional (partial update).
export type UpdateMemberInput = {
  role_ids?: string[]
  status?: MembershipStatusValue
  valid_from?: string | null
  valid_until?: string | null
  reason?: string | null
}
