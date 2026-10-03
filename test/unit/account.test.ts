import { describe, expect, it } from 'vitest'
import { ApiError } from '~/api/errors'
import { changePasswordSchemaFor, profileSchemaFor } from '~/schemas/account'
import { LIBRARY_DEFAULT_POLICY } from '~/utils/password-policy'
import { activeUntil, changePasswordFieldErrors, isSessionNotBoundError, myAccessScopeSummary, phoneChannelsText } from '~/utils/account'
import { passwordPolicyError, passwordRequirementsSummary } from '~/utils/auth-messages'
import type { DirectRoleGrant } from '~/utils/role-access'
import { isSessionEndReason } from '~/utils/session-lifecycle'

// The account (self-service) rules: which refusal of Sign out other devices means the server
// cannot tell this browser's session, which change-password answers belong on a field, the
// profile and password schemas, and the phone copy.

describe('isSessionNotBoundError', () => {
  const error = (status: number, data: Record<string, unknown>) => new ApiError({ message: 'Request failed', status, statusText: '', data })

  it('recognises the 400 outlabs-auth answers keep_current with when the access token names no session', () => {
    // The exact 0.1.0a35 body: a plain HTTPException through the global handler, no reason code.
    const detail = 'keep_current requires a session-bound access token; sign in again to obtain one, or revoke all sessions'
    expect(isSessionNotBoundError(error(400, { error: 'HTTP_ERROR', message: detail, details: { detail } }))).toBe(true)
  })

  it('leaves every other failure to the generic error handling', () => {
    expect(isSessionNotBoundError(error(401, { error: 'HTTP_ERROR', message: 'Not authenticated' }))).toBe(false)
    expect(isSessionNotBoundError(error(403, { error: 'PERMISSION_DENIED', message: 'Forbidden' }))).toBe(false)
    expect(isSessionNotBoundError(error(422, { error: 'VALIDATION_ERROR', message: 'Invalid input' }))).toBe(false)
    expect(isSessionNotBoundError(error(500, { detail: 'Internal server error' }))).toBe(false)
    expect(isSessionNotBoundError(new ApiError({ kind: 'network', status: 0, statusText: '', data: null, message: 'offline' }))).toBe(false)
    expect(isSessionNotBoundError(new Error('boom'))).toBe(false)
  })
})

describe('changePasswordFieldErrors', () => {
  const error = (status: number, data: Record<string, unknown>) => new ApiError({ message: 'Request failed', status, statusText: '', data })

  it('puts a wrong current password on Current password', () => {
    expect(changePasswordFieldErrors(error(401, { error: 'INVALID_CREDENTIALS', message: 'Current password is incorrect' })))
      .toEqual([{ name: 'current_password', message: 'Current password is incorrect.' }])
  })

  it('puts the server\'s password policy, with its requirements, on New password', () => {
    const policy = error(400, {
      error: 'INVALID_PASSWORD',
      message: 'Password must contain at least one special character',
      details: { password_requirements: { min_length: 10, require_uppercase: true, require_digit: true, require_special_char: true } }
    })
    expect(changePasswordFieldErrors(policy)).toEqual([{
      name: 'new_password',
      message: 'Password must contain at least one special character. It needs at least 10 characters, an uppercase letter, a digit and a symbol.'
    }])
  })

  it('leaves everything else to the toast', () => {
    expect(changePasswordFieldErrors(error(500, { error: 'INTERNAL_ERROR', message: 'Boom' }))).toEqual([])
    expect(changePasswordFieldErrors(new Error('network'))).toEqual([])
  })
})

describe('passwordRequirementsSummary', () => {
  it('lists the policy in one sentence, or nothing when the server lists nothing', () => {
    expect(passwordRequirementsSummary({ min_length: 8 })).toBe('It needs at least 8 characters.')
    expect(passwordRequirementsSummary({ require_lowercase: true, require_digit: true })).toBe('It needs a lowercase letter and a digit.')
    expect(passwordRequirementsSummary({})).toBeNull()
    expect(passwordRequirementsSummary(null)).toBeNull()
    // An empty policy keeps the server's reason as it was.
    expect(passwordPolicyError({ data: { error: 'INVALID_PASSWORD', message: 'Too weak.', details: { password_requirements: {} } } })).toBe('Too weak.')
  })
})

describe('profileSchemaFor', () => {
  it('lets an account without a name save without one (F-095)', () => {
    expect(profileSchemaFor({ first_name: null, last_name: '' }).safeParse({ first_name: '', last_name: '' }).success).toBe(true)
  })

  it('requires a name the account already has, since the server cannot clear it', () => {
    const result = profileSchemaFor({ first_name: 'Jane', last_name: null }).safeParse({ first_name: '  ', last_name: '' })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map(issue => issue.path.join('.'))).toEqual(['first_name'])
  })
})

