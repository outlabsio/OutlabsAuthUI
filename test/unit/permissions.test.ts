import { describe, expect, it } from 'vitest'
import { parsePermissionName, PermissionMatcher, permissionSetAllows, permissionSubAction } from '../../app/utils/permissions'

// Mirrors the outlabsAuth backend's own rule table (tests/unit/services/
// test_role_permission_service_helpers.py) so the console grants exactly what the API grants.

describe('parsePermissionName', () => {
  it.each([
    ['user:read', { resource: 'user', action: 'read', scope: null }],
    ['user:read_tree', { resource: 'user', action: 'read', scope: 'tree' }],
    ['user:read_all', { resource: 'user', action: 'read', scope: 'all' }],
    ['post:update_own', { resource: 'post', action: 'update', scope: 'own' }],
    ['user:read_custom', { resource: 'user', action: 'read_custom', scope: null }],
    ['api_key:create_tree', { resource: 'api_key', action: 'create', scope: 'tree' }],
    ['invalid', { resource: 'invalid', action: '*', scope: null }],
    ['user:*', { resource: 'user', action: '*', scope: null }]
  ])('%s', (name, parsed) => {
    expect(parsePermissionName(name)).toEqual(parsed)
  })
})

describe('permissionSetAllows (backend _permission_set_allows)', () => {
  const granted = new Set(['user:*', 'role:update_all'])

  it.each([
    ['user:create', true],
    ['role:update', true],
    ['role:update_tree', true],
    ['role:delete', false]
  ])('%s -> %s', (required, allowed) => {
    expect(permissionSetAllows(required, granted)).toBe(allowed)
  })
})

describe('PermissionMatcher.allows', () => {
  it('matches all grammar variants', () => {
    const matcher = new PermissionMatcher(['user:*', 'role:update_all', 'post:publish_tree', 'comment:read'])
    expect(matcher.allows('user:create')).toBe(true)
    expect(matcher.allows('user:delete_all')).toBe(true)
    expect(matcher.allows('role:update')).toBe(true)
    expect(matcher.allows('role:update_tree')).toBe(true)
    expect(matcher.allows('role:update_all')).toBe(true)
    expect(matcher.allows('post:publish')).toBe(true)
    expect(matcher.allows('post:publish_tree')).toBe(true)
    expect(matcher.allows('post:publish_all')).toBe(false)
    expect(matcher.allows('comment:read')).toBe(true)
    expect(matcher.allows('comment:write')).toBe(false)
    expect(matcher.allows('team:edit')).toBe(false)
  })

  it('super grant short-circuits', () => {
    const matcher = new PermissionMatcher(['*:*'])
    expect(matcher.allows('anything:goes')).toBe(true)
    expect(matcher.allowsFromAncestor('deep:tree')).toBe(true)
  })

  it('empty set denies everything', () => {
    const matcher = new PermissionMatcher([])
    expect(matcher.allows('user:read')).toBe(false)
    expect(matcher.allowsFromAncestor('user:read')).toBe(false)
    expect(matcher.allowsAny([])).toBe(false)
  })

  it('ignores non-permission strings', () => {
    const matcher = new PermissionMatcher(['', 'not_a_permission', 'user:read'])
    expect(matcher.allows('user:read')).toBe(true)
    expect(matcher.allows('not_a_permission')).toBe(true) // exact-match passthrough
    expect(matcher.allows('something:else')).toBe(false)
  })

  it('_tree grants only the unscoped base, never _all or _own', () => {
    const matcher = new PermissionMatcher(['membership:read_tree'])
    expect(matcher.allows('membership:read')).toBe(true)
    expect(matcher.allows('membership:read_tree')).toBe(true)
    expect(matcher.allows('membership:read_all')).toBe(false)
    expect(matcher.allows('membership:read_own')).toBe(false)
    expect(matcher.allows('membership:create')).toBe(false)
  })

  it('_all grants base, _tree, _own and itself', () => {
    const matcher = new PermissionMatcher(['user:read_all'])
    expect(matcher.allows('user:read')).toBe(true)
    expect(matcher.allows('user:read_tree')).toBe(true)
    expect(matcher.allows('user:read_own')).toBe(true)
    expect(matcher.allows('user:read_all')).toBe(true)
    expect(matcher.allows('user:update')).toBe(false)
  })

  it('an unscoped grant does not imply a scoped requirement', () => {
    const matcher = new PermissionMatcher(['user:read'])
    expect(matcher.allows('user:read')).toBe(true)
    expect(matcher.allows('user:read_tree')).toBe(false)
    expect(matcher.allows('user:read_all')).toBe(false)
  })

  it('resource wildcard does not leak across resources', () => {
    const matcher = new PermissionMatcher(['api_key:*'])
    expect(matcher.allows('api_key:read')).toBe(true)
    expect(matcher.allows('api_key:create_tree')).toBe(true)
    expect(matcher.allows('api:read')).toBe(false)
    expect(matcher.allows('key:read')).toBe(false)
  })

  it('allowsAny is any-of', () => {
    const matcher = new PermissionMatcher(['api_key:read_tree'])
    expect(matcher.allowsAny(['api_key:read', 'apikey:read'])).toBe(true)
    expect(matcher.allowsAny(['apikey:read', 'user:read'])).toBe(false)
  })

  it('delegated org admin (seeded persona) holds the base grants the console gates on', () => {
    // Shape of /permissions/me for a tree-scoped organisation admin.
    const matcher = new PermissionMatcher([
      'entity:read', 'user:read', 'api_key:create_tree', 'role:create', 'user:read_tree',
      'membership:read_tree', 'api_key:read_tree', 'role:update', 'entity:read_tree',
      'api_key:update_tree', 'user:create', 'api_key:delete_tree', 'role:read', 'role:delete'
    ])
    expect(matcher.allows('membership:read')).toBe(true)
    expect(matcher.allows('api_key:read')).toBe(true)
    expect(matcher.allows('api_key:create')).toBe(true)
    expect(matcher.allows('membership:create')).toBe(false)
    expect(matcher.allows('permission:read')).toBe(false)
    expect(matcher.allows('entity:create')).toBe(false)
  })
})

