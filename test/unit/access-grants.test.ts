import { describe, expect, it } from 'vitest'
import {
  assignOutcomeSummary,
  checkResultRows,
  endedGrantCount,
  grantActions,
  grantEffectiveStatus,
  grantIsLive,
  grantWindowEnded,
  groupEffectivePermissions,
  reactivateGrantCopy,
  roleGrantOrigins,
  visibleGrants
} from '~/utils/access-grants'
import { checkAccessSchema, reactivateGrantSchemaFor, assignRolesSchema, addMembershipSchema } from '~/schemas/membership'
import type { UserPermissionSource } from '~/types/permission'

const NOW = Date.parse('2026-10-01T12:00:00Z')
const PAST = '2026-09-01T02:59:59.999Z'
const FUTURE = '2026-12-01T02:59:59.999Z'

describe('grant lifecycle (F-015)', () => {
  it('only active and suspended grants are live', () => {
    expect(grantIsLive({ status: 'active' })).toBe(true)
    expect(grantIsLive({ status: 'suspended' })).toBe(true)
    for (const status of ['revoked', 'expired', 'pending', 'rejected']) expect(grantIsLive({ status })).toBe(false)
  })

  it('derives the effective status from the window when the server does not send one', () => {
    expect(grantEffectiveStatus({ status: 'active' }, NOW)).toBe('active')
    expect(grantEffectiveStatus({ status: 'active', valid_until: PAST }, NOW)).toBe('expired')
    expect(grantEffectiveStatus({ status: 'active', valid_from: FUTURE }, NOW)).toBe('pending')
    expect(grantEffectiveStatus({ status: 'revoked', valid_until: FUTURE }, NOW)).toBe('revoked')
    // A membership's own effective status wins.
    expect(grantEffectiveStatus({ status: 'active', effective_status: 'expired' }, NOW)).toBe('expired')
    expect(grantWindowEnded({ valid_until: PAST }, NOW)).toBe(true)
    expect(grantWindowEnded({ valid_until: null }, NOW)).toBe(false)
  })

  it('never offers Edit or Remove on an ended grant, and Reactivate only on a non-active one', () => {
    const all = { edit: true, remove: true, reactivate: true }
    expect(grantActions({ status: 'active' }, all)).toEqual(['edit', 'remove'])
    expect(grantActions({ status: 'suspended' }, all)).toEqual(['reactivate', 'edit', 'remove'])
    expect(grantActions({ status: 'revoked' }, all)).toEqual(['reactivate'])
    expect(grantActions({ status: 'expired' }, all)).toEqual(['reactivate'])
    expect(grantActions({ status: 'revoked' }, { edit: true, remove: true, reactivate: false })).toEqual([])
    expect(grantActions({ status: 'active' }, { edit: false, remove: false, reactivate: true })).toEqual([])
  })

  it('shows live grants by default and counts the ended ones it hides', () => {
    const grants = [{ status: 'active' }, { status: 'suspended' }, { status: 'revoked' }, { status: 'expired' }]
    expect(visibleGrants(grants, false).map(g => g.status)).toEqual(['active', 'suspended'])
    expect(visibleGrants(grants, true)).toHaveLength(4)
    expect(endedGrantCount(grants)).toBe(2)
  })
})

describe('reactivateGrantCopy', () => {
  it('names the roles a membership brings back and an inactive entity', () => {
    const copy = reactivateGrantCopy({
      kind: 'membership',
      name: 'LA Office',
      userEmail: 'a@example.com',
      status: 'revoked',
      roleNames: ['Agent', 'Team Lead'],
      entityInactive: true
    }, NOW)
    expect(copy.title).toBe('Reactivate membership in LA Office')
    expect(copy.submitLabel).toBe('Reactivate membership')
    expect(copy.description).toBe('It is revoked now. Reactivating sets its status to Active.')
    expect(copy.effects[0]).toContain('(Agent and Team Lead) apply again in LA Office')
    expect(copy.effects.some(e => e.includes('LA Office is inactive'))).toBe(true)
    expect(copy.endPassed).toBe(false)
  })

  it('clears a passed end date and says so; a later start is stated', () => {
    const copy = reactivateGrantCopy({ kind: 'role', name: 'Auditor', userEmail: 'a@example.com', status: 'suspended', validUntil: PAST, validFrom: FUTURE }, NOW)
    expect(copy.title).toBe('Reactivate role Auditor')
    expect(copy.endPassed).toBe(true)
    expect(copy.effects.some(e => e.includes('has passed, so it is cleared'))).toBe(true)
    expect(copy.effects.some(e => e.startsWith('Its window starts on'))).toBe(true)
    expect(copy.effects[0]).not.toContain('immediately')
  })

  it('a membership without roles grants nothing', () => {
    const copy = reactivateGrantCopy({ kind: 'membership', name: 'HQ', userEmail: 'a@example.com', status: 'revoked', roleNames: [] }, NOW)
    expect(copy.effects[0]).toContain('carries no roles')
  })

  it('a pending grant is approved by reactivating it', () => {
    const copy = reactivateGrantCopy({ kind: 'role', name: 'Auditor', userEmail: 'a@example.com', status: 'pending' }, NOW)
    expect(copy.description).toBe('It is awaiting approval. Reactivating approves it and sets its status to Active.')
  })
})

