import { describe, expect, it } from 'vitest'
import {
  delegablePermissionNames,
  duplicateRoleDraft,
  inactiveSelected,
  permissionPickerOptions,
  permissionRowPolicy,
  roleDefinedAt,
  roleDelegationNote,
  rolePermissionChanges,
  roleRowPolicy,
  roleScopeLabel,
  roleSlugFromDisplayName,
  roleTypeBadge,
  roleTypeChoices
} from '../../app/utils/role-definitions'
import { PermissionMatcher } from '../../app/utils/permissions'
import type { Role } from '../../app/types/role'

// Role and permission authoring rules (WP-14): mirrors outlabs-auth routers/roles.py
// _require_role_create_scope, services/role.py (system roles locked, inactive permissions refused
// on attach) and the SEC-2 delegation containment.

function role(overrides: Partial<Role> & { id: string }): Role {
  return {
    name: overrides.id,
    display_name: overrides.id,
    description: null,
    permissions: [],
    is_system_role: false,
    is_global: false,
    status: 'active',
    root_entity_id: null,
    root_entity_name: null,
    assignable_at_types: [],
    scope_entity_id: null,
    scope_entity_name: null,
    scope: 'hierarchy',
    is_auto_assigned: false,
    ...overrides
  }
}

const systemWide = role({ id: 'admin', is_global: true, is_system_role: true, permissions: ['*:*'] })
const orgRole = role({ id: 'acme_auditor', root_entity_id: 'acme', root_entity_name: 'ACME Realty', permissions: ['user:read'] })
const entityRole = role({ id: 'east_admin', root_entity_id: 'acme', root_entity_name: 'ACME Realty', scope_entity_id: 'east', scope_entity_name: 'East Coast Region', scope: 'hierarchy' })
const entityOnly = role({ id: 'sf_local', root_entity_id: 'acme', scope_entity_id: 'sf', scope_entity_name: 'SF Office', scope: 'entity_only' })

describe('role type display (F-068)', () => {
  it('reads the type as one neutral badge', () => {
    expect(roleTypeBadge(systemWide)).toEqual({ color: 'neutral', variant: 'subtle', label: 'System-wide' })
    expect(roleTypeBadge(orgRole).label).toBe('Organization')
    expect(roleTypeBadge(entityRole).label).toBe('Entity')
  })

  it('names where the role is defined, never for a system-wide role', () => {
    expect(roleDefinedAt(systemWide)).toBeNull()
    expect(roleDefinedAt(orgRole)).toBe('ACME Realty')
    expect(roleDefinedAt(entityRole)).toBe('East Coast Region')
    expect(roleDefinedAt(role({ id: 'x', root_entity_id: 'r' }))).toBe('An organization outside your view')
  })

  it('shows a scope only where it has an effect: entity-local roles', () => {
    expect(roleScopeLabel(systemWide)).toBeNull()
    expect(roleScopeLabel(orgRole)).toBeNull()
    expect(roleScopeLabel(entityRole)).toBe('Entity and below')
    expect(roleScopeLabel(entityOnly)).toBe('Entity only')
  })
})

describe('role type choices (F-016, F-054)', () => {
  it('offers system-wide roles only to actors with global scope', () => {
    expect(roleTypeChoices({ enterprise: true, actorIsGlobal: true })).toEqual(['global', 'root', 'entity'])
    expect(roleTypeChoices({ enterprise: true, actorIsGlobal: false })).toEqual(['root', 'entity'])
    // Unknown reach (own roles still loading or unreadable) is treated as not global.
    expect(roleTypeChoices({ enterprise: true, actorIsGlobal: null })).toEqual(['root', 'entity'])
  })

  it('offers no type the admin cannot complete (F-016)', () => {
    // A rootless admin without global reach: no entity to pick, and no organization when none
    // is listed.
    expect(roleTypeChoices({ enterprise: true, actorIsGlobal: null, canPickEntity: false })).toEqual(['root'])
    expect(roleTypeChoices({ enterprise: true, actorIsGlobal: false, canPickEntity: false, canPickRoot: false })).toEqual([])
    // A rootless system-wide admin keeps every card (the picker searches every organization).
    expect(roleTypeChoices({ enterprise: true, actorIsGlobal: true, canPickEntity: true, canPickRoot: true })).toEqual(['global', 'root', 'entity'])
  })

  it('SimpleRBAC roles are always global', () => {
    expect(roleTypeChoices({ enterprise: false, actorIsGlobal: false })).toEqual(['global'])
  })
})

describe('roleSlugFromDisplayName (F-069)', () => {
  it('follows the built-in underscore convention', () => {
    expect(roleSlugFromDisplayName('Regional Admin (West)')).toBe('regional_admin_west')
    expect(roleSlugFromDisplayName('  Café   Manager  ')).toBe('cafe_manager')
    expect(roleSlugFromDisplayName('---')).toBe('')
  })

  it('respects the length limit without a trailing separator', () => {
    expect(roleSlugFromDisplayName('ab cd', 3)).toBe('ab')
    expect(roleSlugFromDisplayName('a'.repeat(120))).toHaveLength(100)
  })
})

