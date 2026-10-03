import type { ConfirmCopy } from '~/composables/useConfirmAction'
import type { ApiKey, IntegrationPrincipal, IntegrationPrincipalStatus } from '~/types/api-key'
import { isUuid } from '~/utils/users'

// Service accounts (outlabs-auth "integration principals") and their keys: the pure rules behind
// the Service accounts workspace. No Vue or Nuxt imports: unit-tested in
// test/unit/service-accounts.test.ts.
//
// A service account is a non-human identity. It is either platform-wide (one per backend; on
// EnterpriseRBAC only superusers manage them) or anchored at an entity (EnterpriseRBAC; managed
// with api_key:*_tree at that entity). Its keys act with at most its effective scopes: what its
// roles grant plus its direct scopes, within the backend's system-key policy.

/** Where service accounts live: the API addresses each kind under its own route. */
export type ServiceAccountScope = { kind: 'platform_global' } | { kind: 'entity', entityId: string }

/** The scope selector as the route query keeps it (?scope=platform|entity&entity=<id>). */
export type ServiceAccountScopeFilter = 'platform' | 'entity'

export type ScopeResolution = {
  kind: 'platform_global' | 'entity'
  /** null while an entity scope has no entity yet (the admin must choose one). */
  scope: ServiceAccountScope | null
}

/**
 * The scope the workspace shows. SimpleRBAC has no entities: always platform-wide. On
 * EnterpriseRBAC the platform routes are superuser-only, so anyone else is on entity scope, at the
 * entity in the URL or else `defaultEntityId` (their own organization). A malformed entity id in
 * the URL is ignored.
 */
export function resolveServiceAccountScope(input: {
  enterprise: boolean
  platformAllowed: boolean
  filter: ServiceAccountScopeFilter
  entity: string
  defaultEntityId: string | null
}): ScopeResolution {
  if (!input.enterprise) return { kind: 'platform_global', scope: { kind: 'platform_global' } }
  if (input.platformAllowed && input.filter === 'platform') return { kind: 'platform_global', scope: { kind: 'platform_global' } }
  const entityId = isUuid(input.entity) ? input.entity : (input.defaultEntityId ?? '')
  return { kind: 'entity', scope: entityId ? { kind: 'entity', entityId } : null }
}

/** The scope of an existing account, from its own record. */
export function principalScope(principal: Pick<IntegrationPrincipal, 'scope_kind' | 'anchor_entity_id'>): ServiceAccountScope {
  return principal.scope_kind === 'entity' && principal.anchor_entity_id
    ? { kind: 'entity', entityId: principal.anchor_entity_id }
    : { kind: 'platform_global' }
}

/** The console route of an account (entity accounts carry their anchor: the API needs it). */
export function serviceAccountPath(principal: Pick<IntegrationPrincipal, 'id' | 'scope_kind' | 'anchor_entity_id'>, tab?: string) {
  const scope = principalScope(principal)
  return {
    path: `/app/service-accounts/${principal.id}`,
    query: {
      ...(scope.kind === 'entity' ? { entity: scope.entityId } : {}),
      ...(tab && tab !== 'overview' ? { tab } : {})
    }
  }
}

// ── Lifecycle ──

export type ServiceAccountPolicy = {
  canEdit: boolean
  canDeactivate: boolean
  canReactivate: boolean
  canArchive: boolean
  canCreateKey: boolean
  /** Why nothing can change (archived accounts are read-only). */
  lockedReason: string | null
}

export const ARCHIVED_ACCOUNT_LOCK = 'This service account is archived: its keys were revoked and it can no longer be changed or issued keys.'

/**
 * What an admin may do with an account, from their grants and its status:
 * - archived accounts are read-only (the console never restores them);
 * - Edit, Deactivate and Reactivate need api_key:update, Archive api_key:delete, new keys
 *   api_key:create (tree-scoped grants count at the account's entity);
 * - only an active account is issued keys.
 */
export function serviceAccountPolicy(
  principal: Pick<IntegrationPrincipal, 'status'>,
  grants: { canCreate: boolean, canUpdate: boolean, canDelete: boolean }
): ServiceAccountPolicy {
  if (principal.status === 'archived') {
    return { canEdit: false, canDeactivate: false, canReactivate: false, canArchive: false, canCreateKey: false, lockedReason: ARCHIVED_ACCOUNT_LOCK }
  }
  const active = principal.status === 'active'
  return {
    canEdit: grants.canUpdate,
    canDeactivate: active && grants.canUpdate,
    canReactivate: !active && grants.canUpdate,
    canArchive: grants.canDelete,
    canCreateKey: active && grants.canCreate,
    lockedReason: null
  }
}

export const SERVICE_ACCOUNT_STATUSES = ['active', 'inactive', 'archived'] as const satisfies readonly IntegrationPrincipalStatus[]

