import { describe, expect, it } from 'vitest'
import {
  actionPrefixesPhrase,
  directScopesHelp,
  effectiveScopeRows,
  liveKeyCount,
  machineKeyScopeFlags,
  machineKeyScopeOptions,
  machineKeyScopeRefusal,
  principalScope,
  resolveServiceAccountScope,
  scopesBeyondGrant,
  scopesBeyondGrantErrors,
  serviceAccountAccessSummary,
  serviceAccountLifecycleCopy,
  serviceAccountPath,
  serviceAccountPolicy,
  serviceAccountStatusLabel
} from '../../app/utils/service-accounts'
import { isIpOrCidr, machineKeySchema, serviceAccountSchema } from '../../app/schemas/api-key'

const ENTITY = '0b9c1d1e-1111-4222-8333-444455556666'
const ROOT = '1b9c1d1e-1111-4222-8333-444455556666'

describe('resolveServiceAccountScope', () => {
  const base = { enterprise: true, platformAllowed: true, filter: 'platform' as const, entity: '', defaultEntityId: null }

  it('is always platform-wide on SimpleRBAC', () => {
    expect(resolveServiceAccountScope({ ...base, enterprise: false, filter: 'entity', entity: ENTITY })).toEqual({ kind: 'platform_global', scope: { kind: 'platform_global' } })
  })

  it('lets a superuser choose platform-wide or an entity', () => {
    expect(resolveServiceAccountScope(base).scope).toEqual({ kind: 'platform_global' })
    expect(resolveServiceAccountScope({ ...base, filter: 'entity', entity: ENTITY }).scope).toEqual({ kind: 'entity', entityId: ENTITY })
    // Entity scope without an entity: the admin must choose one.
    expect(resolveServiceAccountScope({ ...base, filter: 'entity' })).toEqual({ kind: 'entity', scope: null })
  })

  it('puts everyone else on entity scope, at their organization by default', () => {
    const delegated = { ...base, platformAllowed: false, defaultEntityId: ROOT }
    expect(resolveServiceAccountScope(delegated).scope).toEqual({ kind: 'entity', entityId: ROOT })
    expect(resolveServiceAccountScope({ ...delegated, entity: ENTITY }).scope).toEqual({ kind: 'entity', entityId: ENTITY })
    expect(resolveServiceAccountScope({ ...delegated, defaultEntityId: null }).scope).toBeNull()
  })

  it('ignores a malformed entity id', () => {
    expect(resolveServiceAccountScope({ ...base, platformAllowed: false, defaultEntityId: ROOT, entity: 'nope' }).scope).toEqual({ kind: 'entity', entityId: ROOT })
  })
})

describe('service account routes', () => {
  it('addresses entity accounts under their anchor', () => {
    const account = { id: 'a1', scope_kind: 'entity' as const, anchor_entity_id: ENTITY }
    expect(principalScope(account)).toEqual({ kind: 'entity', entityId: ENTITY })
    expect(serviceAccountPath(account)).toEqual({ path: '/app/service-accounts/a1', query: { entity: ENTITY } })
    expect(serviceAccountPath(account, 'keys')).toEqual({ path: '/app/service-accounts/a1', query: { entity: ENTITY, tab: 'keys' } })
  })

  it('platform-wide accounts need no anchor', () => {
    const account = { id: 'a2', scope_kind: 'platform_global' as const, anchor_entity_id: null }
    expect(principalScope(account)).toEqual({ kind: 'platform_global' })
    expect(serviceAccountPath(account, 'overview')).toEqual({ path: '/app/service-accounts/a2', query: {} })
  })
})

describe('serviceAccountPolicy', () => {
  const all = { canCreate: true, canUpdate: true, canDelete: true }

  it('archived accounts are read-only', () => {
    const p = serviceAccountPolicy({ status: 'archived' }, all)
    expect(p).toMatchObject({ canEdit: false, canDeactivate: false, canReactivate: false, canArchive: false, canCreateKey: false })
    expect(p.lockedReason).toMatch(/archived/)
  })

  it('active accounts deactivate; inactive ones reactivate and get no new keys', () => {
    expect(serviceAccountPolicy({ status: 'active' }, all)).toMatchObject({ canEdit: true, canDeactivate: true, canReactivate: false, canArchive: true, canCreateKey: true })
    expect(serviceAccountPolicy({ status: 'inactive' }, all)).toMatchObject({ canEdit: true, canDeactivate: false, canReactivate: true, canArchive: true, canCreateKey: false })
  })

  it('follows the grants', () => {
    expect(serviceAccountPolicy({ status: 'active' }, { canCreate: false, canUpdate: false, canDelete: false })).toMatchObject({ canEdit: false, canDeactivate: false, canArchive: false, canCreateKey: false })
    expect(serviceAccountPolicy({ status: 'active' }, { canCreate: false, canUpdate: false, canDelete: true })).toMatchObject({ canArchive: true, canEdit: false })
  })
  it('words an inactive account as deactivated, like the status filter and the account-page alert', () => {
    expect(serviceAccountStatusLabel('inactive')).toBe('Deactivated')
    expect(serviceAccountStatusLabel('active')).toBe('Active')
    expect(serviceAccountStatusLabel('archived')).toBe('Archived')
  })
})

