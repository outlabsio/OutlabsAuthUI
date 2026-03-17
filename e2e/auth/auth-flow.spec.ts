import type { Page } from '@playwright/test'

import { expect, test } from '@playwright/test'

import { authPersonas } from '../support/auth-personas'

const emptyStorageState = {
  cookies: [],
  origins: [],
}

async function expectLoginPage(page: Page) {
  await expect(
    page.getByRole('heading', {
      name: 'Welcome back',
    })
  ).toBeVisible()
  await expect(page.getByText('Use admin@acme.com')).toBeVisible()
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
    await expect(page.getByText(/Unable to sign in|Invalid credentials/i)).toBeVisible()
  })

  test('successful sign-in lands on the dashboard', async ({ page }) => {
    await page.goto('/auth/login')
    await expectLoginPage(page)

    await signIn(page, authPersonas.admin.email, authPersonas.admin.password)

    await expect(page).toHaveURL(/\/app\/dashboard$/)
    await expect(
      page.getByRole('heading', {
        name: 'Dashboard',
      })
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open Users workspace' })).toBeVisible()
  })
})