/**
 * A status as the workspace words it everywhere (badge, status filter, account-page alert): an
 * inactive account was deactivated, and its keys with it.
 */
export function serviceAccountStatusLabel(status: IntegrationPrincipalStatus): string {
  if (status === 'inactive') return 'Deactivated'
  if (status === 'archived') return 'Archived'
  return 'Active'
}

function liveKeysSentence(liveKeys: number | null | undefined) {
  if (liveKeys == null) return 'Every key it owns is revoked immediately: requests signed with them are refused.'
  if (liveKeys === 0) return 'It has no active or suspended keys, so no key is revoked.'
  return `Its ${liveKeys} active or suspended ${liveKeys === 1 ? 'key is' : 'keys are'} revoked immediately: requests signed with ${liveKeys === 1 ? 'it' : 'them'} are refused.`
}

/**
 * Confirmation copy in the backend's terms: deactivating or archiving an account revokes every key
 * it owns (outlabs-auth revokes them on any status change away from active), and revoked keys stay
 * revoked. Pass the number of active and suspended keys when it is known.
 */
export function serviceAccountLifecycleCopy(
  principal: Pick<IntegrationPrincipal, 'name'>,
  action: 'deactivate' | 'reactivate' | 'archive',
  liveKeys?: number | null
): ConfirmCopy {
  if (action === 'reactivate') {
    return {
      title: `Reactivate service account ${principal.name}`,
      description: 'It can be issued keys again, within its roles and scopes. Keys revoked when it was deactivated stay revoked: issue new ones.',
      confirmLabel: 'Reactivate service account',
      confirmColor: 'primary'
    }
  }
  if (action === 'deactivate') {
    return {
      title: `Deactivate service account ${principal.name}`,
      effects: [
        liveKeysSentence(liveKeys),
        'Revoked keys stay revoked: reactivating the account later does not bring them back.',
        'It keeps its roles and scopes, can be edited and can be reactivated.'
      ],
      confirmLabel: 'Deactivate service account',
      confirmColor: 'warning'
    }
  }
  return {
    title: `Archive service account ${principal.name}`,
    effects: [
      liveKeysSentence(liveKeys),
      'It leaves the active list and can no longer be edited, reactivated or issued keys.',
      'Archived service accounts can\'t be restored from the console. The change is recorded in the audit trail.'
    ],
    confirmLabel: 'Archive service account',
    confirmText: principal.name
  }
}

/** Active and suspended keys: the ones a deactivation or archive revokes. */
export function liveKeyCount(keys: readonly Pick<ApiKey, 'status'>[]): number {
  return keys.filter(key => key.status === 'active' || key.status === 'suspended').length
}

// ── Scope policy (F-079) ──
// outlabs-auth 0.1.0a35 publishes what an admin may grant a service account and its keys
// (GET …/integration-principals/grantable-scopes): the host's system-key allowlist, less the
// excluded resources, within what the admin holds at the account's scope. The console offers
// exactly that list and mirrors the server's checks against it; it keeps no copy of the policy.

/** "whose action is read, update or delete": the allowlist's action prefixes, for help text. */
export function actionPrefixesPhrase(prefixes: readonly string[]): string {
  if (!prefixes.length) return ''
  const list = prefixes.length > 1 ? `${prefixes.slice(0, -1).join(', ')} or ${prefixes.at(-1)}` : prefixes[0]
  return ` whose action is ${list}`
}

/** The direct-scope field's description, naming the actions the host allows. */
export function directScopesHelp(prefixes: readonly string[]): string {
  return `Permissions given without a role. Prefer roles; add a direct scope only for a narrow integration. You can grant only what you hold${actionPrefixesPhrase(prefixes)}, and never key or service-account management.`
}

export type ScopesBeyondGrant = {
  /** Per selected role, the permissions it carries that the admin cannot grant. */
  roles: { roleId: string, scopes: string[] }[]
  /** Direct scopes the admin cannot grant. */
  direct: string[]
}

/**
 * What a service account would carry that the admin may not grant. outlabs-auth checks the
 * account's whole envelope (its roles' permissions plus its direct scopes) against the admin's
 * grantable scopes on create and on every edit, a rename included, and refuses it with a 400 that
 * does not name the scope. A role whose permissions are not known yet is skipped (the server
 * decides), and nothing is flagged while `grantable` is unknown (null).
 */
export function scopesBeyondGrant(input: {
  roleIds: readonly string[]
  directScopes: readonly string[]
  rolePermissions: (roleId: string) => readonly string[] | null | undefined
  grantable: ReadonlySet<string> | null
}): ScopesBeyondGrant {
  const { grantable } = input
  if (!grantable) return { roles: [], direct: [] }
  const beyond = (names: readonly string[]) => [...new Set(names.filter(name => name && !grantable.has(name)))].sort()
  const roles = input.roleIds.flatMap((roleId) => {
    const permissions = input.rolePermissions(roleId)
    if (!permissions) return []
    const scopes = beyond(permissions)
    return scopes.length ? [{ roleId, scopes }] : []
  })
  return { roles, direct: beyond(input.directScopes) }
}