describe('PermissionMatcher.allowsFromAncestor (backend _permission_set_allows_from_ancestor)', () => {
  it('only propagates _tree and _all', () => {
    const matcher = new PermissionMatcher(['membership:read_tree', 'role:update_all'])
    expect(matcher.allowsFromAncestor('membership:read')).toBe(true)
    expect(matcher.allowsFromAncestor('membership:read_tree')).toBe(true)
    expect(matcher.allowsFromAncestor('role:update')).toBe(true)
    expect(matcher.allowsFromAncestor('role:update_tree')).toBe(true)
    // _all requireds only match an upstream _all grant
    expect(matcher.allowsFromAncestor('role:update_all')).toBe(true)
    expect(matcher.allowsFromAncestor('membership:read_all')).toBe(false)
    // Non-tree/non-all grants never propagate
    expect(matcher.allowsFromAncestor('other:thing')).toBe(false)
  })

  it('an unscoped grant held on an ancestor does not propagate', () => {
    const matcher = new PermissionMatcher(['user:read'])
    expect(matcher.allowsFromAncestor('user:read')).toBe(false)
  })
})

describe('permissionSubAction (v-access-06)', () => {
  it('keeps the scope, so a tree variant never reads as its base action', () => {
    // The API reports api_key:create_tree as action 'create' with scope 'tree'.
    expect(permissionSubAction({ name: 'api_key:create_tree', resource: 'api_key', action: 'create' })).toBe('create_tree')
    expect(permissionSubAction({ name: 'api_key:create', resource: 'api_key', action: 'create' })).toBe('create')
    expect(permissionSubAction({ name: 'user:read_all', resource: 'user', action: 'read' })).toBe('read_all')
  })

  it('reads the resource from the name when the record lacks it', () => {
    expect(permissionSubAction({ name: 'entity:update_tree' })).toBe('update_tree')
    expect(permissionSubAction({ name: 'reports', action: 'view' })).toBe('view')
  })
})
