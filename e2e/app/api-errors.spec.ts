import type { Page, Route } from '@playwright/test'
import { TEST_PASSWORD } from '../support/api-client'
import { backendConfigured, expect, persona, test } from '../support/fixtures'
import { corsHeaders, jsonResponse } from '../support/mocks'
import { chooseSelect, field } from '../support/ui-select'
import { searchUsersList } from '../support/lists'
import { createApiKeyButton, grantableScope, pickScope } from '../support/api-keys'

// The error model end to end (F-117, F-118, F-119, F-120): a successful write is never reported
// as failed because the refetch after it failed (and a one-time secret survives), server
// validation lands on the offending fields with every problem listed in the dialog, and a
// delegation denial names the permissions the admin may not grant. Real API answers where the
// seed can produce them; route mocks mirror the backend's exact envelopes otherwise.

test.use({ errorGuardMode: 'strict' })

const LIST_FAILURE = { error: 'INTERNAL_SERVER_ERROR', message: 'Internal server error', details: {} }

// After the write succeeds, the list refetch fails (500 is not retried); everything else goes
// through. `fallback` lets both handlers see requests when the list and the write share a URL.
async function failListRefetchAfter(page: Page, list: RegExp, write: RegExp) {
  let written = false
  await page.route(write, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const response = await route.fetch()
    written = response.ok()
    return route.fulfill({ response })
  })
  await page.route(list, async (route: Route) => {
    if (route.request().method() === 'GET' && written) return route.fulfill(jsonResponse(500, LIST_FAILURE))
    return route.fallback()
  })
}

// UForm re-validates a blurred field 300 ms (validateOnInputDelay) after its last keystroke, and
// the local API answers faster than that. The specs below submit straight after typing, so each
// server error must outlive that re-validation; waiting this long proves it did.
const PAST_INPUT_VALIDATION_MS = 600

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test.describe('a failed refetch never fails the write (F-120)', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('creating an API key still shows its secret when the list cannot reload', async ({ page, requires, errorGuard, testData, api }) => {
    await requires({ surfaces: ['api_keys'] })
    errorGuard.allow({ kind: 'api', status: 500, url: /\/api-keys\/$/ })
    errorGuard.allow({ kind: 'console', console: /500/ })
    const scope = await grantableScope(api)
    test.skip(!scope, 'The admin persona has no grantable API key scope.')
    const name = testData.name('key')

    const failedRefetch = page.waitForResponse(r => /\/api-keys\/$/.test(r.url()) && r.request().method() === 'GET' && r.status() === 500)
    await failListRefetchAfter(page, /\/api-keys\/$/, /\/api-keys\/$/)
    await page.goto('/app/api-keys')
    await createApiKeyButton(page).click()
    await page.getByLabel('Name', { exact: true }).fill(name)
    await pickScope(page.getByRole('dialog', { name: 'Create personal API key' }), scope!)
    await page.getByRole('button', { name: 'Create key' }).click()

    // The refetch after the write really failed, and the write is still reported as done.
    await failedRefetch
    await expect(page.getByText('Store the new API key now')).toBeVisible()
    await expect(page.getByLabel('API key secret')).toHaveValue(/\S+/)
    await expect(page.getByText('API key created', { exact: true })).toBeVisible()
    await expect(page.getByText('Could not create API key')).toHaveCount(0)
  })

  test('rotating an API key still shows the new secret when the list cannot reload', async ({ page, requires, errorGuard, testData, api }) => {
    await requires({ surfaces: ['api_keys'] })
    errorGuard.allow({ kind: 'api', status: 500, url: /\/api-keys\/$/ })
    errorGuard.allow({ kind: 'console', console: /500/ })
    const [scope] = await api.grantableScopes()
    test.skip(!scope, 'The admin persona has no grantable API key scope.')
    const name = testData.name('key')
    await api.post('/api-keys/', { name, scopes: [scope], key_kind: 'personal', rate_limit_per_minute: 60 })

    const failedRefetch = page.waitForResponse(r => /\/api-keys\/$/.test(r.url()) && r.request().method() === 'GET' && r.status() === 500)
    await failListRefetchAfter(page, /\/api-keys\/$/, /\/api-keys\/[^/]+\/rotate$/)
    await page.goto('/app/api-keys')
    await page.getByRole('row').filter({ hasText: name }).getByRole('button', { name: 'API key actions' }).click()
    await page.getByRole('menuitem', { name: 'Rotate' }).click()
    await page.getByRole('button', { name: 'Rotate key' }).click()

    await failedRefetch
    await expect(page.getByText('Store the new API key now')).toBeVisible()
    await expect(page.getByLabel('API key secret')).toHaveValue(/\S+/)
    await expect(page.getByText('API key rotated', { exact: true })).toBeVisible()
    await expect(page.getByText('Could not rotate API key')).toHaveCount(0)
  })
})

