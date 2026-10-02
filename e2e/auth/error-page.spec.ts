import { expect, test } from '../support/fixtures'

// The full-page error screen (app/error.vue): status-aware title and copy, and a way back.
// Signed-out context (chromium-guest), so "back to the console" lands on sign-in.
test.describe('error page', () => {
  test('an unknown route shows a 404 page titled by its status, with a way home', async ({ page, errorGuard }) => {
    // Nuxt logs the unmatched route it renders the 404 page for.
    errorGuard.allow({ kind: 'console', console: /NUXT_E1005|Page not found/ })
    await page.goto('/definitely-not-a-console-page')
    await expect(page).toHaveTitle(/^404 · Page not found · /)
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    await expect(page.getByText('404', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reload page' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Back to the console' }).click()
    await expect(page).toHaveURL(/\/auth\/login/)
  })

  test('/app redirects to the dashboard instead of a 404', async ({ page }) => {
    await page.goto('/app')
    // Signed out: the guard sends the dashboard target through sign-in.
    await expect(page).toHaveURL(url => url.pathname === '/auth/login' && url.searchParams.get('redirect') === '/app/dashboard')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })
})
