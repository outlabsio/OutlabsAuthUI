import { queryOptions } from '@tanstack/react-query'

import { getRoles } from '@/features/roles/api/get-roles'
import { rolesKeys } from '@/features/roles/api/roles.keys'
import type { GetRolesParams } from '@/features/roles/types/roles.types'

export function getRolesQueryOptions(params: GetRolesParams = {}) {
  return queryOptions({
    queryKey: rolesKeys.list(params),
    queryFn: () => getRoles(params),
  })
}