test.describe('server validation lands on the fields (F-118)', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  async function openCreateUser(page: Page) {
    await page.goto('/app/users')
    await page.getByRole('button', { name: 'Add user' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add user' })
    await expect(dialog).toBeVisible()
    return dialog
  }

  test('every 422 issue is shown: on its field when one matches, listed in the dialog otherwise', async ({ page, errorGuard, testData }) => {
    errorGuard.allow({ kind: 'api', status: 422, url: /\/users\/$/ })
    errorGuard.allow({ kind: 'console', console: /422/ })
    await page.route(/\/users\/$/, async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      return route.fulfill(jsonResponse(422, {
        error: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: {
          errors: [
            { type: 'value_error', loc: ['body', 'email'], msg: 'value is not a valid email address: The domain name is not accepted.' },
            { type: 'value_error', loc: ['body', 'password'], msg: 'Value error, Password is too common' },
            { type: 'dict_type', loc: ['body', 'metadata'], msg: 'Input should be a valid dictionary' },
            { type: 'string_type', loc: ['body', 'locale'], msg: 'Input should be a valid string' }
          ]
        }
      }))
    })

    const dialog = await openCreateUser(page)
    await dialog.getByLabel('Email').fill(testData.email('user'))
    await dialog.getByLabel('Initial password').fill(TEST_PASSWORD)
    await dialog.getByLabel('Confirm password').fill(TEST_PASSWORD)
    await dialog.getByRole('button', { name: 'Create user' }).click()

    // Matched issues sit on their fields, without Pydantic's prefixes or wire names.
    await expect(dialog.getByText('Value is not a valid email address: The domain name is not accepted.')).toBeVisible()
    await expect(dialog.getByText('Password is too common', { exact: true })).toBeVisible()
    await expect(dialog.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog.getByLabel('Initial password')).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog.getByLabel('Email')).toBeFocused()

    // The rest is listed in the dialog's alert, which stays until the next submit.
    const alert = dialog.getByRole('alert').filter({ hasText: 'Could not create user' })
    await expect(alert).toContainText('Check the highlighted fields and the problems listed here.')
    await expect(alert).toContainText('Metadata: Input should be a valid dictionary')
    await expect(alert).toContainText('Locale: Input should be a valid string')
    // The dialog is the error surface; no toast repeats it.
    await expect(page.getByText('Could not create user', { exact: true })).toHaveCount(1)
    await expect(dialog).toBeVisible()
  })

  test('a password the API refuses is shown on the password field', async ({ page, errorGuard, testData }) => {
    errorGuard.allow({ kind: 'api', status: 400, url: /\/users\/$/ })
    errorGuard.allow({ kind: 'console', console: /400/ })
    // The form checks the default policy itself; a host with a stricter one refuses on the server.
    // This is the example backend's answer for a password outside its policy.
    await page.route(/\/users\/$/, async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      return route.fulfill(jsonResponse(400, {
        error: 'INVALID_PASSWORD',
        message: 'Password must contain at least one uppercase letter',
        details: { password_requirements: { min_length: 8, require_uppercase: true, require_digit: true, require_special_char: true } }
      }))
    })
    const dialog = await openCreateUser(page)
    await dialog.getByLabel('Email').fill(testData.email('user'))
    // Long enough, but without the upper case, digit and symbol the policy asks for: the form
    // says so before anything is sent.
    await dialog.getByLabel('Initial password').fill('lowercaseonlypassword')
    await dialog.getByLabel('Confirm password').fill('lowercaseonlypassword')
    await dialog.getByRole('button', { name: 'Create user' }).click()
    await expect(dialog.getByLabel('Initial password')).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog.getByText('Add an uppercase letter.')).toBeVisible()

    await dialog.getByLabel('Initial password').fill(TEST_PASSWORD)
    await dialog.getByLabel('Confirm password').fill(TEST_PASSWORD)
    await dialog.getByRole('button', { name: 'Create user' }).click()
    await expect(dialog.getByLabel('Initial password')).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog.getByText(/^Password must (contain|be)/)).toBeVisible()
    await page.waitForTimeout(PAST_INPUT_VALIDATION_MS)
    await expect(dialog.getByLabel('Initial password')).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog.getByText(/^Password must (contain|be)/)).toBeVisible()
    await expect(dialog.getByRole('alert').filter({ hasText: 'Could not create user' })).toContainText('Check the highlighted fields.')
    await expect(dialog).toBeVisible()
  })

  test('a duplicate email is shown on the email field and the dialog stays open', async ({ page, errorGuard }) => {
    errorGuard.allow({ kind: 'api', status: 409, url: /\/users\/$/ })
    errorGuard.allow({ kind: 'console', console: /409/ })
    const existing = persona('admin').email
    const dialog = await openCreateUser(page)
    await dialog.getByLabel('Email').fill(existing)
    await dialog.getByLabel('Initial password').fill(TEST_PASSWORD)
    await dialog.getByLabel('Confirm password').fill(TEST_PASSWORD)
    await dialog.getByRole('button', { name: 'Create user' }).click()

    await expect(dialog.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog.getByText(new RegExp(`${escapeRegExp(existing)} already exists`, 'i'))).toBeVisible()
    await expect(dialog).toBeVisible()
  })

  test('retyping the email and pressing Enter at once keeps the new answer on the field', async ({ page, api, errorGuard }) => {
    errorGuard.allow({ kind: 'api', status: 409, url: /\/users\/$/ })
    errorGuard.allow({ kind: 'console', console: /409/ })
    const other = await api.createUser()
    const dialog = await openCreateUser(page)
    const email = dialog.getByLabel('Email')
    await email.fill(persona('admin').email)
    await dialog.getByLabel('Initial password').fill(TEST_PASSWORD)
    await dialog.getByLabel('Confirm password').fill(TEST_PASSWORD)
    await dialog.getByRole('button', { name: 'Create user' }).click()
    await expect(email).toHaveAttribute('aria-invalid', 'true')

    // The usual correction: the field has focus, type another address and resubmit with Enter.
    await expect(email).toBeFocused()
    await email.fill(other.email)
    await email.press('Enter')
    const message = dialog.getByText(new RegExp(`${escapeRegExp(other.email)} already exists`, 'i'))
    await expect(message).toBeVisible()
    // UForm's re-validation of the typed value has run by now; the answer is still on the field.
    await page.waitForTimeout(PAST_INPUT_VALIDATION_MS)
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    await expect(message).toBeVisible()
    await expect(dialog.getByRole('alert').filter({ hasText: 'Could not create user' })).toContainText('Check the highlighted fields.')

    // Editing the value hands the field back to the form's own validation.
    await email.fill('someone-new@example.com')
    await expect(email).toHaveAttribute('aria-invalid', 'false')
    await expect(message).toHaveCount(0)
  })
})

