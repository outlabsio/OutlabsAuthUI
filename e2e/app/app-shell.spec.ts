import type { Page } from '@playwright/test'

import { expect, test } from '../support/auth-fixture'

async function gotoDashboard(page: Page) {
  await page.goto('/app/dashboard')

  await expect(
    page.getByRole('heading', {
      name: 'Auth console shell',
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
  test('admin can navigate the shell and see disabled coming-soon items', async ({
    page,
  }) => {
    await gotoDashboard(page)

    await expect(page.getByText('OutlabsAuth Console')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Providers' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Policies' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Invites' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Sessions' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Branding' })).toBeDisabled()

    await page.getByRole('link', { name: 'Users' }).click()
    await expect(
      page.getByRole('heading', {
        name: 'Users',
      })
    ).toBeVisible()

    await page.getByRole('link', { name: 'Permissions' }).click()
    await expect(
      page.getByRole('heading', {
        name: 'Permissions',
      })
    ).toBeVisible()

    await page.getByRole('link', { name: 'Roles' }).click()
    await expect(
      page.getByRole('heading', {
        name: 'Roles',
      })
    ).toBeVisible()

    await page.getByRole('link', { name: 'Entities' }).click()
    await expect(
      page.getByRole('heading', {
        name: 'Entities',
      })
    ).toBeVisible()

    await page.getByRole('link', { name: 'Dashboard' }).click()
    await expect(
      page.getByRole('heading', {
        name: 'Auth console shell',
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
