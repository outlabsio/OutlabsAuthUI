import type {
  Permission,
  PermissionsPageSearch,
} from '@/features/permissions/types/permissions.types'
import type { AppStatusTone } from '@/components/app/app-status'

const permissionStatusRank: Record<Permission['status'], number> = {
  active: 0,
  inactive: 1,
  archived: 2,
}

const permissionActionRank = new Map<string, number>([
  ['read', 0],
  ['read_tree', 1],
  ['create', 2],
  ['write', 3],
  ['update', 4],
  ['delete', 5],
  ['manage', 6],
  ['*', 7],
])

export function formatPermissionToken(value: string, fallback?: string) {
  const formatted = value
    .split(/[_:-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

  return formatted || fallback || value
}

function getPermissionResourceToken(permission: Permission) {
  return permission.resource ?? permission.name.split(':')[0] ?? 'general'
}

function formatPermissionResourceToken(value?: string | null) {
  if (!value) {
    return 'General'
  }

  return value === '*' ? 'Wildcard' : formatPermissionToken(value, 'General')
}

function getPermissionActionToken(permission: Permission) {
  return permission.action ?? permission.name.split(':')[1] ?? 'action'
}

export function getPermissionResourceLabel(permission: Permission) {
  return formatPermissionResourceToken(getPermissionResourceToken(permission))
}

export function getPermissionActionLabel(permission: Permission) {
  const action = getPermissionActionToken(permission)

  return action === '*' ? 'All actions' : formatPermissionToken(action)
}

export function getPermissionScopeLabel(permission: Permission) {
  if (!permission.scope) {
    return 'No scope suffix'
  }

  return formatPermissionToken(permission.scope)
}

export function getPermissionLifecycleLabel(permission: Permission) {
  switch (permission.status) {
    case 'active':
      return 'Active in the catalog'
    case 'inactive':
      return 'Inactive and should not be assigned'
    case 'archived':
      return 'Archived and hidden from normal reads'
  }
}

export function getPermissionStatusTone(permission: Permission): AppStatusTone {
  switch (permission.status) {
    case 'active':
      return 'success'
    case 'inactive':
      return 'warning'
    case 'archived':
      return 'error'
  }
}

export function getPermissionBehaviorSummary(permission: Permission) {
  if (permission.name === '*:*') {
    return 'Wildcard permission. Grants every resource and action.'
  }

  if (permission.resource === '*' || permission.action === '*') {
    return 'Wildcard permission. Broader than a single resource action.'
  }

  if (permission.scope) {
    return `Permission name includes the ${formatPermissionToken(permission.scope)} scope suffix.`
  }

  return 'Permissions define capability only. Roles determine where they apply.'
}

export function getPermissionOperationalSummary(permission: Permission) {
  if (permission.is_system) {
    return 'Protected system permission. Inspectable, but not editable or deletable.'
  }

  return permission.status === 'active'
    ? 'Custom permission available for role composition.'
    : 'Custom permission retained for auditability, but currently inactive.'
}

function matchesSystemFilter(permission: Permission, system: PermissionsPageSearch['system']) {
  if (!system || system === 'all') {
    return true
  }

  return system === 'system' ? permission.is_system : !permission.is_system
}

function matchesStatusFilter(permission: Permission, status: PermissionsPageSearch['status']) {
  if (!status || status === 'all') {
    return true
  }

  return status === 'active'
    ? permission.status === 'active'
    : permission.status === 'inactive'
}

export function matchesPermissionsSearchFilters(
  permission: Permission,
  filters: PermissionsPageSearch
) {
  if (!matchesSystemFilter(permission, filters.system)) {
    return false
  }

  if (!matchesStatusFilter(permission, filters.status)) {
    return false
  }

  if (filters.resource && permission.resource !== filters.resource) {
    return false
  }

  if (filters.tag && !permission.tags.includes(filters.tag)) {
    return false
  }

  if (filters.search) {
    const haystack = [
      permission.name,
      permission.display_name,
      permission.description,
      permission.resource,
      permission.action,
      permission.scope,
      ...permission.tags,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    if (!haystack.includes(filters.search.toLowerCase())) {
      return false
    }
  }

  return true
}

function comparePermissionsForCatalog(left: Permission, right: Permission) {
  const leftResource = formatPermissionResourceToken(getPermissionResourceToken(left))
  const rightResource = formatPermissionResourceToken(getPermissionResourceToken(right))

  if (leftResource !== rightResource) {
    return leftResource.localeCompare(rightResource)
  }

  if (left.is_system !== right.is_system) {
    return left.is_system ? -1 : 1
  }

  if (left.status !== right.status) {
    return permissionStatusRank[left.status] - permissionStatusRank[right.status]
  }

  const leftAction = getPermissionActionToken(left)
  const rightAction = getPermissionActionToken(right)
  const leftActionRank = permissionActionRank.get(leftAction) ?? Number.POSITIVE_INFINITY
  const rightActionRank = permissionActionRank.get(rightAction) ?? Number.POSITIVE_INFINITY

  if (leftActionRank !== rightActionRank) {
    return leftActionRank - rightActionRank
  }

  const actionComparison = getPermissionActionLabel(left).localeCompare(
    getPermissionActionLabel(right)
  )

  if (actionComparison !== 0) {
    return actionComparison
  }

  return left.display_name.localeCompare(right.display_name)
}

export function sortPermissionsForCatalog(permissions: Permission[]) {
  return [...permissions].sort(comparePermissionsForCatalog)
}

export function groupPermissionsForCatalog(permissions: Permission[]) {
  const groups = new Map<string, Permission[]>()

  sortPermissionsForCatalog(permissions).forEach((permission) => {
    const resource = getPermissionResourceToken(permission)
    const group = groups.get(resource) ?? []

    group.push(permission)
    groups.set(resource, group)
  })

  return [...groups.entries()]
    .map(([resource, groupPermissions]) => ({
      resource,
      label: formatPermissionResourceToken(resource),
      permissions: groupPermissions,
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
}
