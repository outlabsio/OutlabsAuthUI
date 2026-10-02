import { expect, test } from '../support/fixtures'
import { entityAction, openEntity } from '../support/entities'
import type { Locator, Page } from '@playwright/test'

// Entity governance (F-075): child limits on every entity, naming rules on a root organisation
// only (the server rejects them elsewhere). Saved through PATCH /entities/{id}, changed fields only.

// Type a whole number into a number field and leave it, as a keyboard user does. The field
// commits what was typed when it loses focus (or on Enter), so until then the dialog has no
// change and Save stays disabled. A person's click on Save commits it on the way (the press
// takes the focus); Playwright waits for Save to be enabled before it presses at all.
async function typeNumber(field: Locator, value: string) {
  await field.fill(value)
  await field.press('Tab')
  await expect(field).toHaveAttribute('aria-valuenow', value)
}

async function capturePatches(page: Page) {
  const patches: Array<Record<string, unknown>> = []
  await page.route(/\/entities\/[0-9a-f-]+$/, async (route) => {
    if (route.request().method() === 'PATCH') patches.push(route.request().postDataJSON() as Record<string, unknown>)
    await route.continue()
  })
  return patches
}

test.describe('entity governance', () => {
  test.use({ errorGuardMode: 'strict' })

  test.beforeEach(async ({ requires }) => {
    await requires({ backend: true, preset: 'EnterpriseRBAC', surfaces: ['entities'] })
  })

  test('a root organisation sets child limits and naming rules', async ({ page, api }) => {
    const root = await api.createEntity({ kind: 'gov-root' })
    const patches = await capturePatches(page)

    await openEntity(page, root.id, root.display_name)
    await entityAction(page, 'Governance')
    const dialog = page.getByRole('dialog', { name: `Governance of ${root.display_name}` })

    // A root's list also governs every descendant that sets none (v-access-02).
    await expect(dialog.getByText('A list here also applies beneath every entity that sets no list of its own.', { exact: false })).toBeVisible()
    const types = dialog.getByRole('textbox', { name: 'Allowed child types' })
    await types.fill('region')
    await types.press('Enter')
    await types.fill('office')
    await types.press('Enter')
    await dialog.getByRole('checkbox', { name: /^Structural/ }).check()
    await dialog.getByRole('spinbutton', { name: 'Max members' }).fill('50')
    await dialog.getByRole('textbox', { name: 'System-name pattern' }).fill('[a-z0-9_]+')
    // An invalid regular expression is refused on its field.
    await dialog.getByRole('textbox', { name: 'Slug pattern' }).fill('[a-z')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog.getByText('Enter a valid regular expression.')).toBeVisible()
    expect(patches).toHaveLength(0)

    await dialog.getByRole('textbox', { name: 'Slug pattern' }).fill('')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()
    expect(patches).toEqual([{
      allowed_child_classes: ['structural'],
      allowed_child_types: ['region', 'office'],
      max_members: 50,
      child_name_pattern: '[a-z0-9_]+'
    }])
    // The read view shows what was saved.
    await expect(page.getByText('region, office', { exact: true })).toBeVisible()
    await expect(page.getByText('Structural (advisory)')).toBeVisible()
  })

  test('a descendant has no naming fields and shows its root\'s rules read-only', async ({ page, api }) => {
    const root = await api.createEntity({ kind: 'gov-named', child_slug_pattern: '[a-z0-9-]+' })
    const child = await api.createEntity({ kind: 'gov-child', entity_type: 'region', parent_entity_id: root.id })
    const patches = await capturePatches(page)

    await openEntity(page, child.id, child.display_name)
    await expect(page.getByRole('link', { name: `Naming rules are set by ${root.display_name}` })).toBeVisible()
    await entityAction(page, 'Governance')
    const dialog = page.getByRole('dialog', { name: `Governance of ${child.display_name}` })
    await expect(dialog.getByRole('textbox', { name: 'System-name pattern' })).toHaveCount(0)
    await expect(dialog.getByTestId('governance-inherited-naming')).toContainText(`Naming rules are set by ${root.display_name}`)
    await expect(dialog.getByTestId('governance-inherited-naming')).toContainText('[a-z0-9-]+')

    await typeNumber(dialog.getByRole('spinbutton', { name: 'Max members' }), '5')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()
    // Only the changed limit: never a naming field on a non-root.
    expect(patches).toEqual([{ max_members: 5 }])
  })

  // v-access-03: a pattern set through the library in Python-only syntax is the server's to
  // check; the console neither refuses it nor blocks an unrelated change.
  test('a root with Python-only naming rules saves other changes and says the server checks them', async ({ page, api }) => {
    const root = await api.createEntity({ kind: 'gov-py', child_name_pattern: '(?i)[a-z_]+', child_slug_pattern: '\\A[a-z0-9-]+\\Z' })
    const patches = await capturePatches(page)

    await openEntity(page, root.id, root.display_name)
    await entityAction(page, 'Governance')
    const dialog = page.getByRole('dialog', { name: `Governance of ${root.display_name}` })
    await expect(dialog.getByText('Python-only syntax: the server checks it when you save.')).toHaveCount(2)
    await typeNumber(dialog.getByRole('spinbutton', { name: 'Max members' }), '7')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()
    expect(patches).toEqual([{ max_members: 7 }])
  })
})
