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
  },
  auth_methods: {
    password: true,
    magic_link: true,
  },
  available_permissions: ['user:read'],
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
})
