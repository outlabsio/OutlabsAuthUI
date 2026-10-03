// Role-assignment rules — a pure port of the outlabsAuth backend checks that decide whether a role
// can be granted to a target, so every role picker offers only roles the API will accept:
// - services/membership.py MembershipService._is_role_available_for_entity + _allows_entity_type
//   (what GET /roles/entity/{id} returns): membership grants at an entity.
// - services/role.py RoleService.assign_role_to_user: direct user grants (active, not entity-local).
// - routers/_authz_utils.py require_can_delegate_roles (SEC-2 delegation containment): a
//   non-superuser may only grant roles whose permissions they hold.
// - services/access_scope.py _user_has_active_system_wide_role: an active direct grant of a
//   system-wide role gives the holder access across every organization (DD-056).
// Keep this file free of Vue/Nuxt imports: it is unit-tested in isolation.
import type { Entity } from '~/types/entity'
import type { Role, RoleType } from '~/types/role'

type RoleShape = Pick<Role, 'is_global' | 'root_entity_id' | 'scope_entity_id'>

// System-wide ('global') = no owning organization and no defining entity. The backend's own test
// is `is_global and root_entity_id is None and scope_entity_id is None`; a role with neither
// root nor scope but is_global=false is unusable in an entity context, so it reads as global too
// (it can only ever be granted directly).
export function roleTypeOf(role: RoleShape): RoleType {
  if (role.scope_entity_id) return 'entity'
  if (role.root_entity_id) return 'root'
  return 'global'
}

export const ROLE_TYPE_LABELS: Record<RoleType, string> = {
  global: 'System-wide',
  root: 'Organization',
  entity: 'Entity'
}

// Short explanation of where a role type's grants reach, for badges' tooltips and previews.
export function roleTypeDescription(role: RoleShape & Pick<Role, 'root_entity_name' | 'scope_entity_name' | 'scope'>): string {
  const type = roleTypeOf(role)
  if (type === 'global') return 'Defined for the whole system. Granted directly, it applies in every organization.'
  if (type === 'root') return `Owned by ${role.root_entity_name || 'one organization'}.`
  const where = role.scope_entity_name || 'one entity'
  return role.scope === 'entity_only'
    ? `Defined at ${where}; applies only there, not to child entities.`
    : `Defined at ${where}; applies there and to its child entities.`
}

// Display order in pickers: the narrowest reach first, system-wide last.
const TYPE_ORDER: Record<RoleType, number> = { entity: 0, root: 1, global: 2 }

export function compareRolesForPicker(a: Role, b: Role, byType = true): number {
  if (byType) {
    const diff = TYPE_ORDER[roleTypeOf(a)] - TYPE_ORDER[roleTypeOf(b)]
    if (diff) return diff
  }
  return (a.display_name || a.name).localeCompare(b.display_name || b.name)
}

// Where a membership grant would land: the target entity, its type, its root organization and
// its ancestor set (the closure includes the entity itself, exactly like the backend's).
export type EntityRoleContext = {
  entityId: string
  entityType: string | null
  rootId: string
  ancestorIds: ReadonlySet<string>
}

// From GET /entities/{id}/path (root first, target last).
export function entityRoleContextFromPath(path: readonly Pick<Entity, 'id' | 'entity_type'>[]): EntityRoleContext | null {
  const target = path.at(-1)
  const root = path[0]
  if (!target || !root) return null
  return {
    entityId: target.id,
    entityType: target.entity_type || null,
    rootId: root.id,
    ancestorIds: new Set(path.map(entity => entity.id))
  }
}

// Mirror of MembershipService._allows_entity_type: no restriction allows every type; a
// restricted role needs the (case-insensitive) entity type to be listed.
export function roleAllowsEntityType(role: Pick<Role, 'assignable_at_types'>, entityType: string | null): boolean {
  const types = role.assignable_at_types ?? []
  if (!types.length) return true
  if (!entityType) return false
  const wanted = entityType.toLowerCase()
  return types.some(type => type.toLowerCase() === wanted)
}

