import { backendConfigured, expect, test } from '../support/fixtures'

// F-055: when /auth/config cannot be loaded, nothing capability-gated is assumed to exist. The
// route renders in place (the deep link survives) but its gate shows "Server capabilities
// unavailable" with Retry, capability-gated nav items stay hidden, the shell shows a persistent
// Retry notice, and a successful retry restores the page without a reload.
test.describe('capabilities fail closed', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('a failed /auth/config denies gated routes until a retry succeeds', async ({ page, errorGuard }) => {
    // The mocked /auth/config outage under test.
    errorGuard.allow({ status: 503, url: /\/auth\/config$/ })
    let failConfig = true
    await page.route('**/auth/config', async (route) => {
      if (!failConfig || route.request().method() === 'OPTIONS') return route.continue()
      return route.fulfill({ status: 503, json: { detail: 'Service unavailable' } })
    })

    await page.goto('/app/users')
    // The deep link is kept, but the page is gated.
    await expect(page).toHaveURL(/\/app\/users$/)
    await expect(page.getByRole('heading', { name: 'Server capabilities unavailable' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add user' })).toHaveCount(0)
    await expect(page.getByPlaceholder('Search users...')).toHaveCount(0)
    // Only the ungated sections remain in the nav.
    await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Roles', exact: true })).toHaveCount(0)
    // The persistent shell notice.
    await expect(page.getByText('Can\'t load the auth server\'s capabilities', { exact: true })).toBeVisible()

    failConfig = false
    // Retry from the page's own gate state (the shell notice has one too).
    await page.getByRole('heading', { name: 'Server capabilities unavailable' })
      .locator('xpath=ancestor::*[@data-slot="root"][1]')
      .getByRole('button', { name: 'Retry' })
      .click()

    await expect(page.getByRole('button', { name: 'Add user' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Server capabilities unavailable' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Users', exact: true })).toBeVisible()
    await expect(page.getByText('Can\'t load the auth server\'s capabilities', { exact: true })).toHaveCount(0)
  })
})
