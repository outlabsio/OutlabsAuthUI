export type UserMembership = {
  id: string
  entity_id: string
  user_id: string
  role_ids: string[]
  status: string
  effective_status: string
  joined_at: string
  joined_by_id?: string | null
  valid_from?: string | null
  valid_until?: string | null
  revoked_at?: string | null
  revoked_by_id?: string | null
  revocation_reason?: string | null
  is_currently_valid: boolean
  can_grant_permissions: boolean
}

export type CreateMembershipInput = {
  userId: string
  entityId: string
  roleIds: string[]
  status?: 'active' | 'suspended'
  validFrom?: string | null
  validUntil?: string | null
  reason?: string | null
}

export type UpdateMembershipInput = {
  userId: string
  entityId: string
  roleIds?: string[]
  status?: 'active' | 'suspended'
  validFrom?: string | null
  validUntil?: string | null
  reason?: string | null
}

export type RemoveMembershipInput = {
  userId: string
  entityId: string
}

export type GetUserMembershipsParams = {
  includeInactive?: boolean
}
