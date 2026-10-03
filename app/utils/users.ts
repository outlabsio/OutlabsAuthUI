import type { User, UserMembershipHistoryEvent, UserStatusUpdateValue, UserStatusValue } from '~/types/user'
import type { ConfirmCopy } from '~/composables/useConfirmAction'
import type { RoleReference } from '~/types/role'
import { formatDateTime, parseDate, type DateFormatOptions } from './format-date'

// Pure rules of the users area: how an account is named and badged, which row actions an admin
// may take, and where a new account is placed so the admin who creates it can still see it.
// The users list, the user detail and their unit tests share them.

// Reka's select reserves the empty string, so "no organization" needs a sentinel value.
export const NO_ROOT_ORG = '__none__'

// The account's name ("Olivia OrgAdmin"), or null when it has none (lists then lead with the
// email instead of repeating it).
export function userFullName(user: Pick<User, 'first_name' | 'last_name'>): string | null {
  const full = [user.first_name, user.last_name].map(part => part?.trim()).filter(Boolean).join(' ')
  return full || null
}

// What a suspension end date means, in one wording for every place that shows or sets one
// (F-061): outlabs-auth records the end but never reactivates an account by itself (only an
// active account can authenticate), so the end is advisory until an admin reactivates.
export const SUSPENSION_END_NOTE = 'The end date is recorded only: the account stays suspended until it is reactivated.'

// A time-bound hold the status badge does not show (F-061): a lockout after failed sign-ins
// (`locked_until`, whatever the status, so a locked account still reads "Active") and the end of
// a timed suspension. Holds that already ended are not shown.
export type UserHold = {
  kind: 'locked' | 'suspended'
  label: string
  description: string
  until: string
}

export function userHolds(
  user: Pick<User, 'status' | 'locked_until' | 'suspended_until'>,
  now: number = Date.now(),
  options: DateFormatOptions = {}
): UserHold[] {
  const holds: UserHold[] = []
  const locked = parseDate(user.locked_until)
  if (locked && locked.getTime() > now) {
    holds.push({
      kind: 'locked',
      label: `Locked until ${formatDateTime(locked, options)}`,
      description: 'Too many failed sign-ins. An admin password reset clears the lockout.',
      until: user.locked_until!
    })
  }
  const suspended = parseDate(user.suspended_until)
  if (user.status === 'suspended' && suspended && suspended.getTime() > now) {
    holds.push({
      kind: 'suspended',
      // Worded as a recorded end, not "Suspended until": the suspension does not lift by itself.
      label: `Suspension end set for ${formatDateTime(suspended, options)}`,
      description: SUSPENSION_END_NOTE,
      until: user.suspended_until!
    })
  }
  return holds
}

// The actions an admin may take on one account from a list row (F-053, F-063). Built from the
// actor's permissions and the target's state, so the menu never offers something the backend
// refuses:
// - a superuser account can be changed only by a global admin (superuser or system-wide role);
// - so can an account holding a direct system-wide role row in any state, even revoked or of an
//   inactive role (outlabs-auth 0.1.0a35, EnterpriseRBAC: such a grant can come back without
//   anyone reviewing the account again). The users list has no per-row signal for it and leaves
//   `targetHoldsSystemWideRole` out (the server's refusal is shown); the user detail reads the
//   account's direct roles and passes true or false, or null while that is unknown, which offers
//   nothing either (F-209);
// - nobody deletes their own account from the console (it would lock them out); their own
//   account is managed from Account, and the system-wide rule never applies to oneself;
// - a deleted account can only be restored (user:update), never edited or deleted again.
export type UserRowPolicy = {
  isSelf: boolean
  canEdit: boolean
  canDelete: boolean
  canRestore: boolean
  /** Why only a global admin may change it: known (superuser, a system-wide role) or not yet. */
  lock: 'superuser' | 'system_wide_role' | 'unknown' | null
}

export function userRowPolicy(input: {
  actorId: string | null | undefined
  // null while unknown: treated as not global (the safer reading).
  actorIsGlobal: boolean | null
  canUpdate: boolean
  canDelete: boolean
  target: Pick<User, 'id' | 'status' | 'is_superuser'>
  // Whether the account holds a direct system-wide role row (any status); null while unknown;
  // left out where it is not checked (the users list, SimpleRBAC).
  targetHoldsSystemWideRole?: boolean | null
}): UserRowPolicy {
  const { target } = input
  const isSelf = Boolean(input.actorId) && input.actorId === target.id
  const deleted = target.status === 'deleted'
  const global = input.actorIsGlobal === true
  const lock: UserRowPolicy['lock'] = global
    ? null
    : target.is_superuser
      ? 'superuser'
      : isSelf || input.targetHoldsSystemWideRole === undefined || input.targetHoldsSystemWideRole === false
        ? null
        : input.targetHoldsSystemWideRole ? 'system_wide_role' : 'unknown'
  const locked = lock !== null
  return {
    isSelf,
    canEdit: input.canUpdate && !deleted && !locked,
    canDelete: input.canDelete && !deleted && !isSelf && !locked,
    canRestore: input.canUpdate && deleted && !locked,
    lock
  }
}

