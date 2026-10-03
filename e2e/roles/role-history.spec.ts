import { backendConfigured, expect, expectSeeded, personaState, test } from '../support/fixtures'
import { historyEvent, historyEvents } from '../support/definition-history'
import { cardByHeading } from '../support/entities'

// A role's definition history on its detail page (outlabs-auth 0.1.0a35 GET /roles/{id}/history,
// F-092): every change to the definition, newest first, with who made it and what changed. Roles
// are arranged through the API and named through testData; the permissions used (user:read,
// role:read) exist on both example seeds. An archived role is not readable, its history neither,
// so the console never shows an Archived event (PRODUCTION.md section 8).

test.describe('role history', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ errorGuardMode: 'strict' })

  test('lists the definition\'s changes newest first: created, renamed, permissions added and removed', async ({ page, api, testData }) => {
    const role = await api.createRole({ kind: 'hist', permissions: ['user:read'] })
    const renamed = testData.displayName('hist-renamed')
    await api.patch(`/roles/${role.id}`, { display_name: renamed })
    await api.post(`/roles/${role.id}/permissions`, ['role:read'])
    await api.request('DELETE', `/roles/${role.id}/permissions`, { body: ['user:read'] })

    await page.goto(`/app/roles/${role.id}`)
    const card = cardByHeading(page, 'History')
    await expect(card.getByRole('heading', { name: 'History', exact: true })).toBeVisible()
    await expect(historyEvents(page)).toHaveCount(4)
    // Newest first.
    await expect(historyEvents(page).first()).toContainText('Permissions removed')
    await expect(historyEvents(page).last()).toContainText('Created')

    const removed = historyEvent(page, 'Permissions removed')
    await expect(removed.getByTestId('definition-history-removed')).toBeVisible()
    await expect(removed.getByTestId('definition-history-added')).toHaveCount(0)
    await expect(historyEvent(page, 'Permissions added').getByTestId('definition-history-added')).toBeVisible()
    await expect(historyEvent(page, 'Updated').getByTestId('definition-history-changes')).toContainText(`Display name: ${role.display_name} → ${renamed}`)
    await expect(historyEvent(page, 'Created').getByTestId('definition-history-permissions')).toBeVisible()
    // The admin made every change: named "You", with the backend's source of the event.
    for (const item of await historyEvents(page).all()) {
      await expect(item).toContainText('By You')
      await expect(item).toContainText('role_service.')
    }
    await expect(card.getByText('4 events', { exact: true })).toBeVisible()
  })

  test('an edit made here shows in the history without a reload', async ({ page, api, testData }) => {
    const role = await api.createRole({ kind: 'hist-live', permissions: ['user:read'] })
    const renamed = testData.displayName('hist-live-renamed')

    await page.goto(`/app/roles/${role.id}`)
    await expect(historyEvents(page)).toHaveCount(1)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `Edit role ${role.display_name}` })
    await dialog.getByLabel('Display name').fill(renamed)
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()
    await expect(historyEvents(page)).toHaveCount(2)
    await expect(historyEvents(page).first()).toContainText(`Display name: ${role.display_name} → ${renamed}`)
  })

  test('pages through more than ten events', async ({ page, api }) => {
    const role = await api.createRole({ kind: 'hist-pages', permissions: ['user:read'] })
    for (let index = 1; index <= 11; index++) await api.patch(`/roles/${role.id}`, { description: `Revision ${index}` })

    await page.goto(`/app/roles/${role.id}`)
    const card = cardByHeading(page, 'History')
    await expect(historyEvents(page)).toHaveCount(10)
    await expect(historyEvents(page).first()).toContainText('Description: Revision 10 → Revision 11')
    await expect(card.getByText('Showing 1–10 of 12 events')).toBeVisible()
    await card.getByRole('navigation', { name: 'Events pages' }).getByRole('button', { name: 'Page 2' }).click()
    await expect(historyEvents(page)).toHaveCount(2)
    await expect(historyEvents(page).last()).toContainText('Created')
    await expect(card.getByText('Showing 11–12 of 12 events')).toBeVisible()
  })

  test('a role without recorded changes says so', async ({ page, api }) => {
    // Seeded roles are written without history.
    const roles = await api.get<{ items: Array<{ id: string, name: string }> }>('/roles/', { query: { limit: 100 } })
    const seeded = roles.items.find(role => !/^pw[-_]e2e/.test(role.name))
    expectSeeded(seeded, 'the seed has roles')
    const history = await api.get<{ total: number }>(`/roles/${seeded.id}/history`)
    test.skip(history.total > 0, 'This seeded role already has recorded changes.')

    await page.goto(`/app/roles/${seeded.id}`)
    const card = cardByHeading(page, 'History')
    await expect(card.getByText('No history yet')).toBeVisible()
    await expect(card.getByText('Changes to this role\'s definition appear here.')).toBeVisible()
  })
})

test.describe('role history as a delegated organization admin', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ storageState: personaState('orgAdmin'), errorGuardMode: 'strict' })

  test('an organization role they created shows its history, by them', async ({ page, apiAs, requires, testData }) => {
    await requires({ preset: 'EnterpriseRBAC', personas: ['orgAdmin'] })
    const orgAdmin = apiAs('orgAdmin')
    const me = await orgAdmin.me()
    expectSeeded(me.root_entity_id, 'the org admin belongs to an organization')
    const role = await orgAdmin.createRole({ kind: 'org-hist', root_entity_id: me.root_entity_id, is_global: false, permissions: ['user:read'] })
    await orgAdmin.patch(`/roles/${role.id}`, { description: testData.displayName('org-hist-note') })

    await page.goto(`/app/roles/${role.id}`)
    await expect(historyEvents(page)).toHaveCount(2)
    await expect(historyEvents(page).first()).toContainText('Updated')
    await expect(historyEvents(page).first()).toContainText('By You')
    await expect(historyEvents(page).last()).toContainText('Created')
  })
})