// Mirror of MembershipService._is_role_available_for_entity.
export function roleAvailableAtEntity(role: Role, context: EntityRoleContext): boolean {
  if ((role.status ?? 'active') !== 'active') return false
  if (!roleAllowsEntityType(role, context.entityType)) return false
  // 1. System-wide roles are available everywhere.
  if (role.is_global && !role.root_entity_id && !role.scope_entity_id) return true
  // 2. Organization roles: only inside their own organization.
  if (role.root_entity_id && !role.scope_entity_id) return role.root_entity_id === context.rootId
  // 3 & 4. Entity-local roles: same organization, then hierarchy (the entity or an ancestor) or
  // entity_only (exactly the entity).
  if (role.scope_entity_id) {
    if (role.root_entity_id && role.root_entity_id !== context.rootId) return false
    return role.scope === 'entity_only'
      ? role.scope_entity_id === context.entityId
      : context.ancestorIds.has(role.scope_entity_id)
  }
  // No root, not global, no scope: orphaned, unusable in an entity context.
  return false
}

// Direct user grants (POST /users/{id}/roles, or an invite without an entity). The backend
// rejects inactive and entity-local roles. The console additionally keeps direct grants inside the
// target's own organization: on EnterpriseRBAC only system-wide roles and roles owned by the
// user's root organization are offered (a rootless user gets system-wide roles only).
export function roleDirectlyAssignable(role: Role, options: { enterprise: boolean, rootEntityId?: string | null }): boolean {
  if ((role.status ?? 'active') !== 'active') return false
  if (role.scope_entity_id) return false
  if (!options.enterprise) return true
  const type = roleTypeOf(role)
  if (type === 'global') return true
  return Boolean(options.rootEntityId) && role.root_entity_id === options.rootEntityId
}

// Delegation containment (SEC-2): the permissions of `permissions` the actor does not hold,
// judged by `allows` (the backend permission algebra over the actor's grants). Sorted, deduped.
export function missingDelegatedPermissions(permissions: readonly string[] | null | undefined, allows: (permission: string) => boolean): string[] {
  return [...new Set((permissions ?? []).filter(permission => permission && !allows(permission)))].sort()
}

export function delegationBlockedReason(missing: readonly string[]): string {
  if (!missing.length) return ''
  const shown = missing.slice(0, 3).join(', ')
  const more = missing.length > 3 ? ` and ${missing.length - 3} more` : ''
  return `You can't grant this role: you don't hold ${shown}${more}.`
}

// Caveats that make a role's grant narrower than its permission list reads.
export type RoleGrantCaveats = {
  inactive: boolean
  entityOnly: boolean
  conditional: boolean
}

export function roleGrantCaveats(role: Pick<Role, 'status' | 'scope' | 'scope_entity_id'>, options: { enterprise: boolean, conditional?: boolean }): RoleGrantCaveats {
  return {
    inactive: (role.status ?? 'active') !== 'active',
    // Only an entity-defined role can be entity_only in effect (permission.py applies the
    // entity_only restriction to scope-entity roles).
    entityOnly: options.enterprise && Boolean(role.scope_entity_id) && role.scope === 'entity_only',
    conditional: Boolean(options.conditional)
  }
}

// Role id -> display name hints from payloads that carry names next to ids (membership history
// role_ids/role_names are built from the same role list, in order). Pairs only when the lengths
// match; anything else is left to the role catalog.
export function roleNameHints(pairs: Iterable<{ ids: readonly string[], names: readonly string[] }>): Map<string, string> {
  const hints = new Map<string, string>()
  for (const { ids, names } of pairs) {
    if (ids.length !== names.length) continue
    ids.forEach((id, index) => {
      const name = names[index]
      if (id && name && !hints.has(id)) hints.set(id, name)
    })
  }
  return hints
}

// The roles of an entity membership as the membership itself names them (outlabs-auth 0.1.0a35
// MembershipResponse `role_names`). Those are the roles' SYSTEM names (role.name), sorted by name,
// while `role_ids` are sorted by id: the two lists are NOT index-aligned (unlike the membership
// history's role_ids/role_names), so a name is tied to an id only when that is certain:
// - a single role: its one name;
// - one role left unnamed after removing the roles a source already names: the one name left.
// Otherwise the names that cannot be tied to an id are shown as names alone, in place of the
// "Unknown role" chips they stand for, when they are exactly as many; never paired by position (a
// wrong pairing would mislabel access, which is worse than "Unknown role").
export type MembershipRoleDisplay = {
  /** Role ids shown as chips; `name` is the membership's own name for it, when certain. */
  chips: { id: string, name?: string }[]
  /** Names of the membership's roles that cannot be tied to one of its ids. */
  names: string[]
}

