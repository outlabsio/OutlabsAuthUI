import type { Page, Request } from '@playwright/test'
import { backendConfigured, expect, persona, test } from '../support/fixtures'
import { apiUrl } from '../support/env'
import { mintFreshSession } from '../support/sessions'

// Account (WP-19): the tabs, the overview, the names form and the phone number. Profile writes
// run as fresh run-marked users with their own session (never the shared personas); the
// rendering checks use the admin persona read-only.

const BOOT = { timeout: 30_000 }

const isPatchMe = (request: Request) => request.method() === 'PATCH' && request.url() === apiUrl('/users/me')

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
    await expect(page.getByText('Add an uppercase letter.')).toBeVisible()
    await expect(page.getByText('Passwords must match.')).toBeVisible()
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
