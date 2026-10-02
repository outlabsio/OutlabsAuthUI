import { describe, expect, it } from 'vitest'
import { apiOrigin } from '../../e2e/support/env'
import { ErrorGuard } from '../../e2e/support/error-guard'
import { personaOverrides, resolvePersona } from '../../e2e/support/personas'
import { isRunRecord, selectCleanupTargets, testData } from '../../e2e/support/test-data'

// The E2E harness decides what cleanup deletes and which account each persona signs in as.
// Both are safety-relevant (a wrong match deletes real records; a wrong persona tests the
// wrong actor), so they are pinned here.

describe('test-data naming', () => {
  const data = testData('Run42')

  it('marks every generated identifier with the run', () => {
    for (const record of [
      { name: data.name('role') },
      { slug: data.name('entity') },
      { email: data.email('user') },
      { display_name: data.displayName('entity') },
      { name: `${data.resource('abac')}:read` }
    ]) {
      expect(isRunRecord(record, 'Run42')).toBe(true)
      expect(isRunRecord(record, 'run43')).toBe(false)
    }
  })

  it('generates unique names and valid example.com emails', () => {
    expect(data.name('role')).not.toBe(data.name('role'))
    expect(data.email('user')).toMatch(/^pw-e2e-run42-user-[a-z0-9]+@example\.com$/)
    expect(data.resource('perm')).toMatch(/^[a-z0-9]+$/)
  })
})

describe('selectCleanupTargets', () => {
  const rows = [
    { id: '1', name: 'pw-e2e-run42-role-1a' },
    { id: '2', name: 'pw-e2e-run41-role-1a' },
    { id: '3', name: 'pw-perms-100' },
    { id: '4', email: 'e2e-invite-1727@example.com' },
    { id: '5', name: 'sales-manager' },
    { id: '6', name: 'pw-e2e-run42-role-2b', status: 'archived' }
  ]

  it('takes only this run\'s live records: never another run\'s, unmarked or already terminal ones', () => {
    expect(selectCleanupTargets(rows, 'run42').map(r => r.id)).toEqual(['1'])
  })
})

describe('persona resolution', () => {
  it('defaults to the preset seed', () => {
    expect(resolvePersona('admin', 'EnterpriseRBAC', {}).email).toBe('admin@acme.com')
    expect(resolvePersona('admin', 'SimpleRBAC', {}).email).toBe('admin@test.com')
    expect(resolvePersona('agent', 'SimpleRBAC', {}).email).toBe('writer@test.com')
  })

  it('marks personas the preset does not seed as unavailable', () => {
    expect(resolvePersona('orgAdmin', 'SimpleRBAC', {}).available).toBe(false)
    expect(resolvePersona('writer', 'EnterpriseRBAC', {}).available).toBe(false)
    expect(resolvePersona('admin', null, {}).available).toBe(false)
  })

  it('seeds the matrix personas on EnterpriseRBAC only', () => {
    expect(resolvePersona('summitAdmin', 'EnterpriseRBAC', {}).email).toBe('summit-admin@summit.com')
    expect(resolvePersona('auditor', 'EnterpriseRBAC', {}).email).toBe('auditor@acme.com')
    expect(resolvePersona('permissionsAdmin', 'EnterpriseRBAC', {}).email).toBe('permissions-admin@acme.com')
    expect(resolvePersona('auditor', 'SimpleRBAC', {}).available).toBe(false)
  })

  it('makes a provisioned persona available on any known preset, without credentials', () => {
    expect(resolvePersona('globalAdmin', 'EnterpriseRBAC', {})).toMatchObject({ email: '', available: true })
    expect(resolvePersona('globalAdmin', 'SimpleRBAC', {}).available).toBe(true)
    expect(resolvePersona('globalAdmin', null, {}).available).toBe(false)
  })

  it('lets the environment override per persona', () => {
    const env = { E2E_ORG_ADMIN_EMAIL: 'delegate@example.com', E2E_ORG_ADMIN_PASSWORD: 'secret' }
    const resolved = resolvePersona('orgAdmin', 'SimpleRBAC', env)
    expect(resolved).toMatchObject({ email: 'delegate@example.com', password: 'secret', available: true })
    expect(resolved.storageState).toMatch(/org-admin\.json$/)
  })

  // expectSeeded (support/capabilities.ts) fails on a missing seed fact unless these are set.
  it('lists the persona overrides that take a run off the reference seed', () => {
    expect(personaOverrides({})).toEqual([])
    expect(personaOverrides({ E2E_API_BASE_URL: 'http://localhost:8004', E2E_ORG_ADMIN_EMAIL: '  ' })).toEqual([])
    expect(personaOverrides({ E2E_ORG_ADMIN_EMAIL: 'delegate@example.com', E2E_ADMIN_PASSWORD: 'secret' }))
      .toEqual(['E2E_ADMIN_PASSWORD', 'E2E_ORG_ADMIN_EMAIL'])
    expect(personaOverrides({ E2E_PERMISSIONS_ADMIN_EMAIL: 'catalog@example.com' })).toEqual(['E2E_PERMISSIONS_ADMIN_EMAIL'])
  })
})

describe('error guard', () => {
  const url = `${apiOrigin}/v1/users/00000000-0000-4000-8000-000000000000`
  const echo = { kind: 'console' as const, message: 'Failed to load resource: the server responded with a status of 404 (Not Found)', url }

  it('lets an allowed API failure cover the browser\'s console echo of it', () => {
    const guard = new ErrorGuard('strict')
    guard.record({ kind: 'api', message: `GET ${url} → 404`, url, status: 404, method: 'GET' })
    guard.record(echo)
    guard.allow({ status: 404, url: /\/users\// })
    expect(guard.unexpected()).toEqual([])
  })

  it('keeps an echo whose status or URL was not allowed', () => {
    const guard = new ErrorGuard('strict')
    guard.record(echo)
    guard.allow({ status: 403, url: /\/users\// })
    expect(guard.unexpected()).toEqual([echo])
    const other = new ErrorGuard('strict')
    other.record(echo)
    other.allow({ status: 404, url: /\/roles\// })
    expect(other.unexpected()).toEqual([echo])
  })
})
