import type { PaginatedResponse } from '@/lib/api/paginated-response.types'

export type User = {
  id: string
  email: string
  first_name?: string | null
  last_name?: string | null
  status: string
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

export type UserListStatusFilter = 'active' | 'invited' | 'suspended' | 'banned'

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
