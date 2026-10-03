import type { Page, Request } from '@playwright/test'
import { backendConfigured, expect, expectSeeded, personaState, test } from '../support/fixtures'
import { apiUrl } from '../support/env'
import { chooseSelect, chooseSelectMenu, field } from '../support/ui-select'
import { piniaPathsTo } from '../support/pinia-probe'
import { type ApiKeyRow, createApiKeyButton, grantableScope, pastExpiry, pickScope, rewriteKeys, storeSecret } from '../support/api-keys'

// My API keys (WP-17): the signed-in account's own keys, on either preset. Keys are arranged
// through the API with a scope the admin may grant there (user:read on both example seeds) and
// named through testData, so cleanup revokes what a run leaves behind. States the backend cannot
// be put in quickly (an expiry date in the past, an owner who cannot sign in) are served by
// rewriting the real list and detail responses.

type Key = { id: string, name: string, prefix: string, status: string, scopes: string[], rate_limit_per_minute: number, ip_whitelist: string[] | null, description: string | null, entity_ids: string[] | null, inherit_from_tree: boolean }

const LIST = /\/api-keys\/$/
const DETAIL = /\/api-keys\/[0-9a-f-]{36}$/

function keyRow(page: Page, name: string) {
  return page.getByRole('row').filter({ hasText: name })
}

async function openMenu(page: Page, name: string) {
  await page.getByRole('button', { name: `API key actions for ${name}`, exact: true }).click()
}

function recordWrites(page: Page, pattern: RegExp) {
  const writes: { method: string, url: string, body: Record<string, unknown> }[] = []
  page.on('request', (request: Request) => {
    if (request.method() !== 'GET' && pattern.test(request.url())) {
      writes.push({ method: request.method(), url: request.url(), body: (request.postDataJSON() ?? {}) as Record<string, unknown> })
    }
  })
  return writes
}

