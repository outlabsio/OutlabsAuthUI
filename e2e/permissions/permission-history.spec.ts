import { backendConfigured, expect, test } from '../support/fixtures'
import { historyEvent, historyEvents } from '../support/definition-history'
import { cardByHeading } from '../support/entities'
import { chooseSelect, field } from '../support/ui-select'

// A permission's definition history on its detail page (outlabs-auth 0.1.0a35
// GET /permissions/{id}/history, F-092): its definition, tags and ABAC conditions, newest first,
// with who changed what. Custom permissions are arranged through the API as the superuser (a
// permission write needs a global actor) and run-marked, so cleanup archives them.

test.describe('permission history', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ errorGuardMode: 'strict' })

  test('lists the permission\'s creation and the edits of its description and tags', async ({ page, api }) => {
    const permission = await api.createPermission({ kind: 'hist' })
    await api.patch(`/permissions/${permission.id}`, { description: 'Now documented', tags: ['reviewed'] })

    await page.goto(`/app/permissions/${permission.id}`)
    const card = cardByHeading(page, 'History')
    await expect(card.getByRole('heading', { name: 'History', exact: true })).toBeVisible()
    await expect(historyEvents(page).last()).toContainText('Created')
    await expect(historyEvent(page, 'Created')).toHaveCount(1)
    // The route writes the fields and the tags as their own changes: one event or two.
    const changes = historyEvent(page, 'Updated').getByTestId('definition-history-changes')
    await expect(changes.filter({ hasText: 'Description: none → Now documented' })).toHaveCount(1)
    await expect(changes.filter({ hasText: 'Tags: none → reviewed' })).toHaveCount(1)
    for (const item of await historyEvents(page).all()) await expect(item).toContainText('By You')
  })

  test('an edit made here shows in the history without a reload', async ({ page, api }) => {
    const permission = await api.createPermission({ kind: 'hist-live' })

    await page.goto(`/app/permissions/${permission.id}`)
    await expect(historyEvents(page)).toHaveCount(1)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit permission' })
    await dialog.getByLabel('Description').fill('Edited from the console')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()
    await expect(historyEvents(page)).toHaveCount(2)
    await expect(historyEvents(page).first()).toContainText('Description: none → Edited from the console')
  })
})

test.describe('permission history: ABAC conditions', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ errorGuardMode: 'strict' })

  test('a condition added here shows in the history without a reload', async ({ page, api, requires }) => {
    await requires({ features: ['abac'] })
    const permission = await api.createPermission({ kind: 'hist-abac' })

    await page.goto(`/app/permissions/${permission.id}`)
    await expect(historyEvents(page)).toHaveCount(1)
    await page.getByRole('button', { name: 'Add condition' }).first().click()
    const dialog = page.getByRole('dialog')
    await chooseSelect(page, field(page, 'Context'), 'env')
    await dialog.getByLabel('Attribute', { exact: true }).fill('on_call')
    await page.getByLabel('Operator', { exact: true }).click()
    await page.getByRole('option').filter({ has: page.getByText('is_true', { exact: true }) }).click()
    await dialog.getByRole('button', { name: 'Add condition' }).click()
    await expect(dialog).toBeHidden()
    // The condition write refreshes the definition's history (INVALIDATE_AFTER.abac).
    await expect(historyEvents(page)).toHaveCount(2)
    await expect(historyEvents(page).first()).toContainText('Condition added')
    await expect(historyEvents(page).first()).toContainText('Condition: env.on_call is true')
  })
})
