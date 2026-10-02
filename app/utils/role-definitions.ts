// Role and permission AUTHORING rules (the roles and permissions workspaces): how a role's type
// reads, what an admin may do with a role or permission row, which permissions a role editor may
// offer, and how an edit is sent. A pure port of the outlabs-auth checks behind them:
// - routers/roles.py _require_role_create_scope: only an actor with global scope (superuser,
//   active direct system-wide role, or no entity hierarchy) may create a system-wide role; a
//   scoped admin creates roles in their own organization or entities.
// - services/role.py update_role / add_permissions_by_name / remove_permissions_by_name: system
//   roles cannot be modified at all; archived roles are read-only (DELETE archives).
// - services/role.py _resolve_permissions_by_name: a permission that is not active cannot be
//   attached ("One or more permissions are not active", details.inactive_permissions), and a
//   PATCH with `permissions` re-resolves the WHOLE set, so a description edit fails while any
//   attached permission is inactive. Edits therefore apply a permission diff through
//   POST/DELETE /roles/{id}/permissions and never re-send the set.
// - services/permission.py update_permission: system permissions cannot be modified.
// - routers/_authz_utils.py require_can_delegate_permissions (SEC-2): a non-superuser may only
//   attach permissions they hold (wildcards and _tree/_all scopes count, through the matcher).
// Keep this file free of Vue/Nuxt imports: it is unit-tested in isolation.
import type { Permission } from '~/types/permission'
import type { Role, RoleType } from '~/types/role'
import { parsePermissionName } from '~/utils/permissions'
import { ROLE_TYPE_LABELS, roleTypeOf } from '~/utils/role-access'
import type { BadgeStyle } from '~/utils/status'

type RoleWhere = Pick<Role, 'is_global' | 'root_entity_id' | 'scope_entity_id' | 'root_entity_name' | 'scope_entity_name' | 'scope'>

// --- How a role's type reads (list Type column, detail, form) ---

/** The type badge, the same in the list and the detail: a type, not a status, so neutral. */
export function roleTypeBadge(role: Pick<Role, 'is_global' | 'root_entity_id' | 'scope_entity_id'>): BadgeStyle {
  return { color: 'neutral', variant: 'subtle', label: ROLE_TYPE_LABELS[roleTypeOf(role)] }
}

/** Where the role is defined: its organization, or its entity; null for system-wide roles. */
export function roleDefinedAt(role: RoleWhere): string | null {
  const type = roleTypeOf(role)
  if (type === 'entity') return role.scope_entity_name || 'An entity outside your view'
  if (type === 'root') return role.root_entity_name || 'An organization outside your view'
  return null
}

export const ROLE_SCOPE_LABELS: Record<Role['scope'], string> = {
  hierarchy: 'Entity and below',
  entity_only: 'Entity only'
}

/**
 * Where an entity-local role's permissions apply. Only entity-local roles have a scope that
 * matters (services/permission.py applies it to the defining entity); null for the others.
 */
export function roleScopeLabel(role: Pick<Role, 'is_global' | 'root_entity_id' | 'scope_entity_id' | 'scope'>): string | null {
  return roleTypeOf(role) === 'entity' ? ROLE_SCOPE_LABELS[role.scope] : null
}

/**
 * The create form's Type choices. System-wide needs global reach (the backend refuses anyone
 * else); an organization role needs an organization to choose and an entity role an entity
 * (`canPickRoot` / `canPickEntity` false when the admin has none, F-016), so no card dead-ends.
 */
export function roleTypeChoices(options: { enterprise: boolean, actorIsGlobal: boolean | null, canPickRoot?: boolean, canPickEntity?: boolean }): RoleType[] {
  if (!options.enterprise) return ['global']
  const scoped: RoleType[] = [
    ...(options.canPickRoot === false ? [] : ['root' as const]),
    ...(options.canPickEntity === false ? [] : ['entity' as const])
  ]
  return options.actorIsGlobal === true ? ['global', ...scoped] : scoped
}

