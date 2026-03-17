import { queryOptions } from '@tanstack/react-query'

import { getPermissionsCatalog } from '@/features/roles/api/get-permissions-catalog'
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
    queryFn: () => getRoles(params),
  })
}

export function getRoleQueryOptions(roleId: string) {
  return queryOptions({
    queryKey: rolesKeys.detail(roleId),
    queryFn: () => getRole(roleId),
    enabled: Boolean(roleId),
  })
}

export function getRolesForEntityQueryOptions(
  entityId: string,
  params: GetRolesParams = {}
) {
  return queryOptions({
    queryKey: rolesKeys.entityList(entityId, params),
    queryFn: () => getRolesForEntity(entityId, params),
    enabled: Boolean(entityId),
  })
}

export function getPermissionsCatalogQueryOptions() {
  return queryOptions({
    queryKey: rolesKeys.permissionsCatalog(),
    queryFn: getPermissionsCatalog,
  })
}

export function getRoleConditionGroupsQueryOptions(roleId: string) {
  return queryOptions({
    queryKey: rolesKeys.conditionGroups(roleId),
    queryFn: () => getRoleConditionGroups(roleId),
    enabled: Boolean(roleId),
  })
}

export function getRoleConditionsQueryOptions(roleId: string) {
  return queryOptions({
    queryKey: rolesKeys.conditions(roleId),
    queryFn: () => getRoleConditions(roleId),
    enabled: Boolean(roleId),
  })
}
