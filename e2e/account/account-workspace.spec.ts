import type { BrowserContext, Page, Request } from '@playwright/test'
import { backendConfigured, expect, persona, test } from '../support/fixtures'
import { TEST_PASSWORD } from '../support/api-client'
import { withPasswordPolicy } from '../support/capabilities'
import { apiUrl } from '../support/env'
import { corsHeaders } from '../support/mocks'
import { mintAnotherSession, mintFreshSession } from '../support/sessions'

// Account (WP-19): the tabs, the overview, the names form and the phone number. Profile writes
// run as fresh run-marked users with their own session (never the shared personas); the
// rendering checks use the admin persona read-only.

const BOOT = { timeout: 30_000 }

const isPatchMe = (request: Request) => request.method() === 'PATCH' && request.url() === apiUrl('/users/me')
const isChangePassword = (request: Request) => request.method() === 'POST' && request.url() === apiUrl('/users/me/change-password')

// After a password change the console signs in again with the new password. Password logins
// share one small per-IP limiter across the run, so that sign-in is answered with a session the
// backend mints for the same user right then (no password login where the dev magic-link capture
// exists), and the request itself is kept for the test to check.
async function answerSignInAgain(context: BrowserContext, user: { email: string }, password: string) {
  const bodies: Array<Record<string, unknown>> = []
  await context.route(apiUrl('/auth/login'), async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    bodies.push(route.request().postDataJSON() as Record<string, unknown>)
    return route.fulfill({ json: await mintAnotherSession(user, password) })
  })
  return bodies
}

function tabs(page: Page) {
  return page.getByRole('navigation', { name: 'Account sections' })
}

