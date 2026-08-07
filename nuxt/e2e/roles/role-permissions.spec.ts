import { backendConfigured, expect, test } from '../support/fixtures'

// Role -> permission assignment via the AppPermissionPicker (CommandPalette). Creates a global
// pw- role (auto-purged by the cleanup teardown) with permissions, then edits the set. Payloads are
// asserted via route interception; a global role avoids the scoped-role root requirement.
test.describe('role permission assignment', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('creates a role with permissions, then edits the set', async ({ page }) => {
    const stamp = Date.now()
    const name = `pw-perms-${stamp}`

    const posts: Array<Record<string, unknown>> = []
    const patches: Array<Record<string, unknown>> = []
    await page.route(/\/roles\/?$/, async (route) => {
      if (route.request().method() === 'POST') posts.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })
    await page.route(/\/roles\/[^/]+$/, async (route) => {
      if (route.request().method() === 'PATCH') patches.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await page.goto('/app/roles')

    // --- Create a global role with two permissions ---
    await page.getByRole('button', { name: 'Add role' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Display name', { exact: true }).fill(`PW Perms ${stamp}`)
    await dialog.getByLabel('Name', { exact: true }).fill(name)
    await dialog.getByRole('checkbox', { name: 'Global role' }).check()

    await dialog.getByPlaceholder('Search permissions...').click()
    await dialog.getByRole('option').nth(0).click()
    await dialog.getByRole('option').nth(1).click()
    await dialog.getByRole('button', { name: 'Create' }).click()

    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0]).toEqual(expect.objectContaining({ name, is_global: true }))
    expect(Array.isArray(posts[0]!.permissions)).toBe(true)
    expect((posts[0]!.permissions as string[]).length).toBe(2)

    // Role is listed (dialog closes only on success).
    await expect(dialog).toBeHidden()
    const row = page.getByRole('row').filter({ hasText: name })
    await expect(row).toBeVisible()

    // --- Edit: the picker is pre-filled with the 2; add a 3rd ---
    await row.getByRole('button', { name: 'Role actions' }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    const editDialog = page.getByRole('dialog')
    await editDialog.getByPlaceholder('Search permissions...').click()
    await editDialog.getByRole('option').nth(2).click()
    await editDialog.getByRole('button', { name: 'Save' }).click()

    await expect.poll(() => patches.length).toBe(1)
    expect((patches[0]!.permissions as string[]).length).toBe(3)
  })
})
