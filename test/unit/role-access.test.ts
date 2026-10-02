import { describe, expect, it } from 'vitest'
import {
  accessScopeSummary,
  compareRolesForPicker,
  delegationBlockedReason,
  entityRoleContextFromPath,
  grantsSystemWideScope,
  missingDelegatedPermissions,
  roleAllowsEntityType,
  roleAvailableAtEntity,
  roleDirectlyAssignable,
  roleGrantCaveats,
  roleNameHints,
  roleTypeOf
} from '../../app/utils/role-access'
import { PermissionMatcher } from '../../app/utils/permissions'
import type { Role } from '../../app/types/role'

// Mirrors the backend rules the role pickers must honor (outlabs_auth services/membership.py
// _is_role_available_for_entity, services/role.py assign_role_to_user, routers/_authz_utils.py
// require_can_delegate_roles, services/access_scope.py _user_has_active_system_wide_role).

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

// ACME root -> East Coast region -> NYC office; West Coast region -> SF office (sibling branch).
const nyc = entityRoleContextFromPath([
  { id: 'acme', entity_type: 'organization' },
  { id: 'east', entity_type: 'region' },
  { id: 'nyc', entity_type: 'office' }
])!

const roles = {
  systemWide: role({ id: 'admin', is_global: true }),
  orgRole: role({ id: 'acme_auditor', root_entity_id: 'acme' }),
  otherOrg: role({ id: 'summit_org_admin', root_entity_id: 'summit' }),
  officeTyped: role({ id: 'dispatch', root_entity_id: 'acme', assignable_at_types: ['office'] }),
  teamTyped: role({ id: 'team_only', root_entity_id: 'acme', assignable_at_types: ['team'] }),
  eastHierarchy: role({ id: 'east_admin', root_entity_id: 'acme', scope_entity_id: 'east', scope: 'hierarchy', assignable_at_types: ['region', 'office'] }),
  westHierarchy: role({ id: 'west_admin', root_entity_id: 'acme', scope_entity_id: 'west', scope: 'hierarchy', assignable_at_types: ['region', 'office'] }),
  sfOnly: role({ id: 'sf_local', root_entity_id: 'acme', scope_entity_id: 'sf', scope: 'entity_only', assignable_at_types: ['office'] }),
  eastOnly: role({ id: 'east_only', root_entity_id: 'acme', scope_entity_id: 'east', scope: 'entity_only' }),
  nycOnly: role({ id: 'nyc_only', root_entity_id: 'acme', scope_entity_id: 'nyc', scope: 'entity_only' }),
  inactive: role({ id: 'retired', root_entity_id: 'acme', status: 'inactive' }),
  archivedGlobal: role({ id: 'old_global', is_global: true, status: 'archived' }),
  orphan: role({ id: 'orphan' })
}

describe('roleTypeOf', () => {
  it('classifies system-wide, organization and entity roles', () => {
    expect(roleTypeOf(roles.systemWide)).toBe('global')
    expect(roleTypeOf(roles.orgRole)).toBe('root')
    expect(roleTypeOf(roles.eastHierarchy)).toBe('entity')
    expect(roleTypeOf(roles.orphan)).toBe('global')
  })
})

describe('entityRoleContextFromPath', () => {
  it('takes the root, target type and the ancestor closure including the entity itself', () => {
    expect(nyc.entityId).toBe('nyc')
    expect(nyc.rootId).toBe('acme')
    expect(nyc.entityType).toBe('office')
    expect([...nyc.ancestorIds].sort()).toEqual(['acme', 'east', 'nyc'])
  })

  it('returns null for an empty path', () => {
    expect(entityRoleContextFromPath([])).toBeNull()
  })
})

describe('roleAllowsEntityType', () => {
  it('allows every type when unrestricted and matches case-insensitively', () => {
    expect(roleAllowsEntityType({ assignable_at_types: [] }, null)).toBe(true)
    expect(roleAllowsEntityType({ assignable_at_types: ['Office'] }, 'office')).toBe(true)
    expect(roleAllowsEntityType({ assignable_at_types: ['team'] }, 'office')).toBe(false)
    expect(roleAllowsEntityType({ assignable_at_types: ['team'] }, null)).toBe(false)
  })
})

