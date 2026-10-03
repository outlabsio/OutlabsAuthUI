import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { backendConfigured, expect, test, type ApiClient } from '../support/fixtures'
import { pickEntity } from '../support/entities'
import { jsonResponse } from '../support/mocks'
import { piniaPathsTo } from '../support/pinia-probe'
import { chooseSelect, field } from '../support/ui-select'

// Service accounts (outlabs-auth integration principals) and their keys, as the superuser admin
// on either preset (F-025, F-026, F-079, F-081, F-084, F-085, F-182, F-185, F-219). Every account
// is created with the "Service Reader" role or the user:read scope, which both example seeds
// carry, so the specs run on EnterpriseRBAC and SimpleRBAC alike; entity scope and the key
// inventory are EnterpriseRBAC-only. Accounts are named through testData, so cleanup archives
// what a run leaves behind.

type Account = { id: string, name: string, status: string, scope_kind: string, anchor_entity_id: string | null }
type Key = { id: string, name: string, status: string, api_key?: string }
type Page_<T> = { items: T[], total: number }

const SCOPE = 'user:read'
const ROLE = 'Service Reader'

// GET …/integration-principals/grantable-scopes, platform-wide or at an entity (F-079).
const GRANTABLE = /\/integration-principals\/grantable-scopes(\?.*)?$/

type Grantable = { grantable_scopes: string[], system_allowed_action_prefixes: string[] }

/**
 * Serve the admin's grantable scopes narrower than their real grant (the superuser may grant
 * everything allowed): what the console offers and refuses must follow this answer, not a copy
 * of the default policy (which would offer user:read).
 */
async function serveGrantable(page: Page, grantable: Grantable) {
  await page.route(GRANTABLE, async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const response = await route.fetch()
    await route.fulfill({ response, json: { ...(await response.json() as Record<string, unknown>), ...grantable } })
  })
}

function base(entityId?: string) {
  return entityId ? `/admin/entities/${entityId}/integration-principals` : '/admin/system/integration-principals'
}

async function createAccount(api: ApiClient, name: string, entityId?: string, body: Record<string, unknown> = {}) {
  return api.post<Account>(base(entityId), { name, allowed_scopes: [SCOPE], role_ids: [], ...body })
}

async function createKey(api: ApiClient, account: Account, name: string) {
  return api.post<Key>(`${base(account.anchor_entity_id ?? undefined)}/${account.id}/api-keys`, { name, scopes: [SCOPE] })
}

async function accountKeys(api: ApiClient, account: Account) {
  return (await api.get<Page_<Key>>(`${base(account.anchor_entity_id ?? undefined)}/${account.id}/api-keys`, { query: { limit: 100 } })).items
}

function accountPath(account: Account, tab?: string) {
  const query = new URLSearchParams()
  if (account.anchor_entity_id) query.set('entity', account.anchor_entity_id)
  if (tab) query.set('tab', tab)
  const qs = query.toString()
  return `/app/service-accounts/${account.id}${qs ? `?${qs}` : ''}`
}

function keyRow(page: Page, name: string) {
  return page.getByRole('row').filter({ hasText: name })
}

async function keyAction(page: Page, keyName: string, action: string) {
  await page.getByRole('button', { name: `Key actions for ${keyName}`, exact: true }).click()
  await page.getByRole('menuitem', { name: action }).click()
}

async function storeSecret(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Store the new API key now' })
  await expect(dialog).toBeVisible()
  const secret = await dialog.getByLabel('API key secret').inputValue()
  expect(secret).not.toBe('')
  await dialog.getByRole('checkbox', { name: 'I have stored this key somewhere safe' }).check()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog).toBeHidden()
  return secret
}

