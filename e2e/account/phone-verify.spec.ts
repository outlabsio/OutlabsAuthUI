import type { Page } from '@playwright/test'
import { expect, test } from '../support/fixtures'
import { patchAuthConfig } from '../support/capabilities'
import { apiUrl } from '../support/env'
import { corsHeaders, jsonResponse } from '../support/mocks'

// Account phone verification (F-099, F-100, F-101). Runs as the admin persona with its
// /users/me answer given a phone and the code requests mocked, so nothing is sent and the
// persona's record is not changed. Phone sign-in exists only when the server has access codes
// on; the verification step is tested with access codes forced on, and the plain-profile copy
// with them forced off, so both presets run every test.

test.use({ errorGuardMode: 'strict' })

const PHONE = '+15555550100'

async function withPhone(page: Page, verified: boolean) {
  await page.route(apiUrl('/users/me'), async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const response = await route.fetch()
    if (!response.ok()) return route.fulfill({ response })
    const user = await response.json() as Record<string, unknown>
    return route.fulfill({ response, json: { ...user, phone: PHONE, phone_verified: verified } })
  })
}

async function withAccessCodes(page: Page, on: boolean) {
  await patchAuthConfig(page, config => ({ ...config, auth_methods: { ...(config.auth_methods ?? {}), password: true, access_code: on } }))
}

async function countCodeRequests(page: Page) {
  const sent = { count: 0 }
  await page.route(apiUrl('/users/me/phone/request-code'), (route) => {
    if (route.request().method() === 'POST') sent.count += 1
    return route.fulfill({ status: 204, headers: corsHeaders('POST,OPTIONS') })
  })
  return sent
}

test.describe('Account phone verification', () => {
  test('focuses the code input once the code is sent, then resends and offers a different number', async ({ page }) => {
    await withAccessCodes(page, true)
    await withPhone(page, false)
    const sent = await countCodeRequests(page)

    await page.goto('/app/account')
    await expect(page.getByText(`Verify ${PHONE} to sign in with codes sent by WhatsApp or SMS.`)).toBeVisible()
    await page.getByRole('button', { name: 'Send verification code' }).click()
    await expect(page.getByText(`We sent a 6-digit code to ${PHONE}.`)).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'pin input 1 of 6' })).toBeFocused()
    expect(sent.count).toBe(1)

    // Resend waits out the cooldown the first request started.
    await expect(page.getByRole('button', { name: /^Resend code in \d+s$/ })).toBeDisabled()

    // A different number goes back to the number dialog.
    await page.getByRole('button', { name: 'Use a different number' }).click()
    const dialog = page.getByRole('dialog', { name: 'Change phone number' })
    await expect(dialog.getByLabel('Phone number')).toHaveValue(PHONE)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('button', { name: /^Send verification code/ })).toBeVisible()
  })

  // The code is a form field: a refused code is said on it and stays after the boxes clear,
  // instead of only in a toast (c-guardrails-03).
  test('a wrong code is said on the code field, not only in a toast', async ({ page, errorGuard }) => {
    errorGuard.allow({ status: 401, url: /phone\/verify-code/ })
    errorGuard.allow({ console: /status of 401/ })
    await withAccessCodes(page, true)
    await withPhone(page, false)
    await countCodeRequests(page)
    let confirms = 0
    await page.route(url => url.pathname.endsWith('/users/me/phone/verify-code'), (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders('POST,OPTIONS') })
      confirms += 1
      return route.fulfill(jsonResponse(401, { error: 'TOKEN_INVALID', message: 'Invalid or expired verification code' }, 'POST,OPTIONS'))
    })

    await page.goto('/app/account')
    await page.getByRole('button', { name: 'Send verification code' }).click()
    for (let i = 0; i < 6; i++) await page.getByRole('textbox', { name: `pin input ${i + 1} of 6` }).fill(String(i + 1))
    const message = 'This code is wrong or has expired. Check it and try again, or resend the code.'
    await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible()
    expect(confirms).toBe(1)
    await expect(page.locator('[aria-label="Phone verification code"]')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('Could not verify the phone number', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: 'pin input 1 of 6' })).toHaveValue('')
    await expect(page.getByRole('textbox', { name: 'pin input 1 of 6' })).toBeFocused()
  })

  test('a verified number warns before it is changed', async ({ page }) => {
    await withAccessCodes(page, true)
    await withPhone(page, true)
    await page.goto('/app/account')
    await expect(page.getByText('Verified', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Change number' }).click()
    const dialog = page.getByRole('dialog', { name: 'Change phone number' })
    await expect(dialog.getByText('Your current number is verified')).toBeVisible()
    await expect(dialog.getByText(`you can no longer sign in with codes sent to ${PHONE}`)).toBeVisible()
  })

  test('without access codes the number is plain profile data: no sign-in promise, no verification', async ({ page }) => {
    await withAccessCodes(page, false)
    await withPhone(page, false)
    const sent = await countCodeRequests(page)
    await page.goto('/app/account')
    await expect(page.getByTestId('account-phone')).toHaveText(PHONE)
    await expect(page.getByText('A contact number for your account.')).toBeVisible()
    await expect(page.getByRole('button', { name: /Send verification code/ })).toHaveCount(0)
    await expect(page.getByText('Not verified', { exact: true })).toHaveCount(0)
    await expect(page.getByText(/sign-in codes/)).toHaveCount(0)
    expect(sent.count).toBe(0)
  })
})