test.describe('my API keys', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ errorGuardMode: 'strict' })

  test.beforeEach(async ({ requires }) => {
    await requires({ surfaces: ['api_keys'] })
  })

  test('lists keys from GET /api-keys/ with its trailing slash, never through a redirect (F-088)', async ({ page }) => {
    const lists: { url: string, status: number }[] = []
    const listUrls = [apiUrl('/api-keys'), apiUrl('/api-keys/')]
    page.on('response', (response) => {
      if (listUrls.includes(response.url().split('?')[0]!) && response.request().method() === 'GET') {
        lists.push({ url: response.url(), status: response.status() })
      }
    })
    await page.goto('/app/api-keys')
    await expect(page.getByRole('heading', { name: 'My API keys' })).toBeVisible()
    await expect(createApiKeyButton(page)).toBeVisible()
    await expect(page.getByLabel('Filter by status', { exact: true })).toContainText('Active and suspended')
    await expect.poll(() => lists.length).toBeGreaterThan(0)
    for (const list of lists) {
      expect(list.url).toBe(apiUrl('/api-keys/'))
      expect(list.status).toBe(200)
    }
  })

  test('creates a key through the sectioned form, sending the defaults (F-086, F-114)', async ({ page, api, testData }) => {
    const scope = await grantableScope(api)
    test.skip(!scope, 'The admin persona has no grantable API key scope.')
    const name = testData.name('mint')
    const writes = recordWrites(page, LIST)

    await page.goto('/app/api-keys')
    await createApiKeyButton(page).click()
    const dialog = page.getByRole('dialog', { name: 'Create personal API key' })
    // Test keys are a label only (F-087).
    await expect(dialog).toContainText('A label only: test and live keys have the same access.')
    // The header says once that the key acts as you; the note adds only what it does not
    // (v-keys-audit-07).
    await expect(dialog.getByText('Acts as you, within the scopes you choose.', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Its secret is shown once.', { exact: true })).toBeVisible()
    await expect(dialog.getByText(/The key acts as you/)).toHaveCount(0)
    await dialog.getByLabel('Name', { exact: true }).fill(name)
    await pickScope(dialog, scope!)
    await dialog.getByRole('button', { name: 'Create key' }).click()
    await storeSecret(page)

    expect(writes).toHaveLength(1)
    expect(writes[0]!.body).toEqual({
      name,
      scopes: [scope],
      key_kind: 'personal',
      prefix_type: 'sk_live',
      rate_limit_per_minute: 60,
      expires_in_days: 90
    })
    await expect(keyRow(page, name)).toBeVisible()
    await expect(keyRow(page, name).getByTestId('api-key-status').filter({ visible: true })).toHaveText('Active')
  })

  // One verb per action on a page: the empty list repeats the navbar's action (v-keys-audit-07).
  test('an empty list offers the navbar\'s own Create API key', async ({ page }) => {
    await page.route(url => url.pathname.endsWith('/api-keys/'), async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const response = await route.fetch()
      const body = await response.json() as unknown[] | { items: unknown[], total?: number }
      return route.fulfill({ response, json: Array.isArray(body) ? [] : { ...body, items: [], total: 0 } })
    })
    await page.goto('/app/api-keys')
    await expect(page.getByText('No API keys yet', { exact: true })).toBeVisible()
    const actions = page.getByRole('button', { name: 'Create API key', exact: true })
    await expect(actions).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Create a key' })).toHaveCount(0)
    await actions.last().click()
    await expect(page.getByRole('dialog', { name: 'Create personal API key' })).toBeVisible()
  })

  test('sends the chosen key type, IP allowlist, no rate limit and no expiry', async ({ page, api, testData }) => {
    const scope = await grantableScope(api)
    test.skip(!scope, 'The admin persona has no grantable API key scope.')
    const name = testData.name('opts')
    const writes = recordWrites(page, LIST)

    await page.goto('/app/api-keys')
    await createApiKeyButton(page).click()
    const dialog = page.getByRole('dialog', { name: 'Create personal API key' })
    await dialog.getByLabel('Name', { exact: true }).fill(name)
    await pickScope(dialog, scope!)
    await dialog.getByRole('radio', { name: /^Test/ }).check()
    const ips = dialog.getByLabel('IP allowlist', { exact: true })
    for (const ip of ['203.0.113.4', '198.51.100.0/24', '10.0.0.1']) {
      await ips.fill(ip)
      await ips.press('Enter')
    }
    await dialog.getByRole('switch', { name: 'No rate limit' }).click()
    await expect(dialog.getByLabel('Rate limit', { exact: true })).toBeDisabled()
    await chooseSelect(page, field(page, 'Expires after'), 'Never')
    await dialog.getByRole('button', { name: 'Create key' }).click()
    await storeSecret(page)

    expect(writes).toHaveLength(1)
    expect(writes[0]!.body).toEqual(expect.objectContaining({
      name,
      prefix_type: 'sk_test',
      ip_whitelist: ['203.0.113.4', '198.51.100.0/24', '10.0.0.1'],
      rate_limit_per_minute: 0
    }))
    expect(writes[0]!.body).not.toHaveProperty('expires_in_days')
  })

  test('refuses a blank, fractional or invalid rate limit instead of sending it (F-114)', async ({ page, api, testData }) => {
    const scope = await grantableScope(api)
    test.skip(!scope, 'The admin persona has no grantable API key scope.')
    const writes = recordWrites(page, LIST)

    await page.goto('/app/api-keys')
    await createApiKeyButton(page).click()
    const dialog = page.getByRole('dialog', { name: 'Create personal API key' })
    await dialog.getByLabel('Name', { exact: true }).fill(testData.name('rate'))
    await pickScope(dialog, scope!)
    const rate = dialog.getByLabel('Rate limit', { exact: true })
    await rate.fill('')
    await dialog.getByRole('button', { name: 'Create key' }).click()
    await expect(dialog.getByText(/Enter a rate limit, or turn on No rate limit\.|Enter a whole number\./)).toBeVisible()
    // A negative limit would refuse every request: the field never holds one.
    await rate.fill('-5')
    await rate.blur()
    await expect(rate).not.toHaveValue('-5')
    expect(writes).toHaveLength(0)
    await expect(dialog).toBeVisible()
  })

  test('edits scopes, IP allowlist and rate limit, sending only what changed (F-082)', async ({ page, api, testData }) => {
    const scopes = await api.grantableScopes()
    test.skip(scopes.length < 2, 'Needs two grantable scopes.')
    const [first, second] = scopes.includes('user:read') ? ['user:read', scopes.find(s => s !== 'user:read')!] : [scopes[0]!, scopes[1]!]
    const name = testData.name('edit')
    const key = await api.post<Key>('/api-keys/', { name, scopes: [first], key_kind: 'personal', rate_limit_per_minute: 60 })
    const writes = recordWrites(page, DETAIL)

    await page.goto('/app/api-keys')
    await openMenu(page, name)
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit API key' })
    await expect(dialog).toContainText(name)
    await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    // The expiry is fixed once created.
    await expect(dialog.getByLabel('Expires after', { exact: true })).toHaveCount(0)
    await pickScope(dialog, second)
    const ips = dialog.getByLabel('IP allowlist', { exact: true })
    await ips.fill('203.0.113.9')
    await ips.press('Enter')
    await dialog.getByLabel('Rate limit', { exact: true }).fill('30')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()

    expect(writes).toHaveLength(1)
    expect(writes[0]!.method).toBe('PATCH')
    expect(writes[0]!.body).toEqual({ scopes: [first, second].sort(), ip_whitelist: ['203.0.113.9'], rate_limit_per_minute: 30 })
    const saved = await api.get<Key>(`/api-keys/${key.id}`)
    expect([...saved.scopes].sort()).toEqual([first, second].sort())
    expect(saved.ip_whitelist).toEqual(['203.0.113.9'])
    expect(saved.rate_limit_per_minute).toBe(30)

    // The detail shows what the key can do now.
    await page.getByRole('button', { name: `View key ${name}`, exact: true }).click()
    const detail = page.getByTestId('api-key-detail')
    await expect(detail).toContainText('30 requests per minute')
    await expect(detail).toContainText('203.0.113.9')
    await expect(detail).toContainText('2 scopes')
  })

  test('an edit that changes the scopes is refused on the field while a scope no longer offered remains (F-082)', async ({ page, api, testData }) => {
    const scopes = await api.grantableScopes()
    test.skip(scopes.length < 2, 'Needs two grantable scopes.')
    const [first, second] = scopes.includes('user:read') ? ['user:read', scopes.find(s => s !== 'user:read')!] : [scopes[0]!, scopes[1]!]
    const name = testData.name('flag')
    await api.post<Key>('/api-keys/', { name, scopes: [first], key_kind: 'personal' })
    // The server no longer offers the key's scope.
    await page.route(/\/api-keys\/grantable-scopes(\?.*)?$/, async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const response = await route.fetch()
      const body = await response.json() as { grantable_scopes: string[] }
      await route.fulfill({ response, json: { ...body, grantable_scopes: body.grantable_scopes.filter(scope => scope !== first) } })
    })
    const writes = recordWrites(page, DETAIL)

    await page.goto('/app/api-keys')
    await openMenu(page, name)
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit API key' })
    const picker = dialog.getByTestId('scope-picker')
    await expect(picker.getByRole('button', { name: `Remove ${first}`, exact: true })).toContainText('not grantable here')
    await pickScope(dialog, second)
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    const refusal = `Remove ${first}: it is not grantable.`
    await expect(dialog).toContainText(refusal)
    // The field validates itself again (here on blur; also 300 ms after typing). The refusal is a
    // rule of the form, so it is derived again instead of being replaced by the schema's pass.
    const search = picker.getByRole('textbox', { name: 'Scopes', exact: true })
    await search.focus()
    await search.blur()
    await expect(dialog).toContainText(refusal)
    await expect(dialog).toBeVisible()
    expect(writes).toEqual([])
    // Removing the flagged scope lifts the refusal at once: the picker reports the change.
    await dialog.getByTestId('scope-picker').getByRole('button', { name: `Remove ${first}`, exact: true }).click()
    await expect(dialog).not.toContainText(refusal)
  })

  test('a suspended key cannot be rotated; menu and detail say why (F-080)', async ({ page, api, testData }) => {
    const scope = await grantableScope(api)
    test.skip(!scope, 'The admin persona has no grantable API key scope.')
    const name = testData.name('suspended')
    const key = await api.post<Key>('/api-keys/', { name, scopes: [scope], key_kind: 'personal' })
    await api.patch(`/api-keys/${key.id}`, { status: 'suspended' })

    await page.goto('/app/api-keys')
    await expect(keyRow(page, name).getByTestId('api-key-status').filter({ visible: true })).toHaveText('Suspended')
    await openMenu(page, name)
    const rotate = page.getByRole('menuitem', { name: /^Rotate/ })
    await expect(rotate).toBeDisabled()
    await expect(rotate).toContainText('Reactivate the key first: rotating it would issue an active key.')
    await expect(page.getByRole('menuitem', { name: 'Reactivate', exact: true })).toBeEnabled()
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: `View key ${name}`, exact: true }).click()
    const slideover = page.getByRole('dialog', { name })
    await expect(slideover.getByTestId('api-key-ineffective')).toContainText('This key is suspended')
    await expect(slideover.getByRole('button', { name: 'Rotate' })).toBeDisabled()
    await expect(slideover.getByTestId('api-key-disabled-actions')).toContainText('Reactivate the key first')
  })

  test('rotate issues a fresh one-time secret that no store keeps', async ({ page, api, testData }) => {
    const scope = await grantableScope(api)
    test.skip(!scope, 'The admin persona has no grantable API key scope.')
    const name = testData.name('rotate')
    await api.post('/api-keys/', { name, scopes: [scope], key_kind: 'personal' })

    await page.goto('/app/api-keys')
    await openMenu(page, name)
    await page.getByRole('menuitem', { name: 'Rotate' }).click()
    await page.getByRole('dialog', { name: `Rotate API key ${name}` }).getByRole('button', { name: 'Rotate key' }).click()
    const secret = await storeSecret(page)
    expect(await page.evaluate(piniaPathsTo, secret)).toEqual([])
    // The old key is revoked and hidden by default; the new one carries the same name.
    await expect(keyRow(page, name)).toHaveCount(1)
  })

  test('revoke hides the key from the live list; the Revoked filter shows it', async ({ page, api, testData }) => {
    const scope = await grantableScope(api)
    test.skip(!scope, 'The admin persona has no grantable API key scope.')
    const name = testData.name('revoke')
    await api.post('/api-keys/', { name, scopes: [scope], key_kind: 'personal' })

    await page.goto('/app/api-keys')
    await openMenu(page, name)
    await page.getByRole('menuitem', { name: 'Revoke' }).click()
    await page.getByRole('dialog', { name: `Revoke API key ${name}` }).getByRole('button', { name: 'Revoke key' }).click()
    await expect(keyRow(page, name)).toHaveCount(0)

    await chooseSelect(page, field(page, 'Filter by status'), 'Revoked')
    await expect(page).toHaveURL(/[?&]status=revoked/)
    await expect(keyRow(page, name).getByTestId('api-key-status').filter({ visible: true })).toHaveText('Revoked')
    // Nothing to do with a revoked key: no menu.
    await expect(page.getByRole('button', { name: `API key actions for ${name}`, exact: true })).toHaveCount(0)
  })

  test('suspend then reactivate a key', async ({ page, api, testData }) => {
    const scope = await grantableScope(api)
    test.skip(!scope, 'The admin persona has no grantable API key scope.')
    const name = testData.name('suspend')
    await api.post('/api-keys/', { name, scopes: [scope], key_kind: 'personal' })
    const status = () => keyRow(page, name).getByTestId('api-key-status').filter({ visible: true })

    await page.goto('/app/api-keys')
    await openMenu(page, name)
    await page.getByRole('menuitem', { name: 'Suspend' }).click()
    await page.getByRole('dialog', { name: `Suspend API key ${name}` }).getByRole('button', { name: 'Suspend key' }).click()
    await expect(status()).toHaveText('Suspended')

    await openMenu(page, name)
    await page.getByRole('menuitem', { name: 'Reactivate', exact: true }).click()
    await page.getByRole('dialog', { name: `Reactivate API key ${name}` }).getByRole('button', { name: 'Reactivate key' }).click()
    await expect(status()).toHaveText('Active')
  })

  test('a key past its expiry date reads Expired with the reason, and is replaced with a fresh expiry (F-027, F-080)', async ({ page, api, testData }) => {
    const scope = await grantableScope(api)
    test.skip(!scope, 'The admin persona has no grantable API key scope.')
    const name = testData.name('expired')
    const key = await api.post<Key>('/api-keys/', { name, scopes: [scope], key_kind: 'personal', expires_in_days: 30, description: 'Nightly report' })
    const edit = (k: ApiKeyRow) => (k.id === key.id ? pastExpiry(k) : k)
    await rewriteKeys(page, LIST, edit)
    await rewriteKeys(page, DETAIL, edit)
    const writes = recordWrites(page, LIST)

    await page.goto('/app/api-keys')
    // Expired keys leave the default live view.
    await expect(page.getByRole('heading', { name: 'My API keys' })).toBeVisible()
    await expect(keyRow(page, name)).toHaveCount(0)
    await chooseSelect(page, field(page, 'Filter by status'), 'Expired')
    const status = keyRow(page, name).getByTestId('api-key-status').filter({ visible: true })
    await expect(status).toContainText('Expired')
    await expect(status).toContainText('Its expiry date has passed.')

    // Rotating would drop the expiry: an expired key offers a replacement instead.
    await openMenu(page, name)
    await expect(page.getByRole('menuitem')).toHaveText(['View details', 'Create replacement'])
    await page.getByRole('menuitem', { name: 'Create replacement' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create replacement key' })
    await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue(name)
    await expect(dialog.getByTestId('scope-selection').getByRole('button', { name: `Remove ${scope}`, exact: true })).toBeVisible()
    await expect(dialog.getByLabel('Expires after', { exact: true })).toContainText('30 days')
    await dialog.getByRole('button', { name: 'Create key' }).click()
    await storeSecret(page)
    expect(writes).toHaveLength(1)
    expect(writes[0]!.body).toEqual(expect.objectContaining({ name, scopes: [scope], description: 'Nightly report', expires_in_days: 30 }))
  })

  test('an active key the server refuses reads Not in effect, with the reason, and is not rotated (F-027)', async ({ page, api, testData }) => {
    const scope = await grantableScope(api)
    test.skip(!scope, 'The admin persona has no grantable API key scope.')
    const name = testData.name('refused')
    const key = await api.post<Key>('/api-keys/', { name, scopes: [scope], key_kind: 'personal' })
    const edit = (k: ApiKeyRow) => (k.id === key.id ? { ...k, is_currently_effective: false, ineffective_reasons: ['owner_inactive'] } : k)
    await rewriteKeys(page, LIST, edit)
    await rewriteKeys(page, DETAIL, edit)

    await page.goto('/app/api-keys')
    const status = keyRow(page, name).getByTestId('api-key-status').filter({ visible: true })
    await expect(status).toContainText('Not in effect')
    await expect(status).toContainText('The account that owns it cannot sign in')
    await page.getByRole('button', { name: `View key ${name}`, exact: true }).click()
    const slideover = page.getByRole('dialog', { name })
    await expect(slideover.getByTestId('api-key-ineffective')).toContainText('This key is not in effect')
    await expect(slideover.getByTestId('api-key-ineffective')).toContainText('The account that owns it cannot sign in')
    await expect(slideover.getByRole('button', { name: 'Rotate' })).toBeDisabled()
  })

  test('search and status filter live in the URL', async ({ page, api, testData }) => {
    const scope = await grantableScope(api)
    test.skip(!scope, 'The admin persona has no grantable API key scope.')
    const name = testData.name('search')
    await api.post('/api-keys/', { name, scopes: [scope], key_kind: 'personal', description: 'searchable' })

    await page.goto('/app/api-keys')
    await page.getByRole('searchbox', { name: 'Search keys' }).fill(name)
    await expect(page).toHaveURL(new RegExp(`[?&]q=${name}`))
    await expect(page.getByRole('button', { name: /^View key / })).toHaveCount(1)
    await page.reload()
    await expect(page.getByRole('searchbox', { name: 'Search keys' })).toHaveValue(name)
    await expect(keyRow(page, name)).toBeVisible()
  })
})

