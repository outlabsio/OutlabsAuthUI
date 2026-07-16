import type { Page } from '@playwright/test'

import { expect, test } from '../support/auth-fixture'
import { authPersonas, e2eBaseURL } from '../support/auth-personas'
import {
  skipIfPhoneVerifyCaptureDisabled,
  waitForCapturedPhoneVerifyCode,
} from '../support/phone-verify-capture'

async function openAccountWorkspace(page: Page) {
  await page.goto('/app/dashboard')

  const trigger = page.getByRole('button', {
    name: 'Open account menu for admin@acme.com',
  })

  await expect(trigger).toBeVisible()
  await trigger.click()
  await page.getByRole('menuitem', { name: 'Account' }).click()

  await expect(page).toHaveURL(/\/app\/account$/)
  await expect(page.getByRole('button', { name: 'Open Account guide' })).toBeVisible()
}

test.describe('Account Workspace', () => {
  test('admin can open account and update self profile details', async ({
    page,
  }) => {
    await openAccountWorkspace(page)

    const firstNameField = page.locator('#account-first-name')
    const lastNameField = page.locator('#account-last-name')
    const emailField = page.locator('#account-email')
    const originalFirstName = await firstNameField.inputValue()
    const originalLastName = await lastNameField.inputValue()
    const updatedFirstName = originalFirstName || 'Admin'
    const updatedLastName = `${originalLastName || 'Admin'} UI`

    await expect(emailField).toHaveValue('admin@acme.com')

    await firstNameField.fill(updatedFirstName)
    await lastNameField.fill(updatedLastName)
    await page.getByRole('button', { name: 'Save profile' }).click()

    await expect(firstNameField).toHaveValue(updatedFirstName)
    await expect(lastNameField).toHaveValue(updatedLastName)

    const trigger = page.getByRole('button', {
      name: 'Open account menu for admin@acme.com',
    })
    await trigger.click()
    const accountMenu = page.getByRole('menu').filter({
      has: page.getByRole('menuitem', { name: 'Account' }),
    })
    await expect(accountMenu.getByText(`${updatedFirstName} ${updatedLastName}`)).toBeVisible()

    await page.getByRole('menuitem', { name: 'Account' }).click()
    await expect(page).toHaveURL(/\/app\/account$/)

    await firstNameField.fill(originalFirstName)
    await lastNameField.fill(originalLastName)
    await page.getByRole('button', { name: 'Save profile' }).click()

    await expect(firstNameField).toHaveValue(originalFirstName)
    await expect(lastNameField).toHaveValue(originalLastName)
  })

  test('account password form validates confirmation before submit', async ({
    page,
  }) => {
    await openAccountWorkspace(page)

    await page.locator('#account-current-password').fill('Testpass1!')
    await page.locator('#account-new-password').fill('Newpass123!')
    await page.locator('#account-confirm-password').fill('Mismatch123!')
    await page.getByRole('button', { name: 'Update password' }).click()

    await expect(page.getByText('Passwords must match.')).toBeVisible()
  })

  test('admin can view active sessions and linked accounts on account page', async ({
    page,
  }) => {
    await openAccountWorkspace(page)

    await expect(page.getByText('Active sessions', { exact: true })).toBeVisible()
    await expect(page.getByText('Linked accounts', { exact: true })).toBeVisible()
    await expect(
      page
        .getByRole('heading', { name: 'No linked accounts' })
        .or(page.getByText(/Verified email|Unverified email/i))
    ).toBeVisible()
  })

  test('Link Google completes via mocked associate authorize + linked callback', async ({
    page,
  }) => {
    const linkedCallback = new URL('/app/account', e2eBaseURL)
    linkedCallback.searchParams.set('linked', 'google')

    await page.route('**/oauth-associate/google/authorize**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          authorization_url: linkedCallback.toString(),
        },
      })
    })

    await openAccountWorkspace(page)

    const linkGoogle = page.getByRole('button', { name: 'Link Google' })
    test.skip(
      !(await linkGoogle.isVisible()),
      'Link Google is unavailable when Google is already linked for this account.'
    )

    await linkGoogle.click()

    await expect(page).toHaveURL(/\/app\/account(?:\?.*)?$/)
    await expect(page.getByText('Google linked to your account.')).toBeVisible()
    await expect(page).toHaveURL(/\/app\/account$/)
  })

  test('live phone verification completes via fixture code capture', async ({
    page,
  }) => {
    await skipIfPhoneVerifyCaptureDisabled()

    const phone = `+1555${String(Date.now()).slice(-7)}`
    const email = authPersonas.admin.email

    await openAccountWorkspace(page)

    await page.locator('#account-phone').fill(phone)
    await page.getByRole('button', { name: 'Save profile' }).click()
    await expect(
      page.getByText('WhatsApp phone unverified', { exact: true })
    ).toBeVisible()

    await page.getByRole('button', { name: 'Send verification code' }).click()
    const captured = await waitForCapturedPhoneVerifyCode(email, { phone })

    await page.locator('#account-phone-verify-code').fill(captured.code)
    await page.getByRole('button', { name: 'Verify phone' }).click()

    await expect(
      page.getByText('WhatsApp phone verified', { exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Verify WhatsApp phone' })
    ).toBeHidden()

    await page.locator('#account-phone').fill('')
    await page.getByRole('button', { name: 'Save profile' }).click()
    await expect(page.locator('#account-phone')).toHaveValue('')
  })
})