export const ROLE_TYPE_CHOICE_DESCRIPTIONS: Record<RoleType, string> = {
  global: 'Defined for the whole system. Can be granted in every organization.',
  root: 'Owned by one organization. Can be granted anywhere inside it.',
  entity: 'Defined at one entity. Can be granted there, and below it unless limited to the entity.'
}

/**
 * A role name (slug) from its display name: lowercase letters, digits and underscores, the
 * convention of the built-in roles. "Regional Admin (West)" -> "regional_admin_west".
 */
export function roleSlugFromDisplayName(displayName: string, max = 100): string {
  return displayName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max)
    .replace(/_+$/g, '')
}

// --- What an admin may do with a row ---

export type RoleRowPolicy = {
  canEdit: boolean
  canArchive: boolean
  canDuplicate: boolean
  /** Why the role cannot be changed (system or archived); null when it can be. */
  lockedReason: string | null
}

export const SYSTEM_ROLE_LOCK = 'System roles are built in and can\'t be changed. Duplicate it to make a custom role you can edit.'
export const ARCHIVED_ROLE_LOCK = 'Archived roles are read-only.'

export function roleRowPolicy(role: Pick<Role, 'is_system_role' | 'status'>, actor: { canUpdate: boolean, canDelete: boolean, canCreate: boolean }): RoleRowPolicy {
  if (role.is_system_role) {
    return { canEdit: false, canArchive: false, canDuplicate: actor.canCreate, lockedReason: SYSTEM_ROLE_LOCK }
  }
  if (role.status === 'archived') {
    return { canEdit: false, canArchive: false, canDuplicate: actor.canCreate, lockedReason: ARCHIVED_ROLE_LOCK }
  }
  return { canEdit: actor.canUpdate, canArchive: actor.canDelete, canDuplicate: actor.canCreate, lockedReason: null }
}

export type PermissionRowPolicy = {
  canEdit: boolean
  canArchive: boolean
  lockedReason: string | null
}

export const SYSTEM_PERMISSION_LOCK = 'System permissions are built in and can\'t be changed.'

export function permissionRowPolicy(permission: Pick<Permission, 'is_system'>, actor: { canUpdate: boolean, canDelete: boolean }): PermissionRowPolicy {
  if (permission.is_system) return { canEdit: false, canArchive: false, lockedReason: SYSTEM_PERMISSION_LOCK }
  return { canEdit: actor.canUpdate, canArchive: actor.canDelete, lockedReason: null }
}

// --- Permission sets ---

/** What an edit changes in a role's permission set (each list sorted, deduped). */
export function rolePermissionChanges(before: readonly string[], after: readonly string[]): { added: string[], removed: string[] } {
  const was = new Set(before)
  const now = new Set(after)
  return {
    added: [...now].filter(name => !was.has(name)).sort(),
    removed: [...was].filter(name => !now.has(name)).sort()
  }
}

/**
 * The permissions a delegated admin may attach when the catalog is not readable: what they hold,
 * plus the base action of each `_tree` / `_all` grant (holding user:read_tree lets them grant
 * user:read: the backend matcher counts it). Wildcards stay as held; they cannot be expanded
 * without the catalog. Sorted, deduped.
 */
export function delegablePermissionNames(held: readonly string[]): string[] {
  const names = new Set<string>()
  for (const name of held) {
    if (!name) continue
    names.add(name)
    const parsed = parsePermissionName(name)
    if ((parsed.scope === 'tree' || parsed.scope === 'all') && parsed.resource !== '*' && parsed.action !== '*') {
      names.add(`${parsed.resource}:${parsed.action}`)
    }
  }
  return [...names].sort()
}

export type PermissionOption = {
  name: string
  /** The actor may not attach it (not held); removing it is always allowed. */
  blocked: boolean
  /** The definition is inactive: it grants nothing and cannot be attached. */
  inactive: boolean
}

