import { authMethodOn, backendConfigured, expect, persona, test } from '../support/fixtures'
import { openEmailForm } from '../support/sign-in'

// Live capability degradation — the F0 gate run against REAL backends, not mocks. Whatever
// backend the suite is pointed at, the sign-in surface must match its /auth/config:
// SimpleRBAC (password-only) drops the phone method + passwordless alternates and renders
// the email form directly; EnterpriseRBAC (all methods on) offers every method as a button.
test.describe('capability degradation (live backend)', () => {
  test.skip(!backendConfigured, 'Needs a backend (E2E_API_BASE_URL).')

  test('the sign-in surface matches the backend auth_methods', async ({ page }) => {
    const accessCode = await authMethodOn('access_code')
    const magicLink = await authMethodOn('magic_link')

    await page.goto('/auth/login')

    // Phone method presence tracks access_code exactly.
    await expect(page.getByRole('button', { name: 'Continue with phone' })).toHaveCount(accessCode ? 1 : 0)

    if (!accessCode) {
      // Password-only backend: no methods to choose between — the email form renders directly.
      await expect(page.getByRole('button', { name: 'Continue with email', exact: true })).toHaveCount(0)
      await expect(page.getByLabel('Email')).toBeVisible()
      await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
    } else {
      // Full backend: methods are peer buttons; alternates inside the email form track flags.
      await openEmailForm(page)
      await expect(page.getByRole('button', { name: 'Email me a magic link instead' })).toHaveCount(magicLink ? 1 : 0)
      await expect(page.getByRole('button', { name: 'Email me a code instead' })).toHaveCount(1)
    }
  })

  test('password sign-in works against the minimal backend', async ({ page }) => {
    await page.goto('/auth/login')
    await openEmailForm(page)
    await page.getByLabel('Email').fill(persona('admin').email)
    await page.getByLabel('Password', { exact: true }).fill(persona('admin').password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/app\//)
  })
})
