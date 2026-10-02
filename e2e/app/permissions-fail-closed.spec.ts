import type { Page } from '@playwright/test'
import { expect, personaState, test } from '../support/fixtures'
import { sidebarNav } from '../support/shell'

// When the actor's permissions (/permissions/me) cannot be loaded, the console still fails closed
// (nothing is known to be granted) but says what happened: a page that needs a permission shows
// "Couldn't load your permissions" with Retry, never the "No access … Ask an administrator" lock
// a real denial gets; the nav keeps those sections hidden and the shell shows one persistent
// notice with Retry. A successful retry restores the page and the nav without a reload.
// Delegated (non-superuser) admins are the actors this matters for: a superuser passes every
// permission check without the list. The org admin is EnterpriseRBAC's; the provisioned global
// admin exists on both presets.

const GATE_TITLE = 'Couldn\'t load your permissions'
const SHELL_NOTICE = 'Can\'t load your permissions'

function gateByTitle(page: Page, title: string) {
  return page.getByRole('heading', { name: title, exact: true }).locator('xpath=ancestor::*[@data-slot="root"][1]')
}

for (const key of ['orgAdmin', 'globalAdmin'] as const) {
  test.describe(`permissions fail closed (${key})`, () => {
    test.use({ storageState: personaState(key) })

    test('a failed permissions load says so with Retry instead of denying access', async ({ page, requires, errorGuard }) => {
      await requires({ backend: true, personas: [key], surfaces: ['users', 'permissions'] })
      // The mocked outage under test (a 500 is not retried by the query layer).
      errorGuard.allow({ status: 500, url: /\/permissions\/me$/ })
      let failPermissions = true
      let permissionReads = 0
      await page.route(/\/permissions\/me$/, async (route) => {
        if (route.request().method() !== 'GET') return route.continue()
        permissionReads++
        if (!failPermissions) return route.continue()
        return route.fulfill({ status: 500, json: { detail: 'Internal Server Error' } })
      })

      await page.goto('/app/users')
      // The deep link is kept and the page explains the failure, with Retry.
      await expect(page).toHaveURL(/\/app\/users$/)
      const gate = gateByTitle(page, GATE_TITLE)
      await expect(gate).toBeVisible()
      await expect(gate).toContainText('a loading problem, not a missing permission')
      await expect(gate.getByRole('button', { name: 'Retry' })).toBeVisible()
      // Not the denial: no lock, no "ask an administrator", no missing permission named.
      await expect(page.getByRole('heading', { name: 'No access to users' })).toHaveCount(0)
      await expect(page.getByText(/Ask an administrator/)).toHaveCount(0)
      await expect(page.getByPlaceholder('Search users...')).toHaveCount(0)
      // The nav stays fail-closed, and the shell says why once.
      await expect(sidebarNav(page).getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible()
      await expect(sidebarNav(page).getByRole('link', { name: 'Users', exact: true })).toHaveCount(0)
      await expect(page.getByText(SHELL_NOTICE, { exact: true })).toHaveCount(1)

      // Retry from the page's own state once the API answers again.
      failPermissions = false
      const readsBefore = permissionReads
      await gate.getByRole('button', { name: 'Retry' }).click()
      await expect.poll(() => permissionReads).toBeGreaterThan(readsBefore)

      await expect(page.getByPlaceholder('Search users...')).toBeVisible()
      await expect(page.getByRole('heading', { name: GATE_TITLE })).toHaveCount(0)
      await expect(sidebarNav(page).getByRole('link', { name: 'Users', exact: true })).toBeVisible()
      await expect(page.getByText(SHELL_NOTICE, { exact: true })).toHaveCount(0)
    })
  })
}
