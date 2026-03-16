export type UserMembership = {
  id: string
  entity_id: string
  user_id: string
  role_ids: string[]
}

export type CreateMembershipInput = {
  userId: string
  entityId: string
  roleIds: string[]
}

export type UpdateMembershipRolesInput = {
  userId: string
  entityId: string
  roleIds: string[]
}
