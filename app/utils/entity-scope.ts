// Which organisations an admin works in (F-020), and when they cannot pick an entity at all
// (F-016). Pure rules behind useEntityScope and the dialogs that pick entities; unit-tested in
// test/unit/entity-scope.test.ts.
//
// outlabs-auth treats superusers and holders of an active direct system-wide role alike: both
// reach every organisation (services/access_scope.py, DD-056). `actorIsGlobal` is that reach as
// useActorReach knows it, null while unknown (still loading, or the admin cannot read their own
// roles). Unknown never widens anything.

export type ActorScopeInput = {
  superuser: boolean
  actorIsGlobal: boolean | null
  // The admin's own organisation (user.root_entity_id).
  rootEntityId: string | null | undefined
}

// The organisation an admin is anchored on, or null when they browse every organisation:
// superusers, system-wide admins, and accounts with no organisation.
export function anchoredRootFor(input: ActorScopeInput): string | null {
  if (input.superuser || input.actorIsGlobal === true) return null
  return input.rootEntityId || null
}

// Whether an entity picker has nothing to offer this admin: EnterpriseRBAC, no organisation to
// anchor on and no global reach (a rootless non-global account can hold only system-wide grants,
// which it does not). A rootless system-wide admin is not blocked: the picker searches every
// organisation for them, as for a superuser, and the backend accepts their choice.
export function entityPickBlocked(input: { enterprise: boolean, superuser: boolean, actorIsGlobal: boolean | null, anchoredRootId: string | null }): boolean {
  return input.enterprise && !input.superuser && !input.anchoredRootId && input.actorIsGlobal !== true
}