// Where a new account goes (F-012). outlabs-auth shows a delegated admin only the accounts
// inside their organisation (the account's root, or a membership there), so an account created
// without one would vanish from their list the moment it exists:
// - a global admin may create an account in any organisation, or in none;
// - anyone else must place it in their own organisation (preselected); with no organisation
//   of their own (rare) they must pick one.
export type RootOrgOption = { label: string, value: string }
export type RootOrgChoice = { required: boolean, items: RootOrgOption[], initial: string }

export function newUserRootChoice(input: {
  actorIsGlobal: boolean | null
  anchoredRoot: { id: string, name: string } | null
  roots: { id: string, name: string }[]
}): RootOrgChoice {
  const roots = input.roots.map(root => ({ label: root.name, value: root.id }))
  if (input.actorIsGlobal === true) {
    // A global admin's own organisation is always offered, also before (or beyond) the loaded
    // roots, so a value preselected while their reach was loading stays selectable.
    const anchored = input.anchoredRoot && !roots.some(root => root.value === input.anchoredRoot!.id)
      ? [{ label: input.anchoredRoot.name, value: input.anchoredRoot.id }]
      : []
    return { required: false, items: [{ label: 'No organization', value: NO_ROOT_ORG }, ...anchored, ...roots], initial: NO_ROOT_ORG }
  }
  if (input.anchoredRoot) {
    return { required: true, items: [{ label: input.anchoredRoot.name, value: input.anchoredRoot.id }], initial: input.anchoredRoot.id }
  }
  return { required: true, items: roots, initial: '' }
}

// Whether, and how, an admin may invite (F-012, F-171). The invitation itself needs the
// invitations feature and user:create (checked by the caller). An invite never sets an
// organisation, so for a delegated admin the invited account is visible only through the entity
// membership the invite creates, which needs membership:create_tree there:
// - no entity hierarchy (SimpleRBAC): plain invite, no entity;
// - global admin: entity optional (offered with membership:create_tree);
// - anyone else: entity required, and no invite at all without membership:create_tree.
export type InviteEntityRule = { allowed: boolean, offered: boolean, required: boolean }

export function inviteEntityRule(input: {
  isEnterprise: boolean
  actorIsGlobal: boolean | null
  canInviteToEntity: boolean
}): InviteEntityRule {
  if (!input.isEnterprise) return { allowed: true, offered: false, required: false }
  if (input.actorIsGlobal === true) return { allowed: true, offered: input.canInviteToEntity, required: false }
  return { allowed: input.canInviteToEntity, offered: input.canInviteToEntity, required: input.canInviteToEntity }
}

// "0 of 2 memberships active" for an orphaned account's summary.
export function orphanMembershipSummary(active: number, total: number): string {
  return `${active} of ${total} ${total === 1 ? 'membership' : 'memberships'} active`
}

// Record ids in routes are UUIDs. A malformed id is a link nobody can open: the detail renders
// "not found" without asking the API (which would answer 422 with a validation message).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isUuid(value: string | null | undefined): boolean {
  return typeof value === 'string' && UUID.test(value)
}

// ── Lifecycle (user detail, F-207/F-208) ──

// The statuses PATCH /users/{id}/status accepts, with what each one means for the account in
// outlabs-auth's terms: only an active account authenticates (password, sessions, API keys).
export type UserStatusOption = { value: UserStatusUpdateValue, label: string, description: string }
export const USER_STATUS_OPTIONS: readonly UserStatusOption[] = [
  { value: 'active', label: 'Active', description: 'Can sign in, and their sessions and API keys work.' },
  { value: 'suspended', label: 'Suspended', description: 'Can\'t sign in; their sessions and API keys are refused until the account is reactivated. Roles and memberships are kept.' },
  { value: 'banned', label: 'Banned', description: 'Blocked like a suspension, with no end date: for accounts that should not come back. Reactivating reverses it.' }
]

// Change status is offered for these statuses only: an invited account becomes active by
// accepting its invitation (setting it active would break the invitation), and a deleted one is
// restored, not re-statused.
export function canChangeStatus(status: UserStatusValue): status is UserStatusUpdateValue {
  return status === 'active' || status === 'suspended' || status === 'banned'
}

