import type { GetPermissionsParams } from '@/features/permissions/types/permissions.types'

export const permissionsKeys = {
  all: ['permissions'] as const,
  lists: () => [...permissionsKeys.all, 'list'] as const,
  list: (params: GetPermissionsParams) => [...permissionsKeys.lists(), params] as const,
  details: () => [...permissionsKeys.all, 'detail'] as const,
  detail: (permissionId: string) =>
    [...permissionsKeys.details(), permissionId] as const,
  conditionGroups: (permissionId: string) =>
    [...permissionsKeys.all, permissionId, 'condition-groups'] as const,
  conditions: (permissionId: string) =>
    [...permissionsKeys.all, permissionId, 'conditions'] as const,
  check: () => [...permissionsKeys.all, 'check'] as const,
}
