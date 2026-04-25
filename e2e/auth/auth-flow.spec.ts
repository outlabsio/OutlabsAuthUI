import type { Page } from '@playwright/test'

import { expect, test } from '@playwright/test'

import { authPersonas } from '../support/auth-personas'

const emptyStorageState = {
  cookies: [],
  origins: [],
}

const magicLinkAuthConfig = {
  preset: 'EnterpriseRBAC',
  features: {
    entity_hierarchy: true,
    context_aware_roles: true,
    abac: true,
    tree_permissions: true,
    api_keys: true,
    system_api_keys: true,
    user_status: true,
    activity_tracking: true,
    invitations: true,
    magic_links: true,
    access_codes: false,
  },
  auth_methods: {
    password: true,
    magic_link: true,
    access_code: false,
  },
  available_permissions: ['user:read'],
}

const accessCodeAuthConfig = {
  ...magicLinkAuthConfig,
  features: {
    ...magicLinkAuthConfig.features,
    magic_links: false,
    access_codes: true,
  },
  auth_methods: {
    password: true,
    magic_link: false,
    access_code: true,
  },
}

const magicLinkSessionUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'admin@acme.com',
  first_name: 'Admin',
  last_name: 'User',
  status: 'active',
  email_verified: true,
  is_superuser: true,
}

async function expectLoginPage(page: Page) {
  await expect(
    page.getByRole('heading', {
      name: 'Welcome back',
    })
  ).toBeVisible()
  await expect(page.locator('#email')).toBeVisible()
  await expect(page.locator('#password')).toBeVisible()
}

