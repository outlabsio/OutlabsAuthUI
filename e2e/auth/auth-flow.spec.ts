import { authMethodOn, backendConfigured, expect, persona, test } from '../support/fixtures'
import { apiUrl } from '../support/env'
import { corsHeaders, jsonResponse } from '../support/mocks'
import { mockPasswordOnlyConfig, openEmailForm, signInWithPassword } from '../support/sign-in'
import { sidebarNav, signOutFromShell } from '../support/shell'

// Role/label-first selectors (P0 rule) — Nuxt UI is built on Reka UI with proper ARIA, so
// accessible selectors are the durable ones. No CSS/class selectors.
test.describe('auth flow', () => {
  test('renders the sign-in form directly when email is the only method', async ({ page }) => {
    // Password-only capabilities (mocked — deterministic no matter which backend the dev
    // server can reach): no OAuth providers + no phone OTP → the form renders directly.
    await mockPasswordOnlyConfig(page)
    await page.goto('/auth/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with email', exact: true })).toHaveCount(0)
  })

  test('offers email and phone as method buttons when both are available', async ({ page }) => {
    test.skip(!(await authMethodOn('access_code')), 'Needs a backend with access codes on.')
    await page.goto('/auth/login')
    await expect(page.getByRole('button', { name: 'Continue with email', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with phone' })).toBeVisible()
    // The email form stays folded until chosen. Nuxt UI keeps it mounted so switching methods
    // preserves typed values, but the disclosure remains inaccessible while closed.
    await expect(page.getByLabel('Password', { exact: true })).toBeHidden()
    // …then unfolds in place.
    await page.getByRole('button', { name: 'Continue with email', exact: true }).click()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with email', exact: true })).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('button', { name: 'Continue with phone' })).toHaveAttribute('aria-expanded', 'false')
    await page.getByRole('button', { name: 'Continue with phone' }).click()
    await expect(page.getByLabel('Password', { exact: true })).toBeHidden()
    await expect(page.getByLabel('Phone number')).toBeVisible()
    await expect(page.getByLabel('Country code')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with phone' })).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('button', { name: 'Continue with email', exact: true })).toHaveAttribute('aria-expanded', 'false')
  })

  test('validates the email form before submitting', async ({ page }) => {
    await mockPasswordOnlyConfig(page)
    await page.goto('/auth/login')
    await openEmailForm(page)
    await page.getByRole('button', { name: 'Sign in' }).click()
    // UForm blocks submit and surfaces Zod messages; we should still be on /auth/login.
    await expect(page).toHaveURL(/\/auth\/login/)
    await expect(page.getByText('Email is required.')).toBeVisible()
  })

  test('rejects a malformed email', async ({ page }) => {
    await mockPasswordOnlyConfig(page)
    await page.goto('/auth/login')
    await openEmailForm(page)
    await page.getByLabel('Email').fill('not-an-email')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Enter a valid email address.')).toBeVisible()
  })

  test('redirects unauthenticated access to login', async ({ page }) => {
    await page.goto('/app/dashboard')
    await expect(page).toHaveURL(/\/auth\/login\?redirect=/)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })

  test('surfaces an error on invalid credentials', async ({ page, errorGuard }) => {
    // The mocked refusal under test.
    errorGuard.allow({ status: 401, url: /\/auth\/login$/ })
    // Mock a 401 so this runs without a backend. CORS headers keep the credentialed
    // cross-origin fetch from being blocked before the app can read the status.
    await page.route(apiUrl('/auth/login'), async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: corsHeaders('POST,OPTIONS') })
      }
      return route.fulfill(jsonResponse(401, { detail: 'Invalid email or password.' }, 'POST,OPTIONS'))
    })

    await signInWithPassword(page, 'nobody@example.com', 'wrongpassword')

    // `exact` avoids the ARIA live-region announcement ("Notification Sign in failed").
    await expect(page.getByText('Sign in failed', { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/\/auth\/login/)
  })

  test('signs in and reaches the app shell', async ({ page, errorGuard }) => {
    // A dashboard request still in flight when this test signs out is answered 401 once the session ends.
    errorGuard.allow({ status: 401, url: /\/memberships\/me/ })
    test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

    await signInWithPassword(
      page,
      persona('admin').email,
      persona('admin').password
    )

    await expect(page).toHaveURL(/\/app\//)
    await expect(sidebarNav(page).getByRole('link', { name: 'Users', exact: true })).toBeVisible()

    // Sign out returns to the login screen.
    await signOutFromShell(page)
    await expect(page).toHaveURL(/\/auth\/login/)
  })
})