// The submit button of Change status: the verb for the transition, coloured by its weight.
export function statusChangeAction(current: UserStatusValue, target: UserStatusUpdateValue): { label: string, color: 'primary' | 'warning' | 'error' } {
  if (current === target) return { label: 'Save changes', color: 'primary' }
  if (target === 'active') return { label: 'Reactivate account', color: 'primary' }
  if (target === 'suspended') return { label: 'Suspend account', color: 'warning' }
  return { label: 'Ban account', color: 'error' }
}

// suspended_until for the status PATCH (F-062). The endpoint rewrites suspended_until on every
// suspension, so the stored end is sent back unchanged (its exact instant, not a day rounded to
// the end of the day) unless the admin changed the day; an empty day means "until reactivated".
export function suspendedUntilForSave(input: {
  target: UserStatusUpdateValue
  day: string
  storedDay: string
  storedIso: string | null | undefined
  toIso: (day: string) => string | null
}): string | undefined {
  if (input.target !== 'suspended') return undefined
  if (input.storedIso && input.day === input.storedDay) return input.storedIso
  return input.toIso(input.day) ?? undefined
}

// Delete from the users list or the detail page: DELETE /users/{id} retain-deletes (the account
// is kept as deleted and can be restored) and revokes every access artifact.
export function userDeleteCopy(user: Pick<User, 'email'>, options: { hasMemberships: boolean }): ConfirmCopy {
  return {
    title: `Delete user ${user.email}`,
    description: 'The account is kept as deleted. It can be restored later, but its access can\'t.',
    effects: [
      'Signs them out everywhere: every session and refresh token is revoked.',
      'Revokes their personal API keys.',
      options.hasMemberships
        ? 'Revokes their direct role assignments and their entity memberships.'
        : 'Revokes their role assignments.',
      options.hasMemberships
        ? 'Restoring the account brings back the identity only. Roles, memberships and API keys stay revoked and must be granted again.'
        : 'Restoring the account brings back the identity only. Roles and API keys stay revoked and must be granted again.'
    ],
    confirmLabel: 'Delete user',
    confirmText: user.email
  }
}

// POST /users/{id}/resend-invite regenerates the invitation token on every call.
export function resendInviteCopy(user: Pick<User, 'email'>): ConfirmCopy {
  return {
    title: `Resend invitation to ${user.email}`,
    effects: [
      `A new invitation link is sent to ${user.email}.`,
      'The link sent before stops working, so only the newest invitation can be accepted.',
      'The account stays invited, without a password, until the invitation is accepted.'
    ],
    effectsTitle: 'What happens',
    confirmLabel: 'Resend invitation',
    confirmColor: 'primary'
  }
}

// POST /users/{id}/restore brings back the identity only (outlabs-auth keeps memberships, role
// assignments, sessions and API keys revoked) and clears a lockout and a suspension end. One copy
// for the users list's row menu and the user detail.
export function restoreUserCopy(user: Pick<User, 'email'>, options: { hasMemberships: boolean }): ConfirmCopy {
  return {
    title: `Restore user ${user.email}`,
    effects: [
      'The account becomes active again and can sign in with its existing credentials.',
      'Any lockout or timed suspension is cleared.',
      options.hasMemberships
        ? 'Its direct roles, entity memberships, sessions and API keys stay revoked: grant access again as needed.'
        : 'Its roles, sessions and API keys stay revoked: grant access again as needed.'
    ],
    confirmLabel: 'Restore user',
    confirmColor: 'primary'
  }
}

// Whether the account has a password (`has_password`), for the Profile card. Invited accounts
// have none until the invitation is accepted; OAuth-only and magic-link-only accounts have none.
export function passwordStateLabel(user: Pick<User, 'has_password' | 'status'>): string {
  if (user.has_password !== false) return 'Set'
  return user.status === 'invited' ? 'Not set (invitation pending)' : 'Not set'
}

// The user detail's password action: Set password for an account without one, else Reset.
export function adminPasswordAction(user: Pick<User, 'has_password'>): 'Reset password' | 'Set password' {
  return user.has_password === false ? 'Set password' : 'Reset password'
}

export type AdminPasswordDialogCopy = {
  // The menu item, the dialog title's verb and its submit button (adminPasswordAction).
  action: 'Reset password' | 'Set password'
  title: string
  description: string
  effects: string[]
  submitColor: 'warning' | 'primary'
  success: string
  failure: string
}

