import { backendConfigured, expect, test } from '../support/fixtures'

// Passwordless / recovery / invite flows. Render + validation run without a backend (guest
// project); the token-exchange + email-send steps are covered by manual + backend runs.
test.describe('auth flows', () => {
  test('forgot-password renders and validates', async ({ page }) => {
    await page.goto('/auth/forgot-password')
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByText('Email is required.')).toBeVisible()
  })

  test('reset-password without a token shows an invalid-link message', async ({ page }) => {
    await page.goto('/auth/reset-password')
    await expect(page.getByRole('heading', { name: 'Invalid reset link' })).toBeVisible()
  })

  test('reset-password with a token shows the set-password form + validates match', async ({ page }) => {
    await page.goto('/auth/reset-password?token=demo-token')
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
    await page.getByLabel('New password', { exact: true }).fill('longenough1')
    await page.getByLabel('Confirm new password').fill('mismatch1')
    await page.getByRole('button', { name: 'Reset password' }).click()
    await expect(page.getByText('Passwords must match.')).toBeVisible()
  })

  test('accept-invite without a token shows an invalid-link message', async ({ page }) => {
    await page.goto('/auth/accept-invite')
    await expect(page.getByRole('heading', { name: 'Invalid invitation link' })).toBeVisible()
  })

  test('accept-invite with a token shows the set-password form', async ({ page }) => {
    await page.goto('/auth/accept-invite?token=demo-token')
    await expect(page.getByRole('heading', { name: 'Accept your invitation' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Accept and sign in' })).toBeVisible()
  })

  test('magic-link renders the request form', async ({ page }) => {
    await page.goto('/auth/magic-link')
    await expect(page.getByRole('heading', { name: 'Sign in with a magic link' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Email me a link' })).toBeVisible()
  })

  test('access-code renders the request step', async ({ page }) => {
    await page.goto('/auth/access-code')
    await expect(page.getByRole('heading', { name: 'Sign in with an access code' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Email me a code' })).toBeVisible()
  })

  test('login surfaces passwordless methods the backend exposes', async ({ page }) => {
    test.skip(!backendConfigured, 'Needs /auth/config from the backend (magic_link + access_code on).')
    await page.goto('/auth/login')
    await expect(page.getByRole('link', { name: 'Sign in with a magic link' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign in with an access code' })).toBeVisible()
  })

  test('login shows OAuth buttons for deployment-configured providers', async ({ page }) => {
    // The deployment declares its providers via runtime config (no library discovery endpoint).
    await page.addInitScript(() => {
      ;(window as unknown as { __OUTLABS_AUTH_UI_CONFIG__?: Record<string, unknown> }).__OUTLABS_AUTH_UI_CONFIG__ = {
        oauthProviders: ['google']
      }
    })
    await page.goto('/auth/login')
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  })

  test('login surfaces an oauth_error returned by the provider callback', async ({ page }) => {
    await page.goto('/auth/login?oauth_error=unknown_account')
    await expect(page.getByText(/linked to an invitation/)).toBeVisible()
  })
})
