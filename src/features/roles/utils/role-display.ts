import type {
  Role,
  RoleScopeMode,
  RoleSystemFilter,
  RoleType,
  RoleTypeFilter,
  RoleUsageFilter,
  RolesPageSearch,
} from '@/features/roles/types/roles.types'

export function formatRoleToken(value: string, fallback?: string) {
  const formatted = value
    .split(/[_:-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

  return formatted || fallback || value
}

export function getRoleType(role: Role): RoleType {
  if (role.is_global && role.root_entity_id == null && role.scope_entity_id == null) {
    return 'global'
  }

  if (role.scope_entity_id) {
    return 'entity'
  }

  return 'root'
}

export function getRoleTypeLabel(roleOrType: Role | RoleType) {
  const roleType = typeof roleOrType === 'string' ? roleOrType : getRoleType(roleOrType)

  switch (roleType) {
    case 'global':
      return 'Global'
    case 'root':
      return 'Organization'
    case 'entity':
      return 'Entity-defined'
  }
}

export function getRoleTypeDescription(roleOrType: Role | RoleType) {
  const roleType = typeof roleOrType === 'string' ? roleOrType : getRoleType(roleOrType)

  switch (roleType) {
    case 'global':
      return 'System-wide role'
    case 'root':
      return 'Owned by one root organization'
    case 'entity':
      return 'Defined at one entity and applied by scope mode'
  }
}

export function getRoleDefinitionLabel(role: Role) {
  if (getRoleType(role) === 'global') {
    return 'System role catalog'
  }

  if (role.scope_entity_name) {
    return `Defined at ${role.scope_entity_name}`
  }

  if (role.root_entity_name) {
    return `Owned by ${role.root_entity_name}`
  }

  return 'Scoped role'
}

export function getRoleBlastRadiusLabel(role: Role) {
  const roleType = getRoleType(role)

  if (roleType === 'global') {
    return 'Affects every organization and entity'
  }

  if (roleType === 'root') {
    return role.root_entity_name
      ? `Assignable across ${role.root_entity_name}`
      : 'Assignable across the owning organization'
  }

  return role.scope === 'entity_only'
    ? 'Applies here only'
    : 'Applies here and descendants'
}

export function getRoleScopeSummary(role: Role) {
  const roleType = getRoleType(role)

  if (roleType === 'global') {
    return 'System-wide role'
  }

  if (roleType === 'root') {
    return role.root_entity_name
      ? `Owned by ${role.root_entity_name}`
      : 'Organization-scoped role'
  }

  if (role.scope_entity_name) {
    return role.scope === 'entity_only'
      ? `Defined at ${role.scope_entity_name}. Applies here only.`
      : `Defined at ${role.scope_entity_name}. Applies here and descendants.`
  }

  return `Scope mode: ${formatRoleToken(role.scope)}`
}

export function formatAssignableTypes(role: Role) {
  if (role.assignable_at_types.length === 0) {
    return null
  }

  return role.assignable_at_types.map((type) => formatRoleToken(type)).join(', ')
}

export function getRoleAssignmentRuleLabel(role: Role) {
  const formattedTypes = formatAssignableTypes(role)

  if (!formattedTypes) {
    return 'Assignable at any entity type'
  }

  return `Assignable at ${formattedTypes}`
}

export function getRoleOperationalSummary(role: Role) {
  if (role.is_auto_assigned) {
    return role.scope === 'entity_only'
      ? 'Automatically applied to members of the defining entity.'
      : 'Automatically applied to members of the defining entity and its descendants.'
  }

  return 'Assigned intentionally by an administrator.'
}

export function getRoleScopeModeLabel(scope: RoleScopeMode) {
  return scope === 'entity_only' ? 'Entity only' : 'Hierarchy'
}

export function groupPermissions(permissionNames: string[]) {
  const groupedPermissions = new Map<string, string[]>()

  permissionNames.forEach((permissionName) => {
    const [resource = 'other'] = permissionName.split(':')
    const group = groupedPermissions.get(resource) ?? []
    group.push(permissionName)
    groupedPermissions.set(resource, group)
  })

  return [...groupedPermissions.entries()]
    .map(([resource, permissions]) => ({
      resource,
      label: formatRoleToken(resource),
      permissions: permissions.sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
}

function matchesRoleType(role: Role, roleType: RoleTypeFilter) {
  return roleType === 'all' || getRoleType(role) === roleType
}

function matchesUsageFilter(role: Role, usage: RoleUsageFilter) {
  if (usage === 'all') {
    return true
  }

  return usage === 'auto' ? role.is_auto_assigned : !role.is_auto_assigned
}

function matchesSystemFilter(role: Role, system: RoleSystemFilter) {
  if (system === 'all') {
    return true
  }

  return system === 'system' ? role.is_system_role : !role.is_system_role
}

export function matchesRolesSearchFilters(role: Role, filters: RolesPageSearch) {
  if (!matchesRoleType(role, filters.roleType ?? 'all')) {
    return false
  }

  if (!matchesUsageFilter(role, filters.usage ?? 'all')) {
    return false
  }

  if (!matchesSystemFilter(role, filters.system ?? 'all')) {
    return false
  }

  if (filters.scopeMode && filters.scopeMode !== 'all' && role.scope !== filters.scopeMode) {
    return false
  }

  if (filters.scopeRootId && role.root_entity_id !== filters.scopeRootId) {
    return false
  }

  if (
    filters.assignableType &&
    !role.assignable_at_types.includes(filters.assignableType)
  ) {
    return false
  }

  if (filters.search) {
    const haystack = [
      role.name,
      role.display_name,
      role.description,
      role.root_entity_name,
      role.scope_entity_name,
      ...role.permissions,
      ...role.assignable_at_types,
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

export function sortRolesForCatalog(roles: Role[]) {
  return [...roles].sort((left, right) => {
    if (left.is_system_role !== right.is_system_role) {
      return left.is_system_role ? -1 : 1
    }

    if (left.is_auto_assigned !== right.is_auto_assigned) {
      return left.is_auto_assigned ? -1 : 1
    }

    return left.display_name.localeCompare(right.display_name)
  })
}