describe('roleAvailableAtEntity (NYC office)', () => {
  it.each([
    ['system-wide role', roles.systemWide, true],
    ['own organization role', roles.orgRole, true],
    ['another organization role', roles.otherOrg, false],
    ['role typed for offices', roles.officeTyped, true],
    ['role typed for teams only', roles.teamTyped, false],
    ['hierarchy role defined at an ancestor', roles.eastHierarchy, true],
    ['hierarchy role from a sibling branch', roles.westHierarchy, false],
    ['entity-only role of another office', roles.sfOnly, false],
    ['entity-only role defined at an ancestor', roles.eastOnly, false],
    ['entity-only role defined at the office itself', roles.nycOnly, true],
    ['inactive role', roles.inactive, false],
    ['archived system-wide role', roles.archivedGlobal, false],
    ['orphaned role', roles.orphan, false]
  ])('%s', (_label, candidate, expected) => {
    expect(roleAvailableAtEntity(candidate, nyc)).toBe(expected)
  })
})

describe('roleDirectlyAssignable', () => {
  it('SimpleRBAC: every active role', () => {
    expect(roleDirectlyAssignable(roles.systemWide, { enterprise: false })).toBe(true)
    expect(roleDirectlyAssignable(roles.inactive, { enterprise: false })).toBe(false)
  })

  it('EnterpriseRBAC: system-wide roles and the user\'s own organization roles, never entity-local', () => {
    const acmeUser = { enterprise: true, rootEntityId: 'acme' }
    expect(roleDirectlyAssignable(roles.systemWide, acmeUser)).toBe(true)
    expect(roleDirectlyAssignable(roles.orgRole, acmeUser)).toBe(true)
    expect(roleDirectlyAssignable(roles.otherOrg, acmeUser)).toBe(false)
    expect(roleDirectlyAssignable(roles.eastHierarchy, acmeUser)).toBe(false)
    expect(roleDirectlyAssignable(roles.inactive, acmeUser)).toBe(false)
    expect(roleDirectlyAssignable(roles.archivedGlobal, acmeUser)).toBe(false)
  })

  it('EnterpriseRBAC rootless user: system-wide roles only', () => {
    expect(roleDirectlyAssignable(roles.systemWide, { enterprise: true, rootEntityId: null })).toBe(true)
    expect(roleDirectlyAssignable(roles.orgRole, { enterprise: true, rootEntityId: null })).toBe(false)
  })
})

describe('missingDelegatedPermissions', () => {
  it('uses the backend permission algebra over the actor\'s grants', () => {
    const actor = new PermissionMatcher(['user:read_tree', 'role:*', 'entity:read'])
    const allows = (p: string) => actor.allows(p)
    expect(missingDelegatedPermissions(['user:read', 'role:create', 'entity:read'], allows)).toEqual([])
    expect(missingDelegatedPermissions(['lead:update', 'lead:read', 'lead:read', 'user:read'], allows)).toEqual(['lead:read', 'lead:update'])
    expect(missingDelegatedPermissions(undefined, allows)).toEqual([])
  })

  it('a superuser grant covers everything', () => {
    const actor = new PermissionMatcher(['*:*'])
    expect(missingDelegatedPermissions(['anything:at_all'], p => actor.allows(p))).toEqual([])
  })

  it('explains the block with up to three names', () => {
    expect(delegationBlockedReason([])).toBe('')
    expect(delegationBlockedReason(['a:b'])).toBe('You can\'t grant this role: you don\'t hold a:b.')
    expect(delegationBlockedReason(['a:1', 'a:2', 'a:3', 'a:4', 'a:5'])).toContain('a:1, a:2, a:3 and 2 more')
  })
})

