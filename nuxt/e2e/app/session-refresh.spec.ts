import { backendConfigured, expect, test } from '../support/fixtures'

// Token-refresh + expiry hardening. Mocks a mid-session 401 on the users list (leaving the
// real /users/me + /auth/config from boot untouched) to drive the api client's single-flight
// refresh-and-retry, and its logout-on-failed-refresh path. Authenticated (chromium) project.
const corsHeaders: Record<string, string> = {
  'access-control-allow-origin': 'http://localhost:3000',
  'access-control-allow-credentials': 'true',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type'
}

function jsonBody(body: object) {
  return { headers: { ...corsHeaders, 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

test.describe('session refresh', () => {
  test.skip(!backendConfigured, 'Needs a seeded backend (E2E_API_BASE_URL).')

  test('a mid-session 401 refreshes the token once and retries transparently', async ({ page }) => {
    let listCalls = 0
    let refreshCalls = 0

    await page.route(/\/v1\/users\/\?/, async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders })
      listCalls++
      if (listCalls === 1) return route.fulfill({ status: 401, ...jsonBody({ detail: 'token expired' }) })
      return route.fulfill({
        status: 200,
        ...jsonBody({ items: [{ id: 'u1', email: 'after-refresh@example.com', status: 'active', email_verified: true, is_superuser: false }], total: 1 })
      })
    })
    await page.route(/\/v1\/auth\/refresh/, async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders })
      refreshCalls++
      return route.fulfill({ status: 200, ...jsonBody({ access_token: 'refreshed-access', refresh_token: 'refreshed-refresh' }) })
    })

    await page.goto('/app/users')

    // The retry (after refresh) renders the mocked row — proving the refresh was transparent.
    await expect(page.getByText('after-refresh@example.com')).toBeVisible()
    expect(refreshCalls).toBe(1)
    expect(listCalls).toBeGreaterThanOrEqual(2)
  })

  test('a failed refresh clears the session and redirects to login', async ({ page }) => {
    await page.route(/\/v1\/users\/\?/, (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders })
      return route.fulfill({ status: 401, ...jsonBody({ detail: 'token expired' }) })
    })
    await page.route(/\/v1\/auth\/refresh/, (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders })
      return route.fulfill({ status: 401, ...jsonBody({ detail: 'refresh expired' }) })
    })

    await page.goto('/app/users')
    await expect(page).toHaveURL(/\/auth\/login/)
  })
})
