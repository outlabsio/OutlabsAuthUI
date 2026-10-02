// How long cached server state counts as fresh, per kind of data. The global default (30 s) is in
// colada.options.ts; freshness after a write comes from invalidation (queries/invalidation.ts),
// so these only decide how often focus, reconnect and remounts refetch.

// Catalogues behind pickers and name lookups (all permissions, role pools, the entity tree,
// grantable scopes): large, rarely changed, and invalidated by every write that changes them.
export const CATALOGUE_STALE_TIME = 5 * 60_000

// Who the actor is and what they may do. Short enough that a change made by another admin is
// picked up on the next focus; the console also refreshes permissions after any 403.
export const IDENTITY_STALE_TIME = 60_000

// placeholderData for paginated lists: keep showing the previous page (or filter result) while the
// next one loads instead of flashing an empty table. Only for lists whose rows are the same kind
// of record across keys; never for pools that feed a picker, where stale options could be chosen.
export function keepPreviousPage<T>(previous: T | undefined): T | undefined {
  return previous
}