describe('compareRolesForPicker', () => {
  it('orders entity, organization, then system-wide roles, each by name', () => {
    const sorted = [roles.systemWide, roles.orgRole, roles.eastHierarchy, roles.officeTyped]
      .sort((a, b) => compareRolesForPicker(a, b))
      .map(r => r.id)
    expect(sorted).toEqual(['east_admin', 'acme_auditor', 'dispatch', 'admin'])
  })

  it('orders by name only when types are not shown', () => {
    const sorted = [roles.systemWide, roles.orgRole].sort((a, b) => compareRolesForPicker(a, b, false)).map(r => r.id)
    expect(sorted).toEqual(['acme_auditor', 'admin'])
  })
})

describe('roleGrantCaveats', () => {
  it('flags inactive, entity-only (EnterpriseRBAC) and conditional roles', () => {
    expect(roleGrantCaveats(roles.inactive, { enterprise: true })).toEqual({ inactive: true, entityOnly: false, conditional: false })
    expect(roleGrantCaveats(roles.sfOnly, { enterprise: true, conditional: true })).toEqual({ inactive: false, entityOnly: true, conditional: true })
    expect(roleGrantCaveats(roles.sfOnly, { enterprise: false })).toEqual({ inactive: false, entityOnly: false, conditional: false })
    // entity_only on a role that is not entity-defined has no effect.
    expect(roleGrantCaveats(role({ id: 'x', scope: 'entity_only' }), { enterprise: true }).entityOnly).toBe(false)
  })
})

describe('roleNameHints', () => {
  it('pairs ids with names when both lists line up', () => {
    const hints = roleNameHints([
      { ids: ['r1', 'r2'], names: ['Agent', 'Team Lead'] },
      { ids: ['r3'], names: [] },
      { ids: ['r1'], names: ['Renamed later'] }
    ])
    expect(Object.fromEntries(hints)).toEqual({ r1: 'Agent', r2: 'Team Lead' })
  })
})

describe('access scope', () => {
  const grant = (r: Role, overrides: Partial<{ status: string, is_currently_valid: boolean }> = {}) => ({
    status: 'active',
    is_currently_valid: true,
    role: r,
    ...overrides
  })

  it('only an active, current, active system-wide direct grant spans organizations', () => {
    expect(grantsSystemWideScope(grant(roles.systemWide))).toBe(true)
    expect(grantsSystemWideScope(grant(roles.systemWide, { status: 'suspended' }))).toBe(false)
    expect(grantsSystemWideScope(grant(roles.systemWide, { is_currently_valid: false }))).toBe(false)
    expect(grantsSystemWideScope(grant(roles.archivedGlobal))).toBe(false)
    expect(grantsSystemWideScope(grant(roles.orgRole))).toBe(false)
  })

  it('summarises superusers, system-wide holders and organization-bound accounts', () => {
    expect(accessScopeSummary({ isSuperuser: true }).allOrganizations).toBe(true)

    const wide = accessScopeSummary({ isSuperuser: false, rootEntityName: 'ACME Realty', directGrants: [grant(roles.systemWide)] })
    expect(wide).toEqual(expect.objectContaining({ label: 'All organizations', allOrganizations: true }))
    expect(wide.description).toContain('admin')

    const bound = accessScopeSummary({ isSuperuser: false, rootEntityName: 'ACME Realty', directGrants: [grant(roles.orgRole)], membershipCount: 2 })
    expect(bound).toEqual({ label: 'ACME Realty', description: 'Limited to this organization. Member of 2 entities.', allOrganizations: false })

    expect(accessScopeSummary({ isSuperuser: false, directGrants: [] }).label).toBe('No organization')

    // Direct roles unreadable: name the organization without claiming the account is limited to it.
    const unknown = accessScopeSummary({ isSuperuser: false, rootEntityName: 'ACME Realty', directGrants: null })
    expect(unknown.label).toBe('ACME Realty')
    expect(unknown.description).not.toContain('Limited')
  })
})
