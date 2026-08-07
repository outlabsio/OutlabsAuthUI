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
