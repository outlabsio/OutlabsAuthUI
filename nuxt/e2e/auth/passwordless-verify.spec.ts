import { backendConfigured, expect, test } from '../support/fixtures'
import {
  apiInvite,
  apiLogin,
  captureAccessCode,
  captureInviteToken,
  captureMagicLinkToken,
  captureResetToken
} from '../support/passwordless-capture'

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

  test('password reset: forgot → capture → reset → login with the new password', async ({ page }) => {
    // A dedicated seeded user nothing else logs in as; idempotent (reset to a fixed password).
    const email = 'regional-admin@acme.com'
    const newPassword = 'ResetTestpass1!'

    await page.goto('/auth/forgot-password')
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()

    const token = await captureResetToken(email)
    expect(token, 'captured reset token').toBeTruthy()

    await page.goto(`/auth/reset-password?token=${encodeURIComponent(token!)}`)
    await page.getByLabel('New password', { exact: true }).fill(newPassword)
    await page.getByLabel('Confirm new password').fill(newPassword)
    await page.getByRole('button', { name: 'Reset password' }).click()
    await expect(page).toHaveURL(/\/auth\/login/)

    // Prove the reset took: sign in with the new password.
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(newPassword)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/app\//)
  })

  test('invite: admin invites → capture → accept sets password → app', async ({ page }) => {
    const email = `e2e-invite-${Date.now()}@example.com`
    const password = 'InviteTestpass1!'

    // Send the invite through the API as the admin (superuser-gated).
    const adminToken = await apiLogin(
      process.env.E2E_ADMIN_EMAIL ?? 'admin@acme.com',
      process.env.E2E_ADMIN_PASSWORD ?? 'Testpass1!'
    )
    expect(adminToken, 'admin access token').toBeTruthy()
    await apiInvite(adminToken, email)

    const token = await captureInviteToken(email)
    expect(token, 'captured invite token').toBeTruthy()

    await page.goto(`/auth/accept-invite?token=${encodeURIComponent(token!)}`)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByLabel('Confirm password').fill(password)
    await page.getByRole('button', { name: 'Accept and sign in' }).click()

    await expect(page).toHaveURL(/\/app\//)
    // The invitee is a fresh, role-less user: the app shell renders (Dashboard nav is
    // unguarded) but the RBAC-gated admin resources stay hidden.
    await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0)
  })
})
