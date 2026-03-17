import type {
  EntityMember,
  GetEntityMembersParams,
} from '@/features/entities/types/entities.types'
import { apiClient } from '@/lib/api/client'

const defaultEntityMembersParams: Required<GetEntityMembersParams> = {
  page: 1,
  limit: 50,
  includeInactive: false,
}

export function getEntityMembers(
  entityId: string,
  params: GetEntityMembersParams = {}
) {
  const resolvedParams = {
    ...defaultEntityMembersParams,
    ...params,
  }

  const searchParams = new URLSearchParams({
    page: String(resolvedParams.page),
    limit: String(resolvedParams.limit),
  })

  if (resolvedParams.includeInactive) {
    searchParams.set('include_inactive', 'true')
  }

  return apiClient.get<EntityMember[]>(
    `/memberships/entity/${entityId}/details?${searchParams.toString()}`
  )
}
