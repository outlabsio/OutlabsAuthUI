import { backendConfigured, expect, test } from '../support/fixtures'

// Role/label-first selectors (P0 rule) — Nuxt UI is built on Reka UI with proper ARIA, so
// accessible selectors are the durable ones. No CSS/class selectors.
test.describe('auth flow', () => {
  test('renders the sign-in form', async ({ page }) => {
    await page.goto('/auth/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('validates required fields before submitting', async ({ page }) => {
    await page.goto('/auth/login')
    await page.getByRole('button', { name: 'Sign in' }).click()
    // UForm blocks submit and surfaces Zod messages; we should still be on /auth/login.
    await expect(page).toHaveURL(/\/auth\/login/)
    await expect(page.getByText('Email is required.')).toBeVisible()
  })

  test('redirects unauthenticated access to login', async ({ page }) => {
    await page.goto('/app/dashboard')
    await expect(page).toHaveURL(/\/auth\/login\?redirect=/)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })

  test('surfaces an error on invalid credentials', async ({ page }) => {
    // Mock a 401 so this runs without a backend. CORS headers keep the credentialed
    // cross-origin fetch from being blocked before the app can read the status.
    await page.route('**/v1/auth/login', async (route) => {
      const cors = {
        'access-control-allow-origin': 'http://localhost:3000',
        'access-control-allow-credentials': 'true',
        'access-control-allow-headers': 'content-type,authorization',
        'access-control-allow-methods': 'POST,OPTIONS'
      }
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: cors })
      }
      return route.fulfill({
        status: 401,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify({ detail: 'Invalid email or password.' })
      })
    })

    await page.goto('/auth/login')
    await page.getByLabel('Email').fill('nobody@example.com')
    await page.getByLabel('Password').fill('wrongpassword')
    await page.getByRole('button', { name: 'Sign in' }).click()

    // `exact` avoids the ARIA live-region announcement ("Notification Sign in failed").
    await expect(page.getByText('Sign in failed', { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/\/auth\/login/)
  })

  test('signs in and reaches the app shell', async ({ page }) => {
    test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

    await page.goto('/auth/login')
    await page.getByLabel('Email').fill(process.env.E2E_ADMIN_EMAIL ?? 'admin@test.com')
    await page.getByLabel('Password').fill(process.env.E2E_ADMIN_PASSWORD ?? 'Test123!!')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL(/\/app\//)
    await expect(page.getByRole('link', { name: 'Users' })).toBeVisible()

    // Sign out returns to the login screen.
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/auth\/login/)
  })
})
