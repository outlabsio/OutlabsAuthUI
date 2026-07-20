import type {
  UsersListFilters,
  UsersListResponse,
} from '@/features/users/types/users.types'
import { apiClient } from '@/lib/api/client'

const defaultUsersFilters: Required<Pick<UsersListFilters, 'page' | 'limit'>> = {
  page: 1,
  limit: 20,
}

export async function getUsers(
  filters: UsersListFilters,
  options: { signal?: AbortSignal } = {}
) {
  const resolvedFilters = {
    ...defaultUsersFilters,
    ...filters,
  }

  const searchParams = new URLSearchParams({
    page: String(resolvedFilters.page),
    limit: String(resolvedFilters.limit),
  })

  if (resolvedFilters.search) {
    searchParams.set('search', resolvedFilters.search)
  }

  if (resolvedFilters.status) {
    searchParams.set('status', resolvedFilters.status)
  }

  if (resolvedFilters.rootEntityId) {
    searchParams.set('root_entity_id', resolvedFilters.rootEntityId)
  }

  return apiClient.get<UsersListResponse>(`/users/?${searchParams.toString()}`, {
    signal: options.signal,
  })
}
