import { describe, expect, it } from 'vitest'
import {
  apiContractError,
  APP_SECTIONS,
  appSection,
  capabilityAvailable,
  checkApiContract,
  configHasMemberships,
  configHasSurface,
  configIsEnterprise,
  consoleAdminPermissions,
  findAppSection,
  legacyRedirect,
  meetsAccessRequirement,
  requirementPermissions,
  resolveRequirement,
  type AccessContext
} from '../../app/utils/capabilities'
import { PermissionMatcher } from '../../app/utils/permissions'
import { ALWAYS_ON_FEATURES, auditLogSummary, enabledAuthMethods, FEATURE_LABELS, featureLabel, featureList, surfaceLabel } from '../../app/utils/capability-labels'
import type { AuthConfig } from '../../app/types/auth'

// Live /auth/config shapes of the two supported presets (outlabs-auth 0.1.0a34 examples).
const enterprise: AuthConfig = {
  library_version: '0.1.0a34',
  api_contract_version: 'outlabs-auth.api/v1',
  preset: 'EnterpriseRBAC',
  features: {
    entity_hierarchy: true, context_aware_roles: true, abac: true, tree_permissions: true, api_keys: true,
    system_api_keys: true, user_status: true, activity_tracking: true, invitations: true, magic_links: true, access_codes: true
  },
  mounted_surfaces: ['api_key_admin', 'api_keys', 'audit', 'auth', 'config', 'entities', 'integration_principals', 'memberships', 'permissions', 'roles', 'users']
}
const simple: AuthConfig = {
  library_version: '0.1.0a34',
  api_contract_version: 'outlabs-auth.api/v1',
  preset: 'SimpleRBAC',
  features: {
    entity_hierarchy: false, context_aware_roles: false, abac: false, tree_permissions: false, api_keys: true,
    system_api_keys: true, user_status: true, activity_tracking: true, invitations: true, magic_links: false, access_codes: false
  },
  mounted_surfaces: ['api_keys', 'auth', 'integration_principals', 'permissions', 'roles', 'users']
}
// An older library that predates mounted_surfaces.
const legacy: AuthConfig = { ...enterprise, mounted_surfaces: undefined, api_contract_version: undefined }

function ctx(config: AuthConfig | null, granted: string[], isSuperuser = false): AccessContext {
  return { config, isSuperuser, matcher: new PermissionMatcher(granted) }
}

function visibleSections(context: AccessContext) {
  return APP_SECTIONS.filter(s => meetsAccessRequirement(s.requires, context)).map(s => s.id)
}

describe('surfaces and presets', () => {
  it('reads mounted_surfaces, failing closed without config', () => {
    expect(configHasSurface(enterprise, 'audit')).toBe(true)
    expect(configHasSurface(simple, 'audit')).toBe(false)
    expect(configHasSurface(null, 'users')).toBe(false)
    expect(configHasSurface(undefined, 'users')).toBe(false)
  })

  it('treats a config without mounted_surfaces as allow-all (older libraries)', () => {
    expect(configHasSurface(legacy, 'oauth_associate')).toBe(true)
    expect(configIsEnterprise(legacy)).toBe(true)
  })

  it('isEnterprise needs the hierarchy feature AND the entities router', () => {
    expect(configIsEnterprise(enterprise)).toBe(true)
    expect(configIsEnterprise(simple)).toBe(false)
    expect(configIsEnterprise({ ...enterprise, mounted_surfaces: ['users', 'roles'] })).toBe(false)
    expect(configIsEnterprise(null)).toBe(false)
    expect(configHasMemberships(enterprise)).toBe(true)
    expect(configHasMemberships({ ...enterprise, mounted_surfaces: ['entities'] })).toBe(false)
  })

  it('capability half ignores always-true feature flags when the router is absent', () => {
    // SimpleRBAC reports activity_tracking: true but does not mount the audit router.
    expect(capabilityAvailable(appSection('audit').requires, simple)).toBe(false)
    expect(capabilityAvailable(appSection('audit').requires, enterprise)).toBe(true)
    expect(capabilityAvailable(appSection('dashboard').requires, null)).toBe(true)
    expect(capabilityAvailable(appSection('users').requires, null)).toBe(false)
  })
})

