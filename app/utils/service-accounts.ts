import type { ConfirmCopy } from '~/composables/useConfirmAction'
import type { ApiKey, IntegrationPrincipal, IntegrationPrincipalStatus } from '~/types/api-key'
import { parsePermissionName } from '~/utils/permissions'
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

// ── Scope policy ──

/**
 * The backend's default system-key scope allowlist (outlabs-auth core/config.py
 * DEFAULT_SYSTEM_API_KEY_ACTION_PREFIXES and api_key_system_excluded_resources). Hosts can change
 * both and no endpoint reports them yet, so the direct-scope picker uses the defaults and the
 * API's 400 remains the final word.
 */
export const DEFAULT_SYSTEM_SCOPE_ACTION_PREFIXES = ['create', 'read', 'list', 'search', 'view', 'get', 'update', 'delete', 'write', 'run', 'execute', 'trigger'] as const
export const DEFAULT_SYSTEM_SCOPE_EXCLUDED_RESOURCES = ['api_key', 'service_token', 'integration_principal'] as const

/** Whether a permission may be a service account's direct scope under the default policy. */
export function systemScopeAllowed(name: string): boolean {
  const { resource, action } = parsePermissionName(name)
  const res = resource.toLowerCase()
  const act = action.toLowerCase()
  if ((DEFAULT_SYSTEM_SCOPE_EXCLUDED_RESOURCES as readonly string[]).includes(res)) return false
  return DEFAULT_SYSTEM_SCOPE_ACTION_PREFIXES.some(prefix => act === prefix || act.startsWith(`${prefix}_`))
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
