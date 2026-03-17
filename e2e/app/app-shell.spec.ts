import type { Page } from '@playwright/test'

import { expect, test } from '../support/auth-fixture'

async function gotoDashboard(page: Page) {
  await page.goto('/app/dashboard')

  await expect(
    page.getByRole('heading', {
      name: 'Dashboard',
    })
  ).toBeVisible()
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

    await expect(page.getByText('OutlabsAuth Console')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open Dashboard guide' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Dashboard' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Users', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Permissions', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Roles', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Entities', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Providers' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Policies' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Invites' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Sessions' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Branding' })).toHaveCount(0)

    await page.getByRole('link', { name: 'Users', exact: true }).click()
    await expect(
      page.getByRole('heading', {
        name: 'Users',
      })
    ).toBeVisible()

    await page.getByRole('link', { name: 'Permissions', exact: true }).click()
    await expect(
      page.getByRole('heading', {
        name: 'Permissions',
      })
    ).toBeVisible()

    await page.getByRole('link', { name: 'Roles', exact: true }).click()
    await expect(
      page.getByRole('heading', {
        name: 'Roles',
      })
    ).toBeVisible()

    await page.getByRole('link', { name: 'Entities', exact: true }).click()
    await expect(
      page.getByRole('heading', {
        name: 'Entities',
      })
    ).toBeVisible()

    await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
    await expect(
      page.getByRole('heading', {
        name: 'Dashboard',
      })
    ).toBeVisible()

    await page.goto('/auth/login')
    await expect(page).toHaveURL(/\/app\/dashboard$/)
  })

  test('admin can sign out and protected routes redirect back to login', async ({
    page,
  }) => {
    await gotoDashboard(page)
    await openUserMenu(page, 'admin@acme.com')

    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/auth\/login$/)
    await expect(
      page.getByRole('heading', {
        name: 'Welcome back',
      })
    ).toBeVisible()

    await page.goto('/app/dashboard')
    await expect(page).toHaveURL(/\/auth\/login$/)
  })
})