// PATCH /users/{id}/password, for an account with a password (Reset password) or without one
// (Set password: invited accounts are not offered it, they set one by accepting the invitation).
// Either way outlabs-auth revokes every session of the account and clears a lockout; for an
// account that had no password the point is the new way in, so that leads.
export function adminPasswordDialogCopy(user: Pick<User, 'email' | 'has_password'>, options: { locked: boolean }): AdminPasswordDialogCopy {
  const lockout = options.locked ? ['The lockout after failed sign-ins is cleared.'] : []
  if (adminPasswordAction(user) === 'Set password') {
    return {
      action: 'Set password',
      title: `Set password of ${user.email}`,
      description: 'The account has no password yet.',
      effects: [
        `${user.email} can sign in with this password from now on.`,
        'Their current sessions end, so they sign in again on each device.',
        ...lockout,
        'Their API keys keep working.'
      ],
      submitColor: 'primary',
      success: 'Password set',
      failure: 'Could not set password'
    }
  }
  return {
    action: 'Reset password',
    title: `Reset password of ${user.email}`,
    description: 'Set a new password without their current one.',
    effects: [
      `${user.email} is signed out everywhere: every session ends at once.`,
      ...lockout,
      'They sign in with the new password from now on. Their API keys keep working.'
    ],
    submitColor: 'warning',
    success: 'Password reset',
    failure: 'Could not reset password'
  }
}

// The notice on a deleted account's profile (F-008: no memberships on SimpleRBAC).
export function deletedAccountSummary(options: { hasMemberships: boolean }): string {
  return options.hasMemberships
    ? 'Its roles, memberships, sessions and API keys were revoked. Restoring it brings back the identity only.'
    : 'Its roles, sessions and API keys were revoked. Restoring it brings back the identity only.'
}

// The Superuser switch of Add user and Invite (organizations exist on EnterpriseRBAC only, F-008).
export function superuserSwitchDescription(options: { isEnterprise: boolean }): string {
  return options.isEnterprise
    ? 'Bypasses every permission check across every organization. Grant only to platform operators.'
    : 'Bypasses every permission check. Grant only to platform operators.'
}

// What a superuser grant or revoke does (PATCH /users/{id}/superuser).
export function superuserChangeEffects(granting: boolean, options: { hasMemberships: boolean, isEnterprise: boolean }): string[] {
  return granting
    ? [
        options.isEnterprise
          ? 'Every permission check is bypassed for them, in every organization.'
          : 'Every permission check is bypassed for them.',
        'They can manage every user, role, permission and API key, and grant or revoke superuser for others.',
        'The change and its reason are recorded in the audit log.'
      ]
    : [
        'Platform-wide access ends immediately: permission checks apply to them again.',
        options.hasMemberships
          ? 'They keep only what their direct roles and entity memberships grant.'
          : 'They keep only what their roles grant.',
        'The change and its reason are recorded in the audit log.'
      ]
}

// ── History (user detail, F-172/F-192) ──

// What one membership-history event changed: the roles added and removed (by id, named from the
// event's own role names), a status transition and a validity change. `initial` marks an event
// with no previous state (the membership was created): its roles are the starting set, not a diff.
export type MembershipHistoryChanges = {
  initial: boolean
  added: RoleReference[]
  removed: RoleReference[]
  status: { from: string, to: string } | null
  validity: boolean
}

export function membershipHistoryChanges(event: Pick<UserMembershipHistoryEvent,
  'role_ids' | 'role_names' | 'previous_role_ids' | 'previous_role_names' | 'status' | 'previous_status'
  | 'valid_from' | 'valid_until' | 'previous_valid_from' | 'previous_valid_until'>): MembershipHistoryChanges {
  const names = (ids: readonly string[], list: readonly string[] | null | undefined) =>
    new Map(ids.map((id, index) => [id, list && list.length === ids.length ? list[index] : undefined]))
  const now = names(event.role_ids, event.role_names)
  const before = names(event.previous_role_ids ?? [], event.previous_role_names)
  // Without a previous role set (an event that created the membership) nothing was removed and
  // every role is new.
  const added = [...now].filter(([id]) => !before.has(id)).map(([id, name]) => ({ id, display_name: name }))
  const removed = [...before].filter(([id]) => !now.has(id)).map(([id, name]) => ({ id, display_name: name }))
  const status = event.previous_status && event.previous_status !== event.status
    ? { from: event.previous_status, to: event.status }
    : null
  const changedDay = (a?: string | null, b?: string | null) => (a ?? null) !== (b ?? null)
  const initial = event.previous_status == null && !(event.previous_role_ids?.length)
    && event.previous_valid_from == null && event.previous_valid_until == null
  const validity = !initial && (changedDay(event.valid_from, event.previous_valid_from) || changedDay(event.valid_until, event.previous_valid_until))
  return { initial, added, removed, status, validity }
}
