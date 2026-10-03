import { normalizeApiError } from '~/api/errors'
import type { AccessCodeChannel } from '~/types/auth'
import { accessCodeChannelLabel, passwordPolicyError } from './auth-messages'
import { parseDate } from './format-date'
import { grantsSystemWideScope, type AccessScopeSummary, type DirectRoleGrant } from './role-access'

// Pure rules of the account (self-service) pages. No IO, no reactive state; unit-tested.

// ── Sessions ──

/**
 * Whether `DELETE /users/me/sessions?keep_current=true` was refused because the server cannot
 * tell which session made the request: the access token names none (`sid`; minted before
 * outlabs-auth 0.1.0a35, or a host that stores no refresh tokens). outlabs-auth answers it with a
 * plain 400 and no reason code; it is the only 400 that request has, so the status identifies it.
 * Only meaningful for that request.
 */
export function isSessionNotBoundError(error: unknown): boolean {
  return normalizeApiError(error).status === 400
}

// ── Password change ──

export type AccountFieldError = { name: string, message: string }

/**
 * The change-password answers that belong on a field: a wrong current password (401
 * INVALID_CREDENTIALS) on Current password, and the server's password policy (INVALID_PASSWORD)
 * on New password. Anything else is not a field problem (empty list).
 */
export function changePasswordFieldErrors(error: unknown): AccountFieldError[] {
  const policy = passwordPolicyError(error)
  if (policy) return [{ name: 'new_password', message: policy }]
  if (normalizeApiError(error).code === 'INVALID_CREDENTIALS') {
    return [{ name: 'current_password', message: 'Current password is incorrect.' }]
  }
  return []
}

// ── Phone ──

/** "WhatsApp or SMS", "SMS": the channels a verified phone can receive sign-in codes on. */
export function phoneChannelsText(channels: readonly AccessCodeChannel[]): string {
  const labels = channels.filter(channel => channel !== 'email').map(channel => accessCodeChannelLabel(channel))
  if (labels.length <= 1) return labels[0] ?? 'SMS'
  return `${labels.slice(0, -1).join(', ')} or ${labels.at(-1)}`
}

// ── Account overview ──

/** An instant still ahead of `now` (locked_until, suspended_until), else null. */
export function activeUntil(value: string | null | undefined, now = Date.now()): string | null {
  const date = parseDate(value)
  return date && date.getTime() > now ? value! : null
}

// ── Access (F-103) ──

/**
 * The Organization card of one's own Access tab, in the second person. Unlike the admin view of
 * another user (accessScopeSummary), it never talks about roles the account cannot read: most
 * accounts cannot read their own direct roles (that needs the Users section), so it names the
 * organization and the memberships in force and claims no limit it cannot see. A readable
 * system-wide role, or superuser status, reaches every organization.
 */
export function myAccessScopeSummary(input: {
  isSuperuser: boolean
  rootEntityName?: string | null
  directGrants?: readonly DirectRoleGrant[] | null
  membershipCount?: number | null
}): AccessScopeSummary {
  if (input.isSuperuser) {
    return { label: 'All organizations', description: 'As a superuser you reach every organization and entity.', allOrganizations: true }
  }
  const systemWide = (input.directGrants ?? []).filter(grantsSystemWideScope)
  if (systemWide.length) {
    const one = systemWide.length === 1
    const names = systemWide.map(grant => grant.role.display_name || grant.role.name).join(', ')
    return {
      label: 'All organizations',
      description: `Your system-wide ${one ? 'role' : 'roles'} ${names} ${one ? 'reaches' : 'reach'} every organization.`,
      allOrganizations: true
    }
  }
  const count = input.membershipCount ?? null
  const memberships = count == null
    ? ''
    : count === 0
      ? ' You have no memberships in force.'
      : ` You are a member of ${count} ${count === 1 ? 'entity' : 'entities'}.`
  return {
    label: input.rootEntityName || 'No organization',
    description: `${input.rootEntityName ? 'Your organization.' : 'You are not placed in an organization.'}${memberships}`,
    allOrganizations: false
  }
}