/**
 * The options of a role's permission picker. From the catalog when readable: active permissions,
 * non-held ones blocked for a non-superuser; an inactive permission appears only when the role
 * already carries it (flagged, so it can be removed). Without the catalog: the delegable names.
 * Anything selected stays an option, so it can always be deselected.
 */
export function permissionPickerOptions(input: {
  catalog: readonly Pick<Permission, 'name' | 'status'>[] | null
  held: readonly string[]
  selected: readonly string[]
  superuser: boolean
  allows: (name: string) => boolean
}): PermissionOption[] {
  const chosen = new Set(input.selected)
  const out = new Map<string, PermissionOption>()
  if (input.catalog) {
    for (const permission of input.catalog) {
      const inactive = permission.status !== 'active'
      if (inactive && !chosen.has(permission.name)) continue
      out.set(permission.name, {
        name: permission.name,
        inactive,
        blocked: !input.superuser && !chosen.has(permission.name) && !input.allows(permission.name)
      })
    }
  } else {
    for (const name of delegablePermissionNames(input.held)) out.set(name, { name, inactive: false, blocked: false })
  }
  for (const name of chosen) {
    if (!out.has(name)) out.set(name, { name, inactive: false, blocked: false })
  }
  return [...out.values()]
}

/**
 * The note a delegated admin (not a superuser) reads above the permission picker. Its wording
 * follows where the picker's options come from: with the catalog, permissions they don't hold are
 * listed but can't be added; without it (no permission:read, or the catalog failed to load), only
 * the permissions they hold are listed at all.
 */
export function roleDelegationNote(input: { superuser: boolean, listsCatalog: boolean }): string | null {
  if (input.superuser) return null
  return input.listsCatalog
    ? 'Permissions you don\'t hold are listed but can\'t be added. You can always remove one.'
    : 'Only the permissions you hold are listed. You can always remove one.'
}

/** The selected permissions the catalog says are not active (none when it is not readable). */
export function inactiveSelected(selected: readonly string[], catalog: readonly Pick<Permission, 'name' | 'status'>[] | null): string[] {
  if (!catalog) return []
  const inactive = new Set(catalog.filter(p => p.status !== 'active').map(p => p.name))
  return [...new Set(selected)].filter(name => inactive.has(name)).sort()
}

// --- Duplicate ---

export type RoleDraft = {
  role_type: RoleType
  display_name: string
  name: string
  description: string
  root_entity_id: string
  scope_entity_id: string
  scope: Role['scope']
  status: 'active' | 'inactive'
  is_auto_assigned: boolean
  assignable_at_types: string[]
  permissions: string[]
}

/**
 * A create-form draft copying `role` as a custom role: same permissions, description, scope and
 * entity types; a "(copy)" name. Its type falls back to the actor's first allowed type when they
 * may not create the source's (a system-wide role duplicated by an organization admin becomes an
 * organization role of `defaultRootId`). Never auto-assigned: that applies retroactively.
 */
export function duplicateRoleDraft(role: Role, options: { allowedTypes: readonly RoleType[], defaultRootId?: string | null }): RoleDraft {
  const sourceType = roleTypeOf(role)
  const roleType = options.allowedTypes.includes(sourceType) ? sourceType : (options.allowedTypes[0] ?? 'global')
  const displayName = `${role.display_name} (copy)`
  return {
    role_type: roleType,
    display_name: displayName.slice(0, 200),
    name: roleSlugFromDisplayName(`${role.name} copy`),
    description: role.description ?? '',
    root_entity_id: roleType === 'root' ? (sourceType === 'root' ? role.root_entity_id ?? '' : options.defaultRootId ?? '') : '',
    scope_entity_id: roleType === 'entity' && sourceType === 'entity' ? role.scope_entity_id ?? '' : '',
    scope: role.scope,
    status: 'active',
    is_auto_assigned: false,
    assignable_at_types: [...(role.assignable_at_types ?? [])],
    permissions: [...role.permissions]
  }
}
