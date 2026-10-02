import { describe, expect, it } from 'vitest'
import { createUserSchemaFor, inviteUserSchemaFor, resetPasswordSchema, superuserChangeSchemaFor, updateUserSchema, updateUserSchemaFor, userStatusSchemaFor } from '~/schemas/user'
import {
  canChangeStatus,
  deletedAccountSummary,
  inviteEntityRule,
  isUuid,
  membershipHistoryChanges,
  newUserRootChoice,
  NO_ROOT_ORG,
  orphanMembershipSummary,
  restoreUserCopy,
  resendInviteCopy,
  statusChangeAction,
  superuserChangeEffects,
  superuserSwitchDescription,
  SUSPENSION_END_NOTE,
  suspendedUntilForSave,
  userDeleteCopy,
  userFullName,
  userHolds,
  userRowPolicy
} from '~/utils/users'

// The users area's rules: names, time-bound holds, which row actions an admin gets, where a
// new account is placed so its creator keeps seeing it, and when an invite needs an entity.

const NOW = Date.parse('2026-10-01T12:00:00Z')
const fmt = { locale: 'en-US', timeZone: 'UTC' }

describe('userFullName', () => {
  it('joins the names and is null for an account without one', () => {
    expect(userFullName({ first_name: 'Olivia', last_name: 'OrgAdmin' })).toBe('Olivia OrgAdmin')
    expect(userFullName({ first_name: '  ', last_name: 'Only' })).toBe('Only')
    expect(userFullName({ first_name: null, last_name: null })).toBeNull()
  })
})

describe('userHolds', () => {
  it('reads a lockout on an active account and a timed suspension, never one that ended', () => {
    const locked = userHolds({ status: 'active', locked_until: '2026-10-01T18:30:00Z', suspended_until: null }, NOW, fmt)
    expect(locked).toEqual([expect.objectContaining({ kind: 'locked', label: 'Locked until Oct 1, 2026, 6:30 PM' })])
    expect(locked[0]!.description).toContain('password reset clears the lockout')
    // outlabs-auth does not lift a suspension by itself: the copy never promises it.
    const suspended = userHolds({ status: 'suspended', locked_until: null, suspended_until: '2026-10-14T02:59:59Z' }, NOW, fmt)
    expect(suspended[0]!.description).toBe(SUSPENSION_END_NOTE)
    expect(SUSPENSION_END_NOTE).toContain('stays suspended until it is reactivated')

    expect(userHolds({ status: 'suspended', locked_until: null, suspended_until: '2026-10-14T02:59:59Z' }, NOW, fmt))
      .toEqual([expect.objectContaining({ kind: 'suspended', label: 'Suspension end set for Oct 14, 2026, 2:59 AM' })])

    // Ended lockouts, a suspension end on an account no longer suspended, an open-ended suspension.
    expect(userHolds({ status: 'active', locked_until: '2026-09-30T18:30:00Z', suspended_until: null }, NOW)).toEqual([])
    expect(userHolds({ status: 'active', locked_until: null, suspended_until: '2026-10-14T00:00:00Z' }, NOW)).toEqual([])
    expect(userHolds({ status: 'suspended', locked_until: null, suspended_until: null }, NOW)).toEqual([])
  })
})

describe('userRowPolicy', () => {
  const target = { id: 'u2', status: 'active' as const, is_superuser: false }
  const base = { actorId: 'u1', actorIsGlobal: true, canUpdate: true, canDelete: true }

  it('offers edit and delete with the permissions, restore only for a deleted account', () => {
    expect(userRowPolicy({ ...base, target })).toEqual({ isSelf: false, canEdit: true, canDelete: true, canRestore: false })
    expect(userRowPolicy({ ...base, canUpdate: false, canDelete: false, target })).toEqual({ isSelf: false, canEdit: false, canDelete: false, canRestore: false })
    expect(userRowPolicy({ ...base, target: { ...target, status: 'deleted' } })).toEqual({ isSelf: false, canEdit: false, canDelete: false, canRestore: true })
  })

  it('never deletes the actor\'s own account', () => {
    expect(userRowPolicy({ ...base, target: { ...target, id: 'u1' } })).toEqual({ isSelf: true, canEdit: true, canDelete: false, canRestore: false })
  })

  it('leaves superuser accounts to global admins (unknown reach counts as not global)', () => {
    const superuser = { ...target, is_superuser: true }
    expect(userRowPolicy({ ...base, target: superuser }).canDelete).toBe(true)
    for (const actorIsGlobal of [false, null]) {
      expect(userRowPolicy({ ...base, actorIsGlobal, target: superuser })).toEqual({ isSelf: false, canEdit: false, canDelete: false, canRestore: false })
    }
  })
})

