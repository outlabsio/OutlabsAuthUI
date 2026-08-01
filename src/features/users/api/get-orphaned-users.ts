import type {
  OrphanedUsersListFilters,
  OrphanedUsersListResponse,
} from '@/features/users/types/users.types'
import { apiClient } from '@/lib/api/client'

const defaultOrphanedUsersFilters: Required<
  Pick<OrphanedUsersListFilters, 'page' | 'limit'>
> = {
  page: 1,
  limit: 20,
}

export async function getOrphanedUsers(
  filters: OrphanedUsersListFilters,
  options: { signal?: AbortSignal } = {}
) {
  const resolvedFilters = {
    ...defaultOrphanedUsersFilters,
    ...filters,
  }

  const searchParams = new URLSearchParams({
    page: String(resolvedFilters.page),
    limit: String(resolvedFilters.limit),
  })

  if (resolvedFilters.search) {
    searchParams.set('search', resolvedFilters.search)
  }

  if (resolvedFilters.rootEntityId) {
    searchParams.set('root_entity_id', resolvedFilters.rootEntityId)
  }

  return apiClient.get<OrphanedUsersListResponse>(
    `/users/orphaned?${searchParams.toString()}`,
    { signal: options.signal }
  )
}