describe('section visibility (nav == page)', () => {
  it('superuser on EnterpriseRBAC sees everything', () => {
    expect(visibleSections(ctx(enterprise, [], true))).toEqual(APP_SECTIONS.map(s => s.id))
  })

  it('superuser on SimpleRBAC never sees Entities or Audit', () => {
    const ids = visibleSections(ctx(simple, ['*:*'], true))
    expect(ids).not.toContain('entities')
    expect(ids).not.toContain('audit')
    expect(ids).toContain('users')
    expect(ids).toContain('service-accounts')
  })

  it('delegated org admin gets tree-scoped sections', () => {
    const ids = visibleSections(ctx(enterprise, [
      'entity:read', 'user:read', 'api_key:create_tree', 'role:create', 'user:read_tree', 'membership:read_tree',
      'api_key:read_tree', 'role:update', 'entity:read_tree', 'api_key:update_tree', 'user:create', 'api_key:delete_tree',
      'role:read', 'role:delete'
    ]))
    expect(ids).toEqual(['dashboard', 'users', 'roles', 'api-keys', 'service-accounts', 'entities', 'audit', 'settings', 'account'])
  })

  it('low-privilege actors get a minimal nav', () => {
    expect(visibleSections(ctx(enterprise, ['lead:create', 'lead:read', 'lead:update']))).toEqual(['dashboard', 'api-keys', 'account'])
    expect(visibleSections(ctx(simple, ['post:update_own', 'comment:create', 'post:create', 'post:read']))).toEqual(['dashboard', 'api-keys', 'account'])
  })

  it('Settings is for admins: any read of an admin section, tree grants included (F-186)', () => {
    for (const grant of ['user:read', 'role:read', 'permission:read', 'entity:read_tree', 'api_key:read_tree', 'user:*']) {
      expect(visibleSections(ctx(enterprise, [grant])), grant).toContain('settings')
    }
    expect(visibleSections(ctx(enterprise, ['lead:read', 'api_key:create']))).not.toContain('settings')
  })

  it('Settings names only the admin permissions this backend has (v-auth-shell-08)', () => {
    const settings = appSection('settings').requires
    expect(requirementPermissions(resolveRequirement(settings, enterprise))).toEqual(['user:read', 'role:read', 'permission:read', 'entity:read', 'api_key:read'])
    // SimpleRBAC has no entities: entity:read would mean nothing there.
    expect(consoleAdminPermissions(simple)).toEqual(['user:read', 'role:read', 'permission:read', 'api_key:read'])
    expect(requirementPermissions(resolveRequirement(settings, simple))).toEqual(['user:read', 'role:read', 'permission:read', 'api_key:read'])
    // An older library without mounted_surfaces: the feature flags decide.
    expect(consoleAdminPermissions(legacy)).toContain('entity:read')
    // Not loaded yet: every admin section counts.
    expect(consoleAdminPermissions(null)).toEqual(['user:read', 'role:read', 'permission:read', 'entity:read', 'api_key:read'])
    // The nav and the route follow the same list: an entity grant alone opens nothing on SimpleRBAC.
    expect(visibleSections(ctx(simple, ['entity:read']))).not.toContain('settings')
    expect(visibleSections(ctx(simple, ['api_key:read']))).toContain('settings')
    expect(visibleSections(ctx(enterprise, ['entity:read']))).toContain('settings')
  })

  it('a backend with no admin section leaves Settings to superusers', () => {
    const bare: AuthConfig = { ...simple, mounted_surfaces: ['auth', 'api_keys'] }
    expect(consoleAdminPermissions(bare)).toEqual([])
    expect(resolveRequirement(appSection('settings').requires, bare)).toMatchObject({ superuser: true, permission: undefined })
    expect(visibleSections(ctx(bare, ['user:read']))).not.toContain('settings')
    expect(visibleSections(ctx(bare, [], true))).toContain('settings')
  })

  it('a resource wildcard role keeps its whole section', () => {
    expect(visibleSections(ctx(enterprise, ['user:*']))).toContain('users')
    expect(visibleSections(ctx(enterprise, ['user:*']))).toContain('audit')
  })

  it('fails closed on every capability-gated section while config is unknown', () => {
    expect(visibleSections(ctx(null, [], true))).toEqual(['dashboard', 'settings', 'account'])
  })
})

describe('legacyRedirect', () => {
  it('sends a former section route to its current one', () => {
    expect(legacyRedirect('/app/users/api-keys')).toBe('/app/service-accounts')
    expect(legacyRedirect('/app/users/api-keys/')).toBe('/app/service-accounts')
    expect(legacyRedirect('/app/users/api-keys/abc')).toBe('/app/service-accounts/abc')
  })

  it('leaves every current route alone', () => {
    for (const path of ['/app/users', '/app/users/123', '/app/users/api-keysx', '/app/service-accounts', '/app/api-keys']) {
      expect(legacyRedirect(path)).toBeNull()
    }
  })
})