describe('row policies (F-053, F-019)', () => {
  const all = { canUpdate: true, canDelete: true, canCreate: true }

  it('locks system roles: no edit or archive, duplicate instead', () => {
    expect(roleRowPolicy(systemWide, all)).toEqual(expect.objectContaining({ canEdit: false, canArchive: false, canDuplicate: true }))
    expect(roleRowPolicy(systemWide, all).lockedReason).toMatch(/Duplicate it/)
  })

  it('keeps archived roles read-only', () => {
    expect(roleRowPolicy({ is_system_role: false, status: 'archived' }, all)).toEqual(expect.objectContaining({ canEdit: false, canArchive: false }))
  })

  it('follows role:update, role:delete and role:create', () => {
    expect(roleRowPolicy(orgRole, { canUpdate: false, canDelete: true, canCreate: false })).toEqual({ canEdit: false, canArchive: true, canDuplicate: false, lockedReason: null })
  })

  it('locks system permissions and follows permission:update/delete', () => {
    expect(permissionRowPolicy({ is_system: true }, { canUpdate: true, canDelete: true })).toEqual(expect.objectContaining({ canEdit: false, canArchive: false }))
    expect(permissionRowPolicy({ is_system: false }, { canUpdate: true, canDelete: false })).toEqual({ canEdit: true, canArchive: false, lockedReason: null })
  })
})

describe('permission sets (F-070, F-016)', () => {
  it('diffs an edit into additions and removals', () => {
    expect(rolePermissionChanges(['a:read', 'b:read'], ['b:read', 'c:read', 'c:read'])).toEqual({ added: ['c:read'], removed: ['a:read'] })
    expect(rolePermissionChanges(['a:read'], ['a:read'])).toEqual({ added: [], removed: [] })
  })

  it('a delegated admin may also grant the base action of a tree or all grant', () => {
    expect(delegablePermissionNames(['user:read_tree', 'role:create', 'api_key:update_all', 'lead:*', 'user:read_tree']))
      .toEqual(['api_key:update', 'api_key:update_all', 'lead:*', 'role:create', 'user:read', 'user:read_tree'])
  })

  const catalog = [
    { name: 'user:read', status: 'active' as const },
    { name: 'user:delete', status: 'active' as const },
    { name: 'lead:read', status: 'inactive' as const },
    { name: 'lead:update', status: 'inactive' as const }
  ]

  it('offers active catalog permissions, blocks the ones a delegated admin lacks, keeps attached inactive ones flagged', () => {
    const allows = (name: string) => new PermissionMatcher(['user:read_tree']).allows(name)
    const options = permissionPickerOptions({ catalog, held: [], selected: ['lead:read'], superuser: false, allows })
    expect(options).toEqual([
      { name: 'user:read', inactive: false, blocked: false },
      { name: 'user:delete', inactive: false, blocked: true },
      { name: 'lead:read', inactive: true, blocked: false }
    ])
  })

  it('a selected permission the actor lacks stays removable', () => {
    const options = permissionPickerOptions({ catalog, held: [], selected: ['user:delete'], superuser: false, allows: () => false })
    expect(options.find(o => o.name === 'user:delete')).toEqual({ name: 'user:delete', inactive: false, blocked: false })
  })

  it('without the catalog the options are the delegable names plus the selection', () => {
    const options = permissionPickerOptions({ catalog: null, held: ['user:read_tree'], selected: ['lead:read'], superuser: false, allows: () => true })
    expect(options.map(o => o.name)).toEqual(['user:read', 'user:read_tree', 'lead:read'])
  })

  it('the delegation note follows the picker source and is not shown to superusers', () => {
    expect(roleDelegationNote({ superuser: true, listsCatalog: true })).toBeNull()
    expect(roleDelegationNote({ superuser: true, listsCatalog: false })).toBeNull()
    expect(roleDelegationNote({ superuser: false, listsCatalog: true })).toMatch(/don't hold are listed but can't be added/)
    const heldOnly = roleDelegationNote({ superuser: false, listsCatalog: false })
    expect(heldOnly).toMatch(/^Only the permissions you hold are listed/)
    expect(heldOnly).not.toMatch(/listed but/)
  })

  it('names the selected permissions that are inactive', () => {
    expect(inactiveSelected(['lead:update', 'user:read', 'lead:read'], catalog)).toEqual(['lead:read', 'lead:update'])
    expect(inactiveSelected(['lead:read'], null)).toEqual([])
  })
})

describe('duplicateRoleDraft (F-053)', () => {
  it('copies permissions and settings under a new name, never auto-assigned', () => {
    const draft = duplicateRoleDraft(role({ ...entityRole, permissions: ['lead:read'], is_auto_assigned: true, assignable_at_types: ['office'] }), { allowedTypes: ['global', 'root', 'entity'] })
    expect(draft).toEqual(expect.objectContaining({
      role_type: 'entity',
      display_name: 'east_admin (copy)',
      name: 'east_admin_copy',
      scope_entity_id: 'east',
      is_auto_assigned: false,
      assignable_at_types: ['office'],
      permissions: ['lead:read']
    }))
  })

  it('a system-wide role duplicated by an organization admin becomes a role of their organization', () => {
    const draft = duplicateRoleDraft(systemWide, { allowedTypes: ['root', 'entity'], defaultRootId: 'acme' })
    expect(draft.role_type).toBe('root')
    expect(draft.root_entity_id).toBe('acme')
    expect(draft.permissions).toEqual(['*:*'])
  })
})