async function signIn(page: Page, email: string, password: string) {
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test.describe('Auth Flow', () => {
  test.use({ storageState: emptyStorageState })

  test('unauthenticated entrypoints redirect to the login page', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/auth\/login$/)
    await expectLoginPage(page)

    await page.goto('/app/dashboard')
    await expect(page).toHaveURL(/\/auth\/login$/)
    await expectLoginPage(page)
  })

  test('invalid credentials stay on login and surface an error', async ({ page }) => {
    await page.goto('/auth/login')
    await expectLoginPage(page)

    await signIn(page, authPersonas.admin.email, 'Wrongpass1!')

    await expect(page).toHaveURL(/\/auth\/login$/)
    await expect(
      page.getByText(/Unable to sign in|Invalid credentials|Invalid email or password/i)
    ).toBeVisible()
  })

  test('successful sign-in lands on the dashboard', async ({ page }) => {
    await page.goto('/auth/login')
    await expectLoginPage(page)

    await signIn(page, authPersonas.admin.email, authPersonas.admin.password)

    await expect(page).toHaveURL(/\/app\/dashboard$/)
    await expect(page.getByRole('button', { name: 'Open Dashboard guide' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open Users workspace' })).toBeVisible()
  })

  test('expired access token refreshes once and keeps the user in the app', async ({ page }) => {
    let refreshCount = 0
    let sessionCount = 0

    await page.addInitScript(() => {
      window.localStorage.setItem('outlabs-auth.access-token', 'expired-access-token')
      window.localStorage.setItem('outlabs-auth.refresh-token', 'valid-refresh-token')
    })
    await page.route('**/v1/users/me', async (route) => {
      sessionCount += 1

      if (sessionCount === 1) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          json: {
            detail: 'Access token expired.',
          },
        })
        return
      }

      expect(route.request().headers().authorization).toBe(
        'Bearer refreshed-access-token'
      )
      await route.fulfill({
        contentType: 'application/json',
        json: magicLinkSessionUser,
      })
    })
    await page.route('**/v1/auth/refresh', async (route) => {
      refreshCount += 1
      expect(route.request().postDataJSON()).toEqual({
        refresh_token: 'valid-refresh-token',
      })
      await route.fulfill({
        contentType: 'application/json',
        json: {
          access_token: 'refreshed-access-token',
          refresh_token: 'rotated-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
        },
      })
    })
    await page.route('**/v1/auth/config', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: magicLinkAuthConfig,
      })
    })

    await page.goto('/app/dashboard')

    await expect(page).toHaveURL(/\/app\/dashboard$/)
    await expect(page.getByText('Auth configuration snapshot')).toBeVisible()
    expect(refreshCount).toBe(1)
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem('outlabs-auth.access-token'))
      )
      .toBe('refreshed-access-token')
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem('outlabs-auth.refresh-token'))
      )
      .toBe('rotated-refresh-token')
  })

  test('failed refresh clears stored tokens and returns to login', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('outlabs-auth.access-token', 'expired-access-token')
      window.localStorage.setItem('outlabs-auth.refresh-token', 'invalid-refresh-token')
    })
    await page.route('**/v1/users/me', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        json: {
          detail: 'Access token expired.',
        },
      })
    })
    await page.route('**/v1/auth/refresh', async (route) => {
      expect(route.request().postDataJSON()).toEqual({
        refresh_token: 'invalid-refresh-token',
      })
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        json: {
          detail: 'Refresh token expired.',
        },
      })
    })

    await page.goto('/app/dashboard')

    await expect(page).toHaveURL(/\/auth\/login$/)
    await expectLoginPage(page)
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem('outlabs-auth.access-token'))
      )
      .toBeNull()
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem('outlabs-auth.refresh-token'))
      )
      .toBeNull()
  })

  test('magic link method is surfaced and requests an email link', async ({ page }) => {
    let requestBody: unknown = null

    await page.route('**/v1/auth/config', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: magicLinkAuthConfig,
      })
    })
    await page.route('**/v1/auth/magic-link/request', async (route) => {
      requestBody = route.request().postDataJSON()
      await route.fulfill({ status: 204 })
    })

    await page.goto('/auth/login')
    await expectLoginPage(page)

    await page.getByText('Email me a sign-in link').click()
    await expect(page).toHaveURL(/\/auth\/magic-link$/)

    await page.locator('#magic-link-email').fill('admin@acme.com')
    await page.getByRole('button', { name: 'Send sign-in link' }).click()

    await expect(
      page.getByRole('heading', {
        name: 'Check your email',
      })
    ).toBeVisible()
    expect(requestBody).toMatchObject({
      email: 'admin@acme.com',
      redirect_url: expect.stringContaining('/app/dashboard'),
    })
  })

  test('magic link request cooldown persists across reloads', async ({ page }) => {
    let requestCount = 0

    await page.route('**/v1/auth/config', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: magicLinkAuthConfig,
      })
    })
    await page.route('**/v1/auth/magic-link/request', async (route) => {
      requestCount += 1
      await route.fulfill({ status: 204 })
    })

    await page.goto('/auth/magic-link')
    await page.locator('#magic-link-email').fill('admin@acme.com')
    await page.getByRole('button', { name: 'Send sign-in link' }).click()

    await expect(
      page.getByRole('heading', {
        name: 'Check your email',
      })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Request another link in/ })
    ).toBeDisabled()
    expect(requestCount).toBe(1)

    await page.goto('/auth/magic-link')
    await page.locator('#magic-link-email').fill('admin@acme.com')
    await expect(
      page.getByRole('button', { name: /Send again in/ })
    ).toBeDisabled()
    expect(requestCount).toBe(1)
  })

  test('password reset cooldown honors server retry metadata', async ({ page }) => {
    let requestCount = 0

    await page.route('**/v1/auth/forgot-password', async (route) => {
      requestCount += 1
      await route.fulfill({
        contentType: 'application/json',
        headers: {
          'Retry-After': '90',
        },
        status: 429,
        json: {
          detail: {
            message: 'Too many password reset requests. Please try again later.',
            retry_after_seconds: 90,
            retry_after_minutes: 1.5,
          },
        },
      })
    })

    await page.goto('/auth/forgot-password')
    await page.locator('#forgot-password-email').fill('admin@acme.com')
    await page.getByRole('button', { name: 'Send reset link' }).click()

    await expect(
      page
        .getByRole('alert')
        .filter({
          hasText: 'Too many password reset requests. Please try again later.',
        })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Send again in 1m/ })
    ).toBeDisabled()
    expect(requestCount).toBe(1)

    await page.goto('/auth/forgot-password')
    await page.locator('#forgot-password-email').fill('admin@acme.com')
    await expect(
      page.getByRole('button', { name: /Send again in 1m/ })
    ).toBeDisabled()
    expect(requestCount).toBe(1)
  })

  test('magic link token exchange lands on the dashboard', async ({ page }) => {
    let verifyBody: unknown = null

    await page.route('**/v1/auth/config', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: magicLinkAuthConfig,
      })
    })
    await page.route('**/v1/auth/magic-link/verify', async (route) => {
      verifyBody = route.request().postDataJSON()
      await route.fulfill({
        contentType: 'application/json',
        json: {
          access_token: 'magic-access-token',
          refresh_token: 'magic-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
        },
      })
    })
    await page.route('**/v1/users/me', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: magicLinkSessionUser,
      })
    })

    await page.goto('/auth/magic-link?token=one-time-token')

    await expect(page).toHaveURL(/\/app\/dashboard$/)
    await expect(page.getByText('Auth configuration snapshot')).toBeVisible()
    expect(verifyBody).toEqual({
      token: 'one-time-token',
    })
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem('outlabs-auth.access-token'))
      )
      .toBe('magic-access-token')
  })

  test('access code method requests a code and signs in with it', async ({ page }) => {
    let requestBody: unknown = null
    let verifyBody: unknown = null

    await page.route('**/v1/auth/config', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: accessCodeAuthConfig,
      })
    })
    await page.route('**/v1/auth/access-code/request', async (route) => {
      requestBody = route.request().postDataJSON()
      await route.fulfill({ status: 204 })
    })
    await page.route('**/v1/auth/access-code/verify', async (route) => {
      verifyBody = route.request().postDataJSON()
      await route.fulfill({
        contentType: 'application/json',
        json: {
          access_token: 'access-code-token',
          refresh_token: 'access-code-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
        },
      })
    })
    await page.route('**/v1/users/me', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: magicLinkSessionUser,
      })
    })

    await page.goto('/auth/login')
    await expectLoginPage(page)

    await page.getByText('Email me a sign-in code').click()
    await expect(page).toHaveURL(/\/auth\/access-code$/)

    await page.locator('#access-code-email').fill('admin@acme.com')
    await page.getByRole('button', { name: 'Send sign-in code' }).click()

    await expect(page.getByText('Verify your login')).toBeVisible()
    expect(requestBody).toMatchObject({
      email: 'admin@acme.com',
      redirect_url: expect.stringContaining('/app/dashboard'),
    })

    await page.locator('#access-code-code').fill('123456')
    await page.getByRole('button', { name: 'Verify' }).click()

    await expect(page).toHaveURL(/\/app\/dashboard$/)
    await expect(page.getByText('Auth configuration snapshot')).toBeVisible()
    expect(verifyBody).toEqual({
      email: 'admin@acme.com',
      code: '123456',
    })
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem('outlabs-auth.access-token'))
      )
      .toBe('access-code-token')
  })

  test('access code entry is reachable after the original tab is closed', async ({ page }) => {
    let verifyBody: unknown = null

    await page.route('**/v1/auth/config', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: accessCodeAuthConfig,
      })
    })
    await page.route('**/v1/auth/access-code/verify', async (route) => {
      verifyBody = route.request().postDataJSON()
      await route.fulfill({
        contentType: 'application/json',
        json: {
          access_token: 'direct-access-code-token',
          refresh_token: 'direct-access-code-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
        },
      })
    })
    await page.route('**/v1/users/me', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: magicLinkSessionUser,
      })
    })

    await page.goto('/auth/login')
    await page.getByRole('link', { name: 'Enter code' }).click()
    await expect(page).toHaveURL(/\/auth\/access-code\?mode=verify$/)

    await expect(page.getByText('Verify your login')).toBeVisible()
    await page.locator('#access-code-verify-email').fill('admin@acme.com')
    await page.locator('#access-code-code').fill('123456')
    await page.getByRole('button', { name: 'Verify' }).click()

    await expect(page).toHaveURL(/\/app\/dashboard$/)
    expect(verifyBody).toEqual({
      email: 'admin@acme.com',
      code: '123456',
    })
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem('outlabs-auth.access-token'))
      )
      .toBe('direct-access-code-token')
  })

  test('access code route reports when the method is disabled', async ({ page }) => {
    await page.route('**/v1/auth/config', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          ...accessCodeAuthConfig,
          features: {
            ...accessCodeAuthConfig.features,
            access_codes: false,
          },
          auth_methods: {
            ...accessCodeAuthConfig.auth_methods,
            access_code: false,
          },
        },
      })
    })

    await page.goto('/auth/access-code')

    await expect(
      page.getByRole('heading', {
        name: 'Access codes unavailable',
      })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Back to sign in' })
    ).toBeVisible()
  })
})
