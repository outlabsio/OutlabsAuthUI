import type { Page } from '@playwright/test'

import { expect, test } from '../support/auth-fixture'

async function gotoDashboard(page: Page) {
  await page.goto('/app/dashboard')

  await expect(page).toHaveURL(/\/app\/dashboard$/)
  await expect(page.getByRole('button', { name: 'Open Dashboard guide' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Account workspace' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Users workspace' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open API Keys workspace' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open System API Keys workspace' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Settings workspace' })).toBeVisible()
}

async function openUserMenu(page: Page, email: string) {
  const trigger = page.getByRole('button', {
    name: `Open account menu for ${email}`,
  })

  await expect(trigger).toBeVisible()
  await trigger.click()
}

test.describe('App Shell', () => {
  test('admin can navigate the shell with only live workspace routes', async ({
    page,
  }) => {
    await gotoDashboard(page)

    await expect(page.getByText('OutlabsAuth Console')).toHaveCount(0)
    await expect(page.getByText('Dashboard').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open Dashboard guide' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open Account workspace' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Dashboard' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'API Keys', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'System API Keys', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Settings', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Users', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Permissions', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Roles', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Entities', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Providers' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Policies' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Invites' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Sessions' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Branding' })).toHaveCount(0)

    await page.goto('/app/api-keys')
    await expect(page).toHaveURL(/\/app\/api-keys$/)
    await expect(page.getByRole('button', { name: 'Open API Keys guide' })).toBeVisible()

    await page.goto('/app/users/api-keys')
    await expect(page).toHaveURL(/\/app\/users\/api-keys(?:\?.*)?$/)
    await expect(page.getByRole('button', { name: 'Open System API Keys guide' })).toBeVisible()


    await page.goto('/app/settings')
    await expect(page).toHaveURL(/\/app\/settings$/)
    await expect(page.getByRole('button', { name: 'Open Settings guide' })).toBeVisible()

    await page.goto('/app/users')
    await expect(page).toHaveURL(/\/app\/users(?:\?.*)?$/)
    await expect(page.getByRole('button', { name: 'Open Users guide' })).toBeVisible()

    await page.goto('/app/permissions')
    await expect(page).toHaveURL(/\/app\/permissions(?:\?.*)?$/)
    await expect(page.getByRole('button', { name: 'Open Permissions guide' })).toBeVisible()

    await page.goto('/app/roles')
    await expect(page).toHaveURL(/\/app\/roles(?:\?.*)?$/)
    await expect(page.getByRole('button', { name: 'Open Roles guide' })).toBeVisible()

    await page.goto('/app/entities')
    await expect(page).toHaveURL(/\/app\/entities(?:\?.*)?$/)
    await expect(page.getByRole('button', { name: 'Open Entities guide' })).toBeVisible()

    await page.goto('/app/dashboard')
    await expect(page).toHaveURL(/\/app\/dashboard$/)
    await expect(page.getByRole('button', { name: 'Open Dashboard guide' })).toBeVisible()

    await page.goto('/auth/login')
    await expect(page).toHaveURL(/\/app\/dashboard$/)
  })

  test('admin can sign out and protected routes redirect back to login', async ({
    page,
  }) => {
    await gotoDashboard(page)
    await openUserMenu(page, 'admin@acme.com')

    await expect(page.getByRole('menuitemcheckbox', { name: 'Dark mode' })).toBeVisible()

    const logoutResponsePromise = page.waitForResponse((response) => {
      return (
        response.request().method() === 'POST' &&
        response.url().includes('/auth/logout')
      )
    })

    await page.getByRole('menuitem', { name: 'Sign out' }).click()

    const logoutResponse = await logoutResponsePromise
    expect(logoutResponse.status()).toBe(204)

    await expect(page).toHaveURL(/\/auth\/login$/)
    await expect(
      page.getByRole('heading', {
        name: 'Welcome back',
      })
    ).toBeVisible()

    await page.goto('/app/dashboard')
    await expect(page).toHaveURL(/\/auth\/login$/)
  })

  test('api-keys deep link redirects to dashboard when the feature is disabled', async ({
    page,
  }) => {
    await page.route('**/v1/auth/config', async (route) => {
      const response = await route.fetch()
      const payload = (await response.json()) as {
        features: Record<string, unknown>
      }

      await route.fulfill({
        status: response.status(),
        contentType: 'application/json',
        json: {
          ...payload,
          features: {
            ...payload.features,
            api_keys: false,
          },
        },
      })
    })

    await page.goto('/app/api-keys')
    await expect(page).toHaveURL(/\/app\/dashboard$/)
    await expect(page.getByRole('button', { name: 'Open Dashboard guide' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open API Keys workspace' })).toHaveCount(0)
  })
})