describe('newUserRootChoice', () => {
  const roots = [{ id: 'acme', name: 'ACME Realty' }, { id: 'summit', name: 'Summit Commercial' }]

  it('lets a global admin choose any organization or none, defaulting to none', () => {
    expect(newUserRootChoice({ actorIsGlobal: true, anchoredRoot: { id: 'acme', name: 'ACME Realty' }, roots })).toEqual({
      required: false,
      initial: NO_ROOT_ORG,
      items: [{ label: 'No organization', value: NO_ROOT_ORG }, { label: 'ACME Realty', value: 'acme' }, { label: 'Summit Commercial', value: 'summit' }]
    })
  })

  it('always offers a global admin their own organization, also before the roots load', () => {
    const acme = { id: 'acme', name: 'ACME Realty' }
    expect(newUserRootChoice({ actorIsGlobal: true, anchoredRoot: acme, roots: [] })).toEqual({
      required: false,
      initial: NO_ROOT_ORG,
      items: [{ label: 'No organization', value: NO_ROOT_ORG }, { label: 'ACME Realty', value: 'acme' }]
    })
    expect(newUserRootChoice({ actorIsGlobal: true, anchoredRoot: acme, roots: [roots[1]!] }).items).toEqual([
      { label: 'No organization', value: NO_ROOT_ORG },
      { label: 'ACME Realty', value: 'acme' },
      { label: 'Summit Commercial', value: 'summit' }
    ])
  })

  it('places a delegated admin\'s accounts in their own organization, also while their reach loads', () => {
    for (const actorIsGlobal of [false, null]) {
      expect(newUserRootChoice({ actorIsGlobal, anchoredRoot: { id: 'acme', name: 'ACME Realty' }, roots })).toEqual({
        required: true,
        initial: 'acme',
        items: [{ label: 'ACME Realty', value: 'acme' }]
      })
    }
  })

  it('makes a non-global admin without an organization pick one', () => {
    expect(newUserRootChoice({ actorIsGlobal: false, anchoredRoot: null, roots })).toEqual({
      required: true,
      initial: '',
      items: [{ label: 'ACME Realty', value: 'acme' }, { label: 'Summit Commercial', value: 'summit' }]
    })
  })
})

describe('inviteEntityRule', () => {
  it('needs no entity without the hierarchy', () => {
    expect(inviteEntityRule({ isEnterprise: false, actorIsGlobal: null, canInviteToEntity: false })).toEqual({ allowed: true, offered: false, required: false })
  })

  it('offers an optional entity to global admins who may create memberships', () => {
    expect(inviteEntityRule({ isEnterprise: true, actorIsGlobal: true, canInviteToEntity: true })).toEqual({ allowed: true, offered: true, required: false })
    expect(inviteEntityRule({ isEnterprise: true, actorIsGlobal: true, canInviteToEntity: false })).toEqual({ allowed: true, offered: false, required: false })
  })

  it('requires an entity from delegated admins, and offers no invite without membership:create_tree', () => {
    expect(inviteEntityRule({ isEnterprise: true, actorIsGlobal: false, canInviteToEntity: true })).toEqual({ allowed: true, offered: true, required: true })
    expect(inviteEntityRule({ isEnterprise: true, actorIsGlobal: false, canInviteToEntity: false })).toEqual({ allowed: false, offered: false, required: false })
    expect(inviteEntityRule({ isEnterprise: true, actorIsGlobal: null, canInviteToEntity: false }).allowed).toBe(false)
  })
})

describe('orphanMembershipSummary', () => {
  it('counts active of total', () => {
    expect(orphanMembershipSummary(0, 1)).toBe('0 of 1 membership active')
    expect(orphanMembershipSummary(0, 3)).toBe('0 of 3 memberships active')
  })
})