describe('assignOutcomeSummary (F-176)', () => {
  const names: Record<string, string> = { r1: 'Agent', r2: 'Office Manager', r3: 'Auditor' }
  it('reports every refusal by role name', () => {
    const summary = assignOutcomeSummary(
      [{ roleId: 'r1', ok: true }, { roleId: 'r2', ok: false, error: 'denied' }, { roleId: 'r3', ok: true }],
      id => names[id]!,
      error => String(error)
    )
    expect(summary.title).toBe('Assigned 2 of 3 roles')
    expect(summary.assigned).toEqual(['r1', 'r3'])
    expect(summary.failed).toEqual([{ roleId: 'r2', name: 'Office Manager', message: 'denied' }])
    expect(summary.description).toBe('Office Manager: denied')
  })
  it('all assigned', () => {
    expect(assignOutcomeSummary([{ roleId: 'r1', ok: true }], id => names[id]!, String).title).toBe('Role assigned')
    expect(assignOutcomeSummary([{ roleId: 'r1', ok: true }, { roleId: 'r3', ok: true }], id => names[id]!, String).title).toBe('Roles assigned')
  })
})

describe('effective permissions (F-013) and check results (F-059)', () => {
  const source = (name: string, roleId: string, roleName: string, display = name): UserPermissionSource => {
    const [resource, action] = name.split(':') as [string, string]
    return {
      permission: { id: name, name, display_name: display, description: '', resource, action, scope: null, is_system: true, is_active: true, tags: [], metadata: {} } as unknown as UserPermissionSource['permission'],
      source: 'role',
      source_id: roleId,
      source_name: roleName
    }
  }
  const sources = [source('user:read', 'r1', 'agent', 'Read users'), source('entity:read_tree', 'r2', 'manager'), source('user:update', 'r2', 'manager')]

  it('groups by resource, sorted, with the full sub-action', () => {
    const groups = groupEffectivePermissions(sources)
    expect(groups.map(g => g.resource)).toEqual(['entity', 'user'])
    expect(groups[0]!.items[0]!.action).toBe('read_tree')
    expect(groups[1]!.items.map(i => i.name)).toEqual(['user:read', 'user:update'])
  })

  it('filters on the name, display name and the source role label', () => {
    expect(groupEffectivePermissions(sources, 'read users').flatMap(g => g.items.map(i => i.name))).toEqual(['user:read'])
    expect(groupEffectivePermissions(sources, 'Branch Manager', s => (s.source_id === 'r2' ? 'Branch Manager' : 'Agent')).flatMap(g => g.items.map(i => i.name))).toEqual(['entity:read_tree', 'user:update'])
    expect(groupEffectivePermissions(sources, 'nothing-like-this')).toEqual([])
  })

  it('names where a role comes from', () => {
    const grants = { directRoleIds: new Set(['r1']), membershipEntityIdsByRole: new Map([['r1', ['e1']], ['r2', ['e2']]]) }
    const name = (id: string) => ({ e1: 'HQ', e2: 'SF Office' } as Record<string, string>)[id]!
    expect(roleGrantOrigins('r1', grants, name)).toEqual(['Direct', 'HQ'])
    expect(roleGrantOrigins('r2', grants, name)).toEqual(['SF Office'])
    expect(roleGrantOrigins('r9', grants, name)).toEqual([])
  })

  it('answers every requested permission once, in order; a missing answer is denied', () => {
    expect(checkResultRows(['user:read', 'user:delete', 'user:read'], { 'user:read': true, 'user:delete': false })).toEqual([
      { name: 'user:read', allowed: true },
      { name: 'user:delete', allowed: false }
    ])
    expect(checkResultRows(['x:y'], {})).toEqual([{ name: 'x:y', allowed: false }])
  })
})

describe('access schemas', () => {
  it('assign needs a role and an ordered window', () => {
    expect(assignRolesSchema.safeParse({ roleIds: [], validFrom: '', validUntil: '' }).success).toBe(false)
    expect(assignRolesSchema.safeParse({ roleIds: ['r1'], validFrom: '', validUntil: '' }).success).toBe(true)
    const outOfOrder = assignRolesSchema.safeParse({ roleIds: ['r1'], validFrom: '2026-10-20', validUntil: '2026-10-10' })
    expect(outOfOrder.success).toBe(false)
    expect(outOfOrder.error?.issues[0]?.path).toEqual(['validUntil'])
  })

  it('add membership needs an entity', () => {
    const missing = addMembershipSchema.safeParse({ entityId: '', roleIds: [], status: 'active', validFrom: '', validUntil: '', reason: '' })
    expect(missing.success).toBe(false)
    expect(missing.error?.issues[0]?.message).toBe('Choose an entity.')
  })

  it('reactivate rejects an end day in the past, accepts today, later or none', () => {
    const schema = reactivateGrantSchemaFor({ today: '2026-10-01' })
    expect(schema.safeParse({ validUntil: '2026-09-30', reason: '' }).success).toBe(false)
    expect(schema.safeParse({ validUntil: '2026-10-01', reason: '' }).success).toBe(true)
    expect(schema.safeParse({ validUntil: '', reason: '' }).success).toBe(true)
    expect(schema.safeParse({ validUntil: 'incomplete', reason: '' }).success).toBe(false)
  })

  it('check access needs a permission', () => {
    expect(checkAccessSchema.safeParse({ permissions: [], entityId: '' }).success).toBe(false)
    expect(checkAccessSchema.safeParse({ permissions: ['user:read'], entityId: '' }).success).toBe(true)
  })
})