describe('changePasswordSchemaFor', () => {
  const valid = { current_password: 'Old-pass1!', new_password: 'New-pass1!', confirm_password: 'New-pass1!' }
  const changePasswordSchema = changePasswordSchemaFor(LIBRARY_DEFAULT_POLICY)

  it('accepts a new password under the default policy', () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true)
  })

  it('mirrors the default policy, the confirmation and a password different from the current one', () => {
    const paths = (input: typeof valid) => changePasswordSchema.safeParse(input).error?.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`)
    expect(paths({ ...valid, new_password: 'longenough1', confirm_password: 'longenough1' })).toContain('new_password: Add an uppercase letter (A to Z).')
    expect(paths({ ...valid, confirm_password: 'Other-pass1!' })).toEqual(['confirm_password: Passwords must match.'])
    expect(paths({ ...valid, new_password: 'Old-pass1!', confirm_password: 'Old-pass1!' })).toEqual(['new_password: Choose a password different from your current one.'])
  })

  it('follows the published policy', () => {
    const noSymbol = changePasswordSchemaFor({ ...LIBRARY_DEFAULT_POLICY, require_special_char: false })
    expect(noSymbol.safeParse({ ...valid, new_password: 'Newpass12', confirm_password: 'Newpass12' }).success).toBe(true)
    expect(changePasswordSchema.safeParse({ ...valid, new_password: 'Newpass12', confirm_password: 'Newpass12' }).success).toBe(false)
  })
})

describe('phone and overview copy', () => {
  it('names the channels a verified phone receives codes on', () => {
    expect(phoneChannelsText(['whatsapp', 'sms'])).toBe('WhatsApp or SMS')
    expect(phoneChannelsText(['sms'])).toBe('SMS')
    expect(phoneChannelsText(['email', 'whatsapp'])).toBe('WhatsApp')
  })

  it('keeps a lock or suspension only while it is still ahead', () => {
    const now = Date.parse('2026-10-01T12:00:00Z')
    expect(activeUntil('2026-10-01T13:00:00Z', now)).toBe('2026-10-01T13:00:00Z')
    expect(activeUntil('2026-10-01T11:00:00Z', now)).toBeNull()
    expect(activeUntil(null, now)).toBeNull()
  })

  it('knows the sign-out-everywhere reason', () => {
    expect(isSessionEndReason('signed_out_everywhere')).toBe(true)
  })
})

describe('myAccessScopeSummary', () => {
  const systemWideGrant: DirectRoleGrant = {
    status: 'active',
    is_currently_valid: true,
    role: { name: 'platform_admin', display_name: 'Platform admin', is_global: true, root_entity_id: null, scope_entity_id: null, status: 'active' }
  }
  const orgGrant: DirectRoleGrant = { ...systemWideGrant, role: { ...systemWideGrant.role, display_name: 'Org admin', root_entity_id: 'org-1' } }

  it('names the organization in the second person with the memberships in force, when direct roles are unreadable', () => {
    const named = myAccessScopeSummary({ isSuperuser: false, rootEntityName: 'ACME Realty', directGrants: null, membershipCount: 2 })
    expect(named).toEqual({ label: 'ACME Realty', description: 'Your organization. You are a member of 2 entities.', allOrganizations: false })
    expect(myAccessScopeSummary({ isSuperuser: false, rootEntityName: 'ACME Realty', directGrants: null, membershipCount: 1 }).description)
      .toBe('Your organization. You are a member of 1 entity.')
    // Memberships still loading (or not shown): the organization alone.
    expect(myAccessScopeSummary({ isSuperuser: false, rootEntityName: 'ACME Realty', directGrants: null }).description).toBe('Your organization.')
  })

  it('never calls a missing organization "the root organization"', () => {
    const none = myAccessScopeSummary({ isSuperuser: false, rootEntityName: null, directGrants: null, membershipCount: 0 })
    expect(none).toEqual({ label: 'No organization', description: 'You are not placed in an organization. You have no memberships in force.', allOrganizations: false })
    for (const summary of [none, myAccessScopeSummary({ isSuperuser: false, directGrants: null, membershipCount: 3 })]) {
      expect(summary.description).not.toMatch(/root organization|system-wide/i)
    }
  })

  it('reaches every organization as a superuser or through a readable system-wide role, and not through an organization role', () => {
    expect(myAccessScopeSummary({ isSuperuser: true, rootEntityName: 'ACME Realty' })).toEqual({
      label: 'All organizations',
      description: 'As a superuser you reach every organization and entity.',
      allOrganizations: true
    })
    expect(myAccessScopeSummary({ isSuperuser: false, rootEntityName: 'ACME Realty', directGrants: [systemWideGrant] }).description)
      .toBe('Your system-wide role Platform admin reaches every organization.')
    expect(myAccessScopeSummary({ isSuperuser: false, rootEntityName: 'ACME Realty', directGrants: [orgGrant], membershipCount: 2 }))
      .toEqual({ label: 'ACME Realty', description: 'Your organization. You are a member of 2 entities.', allOrganizations: false })
  })
})
