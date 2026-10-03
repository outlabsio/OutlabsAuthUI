import { expect, persona, test } from '../support/fixtures'
import { apiUrl } from '../support/env'
import { corsHeaders } from '../support/mocks'

// Phone-OTP recovery lands on Account with the outcome of its reset email
// (?recover=password&reset=sent|failed|none); the prompt must say what really happened and
// the query must not stay in the URL (WP-10, F-198 / F-108). Account-link failures
// (?link_error=<code>) are covered in social-accounts.spec.ts. Runs as the admin persona; the
// reset-link request is mocked so no email is sent for the persona.

test.use({ errorGuardMode: 'strict' })

test.describe('Account after phone recovery', () => {
  test('says the reset email went out, then cleans the URL', async ({ page }) => {
    await page.goto('/app/account?recover=password&reset=sent')
    await expect(page.getByText(`We emailed a password-reset link to ${persona('admin').email}.`, { exact: false })).toBeVisible()
    await expect(page).toHaveURL(url => url.pathname === '/app/account' && url.search === '')
  })

  test('offers to send the reset link when the email was not sent', async ({ page }) => {
    let requests = 0
    await page.route(apiUrl('/auth/forgot-password'), (route) => {
      if (route.request().method() === 'POST') requests += 1
      return route.fulfill({ status: 204, headers: corsHeaders('POST,OPTIONS') })
    })
    await page.goto('/app/account?recover=password&reset=failed')
    await expect(page.getByText('We could not email you a password-reset link.', { exact: false })).toBeVisible()
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByText('Reset link sent', { exact: true })).toBeVisible()
    await expect(page.getByText(`We emailed a password-reset link to ${persona('admin').email}.`, { exact: false })).toBeVisible()
    expect(requests).toBe(1)
  })

  test('explains an account without an email', async ({ page }) => {
    await page.goto('/app/account?recover=password&reset=none')
    await expect(page.getByText('Your account has no email address', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send reset link' })).toHaveCount(0)
  })
})
