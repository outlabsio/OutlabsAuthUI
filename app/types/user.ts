import type { PaginatedResponse, SessionUser } from '~/types/auth'
import type { MembershipStatusValue } from '~/types/membership'
import type { Role } from '~/types/role'
import type { Narrow, RequestBody, ResponseBody, Schemas } from '~/types/wire'

// Users. Response shapes derive from the generated wire types (types/wire.ts).

export type UserStatusValue = 'active' | 'invited' | 'suspended' | 'banned' | 'deleted'

// A role assigned DIRECTLY to a user (distinct from roles granted via entity membership), with its
// validity window, lifecycle status and the embedded role. From GET /users/{id}/role-memberships.
export type UserRoleMembership = Narrow<ResponseBody<Schemas['UserRoleMembershipDetailResponse']>, { role: Role }>

// POST /users/{id}/roles — assign one direct role, optional validity window.
export type AssignUserRoleInput = {
  userId: string
  roleId: string
  valid_from?: string | null
  valid_until?: string | null
}

// PATCH /users/{id}/role-memberships/{membershipId} — edit an existing direct role assignment's
// validity window and/or status. 'revoked' is sent only to remove a SUSPENDED assignment: DELETE
// /users/{id}/roles/{roleId} revokes an active one and answers 404 for any other status.
export type UpdateUserRoleMembershipInput = {
  valid_from?: string | null
  valid_until?: string | null
  status?: MembershipStatusValue | 'revoked'
}

// POST /auth/invite — invite by email; optionally attach an entity membership with roles (entity_id
// set) or direct account roles (no entity_id). Creates an INVITED account with no password.
export type InviteUserInput = RequestBody<Schemas['InviteUserRequest'], 'email'>

// Statuses an admin can set via PATCH /users/{id}/status ('deleted' is via DELETE, not here).
export type UserStatusUpdateValue = 'active' | 'suspended' | 'banned'

export type UpdateUserStatusInput = {
  userId: string
  status: UserStatusUpdateValue
  suspended_until?: string
  reason?: string
}

// PATCH /users/{id}/password — admin reset, no current password required.
export type ResetUserPasswordInput = {
  userId: string
  new_password: string
}

// A user record (GET /users/{id}); the same shape as the signed-in identity.
export type User = SessionUser

export type UsersListResponse = PaginatedResponse<User>

// GET /users/orphaned: users with no entity membership, each with its membership summary.
export type OrphanedUser = Narrow<ResponseBody<Schemas['OrphanedUserResponse']>, { user: User }>
export type OrphanedUsersListResponse = PaginatedResponse<OrphanedUser>

// Retained, append-only membership lifecycle entries. Unlike the current Membership shape,
// this endpoint includes removed and superseded access so an administrator can trace changes.
export type UserMembershipHistoryEvent = ResponseBody<Schemas['MembershipHistoryEventResponse']>

export type UserMembershipHistoryResponse = PaginatedResponse<UserMembershipHistoryEvent>

export type UsersListFilters = {
  page?: number
  limit?: number
  search?: string
  status?: UserStatusValue
  isSuperuser?: boolean
  rootEntityId?: string
}

// GET /users/orphaned accepts paging, search and the root organization (no status filter).
export type OrphanedUsersFilters = Pick<UsersListFilters, 'page' | 'limit' | 'search' | 'rootEntityId'>

export type CreateUserInput = RequestBody<Schemas['UserCreateRequest'], 'email' | 'password'>

// PATCH /users/{id}: email, names and phone (only the changed fields are sent).
export type UpdateUserInput = Pick<RequestBody<Schemas['UserUpdateRequest']>, 'email' | 'first_name' | 'last_name' | 'phone'>