test.describe('service accounts', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ errorGuardMode: 'strict' })

  test.beforeEach(async ({ requires }) => {
    await requires({ surfaces: ['integration_principals'], features: ['system_api_keys'] })
  })

  test('the former route redirects with its query; the page names the section once', async ({ page }) => {
    await page.goto('/app/users/api-keys?status=all')
    await expect(page).toHaveURL(/\/app\/service-accounts\?status=all$/)
    await expect(page.getByRole('heading', { name: 'Service accounts', exact: true })).toBeVisible()
    await expect(page).toHaveTitle(/^Service accounts · /)
    await expect(page.getByLabel('Filter by status', { exact: true })).toContainText('All statuses')
    await page.getByRole('button', { name: 'About service accounts' }).click()
    await expect(page.getByRole('dialog', { name: 'About service accounts' })).toBeVisible()
  })

  test('creates a role-backed account, opens it and issues a key whose secret is shown once', async ({ page, testData, api }) => {
    const name = testData.name('sa')
    const keyName = testData.name('sa-key')
    const accountPosts: Record<string, unknown>[] = []
    const keyPosts: Record<string, unknown>[] = []
    await page.route(/\/integration-principals(\/[^/?]+\/api-keys)?\/?(\?.*)?$/, async (route) => {
      const request = route.request()
      if (request.method() === 'POST') (/\/api-keys/.test(request.url()) ? keyPosts : accountPosts).push(request.postDataJSON() as Record<string, unknown>)
      await route.fallback()
    })

    await page.goto('/app/service-accounts')
    await page.getByRole('button', { name: 'New service account' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'New service account' })
    await expect(dialog).toContainText('Platform-wide')
    // Platform-wide accounts cannot include child entities (F-182).
    await expect(dialog.getByRole('switch', { name: 'Includes child entities' })).toHaveCount(0)
    await dialog.getByLabel('Name').fill(name)
    // Nothing chosen: the envelope rule names the roles field.
    await dialog.getByRole('button', { name: 'Create service account' }).click()
    await expect(dialog.getByText('Choose at least one role, or add a direct scope under Advanced.')).toBeVisible()
    await dialog.getByTestId('role-access-editor').getByRole('option').filter({ hasText: ROLE }).first().click()
    await expect(dialog.getByRole('button', { name: `Remove ${ROLE}` })).toBeVisible()
    await dialog.getByRole('button', { name: 'Create service account' }).click()

    // Create opens the account.
    await expect(page).toHaveURL(/\/app\/service-accounts\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
    expect(accountPosts).toHaveLength(1)
    expect(accountPosts[0]).toMatchObject({ name, allowed_scopes: [] })
    expect(accountPosts[0]!.role_ids).toHaveLength(1)
    expect(accountPosts[0]).not.toHaveProperty('inherit_from_tree')

    await page.getByRole('link', { name: 'Access' }).click()
    await expect(page).toHaveURL(/[?&]tab=access/)
    await expect(page.getByTestId('role-chip').filter({ hasText: ROLE })).toBeVisible()

    await page.getByRole('link', { name: 'Keys' }).click()
    await expect(page.getByText('No keys yet')).toBeVisible()
    await page.getByRole('button', { name: 'New key' }).click()
    const keyDialog = page.getByRole('dialog', { name: 'New key' })
    // Said once, in the header (v-keys-audit-07).
    await expect(keyDialog.getByText('Acts as this service account.', { exact: true })).toBeVisible()
    await expect(keyDialog.getByText('Its secret is shown once.', { exact: true })).toBeVisible()
    await expect(keyDialog.getByText(/The key acts as /)).toHaveCount(0)
    await keyDialog.getByLabel('Name').fill(keyName)
    await keyDialog.getByTestId('scope-picker').getByRole('option').first().click()
    await keyDialog.getByRole('radio', { name: /^Test/ }).check()
    const ips = keyDialog.getByRole('textbox', { name: 'IP allowlist' })
    await ips.fill('203.0.113.4')
    await ips.press('Enter')
    await ips.fill('nope')
    await ips.press('Enter')
    await keyDialog.getByRole('button', { name: 'Create key' }).click()
    await expect(keyDialog.getByText('nope is not an IP address or CIDR range.')).toBeVisible()
    // Backspace in the empty input selects the last tag, a second one removes it.
    await ips.press('Backspace')
    await ips.press('Backspace')
    await ips.fill('198.51.100.0/24')
    await ips.press('Enter')
    await keyDialog.getByRole('button', { name: 'Create key' }).click()

    const secret = await storeSecret(page)
    await expect(keyRow(page, keyName)).toBeVisible()
    expect(keyPosts).toHaveLength(1)
    expect(keyPosts[0]).toMatchObject({ name: keyName, prefix_type: 'sk_test', rate_limit_per_minute: 60, ip_whitelist: ['203.0.113.4', '198.51.100.0/24'] })
    expect(keyPosts[0]!.scopes).toHaveLength(1)
    // Only the reveal dialog ever held the secret (F-183).
    await expect.poll(() => page.evaluate(value => document.body.innerHTML.includes(value), secret)).toBe(false)
    expect(await page.evaluate(piniaPathsTo, secret)).toEqual([])

    const [account] = (await api.get<Page_<Account>>(base(), { query: { search: name } })).items
    expect((await accountKeys(api, account!)).map(key => key.name)).toEqual([keyName])
  })

  test('key actions: suspend, reactivate, rotate (active keys only) and revoke', async ({ page, testData, api }) => {
    const account = await createAccount(api, testData.name('sa-keys'))
    const keyName = testData.name('key')
    await createKey(api, account, keyName)

    await page.goto(accountPath(account, 'keys'))
    await expect(keyRow(page, keyName)).toBeVisible()

    await keyAction(page, keyName, 'Suspend')
    await page.getByRole('dialog', { name: `Suspend key ${keyName}` }).getByRole('button', { name: 'Suspend key' }).click()
    await expect(keyRow(page, keyName).getByRole('cell', { name: 'Suspended', exact: true })).toBeVisible()
    // A suspended key is not rotated: that would issue an active one (F-080). The item says why.
    await page.getByRole('button', { name: `Key actions for ${keyName}`, exact: true }).click()
    await expect(page.getByRole('menuitem', { name: /^Rotate/ })).toBeDisabled()
    await expect(page.getByRole('menuitem', { name: /^Rotate/ })).toContainText('Reactivate the key first')
    await page.getByRole('menuitem', { name: 'Reactivate', exact: true }).click()
    await page.getByRole('dialog', { name: `Reactivate key ${keyName}` }).getByRole('button', { name: 'Reactivate key' }).click()
    await expect(keyRow(page, keyName).getByRole('cell', { name: 'Active', exact: true })).toBeVisible()

    await keyAction(page, keyName, 'Rotate')
    await page.getByRole('dialog', { name: `Rotate key ${keyName}` }).getByRole('button', { name: 'Rotate key' }).click()
    await storeSecret(page)
    // The rotated key is revoked and hidden by default; the new one carries the same name.
    await expect(keyRow(page, keyName)).toHaveCount(1)
    await page.getByRole('checkbox', { name: /^Include revoked and expired/ }).check()
    await expect(keyRow(page, keyName)).toHaveCount(2)
    await page.getByRole('checkbox', { name: /^Include revoked and expired/ }).uncheck()

    await keyAction(page, keyName, 'Revoke')
    await page.getByRole('dialog', { name: `Revoke key ${keyName}` }).getByRole('button', { name: 'Revoke key' }).click()
    await expect(page.getByText('No active keys')).toBeVisible()
    await expect(page.getByText('2 revoked or expired keys are hidden.')).toBeVisible()
    expect((await accountKeys(api, account)).map(key => key.status).sort()).toEqual(['revoked', 'revoked'])
  })

  test('edits a key in place, sending only what changed (F-082, F-114)', async ({ page, testData, api }) => {
    const account = await createAccount(api, testData.name('sa-edit'))
    const keyName = testData.name('key')
    const key = await createKey(api, account, keyName)
    const patches: Record<string, unknown>[] = []
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && request.url().endsWith(`/api-keys/${key.id}`)) patches.push(request.postDataJSON() as Record<string, unknown>)
    })

    await page.goto(accountPath(account, 'keys'))
    await keyAction(page, keyName, 'Edit')
    const dialog = page.getByRole('dialog', { name: 'Edit key' })
    await expect(dialog).toContainText(keyName)
    await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await dialog.getByLabel('Description').fill('Nightly export')
    await dialog.getByRole('switch', { name: 'No rate limit' }).click()
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()

    expect(patches).toEqual([{ description: 'Nightly export', rate_limit_per_minute: 0 }])
    await page.getByRole('button', { name: `View key ${keyName}`, exact: true }).click()
    const detail = page.getByTestId('api-key-detail')
    await expect(detail).toContainText('Nightly export')
    await expect(detail).toContainText('No limit')
    await expect(detail).toContainText(account.name)
  })

  test('a key edit that changes the scopes is refused on the field while a flagged scope remains (F-082)', async ({ page, testData, api }) => {
    const account = await createAccount(api, testData.name('sa-flag'))
    const keyName = testData.name('key')
    const key = await createKey(api, account, keyName)
    // The account no longer grants the key's scope: served as granting another one instead, one
    // the admin may grant on either preset.
    const OTHER = 'user:update'
    await page.route(new RegExp(`/integration-principals/${account.id}(\\?.*)?$`), async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const response = await route.fetch()
      await route.fulfill({ response, json: { ...(await response.json() as Account), effective_allowed_scopes: [OTHER] } })
    })
    const patches: unknown[] = []
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && request.url().endsWith(`/api-keys/${key.id}`)) patches.push(request.postDataJSON())
    })

    await page.goto(accountPath(account, 'keys'))
    await keyAction(page, keyName, 'Edit')
    const dialog = page.getByRole('dialog', { name: 'Edit key' })
    const picker = dialog.getByTestId('scope-picker')
    await expect(picker.getByRole('button', { name: `Remove ${SCOPE}`, exact: true })).toContainText('not granted to the account')
    const search = picker.getByRole('textbox', { name: 'Scopes', exact: true })
    await search.fill(OTHER)
    await picker.getByRole('option').first().click()
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    const refusal = `Remove ${SCOPE}: it is not granted to the account.`
    await expect(dialog).toContainText(refusal)
    // The field validates itself again (on blur, and 300 ms after the search was typed). The
    // refusal is a rule of the form, so it is derived again; set once on submit, it was replaced
    // by the schema's pass a moment after it appeared and Save seemed to do nothing.
    await search.focus()
    await search.blur()
    await expect(dialog).toContainText(refusal)
    await expect(dialog).toBeVisible()
    expect(patches).toEqual([])
    // Removing the flagged scope lifts the refusal at once: the picker reports the change.
    await picker.getByRole('button', { name: `Remove ${SCOPE}`, exact: true }).click()
    await expect(dialog).not.toContainText(refusal)
  })

  test('the direct-scope picker offers exactly the scopes the server says the admin may grant (F-079)', async ({ page }) => {
    await serveGrantable(page, { grantable_scopes: ['user:update'], system_allowed_action_prefixes: ['update'] })

    await page.goto('/app/service-accounts')
    await page.getByRole('button', { name: 'New service account' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'New service account' })
    await dialog.getByRole('button', { name: 'Advanced: direct scopes' }).click()
    // The help names the actions the server allows, and the picker offers its list alone: a copy
    // of the default allowlist would offer user:read (and every other readable permission) too.
    await expect(dialog.getByText('You can grant only what you hold whose action is update, and never key or service-account management.')).toBeVisible()
    const permissions = dialog.getByTestId('permission-picker')
    await expect(permissions.getByRole('option')).toHaveCount(1)
    await permissions.getByRole('option').first().click()
    await expect(dialog.getByRole('button', { name: 'Remove user:update', exact: true })).toBeVisible()
  })

  test('roles or direct scopes beyond the grantable set are refused on their field, with no request (F-079)', async ({ page, testData }) => {
    // The server checks the whole envelope (role permissions and direct scopes) on create and on
    // every edit, and its 400 does not name the scope: the dialog names it first.
    await serveGrantable(page, { grantable_scopes: ['user:update'], system_allowed_action_prefixes: ['update'] })
    const writes: string[] = []
    page.on('request', (request) => {
      if (['POST', 'PATCH'].includes(request.method()) && /\/integration-principals(\/[^/]+)?$/.test(new URL(request.url()).pathname)) writes.push(request.method())
    })
    const name = testData.name('sa-beyond')

    await page.goto('/app/service-accounts')
    await page.getByRole('button', { name: 'New service account' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'New service account' })
    await dialog.getByLabel('Name').fill(name)
    await dialog.getByTestId('role-access-editor').getByRole('option').filter({ hasText: ROLE }).first().click()
    await dialog.getByRole('button', { name: 'Create service account' }).click()
    const refusal = dialog.getByText(new RegExp(`^${ROLE} grants .*user:read.*, which you can't grant\\. Remove it, or ask an administrator who can\\.$`))
    await expect(refusal).toBeVisible()
    await expect(dialog).toBeVisible()
    expect(writes).toEqual([])

    // Removing the role lifts the refusal; a grantable direct scope is accepted.
    await dialog.getByRole('button', { name: `Remove ${ROLE}` }).click()
    await expect(refusal).toBeHidden()
    await dialog.getByRole('button', { name: 'Advanced: direct scopes' }).click()
    await dialog.getByTestId('permission-picker').getByRole('option').first().click()
    await dialog.getByRole('button', { name: 'Create service account' }).click()
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
    expect(writes).toEqual(['POST'])
  })

  test('an edit, even a rename, of an account carrying scopes the admin cannot grant is refused before the request (F-079)', async ({ page, testData, api }) => {
    const account = await createAccount(api, testData.name('sa-rename'))
    await serveGrantable(page, { grantable_scopes: ['user:update'], system_allowed_action_prefixes: ['update'] })
    const patches: unknown[] = []
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && new URL(request.url()).pathname.endsWith(`/integration-principals/${account.id}`)) patches.push(request.postDataJSON())
    })

    await page.goto(accountPath(account))
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const edit = page.getByRole('dialog', { name: 'Edit service account' })
    await edit.getByLabel('Name').fill(`${account.name}-renamed`)
    await edit.getByRole('button', { name: 'Save changes' }).click()
    // The refused direct scope is in the Advanced section, open and named.
    await expect(edit.getByText(`You can't grant ${SCOPE}. Remove it, or ask an administrator who can.`)).toBeVisible()
    await expect(edit.getByRole('button', { name: 'Hide direct scopes' })).toBeVisible()
    expect(patches).toEqual([])
  })

  test('a failed read of the grantable scopes is said in place, with Retry; the picker offers nothing meanwhile (F-079)', async ({ page, errorGuard }) => {
    let fail = true
    errorGuard.allow({ kind: 'api', status: 500, url: GRANTABLE })
    await page.route(GRANTABLE, async (route) => {
      if (fail) return route.fulfill(jsonResponse(500, { error: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' }))
      return route.continue()
    })

    await page.goto('/app/service-accounts')
    await page.getByRole('button', { name: 'New service account' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'New service account' })
    await dialog.getByRole('button', { name: 'Advanced: direct scopes' }).click()
    const alert = dialog.getByTestId('direct-scopes-error')
    await expect(alert).toContainText('Could not load the scopes you can grant')
    // Fail closed: nothing is offered from a guess.
    await expect(dialog.getByTestId('permission-picker').getByRole('option')).toHaveCount(0)
    fail = false
    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(alert).toBeHidden()
    await expect(dialog.getByTestId('permission-picker').getByRole('option').first()).toBeVisible()
  })

  test('a refused read of the grantable scopes says direct scopes are not the admin\'s to give, without Retry (F-079)', async ({ page, errorGuard }) => {
    errorGuard.allow({ kind: 'api', status: 403, url: GRANTABLE })
    await page.route(GRANTABLE, route => route.fulfill(jsonResponse(403, { error: 'HTTP_ERROR', message: 'Superuser privileges required', details: { detail: 'Superuser privileges required' } })))

    await page.goto('/app/service-accounts')
    await page.getByRole('button', { name: 'New service account' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'New service account' })
    await dialog.getByRole('button', { name: 'Advanced: direct scopes' }).click()
    const denied = dialog.getByTestId('direct-scopes-denied')
    await expect(denied).toContainText('You can\'t grant direct scopes here')
    await expect(denied).toContainText('Superuser privileges required')
    await expect(denied.getByRole('button', { name: 'Retry' })).toHaveCount(0)
    await expect(dialog.getByTestId('permission-picker').getByRole('option')).toHaveCount(0)
  })

  test('a new key offers the account\'s scopes that the admin may grant, nothing else (F-079)', async ({ page, testData, api }) => {
    const account = await createAccount(api, testData.name('sa-key-grant'), undefined, { allowed_scopes: [SCOPE, 'user:update'] })
    await serveGrantable(page, { grantable_scopes: [SCOPE], system_allowed_action_prefixes: ['read'] })
    const keyPosts: Record<string, unknown>[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith(`/integration-principals/${account.id}/api-keys`)) keyPosts.push(request.postDataJSON() as Record<string, unknown>)
    })

    await page.goto(accountPath(account, 'keys'))
    await page.getByRole('button', { name: 'New key' }).click()
    const keyDialog = page.getByRole('dialog', { name: 'New key' })
    const picker = keyDialog.getByTestId('scope-picker')
    // user:update is the account's but not the admin's to give.
    await expect(picker.getByRole('option')).toHaveCount(1)
    await keyDialog.getByLabel('Name').fill(testData.name('key'))
    await picker.getByRole('option').first().click()
    await keyDialog.getByRole('button', { name: 'Create key' }).click()
    await storeSecret(page)
    expect(keyPosts).toEqual([expect.objectContaining({ scopes: [SCOPE] })])
  })

  test('archiving an active account says how many live keys go, then revokes each of them', async ({ page, testData, api }) => {
    const name = testData.name('sa-archive')
    const account = await createAccount(api, name)
    await createKey(api, account, testData.name('key-a'))
    const suspended = await createKey(api, account, testData.name('key-b'))
    await api.patch(`${base()}/${account.id}/api-keys/${suspended.id}`, { status: 'suspended' })

    await page.goto(accountPath(account))
    await page.getByRole('button', { name: 'More service account actions' }).click()
    await page.getByRole('menuitem', { name: 'Archive' }).click()
    const archive = page.getByRole('dialog', { name: `Archive service account ${name}` })
    await expect(archive.getByTestId('confirm-effects')).toContainText('Its 2 active or suspended keys are revoked immediately')
    await archive.getByLabel(`Type ${name} to confirm`).fill(name)
    await archive.getByRole('button', { name: 'Archive service account' }).click()
    await expect(page.getByTestId('service-account-locked')).toBeVisible()
    expect((await api.get<Account>(`${base()}/${account.id}`)).status).toBe('archived')
    expect((await accountKeys(api, account)).map(key => key.status)).toEqual(['revoked', 'revoked'])
  })

  test('edits only what changed, then deactivation revokes every key and archive locks the account', async ({ page, testData, api }) => {
    const name = testData.name('sa-life')
    const account = await createAccount(api, name)
    await createKey(api, account, testData.name('key-a'))
    await createKey(api, account, testData.name('key-b'))
    const patches: Record<string, unknown>[] = []
    await page.route(new RegExp(`/integration-principals/${account.id}$`), async (route) => {
      if (route.request().method() === 'PATCH') patches.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fallback()
    })

    await page.goto(accountPath(account))
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const edit = page.getByRole('dialog', { name: 'Edit service account' })
    await expect(edit.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await edit.getByLabel('Description').fill('Nightly export')
    await edit.getByRole('button', { name: 'Save changes' }).click()
    await expect(edit).toBeHidden()
    await expect(page.getByText('Nightly export')).toBeVisible()
    expect(patches).toEqual([{ description: 'Nightly export' }])

    await page.getByRole('button', { name: 'More service account actions' }).click()
    await page.getByRole('menuitem', { name: 'Deactivate' }).click()
    const deactivate = page.getByRole('dialog', { name: `Deactivate service account ${name}` })
    await expect(deactivate.getByTestId('confirm-effects')).toContainText('Its 2 active or suspended keys are revoked immediately')
    await deactivate.getByRole('button', { name: 'Deactivate service account' }).click()
    await expect(page.getByTestId('service-account-inactive')).toBeVisible()
    expect((await accountKeys(api, account)).map(key => key.status)).toEqual(['revoked', 'revoked'])

    await page.getByRole('button', { name: 'More service account actions' }).click()
    await page.getByRole('menuitem', { name: 'Reactivate' }).click()
    await page.getByRole('dialog', { name: `Reactivate service account ${name}` }).getByRole('button', { name: 'Reactivate service account' }).click()
    await expect(page.getByTestId('service-account-inactive')).toBeHidden()

    await page.getByRole('button', { name: 'More service account actions' }).click()
    await page.getByRole('menuitem', { name: 'Archive' }).click()
    const archive = page.getByRole('dialog', { name: `Archive service account ${name}` })
    await expect(archive.getByTestId('confirm-effects')).toContainText('no active or suspended keys')
    await archive.getByLabel(`Type ${name} to confirm`).fill(name)
    await archive.getByRole('button', { name: 'Archive service account' }).click()
    await expect(page.getByTestId('service-account-locked')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'More service account actions' })).toHaveCount(0)
    expect((await api.get<Account>(`${base()}/${account.id}`)).status).toBe('archived')
  })

  test('the list searches on the server, filters by status and keeps both in the URL', async ({ page, testData, api }) => {
    const marker = testData.name('sa-list')
    const active = await createAccount(api, `${marker}-on`)
    const inactive = await createAccount(api, `${marker}-off`)
    await api.patch(`${base()}/${inactive.id}`, { status: 'inactive' })

    await page.goto('/app/service-accounts')
    await page.getByRole('searchbox', { name: 'Search service accounts' }).fill(marker)
    await expect(page).toHaveURL(/[?&]q=/)
    await expect(page.getByRole('link', { name: active.name, exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: inactive.name, exact: true })).toHaveCount(0)
    await expect(page.getByText('1 service account')).toBeVisible()

    await chooseSelect(page, field(page, 'Filter by status'), 'Deactivated')
    await expect(page.getByRole('link', { name: inactive.name, exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: active.name, exact: true })).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('link', { name: inactive.name, exact: true })).toBeVisible()
    await expect(page.getByLabel('Filter by status', { exact: true })).toContainText('Deactivated')

    // Rows open the account; Back returns to the filtered list.
    await page.getByRole('link', { name: inactive.name, exact: true }).click()
    await expect(page.getByRole('heading', { name: inactive.name, exact: true })).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/status=inactive/)
  })

  test('the account page, its tabs and dialogs have no a11y violations', async ({ page, testData, api }) => {
    const account = await createAccount(api, testData.name('sa-a11y'))
    await createKey(api, account, testData.name('key'))
    // color-contrast is out of this gate, as in the a11y smoke (F-032, an accepted limitation).
    // The role and permission pickers' option lists (UCommandPalette's inner Reka listbox) are
    // left out: Nuxt UI gives a consumer no way to name that listbox, and it scrolls with the
    // keyboard through its search box rather than by tabbing in. Follow-up, not this page's.
    const axe = async () => (await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .exclude('[role="listbox"][aria-multiselectable="true"]')
      .analyze())
      .violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target.join(' ')) }))
    for (const tab of ['overview', 'access', 'keys']) {
      await page.goto(accountPath(account, tab))
      await expect(page.getByRole('heading', { name: account.name, exact: true })).toBeVisible()
      await page.waitForLoadState('networkidle')
      expect(await axe(), tab).toEqual([])
    }
    await page.getByRole('button', { name: 'New key' }).click()
    await expect(page.getByRole('dialog', { name: 'New key' })).toBeVisible()
    expect(await axe(), 'new key dialog').toEqual([])
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Edit service account' })).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(await axe(), 'edit dialog').toEqual([])
  })

  test('a malformed or unknown account link reads "not found" without a refused request', async ({ page }) => {
    await page.goto('/app/service-accounts/not-a-uuid')
    await expect(page.getByText('Service account not found')).toBeVisible()
  })
})

