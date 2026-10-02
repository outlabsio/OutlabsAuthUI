// Permission algebra — a pure port of the outlabsAuth backend matcher
// (outlabs_auth/services/permission.py: PermissionService._parse_permission_name,
// _permission_set_allows, _permission_set_allows_from_ancestor and PermissionMatcher).
//
// The console must grant exactly what the backend grants, or delegated admins (who usually
// hold tree-scoped or wildcard permissions) see false denials. Rules, mirrored verbatim:
// - `*:*` grants everything.
// - An exact name grants itself.
// - `resource:*` grants every action and scope of that resource.
// - `resource:action_all` grants `resource:action`, `resource:action_tree` and `_all` itself.
// - `resource:action_tree` grants the unscoped `resource:action` (and itself).
// - `_own` is a scope too, but only an exact grant or a `_all`/`resource:*`/`*:*` grant covers it.
// Keep this file free of Vue/Nuxt imports: it is unit-tested in isolation.

export type PermissionScope = 'tree' | 'all' | 'own'

export type ParsedPermission = {
  resource: string
  action: string
  scope: PermissionScope | null
}

const SCOPES: readonly string[] = ['tree', 'all', 'own']

// `resource:action[_scope]` -> parts. A name without ':' is a bare resource with action '*'.
// The scope is the last underscore segment only when it is one of tree/all/own.
export function parsePermissionName(name: string): ParsedPermission {
  const colon = name.indexOf(':')
  if (colon === -1) return { resource: name, action: '*', scope: null }
  const resource = name.slice(0, colon)
  const actionPart = name.slice(colon + 1)
  const underscore = actionPart.lastIndexOf('_')
  if (underscore === -1) return { resource, action: actionPart, scope: null }
  const maybeScope = actionPart.slice(underscore + 1)
  if (SCOPES.includes(maybeScope)) {
    return { resource, action: actionPart.slice(0, underscore), scope: maybeScope as PermissionScope }
  }
  return { resource, action: actionPart, scope: null }
}

// Precomputed index over a granted set (mirror of the backend PermissionMatcher). Build it once
// per granted set and call allows() many times: every check is a few set lookups.
export class PermissionMatcher {
  private readonly hasSuper: boolean
  private readonly exact: ReadonlySet<string>
  private readonly resourceWildcards: ReadonlySet<string>
  private readonly allScoped: ReadonlySet<string>
  private readonly treeScoped: ReadonlySet<string>

  constructor(granted: Iterable<string>) {
    const exact = new Set<string>()
    for (const perm of granted) {
      if (perm) exact.add(perm)
    }
    const resourceWildcards = new Set<string>()
    const allScoped = new Set<string>()
    const treeScoped = new Set<string>()
    for (const perm of exact) {
      const colon = perm.indexOf(':')
      if (colon === -1) continue
      const resource = perm.slice(0, colon)
      const actionPart = perm.slice(colon + 1)
      if (actionPart === '*') {
        resourceWildcards.add(resource)
        continue
      }
      const underscore = actionPart.lastIndexOf('_')
      if (underscore === -1) continue
      const baseAction = actionPart.slice(0, underscore)
      const scope = actionPart.slice(underscore + 1)
      if (scope === 'all') allScoped.add(`${resource}:${baseAction}`)
      else if (scope === 'tree') treeScoped.add(`${resource}:${baseAction}`)
    }
    this.hasSuper = exact.has('*:*')
    this.exact = exact
    this.resourceWildcards = resourceWildcards
    this.allScoped = allScoped
    this.treeScoped = treeScoped
  }

  // Mirror of PermissionService._permission_set_allows.
  allows(required: string): boolean {
    if (this.hasSuper || this.exact.has(required)) return true
    const { resource, action, scope } = parsePermissionName(required)
    if (this.resourceWildcards.has(resource)) return true
    const base = `${resource}:${action}`
    if (this.allScoped.has(base)) return true
    if (scope === null && this.treeScoped.has(base)) return true
    return false
  }

  // True when ANY of the candidates is allowed (an empty list allows nothing).
  allowsAny(candidates: readonly string[]): boolean {
    return candidates.some(candidate => this.allows(candidate))
  }

  // Mirror of PermissionService._permission_set_allows_from_ancestor: only `_tree`/`_all`
  // (or `*:*`) grants held on an ancestor entity propagate down to a descendant.
  allowsFromAncestor(required: string): boolean {
    if (this.hasSuper) return true
    const { resource, action, scope } = parsePermissionName(required)
    const base = `${resource}:${action}`
    if (scope === 'all') return this.allScoped.has(base)
    return this.allScoped.has(base) || this.treeScoped.has(base)
  }
}

// One-shot convenience for a single check against a raw granted set.
export function permissionSetAllows(required: string, granted: Iterable<string>): boolean {
  return new PermissionMatcher(granted).allows(required)
}
