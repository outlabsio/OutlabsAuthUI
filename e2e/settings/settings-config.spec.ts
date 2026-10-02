import type { Page } from '@playwright/test'
import { backendConfigured, expect, test } from '../support/fixtures'
import { backendHasSurface, liveAuthConfig } from '../support/capabilities'

// Entity-type config editor (superuser; WP-18, F-187). The config is GLOBAL, so the PUT is
// intercepted and fulfilled with a valid echo: the real seed config is never mutated, only the
// payload is asserted. The four lists are tag inputs; only changed groups are sent (F-158).
async function interceptPut(page: Page) {
  const puts: Array<Record<string, unknown>> = []
  await page.route(/\/config\/entity-types$/, async (route) => {
    if (route.request().method() !== 'PUT') return route.continue()
    const body = route.request().postDataJSON() as Record<string, unknown>
    puts.push(body)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        allowed_root_types: { structural: ['organization'], access_group: ['team'] },
        default_child_types: { structural: ['region', 'office', 'branch'], access_group: [] },
        ...body
      })
    })
  })
  return puts
}

test.describe('entity-type config editor', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.beforeEach(async () => {
    const config = await liveAuthConfig()
    test.skip(!config?.features.entity_hierarchy || !(await backendHasSurface('config')), 'Entity types need the hierarchy and the config router (EnterpriseRBAC).')
  })

  test('edits the lists as tags and sends only the changed group', async ({ page }) => {
    const puts = await interceptPut(page)
    await page.goto('/app/settings')
    await page.getByRole('button', { name: 'Edit entity types' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit entity types' })

    // Nothing changed yet: nothing to save.
    const save = dialog.getByRole('button', { name: 'Save changes' })
    await expect(save).toBeDisabled()

    // Add a structural child type as a tag (Enter), with stray case and spaces.
    const childField = dialog.getByRole('group', { name: 'Structural' }).getByLabel('Default child types')
    await childField.fill('  Kiosk ')
    await childField.press('Enter')
    await expect(save).toBeEnabled()
    await save.click()

    await expect.poll(() => puts.length).toBe(1)
    expect(Object.keys(puts[0]!)).toEqual(['default_child_types'])
    const sent = puts[0]!.default_child_types as { structural: string[], access_group: string[] }
    expect(sent.structural.at(-1)).toBe('kiosk')
    await expect(dialog).toBeHidden()
  })

  // The help says "Press Enter after each type": Enter adds the type and never saves the dialog,
  // not even on the emptied field once the first type made the dialog dirty (AppFormDialog).
  test('Enter twice in a tags field adds the type and saves nothing', async ({ page }) => {
    const puts = await interceptPut(page)
    await page.goto('/app/settings')
    await page.getByRole('button', { name: 'Edit entity types' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit entity types' })
    const save = dialog.getByRole('button', { name: 'Save changes' })

    const roots = dialog.getByRole('group', { name: 'Structural' }).getByLabel('Root types')
    await roots.fill('campus')
    await roots.press('Enter')
    await expect(roots).toHaveValue('')
    await expect(save).toBeEnabled()
    await roots.press('Enter')
    // Another tags field, empty, with the dialog dirty.
    await dialog.getByRole('group', { name: 'Access group' }).getByLabel('Default child types').press('Enter')

    await expect(dialog).toBeVisible()
    await expect(roots).toBeEnabled()
    await expect(dialog.getByRole('group', { name: 'Structural' })).toContainText('campus')
    expect(puts).toHaveLength(0)

    // Save still saves, once, with the added type.
    await save.click()
    await expect.poll(() => puts.length).toBe(1)
    expect(Object.keys(puts[0]!)).toEqual(['allowed_root_types'])
    expect((puts[0]!.allowed_root_types as { structural: string[] }).structural).toContain('campus')
    await expect(dialog).toBeHidden()
  })

  test('a class may have no default child types; only one root type overall is required', async ({ page }) => {
    const puts = await interceptPut(page)
    await page.goto('/app/settings')
    await page.getByRole('button', { name: 'Edit entity types' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit entity types' })
    const accessGroup = dialog.getByRole('group', { name: 'Access group' })

    // Remove every access-group child type: allowed now (the old per-class rule is gone).
    const children = accessGroup.getByLabel('Default child types')
    await children.focus()
    for (let i = 0; i < 20; i++) await children.press('Backspace')
    // Remove every root type of both classes: refused on the field.
    for (const group of ['Structural', 'Access group']) {
      const roots = dialog.getByRole('group', { name: group }).getByLabel('Root types')
      await roots.focus()
      for (let i = 0; i < 20; i++) await roots.press('Backspace')
    }
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog.getByText('Allow at least one root type, structural or access group.')).toBeVisible()
    expect(puts).toHaveLength(0)

    // One root type back: saves, with the empty access-group child list.
    const structuralRoots = dialog.getByRole('group', { name: 'Structural' }).getByLabel('Root types')
    await structuralRoots.fill('organization')
    await structuralRoots.press('Enter')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => puts.length).toBe(1)
    expect((puts[0]!.default_child_types as { access_group: string[] }).access_group).toEqual([])
    expect((puts[0]!.allowed_root_types as { structural: string[], access_group: string[] })).toEqual({ structural: ['organization'], access_group: [] })
  })
})

test.describe('entity-type config editor (real save)', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  // F-139: one save goes to the disposable backend for real. The added type is run-marked and
  // only extends the structural child suggestions, and the original config is put back.
  test('a saved type reaches the backend and shows again on reopen', async ({ page, api, requires, testData }) => {
    await requires({ surfaces: ['config'], features: ['entity_hierarchy'] })
    type EntityTypes = { allowed_root_types: Record<string, string[]>, default_child_types: Record<string, string[]> }
    const original = await api.get<EntityTypes>('/config/entity-types')
    const added = testData.resource('kind')
    try {
      await page.goto('/app/settings')
      await page.getByRole('button', { name: 'Edit entity types' }).click()
      const dialog = page.getByRole('dialog', { name: 'Edit entity types' })
      const childField = dialog.getByRole('group', { name: 'Structural' }).getByLabel('Default child types')
      await childField.fill(added)
      await childField.press('Enter')
      await dialog.getByRole('button', { name: 'Save changes' }).click()
      await expect(dialog).toBeHidden()

      await expect.poll(async () => (await api.get<EntityTypes>('/config/entity-types')).default_child_types.structural).toContain(added)
      await page.reload()
      await page.getByRole('button', { name: 'Edit entity types' }).click()
      await expect(page.getByRole('dialog', { name: 'Edit entity types' }).getByRole('group', { name: 'Structural' })).toContainText(added)
    } finally {
      await api.put('/config/entity-types', original)
    }
  })
})
