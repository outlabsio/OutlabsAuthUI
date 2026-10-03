import type { Page } from '@playwright/test'
import { backendConfigured, expect, expectSeeded, persona, personaState, test } from '../support/fixtures'
import { searchUsersList } from '../support/lists'
import { onPath } from '../support/session'

// A delegated organisation admin on the users list (F-012, F-053, F-054, F-161): the persona
// holds user:read/create/update and membership:create_tree but not user:delete, and has no
// global scope. Accounts they create or invite stay in their organisation (and in their list),
// and they are never offered what the backend refuses them.

test.describe('users list as a delegated organisation admin', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ storageState: personaState('orgAdmin'), errorGuardMode: 'strict' })

  test.beforeEach(async ({ requires }) => {
    await requires({ preset: 'EnterpriseRBAC', personas: ['orgAdmin'] })
  })

  async function openAddUser(page: Page) {
    await page.goto('/app/users')
    await page.getByRole('button', { name: 'Add user' }).click()
    return page.getByRole('dialog', { name: 'Add user' })
  }

  test('Add user places the account in their organization; it opens and stays in their list (F-012, F-054)', async ({ page, apiAs, testData }) => {
    const me = await apiAs('orgAdmin').me()
    expectSeeded(me.root_entity_id, 'the org admin belongs to an organization')
    const posts: Array<Record<string, unknown>> = []
    await page.route(/\/users\/?$/, async (route) => {
      if (route.request().method() === 'POST') posts.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fallback()
    })

    const dialog = await openAddUser(page)
    // Organization: required, preselected, and their own only. No superuser option.
    const organization = dialog.getByLabel('Organization', { exact: true })
    await expect(organization).toContainText((me as { root_entity_name?: string }).root_entity_name ?? '')
    await expect(dialog.getByText('Accounts you create belong to your organization')).toBeVisible()
    await expect(dialog.getByRole('switch', { name: 'Superuser' })).toHaveCount(0)
    await expect(dialog.getByText('Superuser')).toHaveCount(0)
    await organization.click()
    await expect(page.getByRole('option')).toHaveCount(1)
    await page.keyboard.press('Escape')
    // The menu hands the focus back to its trigger as it closes; type only after that.
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(organization).toBeFocused()

    const email = testData.email('org-created')
    await dialog.getByLabel('Email').fill(email)
    await dialog.getByLabel('Initial password').fill('Testpass1!')
    await dialog.getByLabel('Confirm password').fill('Testpass1!')
    await dialog.getByRole('button', { name: 'Create user' }).click()

    // The new account opens (not "not found": it is inside their scope)...
    await expect(page).toHaveURL(/\/app\/users\/[0-9a-f-]+$/)
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
    await expect(page.getByRole('heading', { name: email })).toBeVisible()
    expect(posts).toEqual([expect.objectContaining({ email, root_entity_id: me.root_entity_id, is_superuser: false })])
    // ...and is in their list.
    await page.goto('/app/users')
    await searchUsersList(page, email)
  })

  test('row menus offer only what they may do: View, Edit, and their own account (F-053, F-063)', async ({ page }) => {
    // Another account in their organization: user:update but no user:delete, so no Delete.
    const other = persona('agent').email
    await page.goto('/app/users')
    await searchUsersList(page, other)
    await page.getByRole('button', { name: `User actions for ${other}` }).click()
    await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText(['View', 'Edit profile'])
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)

    const own = persona('orgAdmin').email
    await searchUsersList(page, own)
    await page.getByRole('button', { name: `User actions for ${own}` }).click()
    await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText(['View', 'Your account', 'Edit profile'])
    await page.getByRole('menuitem', { name: 'Your account' }).click()
    await expect(page).toHaveURL(onPath('/app/account'))
  })

  test('their organization\'s orphans, no organization filter, and Invite joins an entity of theirs (F-012, F-161, F-171)', async ({ page }) => {
    await page.goto('/app/users')
    await expect(page.getByRole('button', { name: 'Add user' })).toBeVisible()
    await expect(page.locator('tbody tr').first()).toBeVisible()
    await expect(page.getByLabel('Filter by organization', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'Organization' })).toHaveCount(0)
    // The orphaned list holds the orphans rooted in their organization (the seed's orphan lost
    // its only membership), never another organization's.
    await page.getByRole('checkbox', { name: 'Orphaned only' }).check()
    await expect(page).toHaveURL(/[?&]orphaned=true/)
    await expect(page.locator('tbody tr').first()).toBeVisible()
    await expect(page.locator('tbody tr').filter({ hasText: /@summit\.com/ })).toHaveCount(0)
    await page.getByPlaceholder('Search users...').fill('orphan@acme.com')
    await expect(page.locator('tbody tr').filter({ hasText: 'orphan@acme.com' })).toHaveCount(1)
    await page.getByPlaceholder('Search users...').fill('')
    await page.getByRole('checkbox', { name: 'Orphaned only' }).uncheck()
    // An invite needs membership:create_tree, and must name the entity it joins: an account
    // invited without one would be created outside their view.
    await page.getByRole('button', { name: 'Invite', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Invite user' })
    await expect(dialog.getByText('The account joins this entity, which keeps it in your organization.')).toBeVisible()
    await expect(dialog.getByText('No entity (direct roles)')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
  })
})