describe('findAppSection', () => {
  it.each([
    ['/app/users', 'users'],
    ['/app/users/123', 'users'],
    ['/app/service-accounts', 'service-accounts'],
    ['/app/service-accounts/abc', 'service-accounts'],
    ['/app/api-keys', 'api-keys'],
    ['/app/entities', 'entities'],
    ['/app/audit', 'audit'],
    ['/app/roles/abc', 'roles']
  ])('%s -> %s', (path, id) => {
    expect(findAppSection(path)?.id).toBe(id)
  })

  it('does not match on a bare prefix', () => {
    expect(findAppSection('/app/usersx')).toBeUndefined()
    expect(findAppSection('/auth/login')).toBeUndefined()
  })
})

describe('checkApiContract', () => {
  it.each([
    ['outlabs-auth.api/v1', 'supported'],
    ['outlabs-auth.api/v1.2', 'supported'],
    ['outlabs-auth.api/v1-rc1', 'supported'],
    ['outlabs-auth.api/1', 'supported'],
    ['outlabs-auth.api/v01', 'supported'],
    [' outlabs-auth.api/v1 ', 'supported'],
    ['outlabs-auth.api/v2', 'unsupported'],
    ['outlabs-auth.api/v2.0-beta', 'unsupported'],
    ['outlabs-auth.api/v10', 'unsupported'],
    ['outlabs-auth.api/v0', 'unsupported']
  ])('%s -> %s', (version, status) => {
    expect(checkApiContract({ api_contract_version: version }).status).toBe(status)
  })

  // Format drift must never lock operators out: only a parsed, differing major blocks.
  it.each(['v1', 'other.api/v1', 'outlabs-auth.api/latest', 'garbage'])('an unparseable %s is unknown and does not block', (version) => {
    expect(checkApiContract({ api_contract_version: version })).toEqual({ status: 'unknown', version })
    expect(apiContractError({ api_contract_version: version, preset: 'EnterpriseRBAC' })).toBeNull()
  })

  it('an absent version is unknown, not unsupported', () => {
    expect(checkApiContract({}).status).toBe('unknown')
    expect(checkApiContract(null).status).toBe('unknown')
    expect(apiContractError(null)).toBeNull()
  })

  it('builds a blocking error naming both versions', () => {
    const error = apiContractError({ api_contract_version: 'outlabs-auth.api/v2', library_version: '1.0.0', preset: 'EnterpriseRBAC' })
    expect(error?.issues).toEqual([
      'Server API contract: outlabs-auth.api/v2',
      'Supported by this console: outlabs-auth.api/v1',
      'Server library version: 1.0.0'
    ])
  })
})

describe('capability labels (F-186)', () => {
  it('labels every reported feature once, known ones first in table order', () => {
    const list = featureList({ invitations: true, abac: false, entity_hierarchy: true, shiny_new_thing: true })
    expect(list.map(f => [f.label, f.on])).toEqual([
      ['Entity hierarchy', true],
      ['Attribute conditions (ABAC)', false],
      ['Invitations', true],
      ['Shiny new thing', true]
    ])
    expect(featureList(null)).toEqual([])
  })

  it('leaves out the flags the backend always reports on, unless one is ever off (v-auth-shell-02)', () => {
    expect(ALWAYS_ON_FEATURES).toEqual(['api_keys', 'system_api_keys', 'user_status', 'activity_tracking'])
    // The live SimpleRBAC answer: every constant flag on, so none of them is listed.
    expect(featureList(simple.features).map(f => f.key)).toEqual(['entity_hierarchy', 'context_aware_roles', 'abac', 'tree_permissions', 'invitations', 'magic_links', 'access_codes'])
    expect(featureList({ activity_tracking: false, invitations: true }).map(f => [f.label, f.on])).toEqual([
      ['Activity tracking', false],
      ['Invitations', true]
    ])
    // Activity tracking is usage counting, not the audit log.
    expect(FEATURE_LABELS.activity_tracking.description).not.toMatch(/audit/i)
  })

  it('says whether the audit log can be read, from the mounted routers', () => {
    expect(auditLogSummary(true)).toBe('Account events are recorded, and this server exposes the audit log.')
    expect(auditLogSummary(false)).toBe('Account events are recorded, but this server does not expose the audit log.')
  })

  it('labels routers and sign-in methods, unknown keys humanized', () => {
    expect(surfaceLabel('integration_principals')).toBe('Service accounts')
    expect(surfaceLabel('webhooks_v2')).toBe('Webhooks v2')
    expect(enabledAuthMethods({ password: true, magic_link: false, access_code: true })).toEqual(['Password', 'Access code'])
    expect(featureLabel('abac').label).toBe(FEATURE_LABELS.abac.label)
  })
})