test.describe('account workspace', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ errorGuardMode: 'strict' })

  test('opens on Profile with the overview, and lists the account tabs', async ({ page }) => {
    const admin = persona('admin')
    await page.goto('/app/account')
    await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible()
    await expect(tabs(page).getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page')
    await expect(tabs(page).getByRole('link', { name: 'Security' })).toBeVisible()
    await expect(tabs(page).getByRole('link', { name: 'Access' })).toBeVisible()

    // Overview: verification, superuser, sign-in email explained, last sign-in and member since.
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
    await expect(page.getByText(`${admin.email} is your sign-in email. Contact an administrator to change it.`)).toBeVisible()
    await expect(page.getByText('Email verified', { exact: true })).toBeVisible()
    await expect(page.getByText('Superuser', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Last sign-in', { exact: true })).toBeVisible()
    await expect(page.getByText('Member since', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Phone number' })).toBeVisible()

    await tabs(page).getByRole('link', { name: 'Security' }).click()
    await expect(page).toHaveURL(/\/app\/account\/security$/)
    await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Active sessions' })).toBeVisible()
    await expect(page).toHaveTitle(/^Security · Account · /)
  })

  test('validates the new password against the policy and the confirmation', async ({ page }) => {
    await page.goto('/app/account/security')
    // The policy is stated up front, and checked before any request.
    await expect(page.getByText(/At least 8 characters, with an uppercase/)).toBeVisible()
    await page.getByLabel('Current password').fill('Whatever-1!')
    await page.getByLabel('New password', { exact: true }).fill('longenough1')
    await page.getByLabel('Confirm new password').fill('doesnotmatch1')
    await page.getByRole('button', { name: 'Change password' }).click()
    await expect(page.getByText('Add an uppercase letter (A to Z).')).toBeVisible()
    await expect(page.getByText('Passwords must match.')).toBeVisible()
    // Each password can be revealed to check what was typed (v-auth-shell-09).
    await expect(page.getByRole('button', { name: 'Show password' })).toHaveCount(3)
    const newPassword = page.getByLabel('New password', { exact: true })
    await newPassword.locator('xpath=..').getByRole('button', { name: 'Show password' }).click()
    await expect(newPassword).toHaveAttribute('type', 'text')
    await expect(page.getByLabel('Current password')).toHaveAttribute('type', 'password')
  })

  // The rules are the ones the backend publishes (F-097): a served 12-character policy without
  // the symbol rule is what the form states and checks. Nothing is submitted for the persona.
  test('change password follows the served password policy', async ({ page }) => {
    await withPasswordPolicy(page, { min_length: 12, require_special_char: false })
    const changes: Request[] = []
    page.on('request', (request) => {
      if (isChangePassword(request)) changes.push(request)
    })
    await page.goto('/app/account/security')
    await expect(page.getByText('At least 12 characters, with an uppercase and a lowercase letter and a digit.', { exact: true })).toBeVisible()
    const next = page.getByLabel('New password', { exact: true })
    await page.getByLabel('Current password').fill('Whatever-1!')
    await next.fill('Abcdefghij1')
    await page.getByLabel('Confirm new password').fill('Abcdefghij1')
    await page.getByRole('button', { name: 'Change password' }).click()
    await expect(page.getByText('Password must be at least 12 characters.')).toBeVisible()
    await expect(next).toHaveAttribute('aria-invalid', 'true')
    // Twelve characters and no symbol meet this policy: the field's message goes as it is typed.
    await next.fill('Abcdefghij12')
    await expect(page.getByText('Password must be at least 12 characters.')).toHaveCount(0)
    await expect(next).not.toHaveAttribute('aria-invalid', 'true')
    expect(changes, 'nothing is sent for the persona').toHaveLength(0)
  })

  // outlabs-auth counts the backslash as a symbol; a console whose symbol list lacked it refused
  // such a password on the field although the server takes it.
  test('a password whose only symbol is a backslash is accepted, here and by the server', async ({ api, sessionContext }) => {
    const { user, tokens } = await mintFreshSession(api, 'backslash')
    const next = 'Backslash1\\'
    const context = await sessionContext(tokens)
    const signIn = await answerSignInAgain(context, user, next)
    const page = await context.newPage()
    await page.goto('/app/account/security')
    await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible(BOOT)
    await page.getByLabel('Current password').fill(TEST_PASSWORD)
    await page.getByLabel('New password', { exact: true }).fill(next)
    await page.getByLabel('Confirm new password').fill(next)
    const changed = page.waitForResponse(response => isChangePassword(response.request()))
    await page.getByRole('button', { name: 'Change password' }).click()
    expect((await changed).status(), 'the server accepts the password').toBeLessThan(300)
    await expect(page.getByText('Password changed', { exact: true }).first()).toBeVisible()
    expect(signIn).toEqual([expect.objectContaining({ email: user.email, password: next })])
  })

  // An account without a password (has_password false: invited, OAuth-only, magic-link-only)
  // cannot change one: outlabs-auth asks for the current password and has no endpoint that sets a
  // first one. It is offered the emailed link instead (F-098). The persona's record is served
  // without a password and the link request answered, so no email is sent.
  test('an account without a password sets one through an emailed link', async ({ page }) => {
    await page.route(apiUrl('/users/me'), async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const response = await route.fetch()
      return route.fulfill({ response, json: { ...(await response.json() as object), has_password: false } })
    })
    const linkRequests: Array<Record<string, unknown>> = []
    await page.route(apiUrl('/auth/forgot-password'), (route) => {
      if (route.request().method() === 'POST') linkRequests.push(route.request().postDataJSON() as Record<string, unknown>)
      return route.fulfill({ status: 204, headers: corsHeaders('POST,OPTIONS') })
    })
    await page.goto('/app/account/security')
    await expect(page.getByRole('heading', { name: 'Set a password' })).toBeVisible(BOOT)
    await expect(page.getByText('Your account signs in without a password. To add one, we email you a link to set it.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Change password' })).toHaveCount(0)
    await expect(page.getByLabel('Current password')).toHaveCount(0)
    await expect(page.getByText('Forgot your current password?')).toHaveCount(0)
    // The sessions card is unchanged.
    await expect(page.getByRole('heading', { name: 'Active sessions' })).toBeVisible()

    await page.getByRole('button', { name: 'Email me a link to set a password' }).click()
    await expect(page.getByText('Reset link sent', { exact: true })).toBeVisible()
    expect(linkRequests).toHaveLength(1)
    expect(linkRequests[0]).toMatchObject({ email: persona('admin').email })
    // The rate limit is respected: the button waits before another link.
    await expect(page.getByRole('button', { name: /^Email me a link to set a password in \d+s$/ })).toBeDisabled()
  })

  test('saves only the changed name; Save waits for a change and Reset restores it', async ({ api, sessionContext }) => {
    const { user, tokens } = await mintFreshSession(api, 'profile-names')
    const page = await (await sessionContext(tokens)).newPage()
    await page.goto('/app/account')
    const save = page.getByRole('button', { name: 'Save profile' })
    await expect(save).toBeDisabled(BOOT)

    const first = page.getByLabel('First name')
    await expect(first).toHaveValue('E2E')
    await first.fill('Edited')
    await expect(save).toBeEnabled()
    await page.getByRole('button', { name: 'Reset' }).click()
    await expect(first).toHaveValue('E2E')
    await expect(save).toBeDisabled()

    // A name the account has cannot be emptied (the server cannot clear it).
    await first.fill('')
    await save.click()
    await expect(page.getByText('Enter your first name. It can be changed but not removed.')).toBeVisible()

    await first.fill('Renamed')
    const patched = page.waitForRequest(isPatchMe)
    await save.click()
    expect((await patched).postDataJSON()).toEqual({ first_name: 'Renamed' })
    await expect(page.getByText('Profile updated', { exact: true })).toBeVisible()
    await expect(save).toBeDisabled()
    await expect.poll(async () => (await api.get<{ first_name?: string }>(`/users/${user.id}`)).first_name).toBe('Renamed')
  })

  test('an account without a name adds a phone number, and a name being typed survives the save', async ({ api, sessionContext }) => {
    const { user, tokens } = await mintFreshSession(api, 'nameless-phone', { named: false })
    const page = await (await sessionContext(tokens)).newPage()
    await page.goto('/app/account')
    await expect(page.getByRole('heading', { name: 'Phone number' })).toBeVisible(BOOT)
    await expect(page.getByText('No phone number.')).toBeVisible()
    // Without a name the email stands in for it once, not again as its subtitle; the sentence
    // below still names it as the sign-in email.
    const overview = page.getByRole('heading', { name: 'Overview' }).locator('xpath=ancestor::*[@data-slot="root"][1]')
    await expect(overview.getByText(user.email, { exact: true })).toHaveCount(1)
    await expect(overview.getByText(`${user.email} is your sign-in email.`, { exact: false })).toBeVisible()

    // A draft name, not saved: the phone save updates the session but must not overwrite it.
    await page.getByLabel('Last name').fill('Draft')

    const phone = `+1555${String(Date.now()).slice(-7)}`
    await page.getByRole('button', { name: 'Add phone number' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add phone number' })
    await dialog.getByLabel('Phone number').fill(phone)
    const patched = page.waitForRequest(isPatchMe)
    await dialog.getByRole('button', { name: 'Save number' }).click()
    // Only the phone is sent: no empty names for the server to refuse (F-095).
    expect((await patched).postDataJSON()).toEqual({ phone })
    await expect(page.getByText('Phone number saved', { exact: true })).toBeVisible()
    await expect(page.getByTestId('account-phone')).toHaveText(phone)
    await expect(page.getByLabel('Last name')).toHaveValue('Draft')
    await expect.poll(async () => (await api.get<{ phone?: string | null }>(`/users/${user.id}`)).phone).toBe(phone)

    // Removing it asks first and says what it does.
    await page.getByRole('button', { name: `Remove phone number ${phone}` }).click()
    const confirm = page.getByRole('dialog', { name: `Remove phone number ${phone}` })
    await expect(confirm.getByTestId('confirm-effects')).toBeVisible()
    await confirm.getByRole('button', { name: 'Remove phone number' }).click()
    await expect(page.getByText('No phone number.')).toBeVisible()
    await expect.poll(async () => (await api.get<{ phone?: string | null }>(`/users/${user.id}`)).phone ?? null).toBeNull()
  })

  test('works at phone width without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    for (const path of ['/app/account', '/app/account/security', '/app/account/access']) {
      await page.goto(path)
      await expect(page.getByRole('heading').filter({ hasText: /^(Overview|Change password|Permissions)$/ }).first()).toBeVisible()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0)
    }
  })
})