test.describe('server validation on an ABAC condition (F-118)', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('a problem with one member of the value lands on the Value field', async ({ page, api, requires, errorGuard }) => {
    await requires({ features: ['abac'] })
    errorGuard.allow({ kind: 'api', status: 422, url: /\/conditions$/ })
    errorGuard.allow({ kind: 'console', console: /422/ })
    const permission = await api.createPermission()
    // Pydantic reports a union member under the field (value.str); the dialog maps it by the field.
    await page.route(/\/conditions$/, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      return route.fulfill(jsonResponse(422, {
        error: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: {
          errors: [
            { type: 'string_type', loc: ['body', 'value', 'str'], msg: 'Input should be a valid string' },
            { type: 'extra_forbidden', loc: ['body', 'context_hint'], msg: 'Extra inputs are not permitted' }
          ]
        }
      }))
    })

    await page.goto(`/app/permissions/${permission.id}`)
    await page.getByRole('button', { name: 'Add condition' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Add condition' })).toBeVisible()
    await chooseSelect(page, field(page, 'Context'), 'resource')
    await dialog.getByLabel('Attribute', { exact: true }).fill('department')
    await page.getByLabel('Operator', { exact: true }).click()
    await page.getByRole('option').filter({ has: page.getByText('equals', { exact: true }) }).click()
    const value = dialog.getByLabel('Value', { exact: true })
    await value.fill('sales')
    await value.press('Enter')

    await expect(value).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog.getByText('Input should be a valid string', { exact: true })).toBeVisible()
    const alert = dialog.getByRole('alert').filter({ hasText: 'Could not add condition' })
    await expect(alert).toContainText('Check the highlighted fields and the problems listed here.')
    await expect(alert).toContainText('Context hint: Extra inputs are not permitted')
    await page.waitForTimeout(PAST_INPUT_VALIDATION_MS)
    await expect(value).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('Could not add condition', { exact: true })).toHaveCount(1)
  })
})

