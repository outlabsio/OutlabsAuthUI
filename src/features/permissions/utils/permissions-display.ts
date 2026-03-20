import type {
  Permission,
  PermissionsPageSearch,
} from '@/features/permissions/types/permissions.types'

export function formatPermissionToken(value: string, fallback?: string) {
  const formatted = value
    .split(/[_:-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

  return formatted || fallback || value
}

export function getPermissionResourceLabel(permission: Permission) {
  return formatPermissionToken(permission.resource ?? 'general', 'General')
}

export function getPermissionActionLabel(permission: Permission) {
  return formatPermissionToken(permission.action ?? permission.name.split(':')[1] ?? 'action')
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

export function getPermissionStatusVariant(permission: Permission) {
  switch (permission.status) {
    case 'active':
      return 'secondary'
    case 'inactive':
      return 'outline'
    case 'archived':
      return 'destructive'
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

export function sortPermissionsForCatalog(permissions: Permission[]) {
  return [...permissions].sort((left, right) => {
    if (left.is_system !== right.is_system) {
      return left.is_system ? -1 : 1
    }

    if (left.status !== right.status) {
      return left.status === 'active' ? -1 : 1
    }

    return left.display_name.localeCompare(right.display_name)
  })
}
