import { describe, expect, it } from 'vitest'
import {
  effectiveScopeRows,
  liveKeyCount,
  principalScope,
  resolveServiceAccountScope,
  serviceAccountAccessSummary,
  serviceAccountLifecycleCopy,
  serviceAccountPath,
  serviceAccountPolicy,
  serviceAccountStatusLabel,
  systemScopeAllowed
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
  it('follows the default system-key allowlist', () => {
    expect(systemScopeAllowed('user:read')).toBe(true)
    expect(systemScopeAllowed('entity:read_tree')).toBe(true)
    expect(systemScopeAllowed('post:delete_own')).toBe(true)
    expect(systemScopeAllowed('user:manage')).toBe(false)
    expect(systemScopeAllowed('api_key:read')).toBe(false)
    expect(systemScopeAllowed('integration_principal:create')).toBe(false)
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
