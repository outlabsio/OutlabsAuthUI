import type { MaybeRefOrGetter } from 'vue'
import { useQuery } from '@pinia/colada'
import { entitiesListQuery, entityOrganisationQuery } from '~/queries/entities'
import { userRoleMembershipsQuery } from '~/queries/users'
import type { Entity } from '~/types/entity'
import { anchoredRootFor } from '~/utils/entity-scope'
import { grantsSystemWideScope } from '~/utils/role-access'

// Which organisations' entities the signed-in admin works in (F-020).
//
// The entity routes of outlabs-auth (list, get, children, descendants, path, members) are not
// filtered by the actor's access scope today, so a delegated organisation admin who holds
// entity:read could read every tenant's structure. The console scopes what it shows instead:
// - a non-global admin placed in an organisation (user.root_entity_id) sees that organisation
//   only: the tree, every entity picker (AppEntityPicker anchors itself, the plain entity selects
//   read useScopedEntities), the command palette's entity search and the entity detail are
//   anchored on it, and a deep link to an entity elsewhere renders "outside your organization";
// - superusers, holders of a direct system-wide role (useActorReach, as outlabs-auth's own access
//   scope decides), and accounts with no organisation (which can only hold system-wide grants)
//   browse every organisation through a root switcher. This is the same rule the Users and Roles
//   lists apply, so an admin who is shown another organisation's accounts can also work with its
//   entities. While the reach is unknown (null: loading, or no user:read) the admin stays
//   anchored, so nothing widens before it is known.
// This is presentation, not a security boundary: the backend must scope those routes (WP-23).
export function useEntityScope() {
  const { user, isSuperuser } = useAuth()
  const { isGlobal } = useActorReach()

  // The one organisation a delegated admin is anchored on, or null when they may browse all.
  const anchoredRootId = computed<string | null>(() => anchoredRootFor({ superuser: isSuperuser.value, actorIsGlobal: isGlobal.value, rootEntityId: user.value?.root_entity_id }))
  const canBrowseAllRoots = computed(() => !anchoredRootId.value)

  // Whether an entity whose root organisation is `rootId` is within the actor's scope.
  function rootInScope(rootId: string | null | undefined): boolean {
    if (!anchoredRootId.value) return true
    return Boolean(rootId) && rootId === anchoredRootId.value
  }

  return { anchoredRootId, canBrowseAllRoots, rootInScope }
}

// Every entity the actor may pick, for the plain entity selects that list them all (a new user's
// root organisation, a role's root and scope, a service account's scope, membership names): the
// anchored organisation (root first) for a delegated admin, else the full list (limit 1000).
// `enabled` gates both; it must follow the caller's inputs (permissions, preset), not an idle
// dialog flag, because the full list's key is shared with other pages (one `enabled` per key).
export function useScopedEntities(enabled: MaybeRefOrGetter<boolean>) {
  const { anchoredRootId } = useEntityScope()
  const on = computed(() => toValue(enabled))

  const { data: listData } = useQuery(() => ({
    ...entitiesListQuery({ limit: 1000 }),
    enabled: on.value && !anchoredRootId.value
  }))
  const { data: organisationData } = useQuery(() => ({
    ...entityOrganisationQuery(anchoredRootId.value ?? ''),
    enabled: on.value && Boolean(anchoredRootId.value)
  }))

  const entities = computed<Entity[]>(() => (anchoredRootId.value
    ? organisationData.value ?? []
    : listData.value?.items ?? []))

  return { entities }
}

// Whether the signed-in admin reaches every organisation in outlabs-auth's own sense (DD-056
// "global scope"): superusers, holders of an active direct system-wide role, and everyone on a
// backend without the entity hierarchy. That is what decides whether the backend lets them see
// accounts outside an organisation, the orphaned list, or change a superuser account.
// `isGlobal` is null while unknown: a non-superuser's direct roles are still loading, or they
// cannot read them (no user:read). Callers treat null as "not global".
// The own-roles query is the one useMyAccess reads, and the user detail's Direct roles card on
// the admin's own page: it is gated on the same input as that card (user:read), not on the
// preset or superuser flag, so the shared key keeps a single `enabled` (ARCHITECTURE.md "One
// `enabled` per key") and invalidation never skips it.
export function useActorReach() {
  const { user, isSuperuser, isEnterprise, canAccess, configState } = useAuth()

  const ownRolesReadable = computed(() => canAccess('users') && Boolean(user.value?.id))
  const ownRoles = useQuery(() => ({
    ...userRoleMembershipsQuery({ userId: user.value?.id ?? '' }),
    enabled: ownRolesReadable.value
  }))

  const isGlobal = computed<boolean | null>(() => {
    if (!user.value || configState.value !== 'ready') return null
    if (isSuperuser.value || !isEnterprise.value) return true
    if (!ownRolesReadable.value || ownRoles.status.value !== 'success') return null
    return (ownRoles.data.value ?? []).some(grantsSystemWideScope)
  })
  // Unknown only for now: the own roles are still loading (not unreadable, not failed), so a
  // verdict that depends on the reach can wait instead of showing the narrower one first.
  const reachResolving = computed(() => isGlobal.value === null && Boolean(user.value)
    && (configState.value !== 'ready' || (ownRolesReadable.value && ownRoles.status.value === 'pending')))

  return { isGlobal, reachResolving, ownRoles, ownRolesReadable }
}