test.describe('my API keys restricted to an entity (EnterpriseRBAC, F-083)', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ errorGuardMode: 'strict' })

  test('restricts a key to an entity and its children, refetching what may be granted there', async ({ page, api, requires, testData }) => {
    await requires({ preset: 'EnterpriseRBAC', surfaces: ['api_keys', 'memberships', 'entities'] })
    const memberships = await api.get<{ entity_id: string, is_currently_valid: boolean }[]>('/memberships/me')
    const anchor = memberships.find(m => m.is_currently_valid)
    test.skip(!anchor, 'The admin persona holds no membership in force.')
    const entity = await api.get<{ id: string, display_name: string }>(`/entities/${anchor!.entity_id}`)
    const scope = (await api.grantableScopes(entity.id))[0]
    test.skip(!scope, 'Nothing grantable at the entity.')
    const name = testData.name('anchored')
    const grantable: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api-keys/grantable-scopes')) grantable.push(new URL(request.url()).search)
    })
    const writes = recordWrites(page, LIST)

    await page.goto('/app/api-keys')
    await createApiKeyButton(page).click()
    const dialog = page.getByRole('dialog', { name: 'Create personal API key' })
    await dialog.getByLabel('Name', { exact: true }).fill(name)
    await chooseSelectMenu(page, field(page, 'Restrict to entity'), entity.display_name)
    await expect.poll(() => grantable.some(q => q.includes(`entity_id=${entity.id}`) && q.includes('inherit_from_tree=false'))).toBe(true)
    await dialog.getByRole('switch', { name: 'Include child entities' }).click()
    await expect.poll(() => grantable.some(q => q.includes(`entity_id=${entity.id}`) && q.includes('inherit_from_tree=true'))).toBe(true)
    await pickScope(dialog, scope!)
    await dialog.getByRole('button', { name: 'Create key' }).click()
    await storeSecret(page)

    expect(writes[0]!.body).toEqual(expect.objectContaining({ name, entity_ids: [entity.id], inherit_from_tree: true }))
    await expect(keyRow(page, name)).toContainText(`${entity.display_name} and below`)
  })
})

