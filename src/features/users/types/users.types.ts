import type { Role } from '@/features/roles/types/roles.types'
import type { PaginatedResponse } from '@/lib/api/paginated-response.types'

export type UserStatusValue = 'active' | 'invited' | 'suspended' | 'banned' | 'deleted'
export type UserStatusUpdateValue = 'active' | 'suspended' | 'banned'

export type User = {
  id: string
  email: string
  first_name?: string | null
  last_name?: string | null
  status: UserStatusValue
  email_verified: boolean
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
  last_activity?: string | null
  last_password_change?: string | null
  suspended_until?: string | null
  locked_until?: string | null
  deleted_at?: string | null
}

export type UsersListResponse = PaginatedResponse<User>

export type UserListStatusFilter =
  | 'active'
  | 'invited'
  | 'suspended'
  | 'banned'
  | 'deleted'

export type UsersPageSearch = {
  page: number
  search?: string
  status?: UserListStatusFilter
  rootEntityId?: string
}

export type UsersListFilters = {
  page: number
  limit?: number
  search?: string
  status?: UserListStatusFilter
  rootEntityId?: string
}

export type InviteUserInput = {
  email: string
  first_name?: string
  last_name?: string
  role_ids?: string[]
  entity_id?: string
}

export type UpdateUserInput = {
  userId: string
  email?: string
  first_name?: string
  last_name?: string
}

export type UpdateUserStatusInput = {
  userId: string
  status: UserStatusUpdateValue
  suspended_until?: string
  reason?: string
}

export type AssignUserRoleInput = {
  userId: string
  roleId: string
  valid_from?: string
  valid_until?: string
}

export type RemoveUserRoleInput = {
  userId: string
  roleId: string
}

export type ResetUserPasswordInput = {
  userId: string
  new_password: string
}

export type DeleteUserInput = {
  userId: string
}

export type RestoreUserInput = {
  userId: string
}

export type UserRoleAssignment = {
  id: string
  user_id: string
  role_id: string
  assigned_at: string
  assigned_by_id?: string | null
  valid_from?: string | null
  valid_until?: string | null
  status: string
  revoked_at?: string | null
  revoked_by_id?: string | null
  revocation_reason?: string | null
  is_currently_valid: boolean
  can_grant_permissions: boolean
}

export type UserRoleMembership = UserRoleAssignment & {
  role: Role
}

export type UserPermission = {
  id: string
  name: string
  display_name: string
  description?: string | null
  resource?: string | null
  action?: string | null
  scope?: string | null
  is_system: boolean
  status: 'active' | 'inactive' | 'archived'
  is_active: boolean
  tags: string[]
  metadata: Record<string, unknown>
}

export type UserPermissionSource = {
  permission: UserPermission
  source: string
  source_id?: string | null
  source_name?: string | null
}

export type UserAuditEvent = {
  id: string
  occurred_at: string
  event_category: string
  event_type: string
  event_source: string
  actor_user_id?: string | null
  subject_user_id?: string | null
  subject_email_snapshot: string
  root_entity_id?: string | null
  entity_id?: string | null
  role_id?: string | null
  request_id?: string | null
  ip_address?: string | null
  user_agent?: string | null
  reason?: string | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

export type UserAuditEventsResponse = PaginatedResponse<UserAuditEvent>

export type GetUserAuditEventsParams = {
  page?: number
  limit?: number
  category?: string
  eventType?: string
  entityId?: string
}

export type UserMembershipHistoryEvent = {
  id: string
  membership_id: string
  user_id: string
  entity_id: string
  root_entity_id?: string | null
  actor_user_id?: string | null
  event_type: string
  event_source: string
  event_at: string
  reason?: string | null
  status: string
  previous_status?: string | null
  valid_from?: string | null
  valid_until?: string | null
  previous_valid_from?: string | null
  previous_valid_until?: string | null
  role_ids: string[]
  previous_role_ids: string[]
  role_names: string[]
  previous_role_names: string[]
  entity_display_name?: string | null
  entity_path: string[]
  root_entity_name?: string | null
}

export type UserMembershipHistoryResponse =
  PaginatedResponse<UserMembershipHistoryEvent>

export type GetUserMembershipHistoryParams = {
  page?: number
  limit?: number
  entityId?: string
  eventType?: string
}
