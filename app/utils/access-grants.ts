import { formatDate, parseDate } from '~/utils/format-date'
import type { UserPermissionSource } from '~/types/permission'

// Pure rules for an account's grants: its direct role assignments and its entity memberships.
// Both carry a stored lifecycle status (active, suspended, revoked, expired, pending, rejected)
// and an optional validity window, and only an ACTIVE grant inside its window gives permissions.
//
// The F-015 rule: a dialog never writes a status the admin did not choose. So
//   - "live" grants (stored status active or suspended) are edited with their real status and
//     removed;
//   - every other grant has ended and is offered only "Reactivate", an explicit action whose
//     effects are spelled out (it never opens a form that would save "active" by default).

export type AccessGrant = {
  status: string
  // Memberships carry the server's effective status; direct role assignments derive it here.
  effective_status?: string | null
  valid_from?: string | null
  valid_until?: string | null
}

export type GrantAction = 'edit' | 'reactivate' | 'remove'

/** Stored active or suspended: still part of the account's access (editable, removable). */
export function grantIsLive(grant: Pick<AccessGrant, 'status'>): boolean {
  return grant.status === 'active' || grant.status === 'suspended'
}

/** The validity window has ended (its end is in the past). */
export function grantWindowEnded(grant: Pick<AccessGrant, 'valid_until'>, now: number = Date.now()): boolean {
  const until = parseDate(grant.valid_until)
  return Boolean(until && until.getTime() < now)
}

/**
 * The status a grant has now: a non-active stored status as is; an active one is 'pending'
 * before its window opens and 'expired' after it closes (the server's effective_status rule).
 */
export function grantEffectiveStatus(grant: AccessGrant, now: number = Date.now()): string {
  if (grant.effective_status) return grant.effective_status
  if (grant.status !== 'active') return grant.status
  const from = parseDate(grant.valid_from)
  if (from && now < from.getTime()) return 'pending'
  if (grantWindowEnded(grant, now)) return 'expired'
  return 'active'
}

/**
 * The row actions a grant offers, in menu order. Edit and Remove apply to live grants only;
 * Reactivate to anything not stored as active (a suspended grant offers both Reactivate and
 * Edit, an ended one only Reactivate). `can` says what the admin may do here.
 */
export function grantActions(grant: Pick<AccessGrant, 'status'>, can: { edit: boolean, remove: boolean, reactivate: boolean }): GrantAction[] {
  const actions: GrantAction[] = []
  if (can.reactivate && grant.status !== 'active') actions.push('reactivate')
  if (can.edit && grantIsLive(grant)) actions.push('edit')
  if (can.remove && grantIsLive(grant)) actions.push('remove')
  return actions
}

/** Default view: live grants; "Include ended" adds the rest. */
export function visibleGrants<T extends Pick<AccessGrant, 'status'>>(grants: readonly T[], includeEnded: boolean): T[] {
  return includeEnded ? [...grants] : grants.filter(grantIsLive)
}

/** How many grants the default view hides. */
export function endedGrantCount(grants: readonly Pick<AccessGrant, 'status'>[]): number {
  return grants.filter(grant => !grantIsLive(grant)).length
}

// --- Reactivate ---

export type ReactivateGrantInput = {
  kind: 'membership' | 'role'
  // The entity (membership) or the role (direct assignment).
  name: string
  userEmail: string
  status: string
  validFrom?: string | null
  validUntil?: string | null
  // Membership only: the roles it carries, and whether its entity is inactive.
  roleNames?: string[]
  entityInactive?: boolean
}

