import { backendConfigured, expect, test } from '../support/fixtures'

// Entity-type config editor (superuser). The config is GLOBAL, so the PUT is intercepted and
// fulfilled with a valid echo — the real seed config is never mutated; we only assert the payload.
test.describe('entity-type config editor', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('edits entity-type config', async ({ page }) => {
    const puts: Array<Record<string, unknown>> = []
    await page.route(/\/config\/entity-types$/, async (route) => {
      if (route.request().method() === 'PUT') {
        puts.push(route.request().postDataJSON() as Record<string, unknown>)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            allowed_root_types: { structural: ['organization'], access_group: ['team'] },
            default_child_types: { structural: ['region', 'office', 'branch'], access_group: ['team'] }
          })
        })
        return
      }
      await route.continue()
    })

    await page.goto('/app/settings')
    await page.getByRole('button', { name: 'Edit' }).click()
    const dialog = page.getByRole('dialog')

    // Fill the required lists (refines need a child type per class + a root type across classes).
    await dialog.locator('#etc-structural-root').fill('organization')
    await dialog.locator('#etc-structural-child').fill('region, office, branch')
    await dialog.locator('#etc-ag-child').fill('team')
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect.poll(() => puts.length).toBe(1)
    expect((puts[0]!.default_child_types as { structural: string[] }).structural).toEqual(['region', 'office', 'branch'])
    expect((puts[0]!.allowed_root_types as { structural: string[] }).structural).toEqual(['organization'])
    await expect(dialog).toBeHidden()
  })
})
