import type { PaginatedResponse } from '~/types/auth'
import type { Role } from '~/types/role'

// Ported from the React users feature (src/features/users/types). Wire shapes only.

export type UserStatusValue = 'active' | 'invited' | 'suspended' | 'banned' | 'deleted'

// A role assigned DIRECTLY to a user (distinct from roles granted via entity membership), with its
// validity window + the embedded role. From GET /users/{id}/role-memberships.
export type UserRoleMembership = {
  id: string
  user_id: string
  role_id: string
  assigned_at?: string | null
  valid_from?: string | null
  valid_until?: string | null
  status: string
  is_currently_valid: boolean
  can_grant_permissions: boolean
  role: Role
}

// POST /users/{id}/roles — assign one direct role, optional validity window.
export type AssignUserRoleInput = {
  userId: string
  roleId: string
  valid_from?: string | null
  valid_until?: string | null
}

export type User = {
  id: string
  email: string
  first_name?: string | null
  last_name?: string | null
  status: UserStatusValue
  email_verified: boolean
  phone_verified?: boolean
  is_superuser: boolean
  avatar_url?: string | null
  phone?: string | null
  locale?: string | null
  timezone?: string | null
  root_entity_id?: string | null
  root_entity_name?: string | null
  created_at?: string | null
  updated_at?: string | null
  last_login?: string | null
}

export type UsersListResponse = PaginatedResponse<User>

export type UsersListFilters = {
  page?: number
  limit?: number
  search?: string
  status?: UserStatusValue
  rootEntityId?: string
}

export type CreateUserInput = {
  email: string
  first_name?: string
  last_name?: string
  password?: string
  is_superuser?: boolean
}

export type UpdateUserInput = {
  first_name?: string
  last_name?: string
  phone?: string | null
}