function nameList(names: readonly string[], max = 5): string {
  const shown = names.slice(0, max)
  const more = names.length - shown.length
  const head = more > 0 ? shown : shown.slice(0, -1)
  const tail = more > 0 ? `${more} more` : shown.at(-1) ?? ''
  return head.length ? `${head.join(', ')} and ${tail}` : tail
}

/**
 * The refusals of `scopesBeyondGrant`, worded for the fields they belong to: the roles on Roles
 * (named, with what they carry), the direct scopes on Direct scopes. Empty when nothing is beyond.
 */
export function scopesBeyondGrantErrors(result: ScopesBeyondGrant, roleLabel: (roleId: string) => string): { name: 'role_ids' | 'allowed_scopes', message: string }[] {
  const errors: { name: 'role_ids' | 'allowed_scopes', message: string }[] = []
  if (result.roles.length) {
    const scopes = [...new Set(result.roles.flatMap(role => role.scopes))].sort()
    const roles = result.roles.map(role => roleLabel(role.roleId))
    const one = roles.length === 1
    errors.push({
      name: 'role_ids',
      message: `${nameList(roles)} ${one ? 'grants' : 'grant'} ${nameList(scopes)}, which you can't grant. Remove ${one ? 'it' : 'them'}, or ask an administrator who can.`
    })
  }
  if (result.direct.length) {
    errors.push({
      name: 'allowed_scopes',
      message: `You can't grant ${nameList(result.direct)}. Remove ${result.direct.length === 1 ? 'it' : 'them'}, or ask an administrator who can.`
    })
  }
  return errors
}

/**
 * A machine key's scope choices: the account's effective scopes that the admin may also grant
 * (the server checks both). Null `grantable` (not loaded): none yet.
 */
export function machineKeyScopeOptions(effective: readonly string[], grantable: ReadonlySet<string> | null): string[] {
  if (!grantable) return []
  return [...new Set(effective)].filter(name => grantable.has(name)).sort()
}

export const MACHINE_KEY_NOT_GRANTED = 'not granted to the account'
export const MACHINE_KEY_NOT_GRANTABLE = 'you can\'t grant it'

/**
 * Selected scopes a key could not be given again, with the reason: the account no longer grants
 * it, or the admin cannot. Only scopes the account grants are judged against `grantable`, and not
 * before it is known (null).
 */
export function machineKeyScopeFlags(selected: readonly string[], effective: readonly string[], grantable: ReadonlySet<string> | null): Record<string, string> {
  const granted = new Set(effective)
  const flags: Record<string, string> = {}
  for (const name of selected) {
    if (!granted.has(name)) flags[name] = MACHINE_KEY_NOT_GRANTED
    else if (grantable && !grantable.has(name)) flags[name] = MACHINE_KEY_NOT_GRANTABLE
  }
  return flags
}

/** The Scopes field's refusal while flagged scopes remain (F-082), one sentence per reason. */
export function machineKeyScopeRefusal(flags: Record<string, string>): string | null {
  const notGranted = Object.keys(flags).filter(name => flags[name] === MACHINE_KEY_NOT_GRANTED).sort()
  const notGrantable = Object.keys(flags).filter(name => flags[name] === MACHINE_KEY_NOT_GRANTABLE).sort()
  const sentences: string[] = []
  if (notGranted.length) sentences.push(`Remove ${notGranted.join(', ')}: ${notGranted.length === 1 ? 'it is' : 'they are'} not granted to the account.`)
  if (notGrantable.length) sentences.push(`Remove ${notGrantable.join(', ')}: you can't grant ${notGrantable.length === 1 ? 'it' : 'them'}.`)
  return sentences.length ? sentences.join(' ') : null
}

/** The account's scopes, each marked when it is one of its direct scopes (not through a role). */
export function effectiveScopeRows(principal: Pick<IntegrationPrincipal, 'allowed_scopes' | 'effective_allowed_scopes'>): { name: string, direct: boolean }[] {
  const direct = new Set(principal.allowed_scopes)
  return [...principal.effective_allowed_scopes].sort().map(name => ({ name, direct: direct.has(name) }))
}

/** "2 roles · 5 scopes" for list rows. */
export function serviceAccountAccessSummary(principal: Pick<IntegrationPrincipal, 'role_ids' | 'effective_allowed_scopes'>): string {
  const roles = principal.role_ids.length
  const scopes = principal.effective_allowed_scopes.length
  return `${roles} ${roles === 1 ? 'role' : 'roles'} · ${scopes} ${scopes === 1 ? 'scope' : 'scopes'}`
}
