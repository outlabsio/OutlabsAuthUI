import { useQueryCache, type EntryKey, type QueryCache } from '@pinia/colada'
import { MY_PERMISSIONS_KEY, SESSION_KEY } from '~/queries/session'

// Cross-domain cache freshness in one place. A write changes more than its own resource: a
// membership change shows up in the user's membership history and audit trail, the entity's
// member list, and — when the target is the signed-in admin — their own permissions. Every
// mutation's onSettled calls `invalidateAfter(domain, …)`, which marks the dependent roots stale
// so active queries refetch.
//
// Invalidation is never awaited: the mutation's outcome is decided by the write alone. A refetch
// that fails leaves that view in its own error state; it must not turn a successful write into
// "Could not …" (and lose a one-time secret on create/rotate).

/** Every query-key root the console uses. Query modules key off these. */
export const QUERY_ROOTS = {
  users: ['users'],
  memberships: ['memberships'],
  roles: ['roles'],
  permissions: ['permissions'],
  entities: ['entities'],
  apiKeys: ['api-keys'],
  principals: ['system-principals'],
  audit: ['audit'],
  abac: ['abac'],
  config: ['config'],
  mySessions: ['my-sessions'],
  socialAccounts: ['my-social-accounts'],
  session: SESSION_KEY,
  myPermissions: MY_PERMISSIONS_KEY
} as const satisfies Record<string, EntryKey>

export type QueryRoot = keyof typeof QUERY_ROOTS

/** What a write changed. */
export type MutationDomain
  = | 'user' // create, invite, update, delete, restore, resend invite, status, superuser
    | 'userRoles' // direct role assignments on a user
    | 'userSessions' // an admin revoking one or every session of a user
    | 'membership' // entity memberships (add, update access, remove)
    | 'role' // role definitions (create, update, archive)
    | 'permission' // permission definitions
    | 'entity' // entities (create, update, move)
    | 'entityArchive' // DELETE /entities/{id}: archives memberships, keys and service accounts too
    | 'apiKey' // personal API keys, including an admin revoking a user's key
    | 'principal' // service accounts and their keys
    | 'keyInventory' // an admin revoking any key anchored at an entity (personal or service account)
    | 'abac' // ABAC condition groups and conditions
    | 'entityTypeConfig' // entity-type configuration
    | 'mySessions' // the actor's own sessions
    | 'socialAccounts' // the actor's linked OAuth accounts
    | 'profile' // the actor's own profile (PATCH /users/me)

/**
 * The actor's own session and permissions are refreshed:
 * - 'always': the actor may hold what changed (a role or permission definition);
 * - 'target': only when the write targets the actor (pass `targetUserId`);
 * - 'never'.
 */
type ActorEffect = 'always' | 'target' | 'never'

export const INVALIDATE_AFTER: Record<MutationDomain, { roots: readonly QueryRoot[], actor: ActorEffect }> = {
  // User rows appear in entity member lists; every write is audited.
  user: { roots: ['users', 'memberships', 'audit'], actor: 'target' },
  userRoles: { roots: ['users', 'audit'], actor: 'target' },
  // The user's sessions live under their detail; the revoke is audited (user.sessions_revoked).
  userSessions: { roots: ['users', 'audit'], actor: 'target' },
  // Membership history lives under the user's detail; member counts under entities.
  membership: { roots: ['memberships', 'users', 'entities', 'audit'], actor: 'target' },
  // Role names and permissions render on user role assignments and entity member rows.
  role: { roots: ['roles', 'users', 'memberships', 'audit'], actor: 'always' },
  // Permission definitions render inside role details.
  permission: { roots: ['permissions', 'roles', 'audit'], actor: 'always' },
  // Entity names render on users (root org), members and entity-scoped service accounts. A move
  // or type change also changes which roles a membership there may carry (roles/entity/{id}).
  entity: { roots: ['entities', 'memberships', 'users', 'principals', 'roles', 'audit'], actor: 'never' },
  // Archiving revokes memberships, entity-scoped role assignments and API keys and archives the
  // entity's service accounts; the actor may have held one of those memberships.
  entityArchive: { roots: ['entities', 'memberships', 'users', 'principals', 'apiKeys', 'roles', 'audit'], actor: 'always' },
  // The admin view of a user's personal keys lives under the user's detail.
  apiKey: { roots: ['apiKeys', 'users', 'audit'], actor: 'never' },
  principal: { roots: ['principals', 'audit'], actor: 'never' },
  // The inventory lists personal keys too: their owners' key lists (and the admin's own) go stale.
  keyInventory: { roots: ['principals', 'apiKeys', 'users', 'audit'], actor: 'never' },
  abac: { roots: ['abac', 'audit'], actor: 'never' },
  entityTypeConfig: { roots: ['config', 'entities', 'audit'], actor: 'never' },
  mySessions: { roots: ['mySessions', 'users', 'audit'], actor: 'never' },
  socialAccounts: { roots: ['socialAccounts', 'audit'], actor: 'never' },
  profile: { roots: ['session', 'users', 'audit'], actor: 'never' }
}

export type InvalidateOptions = {
  // The user the write targeted; when it is the signed-in actor, their session and permissions
  // are refreshed too.
  targetUserId?: string | null
}

/** The keys a write in `domain` makes stale (pure; exported for tests and docs). */
export function keysToInvalidate(domain: MutationDomain, { targetUserId, actorId }: InvalidateOptions & { actorId?: string | null } = {}): EntryKey[] {
  const { roots, actor } = INVALIDATE_AFTER[domain]
  const keys = new Set<QueryRoot>(roots)
  const targetsActor = actor === 'always' || (actor === 'target' && Boolean(targetUserId) && targetUserId === actorId)
  if (targetsActor) {
    keys.add('session')
    keys.add('myPermissions')
  }
  return [...keys].map(root => QUERY_ROOTS[root])
}

/** Fire-and-forget invalidation; a failed refetch is the view's error, never the write's. */
export function invalidateAfter(queryCache: QueryCache, domain: MutationDomain, options: InvalidateOptions = {}): void {
  const actorId = queryCache.getQueryData<{ id?: string } | null>(SESSION_KEY)?.id ?? null
  for (const key of keysToInvalidate(domain, { ...options, actorId })) {
    queryCache.invalidateQueries({ key }).catch(() => {})
  }
}

/** `invalidateAfter` bound to the current query cache, for mutation wrappers' onSettled. */
export function useInvalidateAfter() {
  const queryCache = useQueryCache()
  return (domain: MutationDomain, options?: InvalidateOptions) => invalidateAfter(queryCache, domain, options)
}