describe('users dialog schemas', () => {
  const create = {
    email: 'new@example.com',
    password: 'Testpass1!',
    confirm_password: 'Testpass1!',
    first_name: '',
    last_name: '',
    root_entity_id: NO_ROOT_ORG,
    is_superuser: false
  }
  const issuePaths = (result: { success: boolean, error?: { issues: { path: PropertyKey[] }[] } }) =>
    result.success ? [] : [...new Set(result.error!.issues.map(issue => issue.path.join('.')))]

  it('create: the confirmation must match, the password follows the policy, the organization is required only when the rules say so', () => {
    expect(createUserSchemaFor({ rootRequired: false }).safeParse(create).success).toBe(true)
    expect(issuePaths(createUserSchemaFor({ rootRequired: true }).safeParse(create))).toEqual(['root_entity_id'])
    expect(issuePaths(createUserSchemaFor({ rootRequired: true }).safeParse({ ...create, root_entity_id: '' }))).toEqual(['root_entity_id'])
    expect(createUserSchemaFor({ rootRequired: true }).safeParse({ ...create, root_entity_id: 'acme' }).success).toBe(true)
    expect(issuePaths(createUserSchemaFor({ rootRequired: false }).safeParse({ ...create, confirm_password: 'Different1!' }))).toEqual(['confirm_password'])
    expect(issuePaths(createUserSchemaFor({ rootRequired: false }).safeParse({ ...create, password: 'weakpass', confirm_password: 'weakpass' }))).toContain('password')
  })

  it('invite: an entity is required only when the rules say so', () => {
    const invite = { email: 'new@example.com', first_name: '', last_name: '', entity_id: undefined, role_ids: [], is_superuser: false }
    expect(inviteUserSchemaFor({ entityRequired: false }).safeParse(invite).success).toBe(true)
    expect(issuePaths(inviteUserSchemaFor({ entityRequired: true }).safeParse(invite))).toEqual(['entity_id'])
    expect(inviteUserSchemaFor({ entityRequired: true }).safeParse({ ...invite, entity_id: 'sf' }).success).toBe(true)
  })

  it('edit: the email is required and valid, the phone E.164 or blank', () => {
    const edit = { email: 'user@example.com', first_name: 'A', last_name: 'B', phone: '' }
    expect(updateUserSchema.safeParse(edit).success).toBe(true)
    expect(issuePaths(updateUserSchema.safeParse({ ...edit, email: '' }))).toEqual(['email'])
    expect(issuePaths(updateUserSchema.safeParse({ ...edit, email: 'not-an-email' }))).toEqual(['email'])
    expect(issuePaths(updateUserSchema.safeParse({ ...edit, phone: '555' }))).toEqual(['phone'])
  })

  it('edit: a name the account has can be changed but not removed; 100 characters at most (v-users-01)', () => {
    const edit = { email: 'user@example.com', first_name: '', last_name: '', phone: '' }
    // No names yet: both may stay empty.
    expect(updateUserSchemaFor({ first_name: null, last_name: '' }).safeParse(edit).success).toBe(true)
    // A first name the server would refuse to clear ('first_name is required').
    const named = updateUserSchemaFor({ first_name: 'Jane', last_name: null })
    const cleared = named.safeParse({ ...edit, first_name: '  ' })
    expect(issuePaths(cleared)).toEqual(['first_name'])
    expect(cleared.error!.issues[0]!.message).toBe('Enter a first name. It can be changed but not removed.')
    expect(named.safeParse({ ...edit, first_name: 'Joan' }).success).toBe(true)
    // The API caps names at 100 characters, for an edit, a new account and an invitation alike.
    expect(issuePaths(named.safeParse({ ...edit, first_name: 'x'.repeat(101) }))).toEqual(['first_name'])
    expect(named.safeParse({ ...edit, first_name: 'x'.repeat(100) }).success).toBe(true)
    expect(issuePaths(createUserSchemaFor({ rootRequired: false }).safeParse({ ...create, last_name: 'x'.repeat(101) }))).toEqual(['last_name'])
    const invite = { email: 'new@example.com', first_name: 'x'.repeat(101), last_name: '', entity_id: undefined, role_ids: [], is_superuser: false }
    expect(issuePaths(inviteUserSchemaFor({ entityRequired: false }).safeParse(invite))).toEqual(['first_name'])
  })
})

describe('isUuid', () => {
  it('accepts a UUID in either case and rejects anything else', () => {
    expect(isUuid('3943c3fe-1b2a-4c3d-8e4f-5a6b7c8d9e0f')).toBe(true)
    expect(isUuid('3943C3FE-1B2A-4C3D-8E4F-5A6B7C8D9E0F')).toBe(true)
    for (const value of ['not-a-uuid', '', ' 3943c3fe-1b2a-4c3d-8e4f-5a6b7c8d9e0f', '3943c3fe1b2a4c3d8e4f5a6b7c8d9e0f', null, undefined]) {
      expect(isUuid(value)).toBe(false)
    }
  })
})

