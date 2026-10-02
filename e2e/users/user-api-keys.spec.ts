import { backendConfigured, expect, test } from '../support/fixtures'
import { grantableScope } from '../support/api-keys'

// Admin personal-key incident response on the user detail's Security tab. The key is arranged
// through the API as the admin (a personal key of their own), then listed, inspected and revoked
// in the browser. Revoked keys leave the default live view (F-184).

type ApiKeyResponse = { id: string, name: string, status: string, api_key?: unknown }

test.describe('user personal API keys', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('lists metadata, opens a key and revokes it', async ({ page, api, requires, testData }) => {
    await requires({ features: ['api_keys'] })
    const scope = await grantableScope(api)
    test.skip(!scope, 'The admin persona has no grantable API key scope.')
    const me = await api.me()
    const name = testData.name('user-key')
    await api.post('/api-keys/', { name, scopes: [scope], key_kind: 'personal' })

    const listed = await api.get<ApiKeyResponse[]>(`/users/${me.id}/api-keys`)
    const key = listed.find(candidate => candidate.name === name)
    expect(key, 'created key in admin inventory').toBeTruthy()
    // The list contract is metadata-only; only create/rotate responses may expose a secret.
    expect(key).not.toHaveProperty('api_key')

    await page.goto(`/app/users/${me.id}?tab=security`)
    await expect(page.getByRole('heading', { name: 'Personal API keys' })).toBeVisible()
    const row = page.getByRole('row').filter({ hasText: name })
    await expect(row.getByTestId('api-key-status').filter({ visible: true })).toHaveText('Active')

    // The detail says what the key can do (F-028).
    await page.getByRole('button', { name: `View key ${name}`, exact: true }).click()
    const detail = page.getByRole('dialog', { name })
    await expect(detail.getByTestId('api-key-detail')).toContainText(me.email)
    await expect(detail.getByTestId('api-key-detail')).toContainText('1 scope')
    await detail.getByRole('button', { name: 'Revoke' }).click()
    const confirm = page.getByRole('dialog', { name: `Revoke API key ${name}` })
    await expect(confirm.getByTestId('confirm-effects')).toContainText('refused immediately')
    await confirm.getByRole('button', { name: 'Revoke key' }).click()

    await expect(row).toHaveCount(0)
    await page.getByRole('checkbox', { name: /^Include revoked and expired/ }).check()
    await expect(row.getByTestId('api-key-status').filter({ visible: true })).toHaveText('Revoked')
    await expect(page.getByRole('button', { name: `Personal API key actions for ${name}`, exact: true })).toHaveCount(0)
    await expect.poll(async () => {
      const after = await api.get<ApiKeyResponse[]>(`/users/${me.id}/api-keys`)
      return after.find(candidate => candidate.id === key!.id)?.status
    }).toBe('revoked')
  })

  test('pages a long key list; with every key revoked it says how many are hidden', async ({ page, api, requires, testData }) => {
    await requires({ features: ['api_keys'] })
    const scope = await grantableScope(api)
    test.skip(!scope, 'The admin persona has no grantable API key scope.')
    const me = await api.me()
    const name = testData.name('user-key-page')
    await api.post('/api-keys/', { name, scopes: [scope], key_kind: 'personal' })
    const real = (await api.get<ApiKeyResponse[]>(`/users/${me.id}/api-keys`)).find(candidate => candidate.name === name)!
    // Served lists: twelve live keys, then one revoked key only.
    let served: ApiKeyResponse[] = Array.from({ length: 12 }, (_, i) => ({ ...real, id: `${real.id.slice(0, -2)}${String(i).padStart(2, '0')}`, name: `${name}-${i}` }))
    await page.route(new RegExp(`/users/${me.id}/api-keys(\\?.*)?$`), async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      await route.fulfill({ json: served })
    })

    await page.goto(`/app/users/${me.id}?tab=security`)
    await expect(page.getByText('Showing 1–10 of 12 keys')).toBeVisible()
    await page.getByRole('navigation', { name: 'Keys pages' }).getByRole('button', { name: 'Page 2' }).click()
    await expect(page.getByText('Showing 11–12 of 12 keys')).toBeVisible()
    await expect(page.getByRole('button', { name: `View key ${name}-11`, exact: true })).toBeVisible()

    served = [{ ...real, status: 'revoked' }]
    await page.reload()
    await expect(page.getByText('No active keys')).toBeVisible()
    await expect(page.getByText('1 revoked or expired key is hidden.')).toBeVisible()
  })
})
