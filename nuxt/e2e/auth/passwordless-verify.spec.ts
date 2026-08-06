import { backendConfigured, expect, test } from '../support/fixtures'
import { captureAccessCode, captureMagicLinkToken } from '../support/passwordless-capture'

// The *verify* side of the passwordless flows, exercised end-to-end by capturing the real
// code/token from the backend's dev debug endpoints (see support/passwordless-capture).
test.describe('passwordless verify (dev capture)', () => {
  test.skip(!backendConfigured, 'Needs the backend + dev capture endpoints (dev mode).')

  test('access code: request → capture → OTP verify → app', async ({ page }) => {
    const email = process.env.E2E_ADMIN_EMAIL ?? 'admin@acme.com'

    await page.goto('/auth/access-code')
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Email me a code' }).click()
    await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible()

    const code = await captureAccessCode(email)
    expect(code, 'captured 6-digit code').toMatch(/^\d{6}$/)

    // Fill the OTP slots; the 6th digit auto-submits.
    for (let i = 0; i < 6; i++) {
      await page.getByRole('textbox', { name: `pin input ${i + 1} of 6` }).fill(code![i]!)
    }

    await expect(page).toHaveURL(/\/app\//)
    await expect(page.getByRole('link', { name: 'Users' })).toBeVisible()
  })

  test('magic link: request → capture token → verify → app', async ({ page }) => {
    // A different seeded user than the access-code test, to avoid capture-bucket collisions.
    const email = 'org-admin@acme.com'

    await page.goto('/auth/magic-link')
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Email me a link' }).click()
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()

    const token = await captureMagicLinkToken(email)
    expect(token, 'captured magic-link token').toBeTruthy()

    // Landing on the page with the token auto-verifies and signs in.
    await page.goto(`/auth/magic-link?token=${encodeURIComponent(token!)}`)
    await expect(page).toHaveURL(/\/app\//)
    await expect(page.getByRole('link', { name: 'Users' })).toBeVisible()
  })
})