test.describe('service accounts at an entity (EnterpriseRBAC)', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ errorGuardMode: 'strict' })

  test.beforeEach(async ({ requires }) => {
    await requires({ preset: 'EnterpriseRBAC', surfaces: ['integration_principals', 'api_key_admin'] })
  })

  test('a superuser picks an entity, creates an account there and the inventory filters and revokes its key', async ({ page, testData, api }) => {
    const entity = await api.createEntity({ kind: 'sa-org' })
    const posts: Record<string, unknown>[] = []
    await page.route(new RegExp(`/admin/entities/${entity.id}/integration-principals$`), async (route) => {
      if (route.request().method() === 'POST') posts.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fallback()
    })

    await page.goto('/app/service-accounts')
    await chooseSelect(page, field(page, 'Scope'), 'Entity')
    await expect(page.getByText('Choose an entity', { exact: true }).first()).toBeVisible()
    await pickEntity(page, page.getByRole('button', { name: 'Entity', exact: true }), entity.display_name, { search: true })
    await expect(page).toHaveURL(new RegExp(`scope=entity.*entity=${entity.id}|entity=${entity.id}.*scope=entity`))
    await expect(page.getByText('No active service accounts')).toBeVisible()

    const name = testData.name('sa-entity')
    await page.getByRole('button', { name: 'New service account' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'New service account' })
    await expect(dialog).toContainText(`Anchored at ${entity.display_name}`)
    await dialog.getByLabel('Name').fill(name)
    await dialog.getByRole('switch', { name: 'Includes child entities' }).click()
    await dialog.getByRole('button', { name: 'Advanced: direct scopes' }).click()
    await dialog.getByPlaceholder('Search permissions...').fill(SCOPE)
    const permissions = dialog.getByTestId('permission-picker')
    // The superuser's options come from the catalog (display names): the exact name ranks first.
    await permissions.getByRole('option').first().click()
    await expect(dialog.getByRole('button', { name: `Remove ${SCOPE}`, exact: true })).toBeVisible()
    // Key and service-account management are never offered as direct scopes.
    await dialog.getByPlaceholder('Search permissions...').fill('api_key')
    await expect(permissions.getByRole('option')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Create service account' }).click()
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
    expect(posts).toEqual([expect.objectContaining({ name, allowed_scopes: [SCOPE], role_ids: [], inherit_from_tree: true })])
    await expect(page).toHaveURL(new RegExp(`entity=${entity.id}`))
    await expect(page.getByText(entity.display_name).first()).toBeVisible()

    // A key, then the entity's inventory (from Back to the list).
    const [account] = (await api.get<Page_<Account>>(base(entity.id), { query: { search: name } })).items
    const keyName = testData.name('entity-key')
    const key = await createKey(api, account!, keyName)
    await page.goto(`/app/service-accounts?scope=entity&entity=${entity.id}`)
    await page.getByRole('link', { name: 'Key inventory' }).click()
    await expect(page).toHaveURL(/view=inventory/)
    await expect(keyRow(page, keyName)).toBeVisible()
    // The Owner column names the account that holds the key and links to its page.
    const ownerHref = new RegExp(`/app/service-accounts/${account!.id}\\?entity=${entity.id}`)
    await expect(keyRow(page, keyName).getByRole('link', { name, exact: true })).toHaveAttribute('href', ownerHref)
    // So does the key's detail, as who the key acts as (v-keys-audit-03).
    await page.getByRole('button', { name: `View key ${keyName}`, exact: true }).click()
    const detail = page.getByRole('dialog', { name: keyName })
    await expect(detail.getByText('Acts as', { exact: true })).toBeVisible()
    await expect(detail.getByRole('link', { name, exact: true })).toHaveAttribute('href', ownerHref)
    await page.keyboard.press('Escape')
    await expect(detail).toBeHidden()

    await chooseSelect(page, field(page, 'Filter by kind'), 'Personal')
    await expect(page.getByText('No keys match')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show all statuses' })).toBeVisible()
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(keyRow(page, keyName)).toBeVisible()

    await page.getByRole('button', { name: `Key actions for ${keyName}`, exact: true }).click()
    await page.getByRole('menuitem', { name: 'Revoke' }).click()
    await page.getByRole('dialog', { name: `Revoke key ${keyName}` }).getByRole('button', { name: 'Revoke key' }).click()
    await expect(page.getByText('No active keys here')).toBeVisible()
    const revoked = await api.get<Key>(`/admin/entities/${entity.id}/api-keys/${key.id}`)
    expect(revoked.status).toBe('revoked')
    // The empty default view widens to every status in one click (v-keys-audit-01).
    await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Show all statuses' }).click()
    await expect(page).toHaveURL(/[?&]kstatus=all(&|$)/)
    await expect(field(page, 'Filter by status')).toHaveText('All statuses')
    await expect(keyRow(page, keyName).getByTestId('api-key-status').filter({ visible: true })).toContainText('Revoked')
  })

  // Below md the Owner column is hidden: the row names the owner under the key, and the detail
  // names who the key acts as (v-keys-audit-03).
  test('at 390px the inventory names each key\'s owner in the row and in the key detail', async ({ page, testData, api }) => {
    const entity = await api.createEntity({ kind: 'sa-owner' })
    const account = await createAccount(api, testData.name('sa-owner'), entity.id)
    const keyName = testData.name('owner-key')
    await createKey(api, account, keyName)
    const ownerHref = new RegExp(`/app/service-accounts/${account.id}\\?entity=${entity.id}`)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/app/service-accounts?scope=entity&entity=${entity.id}&view=inventory`)
    const row = keyRow(page, keyName)
    await expect(row).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Owner' })).toBeHidden()
    const ownerLine = row.getByTestId('key-owner-line')
    await expect(ownerLine).toBeVisible()
    await expect(ownerLine).toHaveText(`Owner: ${account.name}`)
    await expect(ownerLine.getByRole('link', { name: account.name, exact: true })).toHaveAttribute('href', ownerHref)

    await row.getByRole('button', { name: `View key ${keyName}`, exact: true }).click()
    const detail = page.getByRole('dialog', { name: keyName })
    await expect(detail.getByText('Acts as', { exact: true })).toBeVisible()
    await expect(detail.getByRole('link', { name: account.name, exact: true })).toHaveAttribute('href', ownerHref)
    // No horizontal page scroll.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })

  test('the entity page links to its service accounts', async ({ page, api }) => {
    const entity = await api.createEntity({ kind: 'sa-link' })
    await page.goto(`/app/entities?entity=${entity.id}`)
    const integrations = page.getByTestId('entity-integrations')
    await expect(integrations).toContainText('Active service accounts')
    await expect(integrations).toContainText('Active keys anchored here')
    await page.getByRole('link', { name: 'Manage' }).click()
    await expect(page).toHaveURL(new RegExp(`/app/service-accounts\\?scope=entity&entity=${entity.id}$`))
    await expect(page.getByLabel('Entity', { exact: true })).toContainText(entity.display_name)
    await expect(page.getByText('No active service accounts')).toBeVisible()
  })

  test('an entity account opens with its anchor; without it the link is not found', async ({ page, testData, api, errorGuard }) => {
    const entity = await api.createEntity({ kind: 'sa-anchor' })
    const account = await createAccount(api, testData.name('sa-anchored'), entity.id)
    await page.goto(accountPath(account))
    await expect(page.getByRole('heading', { name: account.name, exact: true })).toBeVisible()
    await expect(page.getByText(entity.display_name)).toBeVisible()
    // The same id without its anchor is a platform-wide address: not found there.
    errorGuard.allow({ kind: 'api', status: 404, url: new RegExp(`/admin/system/integration-principals/${account.id}$`) })
    errorGuard.allow({ kind: 'console', console: /404/ })
    await page.goto(`/app/service-accounts/${account.id}`)
    await expect(page.getByText('Service account not found')).toBeVisible()
  })
})
