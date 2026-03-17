import { queryOptions } from '@tanstack/react-query'

import { getPermission } from '@/features/permissions/api/get-permission'
import { getPermissionConditionGroups } from '@/features/permissions/api/get-permission-condition-groups'
import { getPermissionConditions } from '@/features/permissions/api/get-permission-conditions'
import { getPermissions } from '@/features/permissions/api/get-permissions'
import { permissionsKeys } from '@/features/permissions/api/permissions.keys'
import type { GetPermissionsParams } from '@/features/permissions/types/permissions.types'

export function getPermissionsQueryOptions(params: GetPermissionsParams = {}) {
  return queryOptions({
    queryKey: permissionsKeys.list(params),
    queryFn: () => getPermissions(params),
  })
}

export function getPermissionQueryOptions(permissionId: string) {
  return queryOptions({
    queryKey: permissionsKeys.detail(permissionId),
    queryFn: () => getPermission(permissionId),
    enabled: Boolean(permissionId),
  })
}

export function getPermissionConditionGroupsQueryOptions(permissionId: string) {
  return queryOptions({
    queryKey: permissionsKeys.conditionGroups(permissionId),
    queryFn: () => getPermissionConditionGroups(permissionId),
    enabled: Boolean(permissionId),
  })
}

export function getPermissionConditionsQueryOptions(permissionId: string) {
  return queryOptions({
    queryKey: permissionsKeys.conditions(permissionId),
    queryFn: () => getPermissionConditions(permissionId),
    enabled: Boolean(permissionId),
  })
}
