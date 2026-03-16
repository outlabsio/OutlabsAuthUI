import type { Role } from '@/features/roles/types/roles.types'

export function formatRoleToken(value: string, fallback?: string) {
  const formatted = value
    .split(/[_:-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

  return formatted || fallback || value
}

export function formatAssignableTypes(role: Role) {
  if (role.assignable_at_types.length === 0) {
    return null
  }

  return role.assignable_at_types.map((type) => formatRoleToken(type)).join(', ')
}

export function getRoleScopeSummary(role: Role) {
  if (role.is_global && role.root_entity_id == null && role.scope_entity_id == null) {
    return 'System-wide global role'
  }

  if (role.root_entity_name && role.scope_entity_id == null) {
    return `Organization-scoped to ${role.root_entity_name}`
  }

  if (role.scope_entity_name) {
    return role.scope === 'entity_only'
      ? `Only at ${role.scope_entity_name}`
      : `Inherited from ${role.scope_entity_name}`
  }

  return `Scope: ${formatRoleToken(role.scope)}`
}
