import type { Page, Request } from '@playwright/test'
import { authMethodOn, backendConfigured, expect, test } from '../support/fixtures'
import { openPhonePanel } from '../support/sign-in'
import { patchAuthConfig, withExtraSurfaces, withPasswordPolicy } from '../support/capabilities'
import { apiUrl } from '../support/env'
import { jsonResponse } from '../support/mocks'
import { captureAccessCodeByPhone, captureEnabled, capturePhoneVerifyCode } from '../support/passwordless-capture'
import { signOutFromShell } from '../support/shell'

// Signup (F3) — render + validation run without a backend; the full loop
// (register → auto-login → add+verify phone → sign out → phone OTP login) is capture-verified
// against the dev backend. The password rules and whether the page offers a form at all follow
// the backend's /auth/config (`password_policy`, `registration_mode`), served here with the
// changes each test needs.

const isRegister = (request: Request) => request.method() === 'POST' && request.url() === apiUrl('/auth/register')

// Every registration the page sends.
function registrations(page: Page): Request[] {
  const sent: Request[] = []
  page.on('request', (request) => {
    if (isRegister(request)) sent.push(request)
  })
  return sent
}

async function fillRegisterForm(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
}

test.describe('signup', () => {
  test('renders and validates the register form', async ({ page }) => {
    await page.goto('/auth/signup')
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
    // The rules are stated up front: outlabs-auth's default policy, backslash included.
    await expect(page.getByText('At least 8 characters, with an uppercase and a lowercase letter, a digit and a symbol (! @ # $ % ^ & * ( ) , . ? " : { } | < > \\).', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Email is required.')).toBeVisible()
    await expect(page.getByText('Password must be at least 8 characters.')).toBeVisible()

    await page.getByLabel('Password', { exact: true }).fill('longenough1')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Add an uppercase letter (A to Z).')).toBeVisible()

    await page.getByLabel('Password', { exact: true }).fill('Longenough1!')
    await page.getByLabel('Confirm password').fill('Mismatch1!')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Passwords must match.')).toBeVisible()
  })

  test('the description mentions phone sign-in codes only where they are offered', async ({ page }) => {
    const phoneCodes = 'Sign up with your email. You can add a phone number for sign-in codes later.'
    // No access codes (SimpleRBAC, or a deployment that turned them off): email only.
    await patchAuthConfig(page, config => ({
      ...config,
      features: { ...config.features, access_codes: false },
      auth_methods: { ...config.auth_methods, password: true, access_code: false }
    }))
    await page.goto('/auth/signup')
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
    await expect(page.getByText('Sign up with your email.', { exact: true })).toBeVisible()
    await expect(page.getByText(phoneCodes)).toHaveCount(0)

    // Access codes on, with the harness's phone channels: the phone can be added later.
    await page.unroute('**/auth/config')
    await patchAuthConfig(page, config => ({
      ...config,
      features: { ...config.features, access_codes: true },
      auth_methods: { ...config.auth_methods, password: true, access_code: true }
    }))
    await page.reload()
    await expect(page.getByText(phoneCodes)).toBeVisible()
  })

  test('login links to signup when the deployment surfaces it', async ({ page }) => {
    await page.goto('/auth/login')
    await expect(page.getByRole('link', { name: 'Create an account' })).toBeVisible()
  })

  test('the served password policy is stated and checked before anything is sent', async ({ page, testData, errorGuard }) => {
    // A 12-character policy without the symbol rule.
    await withPasswordPolicy(page, { min_length: 12, require_special_char: false })
    const sent = registrations(page)
    await page.goto('/auth/signup')
    await expect(page.getByText('At least 12 characters, with an uppercase and a lowercase letter and a digit.', { exact: true })).toBeVisible()

    const email = testData.email('signup-policy')
    await fillRegisterForm(page, email, 'Abcdefghij1')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Password must be at least 12 characters.')).toBeVisible()
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('aria-invalid', 'true')
    expect(sent, 'an 11-character password is refused before any request').toHaveLength(0)

    // Twelve characters and no symbol meet this policy: the form sends it. (The answer is served:
    // the example backends keep the default policy, and no account is made.)
    errorGuard.allow({ status: 409, url: /\/auth\/register$/ })
    await page.route(apiUrl('/auth/register'), route => route.request().method() === 'POST'
      ? route.fulfill(jsonResponse(409, { error: 'USER_ALREADY_EXISTS', message: `User with email ${email} already exists` }))
      : route.continue())
    await fillRegisterForm(page, email, 'Abcdefghij12')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect.poll(() => sent.length).toBe(1)
    expect(sent[0]!.postDataJSON()).toMatchObject({ email, password: 'Abcdefghij12' })
    await expect(page.getByText('Password must be at least 12 characters.')).toHaveCount(0)
  })

  for (const { mode, title, description } of [
    { mode: 'invite_only' as const, title: 'Sign-up is by invitation', description: 'Ask an administrator to invite you. The invitation email has a link to set your password.' },
    { mode: 'closed' as const, title: 'Accounts are created by an administrator', description: 'Ask an administrator for an account.' }
  ]) {
    test(`registration_mode ${mode}: no Create an account link, and signup explains how accounts are made`, async ({ page }) => {
      await patchAuthConfig(page, config => ({ ...config, registration_mode: mode, features: { ...config.features, registration: false } }))
      await page.goto('/auth/login')
      await expect(page.getByRole('link', { name: 'Can\'t sign in?' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Create an account' })).toHaveCount(0)

      await page.goto('/auth/signup?redirect=/app/users')
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
      await expect(page.getByText(description, { exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Create your account' })).toHaveCount(0)
      await expect(page.getByLabel('Email')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Create account' })).toHaveCount(0)
      const back = page.getByRole('link', { name: 'Back to sign in' })
      await expect(back).toHaveAttribute('href', /^\/auth\/login\?redirect=(%2F|\/)app(%2F|\/)users$/)
      await back.click()
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    })
  }

  test('the deployment\'s signup: false still closes the page before the backend\'s mode is read', async ({ page }) => {
    await patchAuthConfig(page, config => ({ ...config, registration_mode: 'invite_only' }))
    await page.addInitScript(() => {
      ;(window as unknown as { __OUTLABS_AUTH_UI_CONFIG__?: Record<string, unknown> }).__OUTLABS_AUTH_UI_CONFIG__ = {
        authUi: { signup: false }
      }
    })
    await page.goto('/auth/signup')
    await expect(page).toHaveURL(/\/auth\/login/)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByText('Sign-up is by invitation')).toHaveCount(0)
  })

  test('a registration the server refuses as turned off gets the same explanation', async ({ page, testData, errorGuard }) => {
    // The capabilities said open, then the server turned registration off (or the page was open
    // across that change): its refusal replaces the form with the explanation.
    errorGuard.allow({ status: 403, url: /\/auth\/register$/ })
    await page.route(apiUrl('/auth/register'), route => route.request().method() === 'POST'
      ? route.fulfill(jsonResponse(403, {
          error: 'HTTP_ERROR',
          message: 'Self-registration is disabled on this server.',
          details: { code: 'registration_disabled', message: 'Self-registration is disabled on this server.' }
        }))
      : route.continue())
    const sent = registrations(page)
    await page.goto('/auth/signup')
    await fillRegisterForm(page, testData.email('signup-refused'), 'Signup-refused1!')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect.poll(() => sent.length).toBe(1)
    const heading = page.getByRole('heading', { level: 1, name: 'Sign-up is by invitation' })
    await expect(heading).toBeVisible()
    await expect(heading).toBeFocused()
    await expect(page.getByRole('button', { name: 'Create account' })).toHaveCount(0)
    // The page explains it; no error toast repeats it.
    await expect(page.getByText('Could not create account')).toHaveCount(0)
  })

  test('signup: false hides the link and closes the page before it renders', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { __OUTLABS_AUTH_UI_CONFIG__?: Record<string, unknown> }).__OUTLABS_AUTH_UI_CONFIG__ = {
        authUi: { signup: false }
      }
      // Record whether the register form ever reaches the DOM, even for a frame.
      const seen = { form: false }
      ;(window as unknown as { __signupSeen: typeof seen }).__signupSeen = seen
      new MutationObserver(() => {
        if (document.body?.textContent?.includes('Create your account')) seen.form = true
      }).observe(document, { childList: true, subtree: true, characterData: true })
    })
    await page.goto('/auth/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Create an account' })).toHaveCount(0)

    await page.goto('/auth/signup?redirect=/app/users')
    await expect(page).toHaveURL(/\/auth\/login\?redirect=/)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __signupSeen: { form: boolean } }).__signupSeen.form)).toBe(false)
  })

  test('OAuth providers render as peer buttons and the email form unfolds', async ({ page }) => {
    // Buttons need the backend's oauth router as well as the deployment's provider list.
    await withExtraSurfaces(page, ['oauth'])
    await page.addInitScript(() => {
      ;(window as unknown as { __OUTLABS_AUTH_UI_CONFIG__?: Record<string, unknown> }).__OUTLABS_AUTH_UI_CONFIG__ = {
        authUi: { oauthProviders: ['google'] }
      }
    })
    await page.goto('/auth/signup')
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
    // The register form stays folded until the email method is chosen.
    await expect(page.getByLabel('Email')).toHaveCount(0)
    await page.getByRole('button', { name: 'Continue with email', exact: true }).click()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()
  })

  test('full loop: register → auto-login → verify phone in account → sign out → phone OTP login', async ({ page, testData }) => {
    test.skip(!backendConfigured, 'Needs a backend (E2E_API_BASE_URL).')
    test.skip(!(await authMethodOn('access_code')), 'Backend has access_code off.')
    test.skip(!(await captureEnabled()), 'Dev capture endpoints are not enabled.')

    const suffix = String(Date.now()).slice(-6)
    const email = testData.email('signup')
    const password = 'SignupTestpass1!'
    const phone = `+5491166${suffix}`

    // Register through the UI; success auto-logs-in and lands in the app.
    await page.goto('/auth/signup')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('First name').fill('E2E')
    await page.getByLabel('Last name').fill('Signup')
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByLabel('Confirm password').fill(password)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/app\//)
    // Fresh, role-less user: shell renders, admin resources hidden.
    await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0)

    // Add + verify the phone through the Account page UI. A new number goes straight to its
    // verification step (the code is sent on save).
    await page.goto('/app/account')
    await page.getByRole('button', { name: 'Add phone number' }).click()
    const phoneDialog = page.getByRole('dialog', { name: 'Add phone number' })
    await phoneDialog.getByLabel('Phone number').fill(phone)
    await phoneDialog.getByRole('button', { name: 'Save number' }).click()
    await expect(page.getByText('Phone number saved', { exact: true })).toBeVisible()
    await expect(page.getByText(`We sent a 6-digit code to ${phone}.`)).toBeVisible()

    const verifyCode = await capturePhoneVerifyCode(email)
    expect(verifyCode, 'captured phone-verify code').toMatch(/^\d{4,12}$/)
    for (let i = 0; i < 6; i++) {
      await page.getByRole('textbox', { name: `pin input ${i + 1} of 6` }).fill(verifyCode![i]!)
    }
    await expect(page.getByText('Phone number verified', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Verified', { exact: true })).toBeVisible()

    // Sign out, then sign back in by phone OTP through the unified flow.
    await signOutFromShell(page)
    await expect(page).toHaveURL(/\/auth\/login/)

    await openPhonePanel(page)
    await page.getByLabel('Phone number').fill(phone)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: 'Send code via WhatsApp' }).click()
    await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible()

    const code = await captureAccessCodeByPhone(phone)
    expect(code, 'captured 6-digit code').toMatch(/^\d{6}$/)
    for (let i = 0; i < 6; i++) {
      await page.getByRole('textbox', { name: `pin input ${i + 1} of 6` }).fill(code![i]!)
    }
    await expect(page).toHaveURL(/\/app\//)
    await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible()
  })
})
