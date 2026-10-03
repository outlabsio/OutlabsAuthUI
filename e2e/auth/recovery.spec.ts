import type { Request } from '@playwright/test'
import { authMethodOn, backendConfigured, expect, persona, test } from '../support/fixtures'
import { signInWithPassword } from '../support/sign-in'
import { DEFAULT_PASSWORD_POLICY, type LiveAuthConfig, withPasswordPolicy } from '../support/capabilities'
import { apiUrl } from '../support/env'
import { corsHeaders, jsonResponse } from '../support/mocks'
import {
  captureEnabled,
  apiConfirmPhoneVerify,
  apiCreateUser,
  apiLogin,
  apiRequestPhoneVerify,
  apiSetMyPhone,
  captureAccessCodeByPhone,
  capturePhoneVerifyCode,
  captureResetToken
} from '../support/passwordless-capture'

// Recovery (F4) — the "Can't sign in?" brancher. Email → reset link; phone → OTP sign-in IS
// the recovery (lands on Account, which points at the emailed reset link). Both branches are
// exercised end-to-end with fresh users + dev capture.
test.describe('recovery', () => {
  test('renders the identifier step', async ({ page }) => {
    await page.goto('/auth/recovery')
    await expect(page.getByRole('heading', { level: 1, name: 'Can\'t sign in?' })).toBeVisible()
    const emailInput = page.getByLabel('Email')
    const emailChoice = page.getByRole('button', { name: 'Recover with email' })
    await expect(emailChoice.or(emailInput).first()).toBeVisible()
    if (await emailChoice.count()) {
      await expect(emailChoice).toBeVisible()
      await expect(page.getByRole('button', { name: 'Recover with phone' })).toBeVisible()
      await emailChoice.click()
    }
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Email')).toHaveAttribute('type', 'email')
    await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to sign in' })).toBeVisible()
  })

  // The reset page checks the new password against the backend's published policy and states it
  // (F-097): a served policy (10 characters, no uppercase rule) drives both.
  test('the reset form follows the served password policy', async ({ page }) => {
    await withPasswordPolicy(page, { min_length: 10, require_uppercase: false })
    const resets: Request[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url() === apiUrl('/auth/reset-password')) resets.push(request)
    })
    await page.goto('/auth/reset-password?token=e2e-policy-token')
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
    await expect(page.getByText('At least 10 characters, with a lowercase letter, a digit and a symbol (! @ # $ % ^ & * ( ) , . ? " : { } | < > \\).', { exact: true })).toBeVisible()

    const password = page.getByLabel('New password', { exact: true })
    await password.fill('abcdefg1!')
    await page.getByLabel('Confirm new password').fill('abcdefg1!')
    await page.getByRole('button', { name: 'Reset password' }).click()
    await expect(page.getByText('Password must be at least 10 characters.')).toBeVisible()
    await expect(password).toHaveAttribute('aria-invalid', 'true')
    expect(resets, 'nothing is sent for a password the policy refuses').toHaveLength(0)

    // Ten characters without an uppercase letter meet this policy. The answer is served (the
    // example backends keep the default policy); the made-up token resets nothing.
    await page.route(apiUrl('/auth/reset-password'), route => route.request().method() === 'POST'
      ? route.fulfill({ status: 204, headers: corsHeaders('POST,OPTIONS') })
      : route.continue())
    await password.fill('abcdefgh1!')
    await page.getByLabel('Confirm new password').fill('abcdefgh1!')
    await page.getByRole('button', { name: 'Reset password' }).click()
    await expect(page).toHaveURL(/\/auth\/login/)
    await expect(page.getByText('Password reset', { exact: true })).toBeVisible()
    expect(resets).toHaveLength(1)
    expect(resets[0]!.postDataJSON()).toEqual({ token: 'e2e-policy-token', new_password: 'abcdefgh1!' })
  })

  // Until the capabilities load, a form checks with outlabs-auth's default policy; when the
  // backend's own arrives later (its first request failed), a field flagged under the default is
  // checked again at once instead of keeping a message the policy no longer gives.
  test('a policy that arrives after the reset form rendered re-checks the flagged field', async ({ page, errorGuard }) => {
    test.skip(!backendConfigured, 'Needs a backend (E2E_API_BASE_URL).')
    errorGuard.allow({ status: 500, url: /\/auth\/config$/ })
    let configReads = 0
    let release!: () => void
    const released = new Promise<void>(resolve => (release = resolve))
    await page.route('**/auth/config', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204 })
      configReads += 1
      // Boot: no capabilities (a 500 is not retried).
      if (configReads === 1) return route.fulfill(jsonResponse(500, { error: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' }))
      await released
      const response = await route.fetch()
      const config = await response.json() as LiveAuthConfig
      return route.fulfill({ response, json: { ...config, password_policy: { ...(config.password_policy ?? DEFAULT_PASSWORD_POLICY), require_special_char: false } } })
    })
    await page.goto('/auth/reset-password?token=e2e-late-policy')
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
    // The page's own request for the capabilities (and any refetch) is held.
    await expect.poll(() => configReads).toBeGreaterThanOrEqual(2)
    // Meanwhile: the default policy, which wants a symbol.
    await expect(page.getByText(/^At least 8 characters, with an uppercase and a lowercase letter, a digit and a symbol/)).toBeVisible()
    const password = page.getByLabel('New password', { exact: true })
    await password.fill('Nosymbol12')
    await page.getByLabel('Confirm new password').fill('Nosymbol12')
    await page.getByRole('button', { name: 'Reset password' }).click()
    await expect(page.getByText(/^Add a symbol: one of/)).toBeVisible()

    release()
    await expect(page.getByText('At least 8 characters, with an uppercase and a lowercase letter and a digit.', { exact: true })).toBeVisible()
    await expect(page.getByText(/^Add a symbol: one of/)).toHaveCount(0)
    await expect(password).not.toHaveAttribute('aria-invalid', 'true')
  })

  test('email branch: identifier → reset link → capture → new password → login', async ({ page, testData }) => {
    test.skip(!backendConfigured, 'Needs a backend (E2E_API_BASE_URL).')
    test.skip(!(await captureEnabled()), 'Dev capture endpoints are not enabled.')

    const email = testData.email('recover')
    const oldPassword = 'RecoverOld1!'
    const newPassword = 'RecoverNew1!'

    const adminToken = await apiLogin(
      persona('admin').email,
      persona('admin').password
    )
    expect(await apiCreateUser(adminToken, email, oldPassword), 'create user').toBeTruthy()

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

    await signInWithPassword(page, email, newPassword)
    await expect(page).toHaveURL(/\/app\//)
  })

  test('phone branch: OTP sign-in → Account prompt → emailed reset link → new password → login', async ({ page, errorGuard, testData }) => {
    // The password reset ends the phone sign-in session, so its later renewal and sign-out are refused.
    errorGuard.allow({ status: 401, url: /\/auth\/(logout|refresh)$/ })
    test.skip(!backendConfigured, 'Needs a backend (E2E_API_BASE_URL).')
    test.skip(!(await authMethodOn('access_code')), 'Backend has access_code off.')
    test.skip(!(await captureEnabled()), 'Dev capture endpoints are not enabled.')

    const suffix = String(Date.now()).slice(-6)
    const email = testData.email('recover-phone')
    const password = 'RecoverPhone1!'
    const newPassword = 'RecoverPhone2!'
    const phone = `+5491177${suffix}`

    // Fresh user with a verified phone (the authenticated self-service loop).
    const adminToken = await apiLogin(
      persona('admin').email,
      persona('admin').password
    )
    expect(await apiCreateUser(adminToken, email, password), 'create user').toBeTruthy()
    const userToken = await apiLogin(email, password)
    expect(await apiSetMyPhone(userToken, phone), 'set phone').toBe(true)
    expect(await apiRequestPhoneVerify(userToken), 'request phone verify').toBe(true)
    const verifyCode = await capturePhoneVerifyCode(email)
    expect(await apiConfirmPhoneVerify(userToken, verifyCode!), 'confirm phone verify').toBe(true)

    // Recovery: phone identifier → channel → OTP → signed in, Account prompts the reset.
    await page.goto('/auth/recovery')
    await page.getByRole('button', { name: 'Recover with phone' }).click()
    await page.getByLabel('Phone number').fill(phone)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: 'Send code via WhatsApp' }).click()
    await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible()

    const code = await captureAccessCodeByPhone(phone)
    expect(code, 'captured 6-digit code').toMatch(/^\d{6}$/)
    for (let i = 0; i < 6; i++) {
      await page.getByRole('textbox', { name: `pin input ${i + 1} of 6` }).fill(code![i]!)
    }

    // Account says what really happened to the reset email, then drops the query.
    await expect(page.getByText('You\'re signed in with a one-time code')).toBeVisible()
    await expect(page.getByText(`We emailed a password-reset link to ${email}.`, { exact: false })).toBeVisible()
    await expect(page).toHaveURL(url => url.pathname === '/app/account' && url.search === '')

    // The recovery also emailed a reset link — use it to set a new password. Reset-password
    // is the one auth page a signed-in user may open (the token is the authorization).
    const token = await captureResetToken(email)
    expect(token, 'captured reset token').toBeTruthy()
    await page.goto(`/auth/reset-password?token=${encodeURIComponent(token!)}`)
    await page.getByLabel('New password', { exact: true }).fill(newPassword)
    await page.getByLabel('Confirm new password').fill(newPassword)
    await page.getByRole('button', { name: 'Reset password' }).click()
    // The reset ended every session of the account, this browser's too: it is signed out and on
    // sign-in (F-029), not bounced back into a session the server already ended.
    await expect(page).toHaveURL(/\/auth\/login/)
    await expect(page.getByText('Password reset', { exact: true })).toBeVisible()

    // The new password works through the unified flow.
    await signInWithPassword(page, email, newPassword)
    await expect(page).toHaveURL(/\/app\//)
  })
})