test.describe('my API keys as a low-privilege account', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ storageState: personaState('agent'), errorGuardMode: 'strict' })

  test('the scope picker offers exactly what the account may grant', async ({ page, apiAs, requires }) => {
    await requires({ surfaces: ['api_keys'], personas: ['agent'] })
    const expected = [...await apiAs('agent').grantableScopes()].sort()

    await page.goto('/app/api-keys')
    await createApiKeyButton(page).click()
    const dialog = page.getByRole('dialog', { name: 'Create personal API key' })
    const picker = dialog.getByTestId('scope-picker')
    if (!expected.length) {
      await expect(picker.getByTestId('scope-picker-empty')).toBeVisible()
      return
    }
    await expect(picker.getByRole('option')).toHaveCount(expected.length)
    for (const scope of expected) {
      await picker.getByPlaceholder('Search scopes...').fill(scope)
      await picker.getByRole('option').first().click()
    }
    const chips = await picker.getByTestId('scope-selection').getByRole('button').evaluateAll(buttons => buttons.map(b => b.getAttribute('aria-label')?.replace(/^Remove /, '')))
    expect(chips.sort()).toEqual(expected)
  })

  test('the entity restriction names the account\'s own memberships, which it cannot read (F-103)', async ({ page, apiAs, requires }) => {
    await requires({ preset: 'EnterpriseRBAC', surfaces: ['api_keys', 'memberships'], personas: ['agent'] })
    const agent = apiAs('agent')
    const held = await agent.get<string[]>('/permissions/me')
    expect(held.filter(name => name.startsWith('entity:'))).toEqual([])
    const memberships = await agent.get<Array<{ is_currently_valid: boolean, entity_display_name?: string | null, entity_name?: string | null }>>('/memberships/me')
    const named = memberships.find(m => m.is_currently_valid && (m.entity_display_name || m.entity_name))
    expectSeeded(named, 'the agent holds a membership in force')

    await page.goto('/app/api-keys')
    await createApiKeyButton(page).click()
    await field(page, 'Restrict to entity').click()
    // Named by the membership (outlabs-auth 0.1.0a35), not "An entity you belong to".
    await expect(page.getByRole('option', { name: (named.entity_display_name || named.entity_name)!, exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: /An entity you belong to/ })).toHaveCount(0)
    await page.keyboard.press('Escape')
  })
})