test.describe('a delegation denial names what was denied (F-119)', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('the invite dialog lists the missing permissions and the role that carries them', async ({ page, requires, errorGuard, api, testData }) => {
    await requires({ features: ['invitations'] })
    errorGuard.allow({ kind: 'api', status: 403, url: /\/auth\/invite$/ })
    errorGuard.allow({ kind: 'console', console: /403/ })
    // A global role the invite can attach; the denial below names its permission.
    const roleName = testData.displayName('role')
    await api.createRole({ display_name: roleName, permissions: ['user:read'] })

    // The body the API sends when an admin grants a role carrying permissions they do not hold
    // (routers/_authz_utils.py require_can_delegate_permissions), captured from the backend.
    await page.route(/\/auth\/invite$/, async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      return route.fulfill(jsonResponse(403, {
        error: 'PERMISSION_DENIED',
        message: 'You cannot grant permissions you do not hold',
        details: { missing_permissions: ['user:read'] }
      }))
    })

    await page.goto('/app/users')
    await page.getByRole('button', { name: 'Invite', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Invite user' })
    await dialog.getByLabel('Email').fill(testData.email('invite'))
    await dialog.getByPlaceholder('Search roles...').fill(roleName)
    await dialog.getByRole('option', { name: new RegExp(roleName) }).click()

    const permissionsRefetch = page.waitForRequest(request => request.method() === 'GET' && /\/permissions\/me$/.test(request.url()))
    await dialog.getByRole('button', { name: 'Send invite' }).click()

    const alert = dialog.getByRole('alert').filter({ hasText: 'Could not send invitation' })
    await expect(alert).toContainText('You cannot grant permissions you do not hold.')
    await expect(alert.getByLabel('Missing permissions').getByText('user:read', { exact: true })).toBeVisible()
    await expect(alert).toContainText(`Granted through ${roleName}.`)
    await expect(dialog).toBeVisible()
    // A denial may mean the admin's own access changed: their permissions are reloaded.
    await permissionsRefetch
  })
})

test.describe('a record that no longer exists (F-117)', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('deleting a user removed elsewhere closes the confirmation and says it is gone', async ({ page, api, errorGuard }) => {
    errorGuard.allow({ kind: 'api', status: 404, url: /\/users\/[^/]+$/ })
    errorGuard.allow({ kind: 'console', console: /404/ })
    const user = await api.createUser()
    // Another admin removed it between the list load and the confirmation.
    await page.route(new RegExp(`/users/${user.id}$`), async (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback()
      return route.fulfill(jsonResponse(404, { error: 'USER_NOT_FOUND', message: 'User not found', details: {} }))
    })

    await page.goto('/app/users')
    await searchUsersList(page, user.email)
    await page.getByRole('row').filter({ hasText: user.email }).getByRole('button', { name: 'User actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    const dialog = page.getByRole('dialog', { name: `Delete user ${user.email}` })
    await dialog.getByLabel(`Type ${user.email} to confirm`).fill(user.email)
    await dialog.getByRole('button', { name: 'Delete user' }).click()

    await expect(dialog).toBeHidden()
    await expect(page.getByText('Could not delete user', { exact: true })).toBeVisible()
    await expect(page.getByText('User not found. It may have been deleted, or you no longer have access to it.', { exact: true })).toBeVisible()
  })
})

test.describe('refusals keep the dialog and say why (F-147)', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  async function openAddRole(page: Page) {
    await page.goto('/app/roles')
    await page.getByRole('button', { name: 'Add role', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Add role' })
    await expect(dialog).toBeVisible()
    return dialog
  }

  test('a role name already taken is shown on the Name field and nothing is lost', async ({ page, api, errorGuard, testData }) => {
    errorGuard.allow({ status: 422, url: /\/roles\/$/ })
    const existing = await api.createRole({ kind: 'dup' })
    const dialog = await openAddRole(page)
    const displayName = testData.displayName('dup-again')
    await dialog.getByLabel('Display name', { exact: true }).fill(displayName)
    await dialog.getByLabel('Name', { exact: true }).fill(existing.name)
    await dialog.getByRole('button', { name: 'Create role' }).click()
    await expect(dialog.getByText(/already exists/).first()).toBeVisible()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Display name', { exact: true })).toHaveValue(displayName)
  })

  test('a rate-limited create says how long to wait and keeps the dialog open', async ({ page, errorGuard, testData }) => {
    errorGuard.allow({ status: 429, url: /\/roles\/$/ })
    await page.route(/\/roles\/$/, route => route.request().method() === 'POST'
      ? route.fulfill({
          status: 429,
          headers: { ...corsHeaders(), 'Retry-After': '30', 'Access-Control-Expose-Headers': 'Retry-After' },
          contentType: 'application/json',
          body: JSON.stringify({ error: 'RATE_LIMITED', message: 'Too many requests', details: { retry_after_seconds: 30 } })
        })
      : route.fallback())
    const dialog = await openAddRole(page)
    const displayName = testData.displayName('limited')
    await dialog.getByLabel('Display name', { exact: true }).fill(displayName)
    await dialog.getByRole('button', { name: 'Create role' }).click()
    await expect(page.getByText('Too many requests. Try again in 30 seconds.').first()).toBeVisible()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Display name', { exact: true })).toHaveValue(displayName)
  })
})
