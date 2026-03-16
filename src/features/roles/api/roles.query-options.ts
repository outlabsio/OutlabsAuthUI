import { queryOptions } from '@tanstack/react-query'

import { getRolesForEntity } from '@/features/roles/api/get-roles-for-entity'
import { getRoles } from '@/features/roles/api/get-roles'
import { rolesKeys } from '@/features/roles/api/roles.keys'
import type { GetRolesParams } from '@/features/roles/types/roles.types'

export function getRolesQueryOptions(params: GetRolesParams = {}) {
  return queryOptions({
    queryKey: rolesKeys.list(params),
    queryFn: () => getRoles(params),
  })
}

export function getRolesForEntityQueryOptions(
  entityId: string,
  params: GetRolesParams = {}
) {
  return queryOptions({
    queryKey: rolesKeys.entityList(entityId, params),
    queryFn: () => getRolesForEntity(entityId, params),
  })
}
