import { expect, test } from '../support/fixtures'
import { treeRow } from '../support/entities'

// F-023: below lg the detail opens in a slideover over the tree (the dashboard template's inbox
// pattern); from lg it sits beside the tree.

for (const viewport of [{ width: 390, height: 844 }, { width: 900, height: 900 }]) {
  test.describe(`entity detail at ${viewport.width}px`, () => {
    test.use({ viewport, errorGuardMode: 'strict' })

    test.beforeEach(async ({ requires }) => {
      await requires({ backend: true, preset: 'EnterpriseRBAC', surfaces: ['entities'] })
    })

    test('selecting an entity opens its detail in a slideover; closing returns to the tree', async ({ page, api }) => {
      const root = await api.createEntity({ kind: `mobile-${viewport.width}` })
      await page.goto(`/app/entities?root=${root.id}`)
      await treeRow(page, root.display_name).click()

      const sheet = page.getByRole('dialog', { name: 'Entity details' })
      await expect(sheet).toBeVisible()
      await expect(sheet.getByRole('heading', { name: root.display_name, exact: true })).toBeVisible()
      await expect(sheet.getByRole('heading', { name: 'Details' })).toBeVisible()
      await expect(sheet.getByRole('button', { name: 'Edit', exact: true })).toBeInViewport()
      // Nothing scrolls the page sideways.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

      // A dialog opened from the sheet stacks above it and takes input.
      await sheet.getByRole('button', { name: 'Add child' }).click()
      const create = page.getByRole('dialog', { name: 'Create entity' })
      await create.getByRole('textbox', { name: /^Display name/ }).fill('Stacked above the sheet')
      await create.getByRole('button', { name: 'Cancel' }).click()
      await page.getByRole('dialog', { name: 'Discard changes?' }).getByRole('button', { name: /^Discard/ }).click()
      await expect(create).toBeHidden()

      await sheet.getByRole('link', { name: 'Close entity detail' }).click()
      await expect(sheet).toBeHidden()
      await expect(page).not.toHaveURL(/entity=/)
      await expect(treeRow(page, root.display_name)).toBeVisible()
    })
  })
}