export type ReactivateGrantCopy = {
  title: string
  description: string
  effects: string[]
  submitLabel: string
  // The stored end has passed: the form starts with it cleared, so reactivating restores access.
  endPassed: boolean
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

export function reactivateGrantCopy(input: ReactivateGrantInput, now: number = Date.now()): ReactivateGrantCopy {
  const endPassed = grantWindowEnded({ valid_until: input.validUntil }, now)
  const from = parseDate(input.validFrom)
  const startsLater = Boolean(from && from.getTime() > now)
  const effects: string[] = []
  if (input.kind === 'membership') {
    const roles = input.roleNames ?? []
    effects.push(roles.length
      ? `Its ${roles.length === 1 ? 'role' : `${roles.length} roles`} (${listNames(roles)}) apply again in ${input.name}, and below it for roles that reach down the tree${startsLater ? '' : ', immediately'}.`
      : `It carries no roles, so it grants nothing until roles are added with Edit access.`)
    if (input.entityInactive) {
      effects.push(`${input.name} is inactive. An inactive entity does not revoke access, so this membership applies again.`)
    }
  } else {
    effects.push(`${input.userEmail} gets the permissions of ${input.name} again${startsLater ? '' : ', immediately'}.`)
  }
  if (startsLater) effects.push(`Its window starts on ${formatDate(input.validFrom)}; it applies from then.`)
  if (endPassed) effects.push(`Its end date (${formatDate(input.validUntil)}) has passed, so it is cleared. Set Valid until if this access should end.`)
  effects.push(input.kind === 'membership'
    ? 'The reactivation is recorded in the user\'s membership history.'
    : 'The reactivation is recorded in the user\'s audit trail.')
  const noun = input.kind === 'membership' ? 'membership' : 'role'
  return {
    title: input.kind === 'membership' ? `Reactivate membership in ${input.name}` : `Reactivate role ${input.name}`,
    // Reactivate is offered only on a grant not stored as active (grantActions). A pending one
    // awaits approval (the backend's future-use status), so reactivating it approves it.
    description: input.status === 'pending'
      ? 'It is awaiting approval. Reactivating approves it and sets its status to Active.'
      : `It is ${input.status} now. Reactivating sets its status to Active.`,
    effects,
    submitLabel: `Reactivate ${noun}`,
    endPassed
  }
}

// --- Multi-role assignment (F-176) ---

export type AssignOutcomeLike = { roleId: string, ok: boolean, error?: unknown }

export type AssignSummary = {
  assigned: string[]
  failed: Array<{ roleId: string, name: string, message: string }>
  // Toast copy: "Assigned 2 of 3 roles" / "Office Manager: <reason>".
  title: string
  description: string
}

export function assignOutcomeSummary(
  outcomes: readonly AssignOutcomeLike[],
  nameOf: (roleId: string) => string,
  messageOf: (error: unknown) => string
): AssignSummary {
  const assigned = outcomes.filter(outcome => outcome.ok).map(outcome => outcome.roleId)
  const failed = outcomes
    .filter(outcome => !outcome.ok)
    .map(outcome => ({ roleId: outcome.roleId, name: nameOf(outcome.roleId), message: messageOf(outcome.error) }))
  const total = outcomes.length
  const title = failed.length
    ? `Assigned ${assigned.length} of ${total} ${total === 1 ? 'role' : 'roles'}`
    : (total === 1 ? 'Role assigned' : 'Roles assigned')
  const description = failed.map(item => `${item.name}: ${item.message}`).join(' ')
  return { assigned, failed, title, description }
}

// --- Effective permissions (F-013) ---

export type EffectivePermissionRow = {
  name: string
  displayName: string
  description: string | null
  action: string
  sourceId: string | null
  sourceName: string | null
}

export type EffectivePermissionGroup = { resource: string, items: EffectivePermissionRow[] }

/**
 * GET /users/{id}/permissions grouped by resource (resources and names sorted), filtered by a
 * search term over the name, display name, description and source role.
 */
export function groupEffectivePermissions(sources: readonly UserPermissionSource[], term = '', sourceLabel: (source: UserPermissionSource) => string = s => s.source_name ?? ''): EffectivePermissionGroup[] {
  const needle = term.trim().toLowerCase()
  const groups = new Map<string, EffectivePermissionRow[]>()
  for (const source of sources) {
    const p = source.permission
    const resource = p.resource || p.name.split(':')[0] || 'other'
    const row: EffectivePermissionRow = {
      name: p.name,
      displayName: p.display_name || p.name,
      description: p.description || null,
      action: p.name.startsWith(`${resource}:`) ? p.name.slice(resource.length + 1) : (p.action || p.name),
      sourceId: source.source_id ?? null,
      sourceName: source.source_name ?? null
    }
    if (needle && ![row.name, row.displayName, row.description ?? '', sourceLabel(source)].some(text => text.toLowerCase().includes(needle))) continue
    const bucket = groups.get(resource) ?? []
    bucket.push(row)
    groups.set(resource, bucket)
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([resource, items]) => ({ resource, items: items.sort((a, b) => a.name.localeCompare(b.name)) }))
}

/**
 * Where a role in force comes from for this account: 'Direct' and/or the entities whose
 * memberships carry it. Only grants that give permissions now count.
 */
export function roleGrantOrigins(
  roleId: string,
  grants: { directRoleIds: ReadonlySet<string>, membershipEntityIdsByRole: ReadonlyMap<string, readonly string[]> },
  entityName: (entityId: string) => string
): string[] {
  const origins: string[] = []
  if (grants.directRoleIds.has(roleId)) origins.push('Direct')
  for (const entityId of grants.membershipEntityIdsByRole.get(roleId) ?? []) origins.push(entityName(entityId))
  return origins
}

// --- Check access (F-059) ---

export type CheckResultRow = { name: string, allowed: boolean }

/** One row per requested permission, in the order asked; a name the answer lacks is denied. */
export function checkResultRows(requested: readonly string[], results: Record<string, unknown>): CheckResultRow[] {
  return [...new Set(requested)].map(name => ({ name, allowed: results[name] === true }))
}