export function membershipRoleDisplay(
  membership: { role_ids?: readonly string[] | null, role_names?: readonly string[] | null },
  sources: {
    /** id -> system name of the roles the catalog holds; null while it is still loading. */
    catalogNames: ReadonlyMap<string, string> | null
    /** Whether another source (the membership history) already names this role. */
    namedElsewhere?: (id: string) => boolean
  }
): MembershipRoleDisplay {
  const ids = [...(membership.role_ids ?? [])]
  const names = [...(membership.role_names ?? [])]
  const chips = (named: ReadonlyMap<string, string> = new Map()) => ids.map(id => (named.has(id) ? { id, name: named.get(id) } : { id }))
  // The membership's names are the last resort: nothing is named from them until the catalog
  // (and the caller's other sources) have answered, so a chip never flips from a system name to
  // a display name.
  if (!sources.catalogNames || !ids.length || !names.length) return { chips: chips(), names: [] }
  if (ids.length === 1 && names.length === 1) return { chips: chips(new Map([[ids[0]!, names[0]!]])), names: [] }

  // Names left once the roles the catalog holds are taken out (by their system name).
  const left = [...names]
  const unnamed: string[] = []
  let namedByOthers = 0
  for (const id of ids) {
    const known = sources.catalogNames.get(id)
    if (known !== undefined) {
      const index = left.indexOf(known)
      if (index !== -1) left.splice(index, 1)
    } else if (sources.namedElsewhere?.(id)) {
      namedByOthers++
    } else {
      unnamed.push(id)
    }
  }
  // A role named only by another source keeps one of the names left, but which one is unknown.
  if (!unnamed.length || namedByOthers || left.length !== unnamed.length) return { chips: chips(), names: [] }
  if (unnamed.length === 1) return { chips: chips(new Map([[unnamed[0]!, left[0]!]])), names: [] }
  const hidden = new Set(unnamed)
  return { chips: ids.filter(id => !hidden.has(id)).map(id => ({ id })), names: left.sort((a, b) => a.localeCompare(b)) }
}

// A directly granted role that gives cross-organization scope: active system-wide role in an
// active, currently valid direct membership (mirrors _user_has_active_system_wide_role).
export type DirectRoleGrant = {
  status: string
  is_currently_valid: boolean
  role: Pick<Role, 'display_name' | 'name' | 'is_global' | 'root_entity_id' | 'scope_entity_id' | 'status'>
}

export function grantsSystemWideScope(grant: DirectRoleGrant): boolean {
  const role = grant.role
  return grant.status === 'active'
    && grant.is_currently_valid
    && (role.status ?? 'active') === 'active'
    && role.is_global
    && !role.root_entity_id
    && !role.scope_entity_id
}

export type AccessScopeSummary = {
  // Short value for a detail row.
  label: string
  // One sentence explaining where it comes from.
  description: string
  // True when the account reaches every organization (superuser or a direct system-wide role).
  allOrganizations: boolean
}

// What an account can reach on EnterpriseRBAC (access_scope.py resolve_for_user): superusers and
// holders of an active direct system-wide role span every organization; everyone else is limited
// to their root organization and the entities they are members of. `directGrants` null/undefined
// means the direct roles could not be read, so the summary does not claim a limit it cannot see.
export function accessScopeSummary(input: {
  isSuperuser: boolean
  rootEntityName?: string | null
  directGrants?: readonly DirectRoleGrant[] | null
  membershipCount?: number | null
}): AccessScopeSummary {
  if (input.isSuperuser) {
    return { label: 'All organizations', description: 'Superuser: every organization and entity.', allOrganizations: true }
  }
  if (!input.directGrants) {
    return {
      label: input.rootEntityName || 'No organization',
      description: 'The root organization. A system-wide role granted directly would extend access to every organization.',
      allOrganizations: false
    }
  }
  const systemWide = input.directGrants.filter(grantsSystemWideScope)
  if (systemWide.length) {
    const names = systemWide.map(grant => grant.role.display_name || grant.role.name).join(', ')
    return {
      label: 'All organizations',
      description: `Through the directly granted system-wide ${systemWide.length === 1 ? 'role' : 'roles'} ${names}.`,
      allOrganizations: true
    }
  }
  const memberships = input.membershipCount ?? null
  const membershipText = memberships == null
    ? ''
    : memberships === 0
      ? ' No entity memberships.'
      : ` Member of ${memberships} ${memberships === 1 ? 'entity' : 'entities'}.`
  if (input.rootEntityName) {
    return {
      label: input.rootEntityName,
      description: `Limited to this organization.${membershipText}`,
      allOrganizations: false
    }
  }
  return {
    label: 'No organization',
    description: `Not placed in an organization.${membershipText}`,
    allOrganizations: false
  }
}