describe('user lifecycle rules', () => {
  it('offers Change status for active, suspended and banned accounts only', () => {
    expect(['active', 'suspended', 'banned'].every(status => canChangeStatus(status as 'active'))).toBe(true)
    expect(canChangeStatus('invited')).toBe(false)
    expect(canChangeStatus('deleted')).toBe(false)
  })

  it('names the transition and colours it by its weight; the same status saves changes', () => {
    expect(statusChangeAction('suspended', 'active')).toEqual({ label: 'Reactivate account', color: 'primary' })
    expect(statusChangeAction('active', 'suspended')).toEqual({ label: 'Suspend account', color: 'warning' })
    expect(statusChangeAction('active', 'banned')).toEqual({ label: 'Ban account', color: 'error' })
    expect(statusChangeAction('suspended', 'suspended')).toEqual({ label: 'Save changes', color: 'primary' })
  })

  it('keeps a stored suspension end unless the day changed (F-062)', () => {
    const toIso = (day: string) => (day ? `${day}T23:59:59.999Z` : null)
    const stored = { storedDay: '2026-10-14', storedIso: '2026-10-14T15:30:00Z', toIso }
    // Adding a reason to a timed suspension: the exact stored instant goes back.
    expect(suspendedUntilForSave({ target: 'suspended', day: '2026-10-14', ...stored })).toBe('2026-10-14T15:30:00Z')
    // A new day ends at the end of that day; a cleared day is open-ended.
    expect(suspendedUntilForSave({ target: 'suspended', day: '2026-10-20', ...stored })).toBe('2026-10-20T23:59:59.999Z')
    expect(suspendedUntilForSave({ target: 'suspended', day: '', ...stored })).toBeUndefined()
    // Not a suspension: nothing is sent.
    expect(suspendedUntilForSave({ target: 'active', day: '2026-10-14', ...stored })).toBeUndefined()
    // A new suspension of an active account.
    expect(suspendedUntilForSave({ target: 'suspended', day: '2026-10-20', storedDay: '', storedIso: null, toIso })).toBe('2026-10-20T23:59:59.999Z')
  })

  it('confirmation copy follows the backend: retain-delete, a resend replaces the link, a restore brings back the identity only', () => {
    const user = { email: 'ana@example.com' }
    const remove = userDeleteCopy(user, { hasMemberships: true })
    expect(remove).toMatchObject({ title: 'Delete user ana@example.com', confirmLabel: 'Delete user', confirmText: 'ana@example.com' })
    expect(remove.effects!.join(' ')).toContain('entity memberships')
    expect(userDeleteCopy(user, { hasMemberships: false }).effects!.join(' ')).not.toContain('memberships')
    expect(resendInviteCopy(user).effects!.join(' ')).toContain('The link sent before stops working')
    expect(resendInviteCopy(user).confirmColor).toBe('primary')
    const restore = restoreUserCopy(user, { hasMemberships: true })
    expect(restore.title).toBe('Restore user ana@example.com')
    expect(restore.effects!.join(' ')).toContain('stay revoked')
    expect(superuserChangeEffects(true, { hasMemberships: true, isEnterprise: true })[0]).toContain('bypassed')
    expect(superuserChangeEffects(false, { hasMemberships: false, isEnterprise: false }).join(' ')).toContain('what their roles grant')
  })

  it('restore reads the same from the list and the detail, and says a lockout or suspension end is cleared (v-users-04)', () => {
    const effects = restoreUserCopy({ email: 'ana@example.com' }, { hasMemberships: true }).effects!
    expect(effects).toContain('Any lockout or timed suspension is cleared.')
    expect(effects.join(' ')).toContain('entity memberships')
    expect(restoreUserCopy({ email: 'ana@example.com' }, { hasMemberships: false }).effects!.join(' ')).not.toContain('membership')
  })

  it('SimpleRBAC copy names no organizations or memberships (v-users-03)', () => {
    expect(superuserSwitchDescription({ isEnterprise: true })).toContain('across every organization')
    expect(superuserSwitchDescription({ isEnterprise: false })).toBe('Bypasses every permission check. Grant only to platform operators.')
    expect(superuserChangeEffects(true, { hasMemberships: true, isEnterprise: true })[0]).toBe('Every permission check is bypassed for them, in every organization.')
    const simpleGrant = superuserChangeEffects(true, { hasMemberships: false, isEnterprise: false }).join(' ')
    expect(simpleGrant).not.toMatch(/organization|workspace|membership/)
    expect(deletedAccountSummary({ hasMemberships: true })).toContain('memberships')
    expect(deletedAccountSummary({ hasMemberships: false })).toBe('Its roles, sessions and API keys were revoked. Restoring it brings back the identity only.')
  })

  it('status form: a new suspension end may not be in the past, the stored one may stay', () => {
    const schema = userStatusSchemaFor({ storedDay: '2026-09-01', today: '2026-10-01' })
    const ok = (data: Record<string, string>) => schema.safeParse({ status: 'suspended', suspendedUntil: '', reason: '', ...data }).success
    expect(ok({})).toBe(true)
    expect(ok({ suspendedUntil: '2026-10-01' })).toBe(true)
    expect(ok({ suspendedUntil: '2026-09-01' })).toBe(true)
    expect(ok({ suspendedUntil: '2026-09-15' })).toBe(false)
    expect(ok({ suspendedUntil: 'incomplete' })).toBe(false)
    // Only a suspension reads the day.
    expect(schema.safeParse({ status: 'active', suspendedUntil: '2026-09-15', reason: '' }).success).toBe(true)
  })

  it('superuser form: granting needs a reason and the typed email, revoking neither', () => {
    const grant = superuserChangeSchemaFor({ granting: true, email: 'ana@example.com' })
    expect(grant.safeParse({ reason: 'On-call lead', confirmation: 'ana@example.com' }).success).toBe(true)
    expect(grant.safeParse({ reason: '  ', confirmation: 'ana@example.com' }).success).toBe(false)
    expect(grant.safeParse({ reason: 'On-call lead', confirmation: 'ana@example' }).success).toBe(false)
    expect(superuserChangeSchemaFor({ granting: false, email: 'ana@example.com' }).safeParse({ reason: '', confirmation: '' }).success).toBe(true)
  })

  it('reset password: the console\'s password rules and a matching confirmation', () => {
    expect(resetPasswordSchema.safeParse({ new_password: 'Newpass1!', confirm_password: 'Newpass1!' }).success).toBe(true)
    expect(resetPasswordSchema.safeParse({ new_password: 'newpass1', confirm_password: 'newpass1' }).success).toBe(false)
    expect(resetPasswordSchema.safeParse({ new_password: 'Newpass1!', confirm_password: 'Newpass2!' }).success).toBe(false)
  })
})