describe('serviceAccountLifecycleCopy', () => {
  it('says how many keys a deactivation revokes, when known', () => {
    const copy = serviceAccountLifecycleCopy({ name: 'ci' }, 'deactivate', 3)
    expect(copy.title).toBe('Deactivate service account ci')
    expect(copy.effects?.[0]).toBe('Its 3 active or suspended keys are revoked immediately: requests signed with them are refused.')
    expect(serviceAccountLifecycleCopy({ name: 'ci' }, 'deactivate', 1).effects?.[0]).toMatch(/^Its 1 active or suspended key is revoked/)
    expect(serviceAccountLifecycleCopy({ name: 'ci' }, 'deactivate', 0).effects?.[0]).toMatch(/no active or suspended keys/)
    expect(serviceAccountLifecycleCopy({ name: 'ci' }, 'deactivate').effects?.[0]).toMatch(/^Every key it owns is revoked/)
  })

  it('archive is typed and says it cannot be restored', () => {
    const copy = serviceAccountLifecycleCopy({ name: 'ci' }, 'archive', 2)
    expect(copy.confirmText).toBe('ci')
    expect(copy.confirmLabel).toBe('Archive service account')
    expect(copy.effects?.join(' ')).toMatch(/can't be restored from the console/)
  })

  it('reactivation says revoked keys stay revoked', () => {
    expect(serviceAccountLifecycleCopy({ name: 'ci' }, 'reactivate').description).toMatch(/stay revoked/)
  })
})

describe('keys', () => {
  it('counts the keys a lifecycle change revokes', () => {
    expect(liveKeyCount([{ status: 'active' }, { status: 'suspended' }, { status: 'revoked' }, { status: 'expired' }])).toBe(2)
  })
})

describe('scopes', () => {
  it('names the allowed actions from the server, not a copy of the policy', () => {
    expect(actionPrefixesPhrase([])).toBe('')
    expect(actionPrefixesPhrase(['read'])).toBe(' whose action is read')
    expect(actionPrefixesPhrase(['read', 'update', 'manage'])).toBe(' whose action is read, update or manage')
    expect(directScopesHelp(['read'])).toContain('You can grant only what you hold whose action is read, and never key')
  })

  it('flags what a role or a direct scope carries beyond the grantable scopes', () => {
    const permissions: Record<string, string[] | null> = { reader: ['user:read', 'entity:read'], loading: null, fine: ['user:read'] }
    const grantable = new Set(['user:read'])
    const result = scopesBeyondGrant({
      roleIds: ['reader', 'loading', 'fine', 'unknown'],
      directScopes: ['user:read', 'user:manage', 'user:manage'],
      rolePermissions: id => permissions[id],
      grantable
    })
    // A role whose permissions are not known (loading, or not readable) is left to the server.
    expect(result).toEqual({ roles: [{ roleId: 'reader', scopes: ['entity:read'] }], direct: ['user:manage'] })
    // Nothing is flagged before the grantable scopes are known.
    expect(scopesBeyondGrant({ roleIds: ['reader'], directScopes: ['user:manage'], rolePermissions: id => permissions[id], grantable: null })).toEqual({ roles: [], direct: [] })
  })

  it('words the envelope refusals for their fields', () => {
    const labels: Record<string, string> = { a: 'Service Reader', b: 'Auditor' }
    expect(scopesBeyondGrantErrors({ roles: [], direct: [] }, id => labels[id]!)).toEqual([])
    expect(scopesBeyondGrantErrors({ roles: [{ roleId: 'a', scopes: ['entity:read'] }], direct: ['user:manage'] }, id => labels[id]!)).toEqual([
      { name: 'role_ids', message: 'Service Reader grants entity:read, which you can\'t grant. Remove it, or ask an administrator who can.' },
      { name: 'allowed_scopes', message: 'You can\'t grant user:manage. Remove it, or ask an administrator who can.' }
    ])
    const many = scopesBeyondGrantErrors({
      roles: [{ roleId: 'a', scopes: ['a:1', 'a:2', 'a:3'] }, { roleId: 'b', scopes: ['a:3', 'b:1', 'b:2', 'b:3'] }],
      direct: ['x:1', 'x:2']
    }, id => labels[id]!)
    expect(many[0]!.message).toBe('Service Reader and Auditor grant a:1, a:2, a:3, b:1, b:2 and 1 more, which you can\'t grant. Remove them, or ask an administrator who can.')
    expect(many[1]!.message).toBe('You can\'t grant x:1 and x:2. Remove them, or ask an administrator who can.')
  })

  it('offers a machine key the account\'s scopes the admin may grant, and flags the rest', () => {
    const grantable = new Set(['user:read', 'entity:read'])
    expect(machineKeyScopeOptions(['user:update', 'user:read', 'user:read'], grantable)).toEqual(['user:read'])
    expect(machineKeyScopeOptions(['user:read'], null)).toEqual([])
    const flags = machineKeyScopeFlags(['user:read', 'user:update', 'lead:read'], ['user:read', 'user:update'], grantable)
    expect(flags).toEqual({ 'user:update': 'you can\'t grant it', 'lead:read': 'not granted to the account' })
    // Before the grantable scopes are known only the account's own grant is judged.
    expect(machineKeyScopeFlags(['user:update', 'lead:read'], ['user:update'], null)).toEqual({ 'lead:read': 'not granted to the account' })
    expect(machineKeyScopeRefusal({})).toBeNull()
    expect(machineKeyScopeRefusal({ 'lead:read': 'not granted to the account' })).toBe('Remove lead:read: it is not granted to the account.')
    expect(machineKeyScopeRefusal(flags)).toBe('Remove lead:read: it is not granted to the account. Remove user:update: you can\'t grant it.')
    expect(machineKeyScopeRefusal({ 'a:1': 'you can\'t grant it', 'a:2': 'you can\'t grant it' })).toBe('Remove a:1, a:2: you can\'t grant them.')
  })

  it('marks direct scopes among the effective ones', () => {
    expect(effectiveScopeRows({ allowed_scopes: ['b:read'], effective_allowed_scopes: ['b:read', 'a:read'] })).toEqual([
      { name: 'a:read', direct: false },
      { name: 'b:read', direct: true }
    ])
  })

  it('summarizes access for list rows', () => {
    expect(serviceAccountAccessSummary({ role_ids: ['r'], effective_allowed_scopes: ['a', 'b'] })).toBe('1 role · 2 scopes')
    expect(serviceAccountAccessSummary({ role_ids: [], effective_allowed_scopes: ['a'] })).toBe('0 roles · 1 scope')
  })
})

describe('key and service account forms', () => {
  it('validates IP addresses and CIDR ranges', () => {
    for (const ok of ['203.0.113.4', '198.51.100.0/24', '10.0.0.1/32', '0.0.0.0/0', '2001:db8::1', '2001:db8::/32', '::1']) expect(isIpOrCidr(ok), ok).toBe(true)
    for (const bad of ['256.1.1.1', '10.0.0.1/33', '2001:db8::/129', 'example.com', '10.0.0', '1.2.3.4/24/1', '1.2.3.4/x', '']) expect(isIpOrCidr(bad), bad).toBe(false)
  })

  const key = { name: 'deploy', description: '', prefix_type: 'sk_live' as const, scopes: ['user:read'], no_rate_limit: false, rate_limit_per_minute: 60 as number | null, expires: '90' as const, ip_whitelist: [] }

  it('accepts a valid key and names the first bad IP', () => {
    expect(machineKeySchema.safeParse(key).success).toBe(true)
    const result = machineKeySchema.safeParse({ ...key, ip_whitelist: ['10.0.0.1', 'nope'] })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({ path: ['ip_whitelist'], message: 'nope is not an IP address or CIDR range.' })
  })

  it('needs a scope, a whole positive rate limit unless No rate limit is on, and a preset expiry (F-114)', () => {
    expect(machineKeySchema.safeParse({ ...key, scopes: [] }).success).toBe(false)
    expect(machineKeySchema.safeParse({ ...key, rate_limit_per_minute: -1 }).success).toBe(false)
    expect(machineKeySchema.safeParse({ ...key, rate_limit_per_minute: 0 }).success).toBe(false)
    expect(machineKeySchema.safeParse({ ...key, rate_limit_per_minute: 2.5 }).success).toBe(false)
    const blank = machineKeySchema.safeParse({ ...key, rate_limit_per_minute: null })
    expect(blank.success).toBe(false)
    expect(blank.error?.issues[0]).toMatchObject({ path: ['rate_limit_per_minute'], message: 'Enter a rate limit, or turn on No rate limit.' })
    expect(machineKeySchema.safeParse({ ...key, rate_limit_per_minute: null, no_rate_limit: true }).success).toBe(true)
    expect(machineKeySchema.safeParse({ ...key, expires: '45' }).success).toBe(false)
    expect(machineKeySchema.safeParse({ ...key, expires: 'never' }).success).toBe(true)
  })

  it('a service account needs a name and a role or a direct scope', () => {
    const account = { name: 'ci', description: '', role_ids: [], allowed_scopes: [], inherit_from_tree: false }
    const empty = serviceAccountSchema.safeParse(account)
    expect(empty.success).toBe(false)
    expect(empty.error?.issues[0]?.path).toEqual(['role_ids'])
    expect(serviceAccountSchema.safeParse({ ...account, role_ids: ['r'] }).success).toBe(true)
    expect(serviceAccountSchema.safeParse({ ...account, allowed_scopes: ['user:read'] }).success).toBe(true)
    expect(serviceAccountSchema.safeParse({ ...account, name: ' ', role_ids: ['r'] }).success).toBe(false)
  })
})
