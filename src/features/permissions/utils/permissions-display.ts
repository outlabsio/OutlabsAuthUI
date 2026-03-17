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
  return permission.is_active ? 'Active in the catalog' : 'Inactive and should not be assigned'
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

  return permission.is_active
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

  return status === 'active' ? permission.is_active : !permission.is_active
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

    if (left.is_active !== right.is_active) {
      return left.is_active ? -1 : 1
    }

    return left.display_name.localeCompare(right.display_name)
  })
}

export function groupPermissionsByResource(permissions: Permission[]) {
  const wildcardPermissions = permissions.filter(
    (permission) => permission.resource === '*' || permission.name === '*:*'
  )
  const permissionsByResource = new Map<string, Permission[]>()

  permissions
    .filter((permission) => !wildcardPermissions.includes(permission))
    .forEach((permission) => {
      const key = permission.resource ?? 'general'
      const group = permissionsByResource.get(key) ?? []
      group.push(permission)
      permissionsByResource.set(key, group)
    })

  const grouped = [...permissionsByResource.entries()]
    .map(([resource, items]) => ({
      key: resource,
      label: formatPermissionToken(resource, 'General'),
      description: `Actions that describe ${formatPermissionToken(resource, 'general')} access.`,
      permissions: sortPermissionsForCatalog(items),
    }))
    .sort((left, right) => left.label.localeCompare(right.label))

  if (wildcardPermissions.length > 0) {
    grouped.unshift({
      key: 'wildcard',
      label: 'Wildcard',
      description: 'Broad permissions that match many resources or actions.',
      permissions: sortPermissionsForCatalog(wildcardPermissions),
    })
  }

  return grouped
}
