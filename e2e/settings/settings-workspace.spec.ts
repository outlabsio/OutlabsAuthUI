import type { Page } from '@playwright/test'

import { expect, test } from '../support/auth-fixture'
import { typeIntoBaseUiField } from '../support/base-ui-text'

const settingsPath = '/app/settings'

async function gotoSettingsWorkspace(page: Page) {
  await page.goto(settingsPath)

  await expect(page).toHaveURL(/\/app\/settings$/)
  await expect(page.getByRole('button', { name: 'Open Settings guide' })).toBeVisible()
  await expect(
    page.getByRole('heading', {
      name: 'Settings',
    })
  ).toBeVisible()
}

test.describe('Settings Workspace', () => {
  test('admin can update entity type defaults', async ({ page }) => {
    await gotoSettingsWorkspace(page)

    await typeIntoBaseUiField(
      page.locator('main').first(),
      'Default structural child types',
      'department, team, division'
    )
    await typeIntoBaseUiField(
      page.locator('main').first(),
      'Default access-group child types',
      'permission_group, admin_group'
    )
    await page.getByRole('button', { name: 'Save configuration' }).click()

    await expect(page.getByText('division', { exact: true })).toBeVisible()
  })

  test.describe('Read-only UX', () => {
    test.use({ persona: 'auditor' })

    test('non-superuser can inspect but not save entity type configuration', async ({
      page,
    }) => {
      await gotoSettingsWorkspace(page)

      await expect(page.getByText('Read-only', { exact: true })).toBeVisible()
      await expect(
        page.getByText(
          'The backend exposes this configuration to everyone for reads, but only superusers can persist changes.'
        )
      ).toBeVisible()
      await expect(page.getByRole('button', { name: 'Save configuration' })).toBeDisabled()
    })
  })
})
