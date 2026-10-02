import type { Page } from '@playwright/test'
import { backendConfigured, expect, test } from '../support/fixtures'
import { type ApiKeyRow, grantableScope, pastExpiry, rewriteKeys } from '../support/api-keys'
import { field } from '../support/ui-select'

// A key's status is what it can do, not only what was stored (F-027): in every key table a key
// past its expiry date reads Expired with the reason (the server keeps it 'active') and offers no
// action that would revive it. The client-filtered tables leave it out of the default live view;
// the server-filtered entity inventory keeps it under "Active (includes expired)". My API keys is covered in
// api-keys-workspace.spec.ts; this file covers a service account's keys, the user detail's
// Personal API keys card and the entity key inventory. The past expiry is served by rewriting
// the real list response (a key cannot be created already expired).

type Account = { id: string, name: string }
type Key = { id: string, name: string }

const SCOPE = 'user:read'

function statusIn(page: Page, name: string) {
  return page.getByRole('row').filter({ hasText: name }).getByTestId('api-key-status').filter({ visible: true })
}

test.describe('key status across key tables', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ errorGuardMode: 'strict' })

  test('a service account key past its expiry reads Expired with the reason and offers no action', async ({ page, api, requires, testData }) => {
    await requires({ surfaces: ['integration_principals'], features: ['system_api_keys'] })
    const base = '/admin/system/integration-principals'
    const account = await api.post<Account>(base, { name: testData.name('sa-expired'), allowed_scopes: [SCOPE], role_ids: [] })
    const live = await api.post<Key>(`${base}/${account.id}/api-keys`, { name: testData.name('live'), scopes: [SCOPE] })
    const expired = await api.post<Key>(`${base}/${account.id}/api-keys`, { name: testData.name('expired'), scopes: [SCOPE], expires_in_days: 7 })
    await rewriteKeys(page, new RegExp(`/integration-principals/${account.id}/api-keys\\?`), key => (key.id === expired.id ? pastExpiry(key) : key))

    await page.goto(`/app/service-accounts/${account.id}?tab=keys`)
    await expect(statusIn(page, live.name)).toHaveText('Active')
    await expect(page.getByRole('row').filter({ hasText: expired.name })).toHaveCount(0)
    await expect(page.getByText('Include revoked and expired (1)')).toBeVisible()
    await page.getByRole('checkbox', { name: /^Include revoked and expired/ }).check()
    await expect(statusIn(page, expired.name)).toContainText('Expired')
    await expect(statusIn(page, expired.name)).toContainText('Its expiry date has passed.')
    await expect(page.getByRole('button', { name: `Key actions for ${expired.name}`, exact: true })).toHaveCount(0)
  })

  test('the user detail lists a personal key past its expiry as Expired', async ({ page, api, requires, testData }) => {
    await requires({ features: ['api_keys'] })
    const scope = await grantableScope(api)
    test.skip(!scope, 'The admin persona has no grantable API key scope.')
    const me = await api.me()
    const key = await api.post<Key>('/api-keys/', { name: testData.name('user-expired'), scopes: [scope], key_kind: 'personal', expires_in_days: 7 })
    // Only this key is served: the admin's other keys (other specs make them in parallel) would
    // page it out, since a key past its expiry sorts as an old one.
    await page.route(new RegExp(`/users/${me.id}/api-keys$`), async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const rows = await (await route.fetch()).json() as ApiKeyRow[]
      await route.fulfill({ json: rows.filter(row => row.id === key.id).map(row => pastExpiry(row)) })
    })

    await page.goto(`/app/users/${me.id}?tab=security`)
    await expect(page.getByRole('heading', { name: 'Personal API keys' })).toBeVisible()
    await page.getByRole('checkbox', { name: /^Include revoked and expired/ }).check()
    await expect(statusIn(page, key.name)).toContainText('Expired')
    await expect(statusIn(page, key.name)).toContainText('Its expiry date has passed.')
    await page.getByRole('button', { name: `View key ${key.name}`, exact: true }).click()
    await expect(page.getByTestId('api-key-ineffective')).toContainText('This key has expired')
  })

  // The inventory filters on the server, by the STORED status, and the server keeps a key past
  // its expiry 'active' (v-keys-audit-01): the default view says it includes such keys, and there
  // is no Expired choice (it could only ever come back empty).
  test('the entity key inventory lists a key past its expiry as Expired under "Active (includes expired)" (EnterpriseRBAC)', async ({ page, api, requires, testData }) => {
    await requires({ preset: 'EnterpriseRBAC', surfaces: ['api_key_admin', 'memberships', 'entities'] })
    const memberships = await api.get<{ entity_id: string, is_currently_valid: boolean }[]>('/memberships/me')
    const anchor = memberships.find(m => m.is_currently_valid)?.entity_id
    test.skip(!anchor, 'The admin persona holds no membership in force.')
    const scope = (await api.grantableScopes(anchor))[0]
    test.skip(!scope, 'Nothing grantable at the entity.')
    const key = await api.post<Key>('/api-keys/', { name: testData.name('inv-expired'), scopes: [scope], key_kind: 'personal', expires_in_days: 7, entity_ids: [anchor] })
    await rewriteKeys(page, new RegExp(`/admin/entities/${anchor}/api-keys\\?`), (row: ApiKeyRow) => (row.id === key.id ? pastExpiry(row) : row))

    const inventoryRequest = page.waitForRequest(request => new RegExp(`/admin/entities/${anchor}/api-keys\\?`).test(request.url()))
    await page.goto(`/app/service-accounts?scope=entity&entity=${anchor}&view=inventory&kq=${encodeURIComponent(key.name)}`)
    expect(new URL((await inventoryRequest).url()).searchParams.get('status')).toBe('active')
    const statusFilter = field(page, 'Filter by status')
    await expect(statusFilter).toHaveText('Active (includes expired)')
    // The label is read in full, not cut to "Active (inclu…".
    expect(await statusFilter.evaluate(el => [...el.querySelectorAll('span')].every(span => span.scrollWidth <= span.clientWidth))).toBe(true)
    await expect(statusIn(page, key.name)).toContainText('Expired')
    await expect(statusIn(page, key.name)).toContainText('Its expiry date has passed.')
    // An expired key is past saving: no revoke, only its detail.
    await expect(page.getByRole('button', { name: `Key actions for ${key.name}`, exact: true })).toHaveCount(0)

    await statusFilter.click()
    await expect(page.getByRole('option')).toHaveText(['Active (includes expired)', 'Suspended', 'Revoked', 'All statuses'])
    await page.keyboard.press('Escape')

    // An address that still says kstatus=expired falls back to the default view, which lists it.
    await page.goto(`/app/service-accounts?scope=entity&entity=${anchor}&view=inventory&kstatus=expired&kq=${encodeURIComponent(key.name)}`)
    await expect(statusFilter).toHaveText('Active (includes expired)')
    await expect(statusIn(page, key.name)).toContainText('Expired')
  })
})
