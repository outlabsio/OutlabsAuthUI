import { infiniteQueryOptions, keepPreviousData, queryOptions } from '@tanstack/react-query'

import { getRoleConditionGroups } from '@/features/roles/api/get-role-condition-groups'
import { getRoleConditions } from '@/features/roles/api/get-role-conditions'
import { getRole } from '@/features/roles/api/get-role'
import { getRolesForEntity } from '@/features/roles/api/get-roles-for-entity'
import { getRoles } from '@/features/roles/api/get-roles'
import { rolesKeys } from '@/features/roles/api/roles.keys'
import type { GetRolesParams } from '@/features/roles/types/roles.types'

export function getRolesQueryOptions(params: GetRolesParams = {}) {
  return queryOptions({
    queryKey: rolesKeys.list(params),
    queryFn: ({ signal }) => getRoles(params, { signal }),
    placeholderData: keepPreviousData,
  })
}

export function getInfiniteRolesQueryOptions(params: Omit<GetRolesParams, 'page'> = {}) {
  return infiniteQueryOptions({
    queryKey: rolesKeys.infiniteList(params),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      getRoles(
        {
          ...params,
          page: pageParam,
        },
        { signal }
      ),
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.pages ? lastPage.page + 1 : undefined,
  })
}

export function getRoleQueryOptions(roleId: string) {
  return queryOptions({
    queryKey: rolesKeys.detail(roleId),
    queryFn: ({ signal }) => getRole(roleId, { signal }),
    enabled: Boolean(roleId),
  })
}

export function getRolesForEntityQueryOptions(
  entityId: string,
  params: GetRolesParams = {}
) {
  return queryOptions({
    queryKey: rolesKeys.entityList(entityId, params),
    queryFn: ({ signal }) => getRolesForEntity(entityId, params, { signal }),
    enabled: Boolean(entityId),
    placeholderData: keepPreviousData,
  })
}

export function getRoleConditionGroupsQueryOptions(roleId: string) {
  return queryOptions({
    queryKey: rolesKeys.conditionGroups(roleId),
    queryFn: ({ signal }) => getRoleConditionGroups(roleId, { signal }),
    enabled: Boolean(roleId),
  })
}

export function getRoleConditionsQueryOptions(roleId: string) {
  return queryOptions({
    queryKey: rolesKeys.conditions(roleId),
    queryFn: ({ signal }) => getRoleConditions(roleId, { signal }),
    enabled: Boolean(roleId),
  })
}