describe('membershipHistoryChanges', () => {
  const base = {
    role_ids: [] as string[],
    role_names: [] as string[],
    previous_role_ids: [] as string[],
    previous_role_names: [] as string[],
    status: 'active',
    previous_status: null as string | null,
    valid_from: null,
    valid_until: null,
    previous_valid_from: null,
    previous_valid_until: null
  }

  it('a created membership starts its roles; nothing was removed', () => {
    const changes = membershipHistoryChanges({ ...base, role_ids: ['r1'], role_names: ['Agent'] })
    expect(changes).toMatchObject({ initial: true, status: null, validity: false, removed: [] })
    expect(changes.added).toEqual([{ id: 'r1', display_name: 'Agent' }])
  })

  it('an update lists the roles added and removed, named from the event, and the status change', () => {
    const changes = membershipHistoryChanges({
      ...base,
      role_ids: ['r1', 'r3'],
      role_names: ['Agent', 'Lead'],
      previous_role_ids: ['r1', 'r2'],
      previous_role_names: ['Agent', 'Manager'],
      status: 'suspended',
      previous_status: 'active'
    })
    expect(changes.initial).toBe(false)
    expect(changes.added).toEqual([{ id: 'r3', display_name: 'Lead' }])
    expect(changes.removed).toEqual([{ id: 'r2', display_name: 'Manager' }])
    expect(changes.status).toEqual({ from: 'active', to: 'suspended' })
  })

  it('names are dropped when the lists do not line up, and a validity change is flagged', () => {
    const changes = membershipHistoryChanges({
      ...base,
      role_ids: ['r1'],
      role_names: [],
      previous_status: 'active',
      valid_until: '2026-12-31T23:59:59Z'
    })
    expect(changes.added).toEqual([{ id: 'r1', display_name: undefined }])
    expect(changes.validity).toBe(true)
    expect(changes.status).toBeNull()
  })
})
