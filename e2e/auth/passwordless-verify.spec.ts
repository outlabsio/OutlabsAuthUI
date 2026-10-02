import { authMethodOn, backendConfigured, expect, persona, test } from '../support/fixtures'
import { openPhonePanel, requestEmailCode, signInWithPassword } from '../support/sign-in'
import { sidebarNav } from '../support/shell'
import {
  apiConfirmPhoneVerify,
  apiCreateUser,
  apiInvite,
  apiLogin,
  apiRequestPhoneVerify,
  apiSetMyPhone,
  captureAccessCode,
  captureAccessCodeByPhone,
  captureEnabled,
  captureInviteToken,
  captureMagicLinkToken,
  capturePhoneVerifyCode,
  captureResetToken
} from '../support/passwordless-capture'

// The *verify* side of the passwordless flows, exercised end-to-end by capturing the real
// code/token from the backend's dev debug endpoints (see support/passwordless-capture).
// Requests are driven through the unified identifier-first sign-in (F1). Each test self-skips
// when the configured backend lacks the capability it exercises (SimpleRBAC runs password-only).
test.describe('passwordless verify (dev capture)', () => {
  async function needs(name: 'magic_link' | 'access_code') {
    test.skip(!backendConfigured, 'Needs a backend (E2E_API_BASE_URL).')
    test.skip(!(await authMethodOn(name)), `Backend has ${name} off.`)
    test.skip(!(await captureEnabled()), 'Dev capture endpoints are not enabled.')
  }

  async function fillOtp(page: import('@playwright/test').Page, code: string) {
    // Fill the OTP slots; the 6th digit auto-submits.
    for (let i = 0; i < 6; i++) {
      await page.getByRole('textbox', { name: `pin input ${i + 1} of 6` }).fill(code[i]!)
    }
  }

  test('email access code: unified flow → capture → OTP verify → app', async ({ page }) => {
    await needs('access_code')
    const email = persona('admin').email

    await requestEmailCode(page, email)
    await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible()
    await expect(page.getByText(`If ${email} has an account here, we sent it a 6-digit code.`)).toBeVisible()

    const code = await captureAccessCode(email)
    expect(code, 'captured 6-digit code').toMatch(/^\d{6}$/)
    await fillOtp(page, code!)

    await expect(page).toHaveURL(/\/app\//)
    await expect(sidebarNav(page).getByRole('link', { name: 'Users', exact: true })).toBeVisible()
  })

  test('magic link: unified flow → capture token → verify → app', async ({ page }) => {
    await needs('magic_link')
    // A different seeded user than the access-code test, to avoid capture-bucket collisions.
    const email = persona('orgAdmin').email

    await page.goto('/auth/login')
    await page.getByRole('button', { name: 'Continue with email', exact: true }).click()
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Email me a magic link instead' }).click()
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
    await expect(page.getByText(`If ${email} has an account here, we sent it a sign-in link.`)).toBeVisible()

    const token = await captureMagicLinkToken(email)
    expect(token, 'captured magic-link token').toBeTruthy()

    // The link is used only on an explicit click.
    await page.goto(`/auth/magic-link?token=${encodeURIComponent(token!)}`)
    await page.getByRole('button', { name: 'Continue signing in' }).click()
    await expect(page).toHaveURL(/\/app\//)
    await expect(sidebarNav(page).getByRole('link', { name: 'Users', exact: true })).toBeVisible()
  })

  test('password reset: forgot → capture → reset → login with the new password', async ({ page, api, requires }) => {
    await requires({ capture: ['reset-password'] })
    // A fresh run-marked user: resetting a seeded persona's password would break later runs.
    const { email } = await api.createUser({ kind: 'reset' })
    const newPassword = 'ResetTestpass1!'

    await page.goto('/auth/recovery')
    const emailChoice = page.getByRole('button', { name: 'Recover with email' })
    await expect(emailChoice.or(page.getByLabel('Email')).first()).toBeVisible()
    if (await emailChoice.count()) await emailChoice.click()
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

    // Prove the reset took: sign in with the new password through the unified flow.
    await signInWithPassword(page, email, newPassword)
    await expect(page).toHaveURL(/\/app\//)
  })

  test('invite: admin invites → capture → accept sets password → app', async ({ page, testData }) => {
    test.skip(!backendConfigured, 'Needs a backend (E2E_API_BASE_URL).')
    test.skip(!(await captureEnabled()), 'Dev capture endpoints are not enabled.')
    const email = testData.email('invite')
    const password = 'InviteTestpass1!'

    // Send the invite through the API as the admin (superuser-gated).
    const adminToken = await apiLogin(
      persona('admin').email,
      persona('admin').password
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

  // Phone OTP sign-in (F2 path): a fresh user verifies their phone via the authenticated
  // self-service loop, then signs in by OTP through the unified flow — per channel.
  for (const channel of ['WhatsApp', 'SMS'] as const) {
    test(`phone OTP (${channel}): verify phone via API → request → capture → OTP → app`, async ({ page, testData }) => {
      await needs('access_code')
      const suffix = String(Date.now()).slice(-6)
      const email = testData.email(`phone-${channel.toLowerCase()}`)
      const password = 'PhoneTestpass1!'
      const phone = `+5491155${suffix}`

      const adminToken = await apiLogin(
        persona('admin').email,
        persona('admin').password
      )
      expect(adminToken, 'admin access token').toBeTruthy()
      expect(await apiCreateUser(adminToken, email, password), 'create user').toBeTruthy()

      const userToken = await apiLogin(email, password)
      expect(userToken, 'new-user access token').toBeTruthy()
      expect(await apiSetMyPhone(userToken, phone), 'set phone').toBe(true)
      expect(await apiRequestPhoneVerify(userToken), 'request phone verify').toBe(true)

      const verifyCode = await capturePhoneVerifyCode(email)
      expect(verifyCode, 'captured phone-verify code').toMatch(/^\d{4,12}$/)
      expect(await apiConfirmPhoneVerify(userToken, verifyCode!), 'confirm phone verify').toBe(true)

      // Unified flow: phone panel → identifier → channel step → send → OTP.
      await page.goto('/auth/login')
      await openPhonePanel(page)
      await page.getByLabel('Phone number').fill(phone)
      await page.getByRole('button', { name: 'Continue', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Get your code' })).toBeVisible()
      const sendLabel = channel === 'WhatsApp' ? 'Send code via WhatsApp' : 'Send it by SMS instead'
      await page.getByRole('button', { name: sendLabel }).click()
      await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible()
      await expect(page.getByText(`If ${phone} is a verified number on an account here, we sent a 6-digit code by ${channel}.`)).toBeVisible()

      const code = await captureAccessCodeByPhone(phone)
      expect(code, 'captured 6-digit code').toMatch(/^\d{6}$/)
      await fillOtp(page, code!)

      await expect(page).toHaveURL(/\/app\//)
      // Fresh, role-less user: shell renders, admin resources hidden.
      await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0)
    })
  }
})
