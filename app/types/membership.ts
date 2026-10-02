import type { UserStatusValue } from '~/types/user'
import type { Narrow, RequestBody, ResponseBody, Schemas } from '~/types/wire'

// Entity membership (the user<->entity link). Response shapes derive from the generated wire
// types (types/wire.ts).

export type MemberRoleSummary = ResponseBody<Schemas['RoleSummary']>

// A member row from GET /memberships/entity/{id}/details (user details + role summaries).
export type EntityMember = Narrow<ResponseBody<Schemas['EntityMemberResponse']>, { user_status: UserStatusValue }>

// A user's membership in an entity (entity-centric), from GET /memberships/user/{id}. Roles are IDs
// here (map via the roles pool); the entity is an ID (map via the entities pool).
export type Membership = ResponseBody<Schemas['MembershipResponse']>

// Every lifecycle status a membership (or a direct role assignment) can report.
export type MembershipStatus = Schemas['MembershipStatus']

// Only 'active'/'suspended' are set directly on create/update — the backend rejects the rest
// (DELETE handles revocation). See schemas/membership.py MembershipCreateRequest/UpdateRequest.
export type MembershipStatusValue = 'active' | 'suspended'

// POST /memberships/ — add an existing user to an entity with roles + lifecycle.
export type AddMemberInput = RequestBody<Schemas['MembershipCreateRequest'], 'user_id' | 'entity_id' | 'role_ids'> & {
  status: MembershipStatusValue
}

// PATCH /memberships/{entity_id}/{user_id} — every field optional (partial update).
export type UpdateMemberInput = Omit<RequestBody<Schemas['MembershipUpdateRequest']>, 'status'> & {
  status?: MembershipStatusValue
}
