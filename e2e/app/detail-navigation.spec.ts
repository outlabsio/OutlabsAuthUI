import { backendConfigured, expect, test } from '../support/fixtures'
import { treeRow } from '../support/entities'
import { onPath } from '../support/session'
import { userTabs } from '../support/users'

// P2 detail pages — list row links through to the resource detail view.
test.describe('resource detail navigation', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('opens a role detail from the roles list', async ({ page }) => {
    await page.goto('/app/roles')
    await page.getByRole('link', { name: 'Administrator' }).click()
    await expect(page).toHaveURL(/\/app\/roles\/[0-9a-f-]+/)
    await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Permissions' })).toBeVisible()
  })

  test('opens a user detail from the users list', async ({ page }) => {
    await page.goto('/app/users')
    // Click whichever user is first — robust to list ordering / accumulated test data.
    await page.getByRole('link', { name: /@/ }).first().click()
    await expect(page).toHaveURL(/\/app\/users\/[0-9a-f-]+/)
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
    // Tabs (WP-12): access before history, each a link in the route query.
    const tabs = userTabs(page)
    await expect(tabs.getByRole('link')).toHaveText(['Overview', 'Access', 'Security', ...(await tabs.getByRole('link', { name: 'History' }).count() ? ['History'] : [])])
    await expect(tabs.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
    await tabs.getByRole('link', { name: 'Access' }).click()
    await expect(page).toHaveURL(/[?&]tab=access/)
    await expect(page.getByRole('heading', { name: 'Direct roles', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Profile' })).toHaveCount(0)
    await tabs.getByRole('link', { name: 'Security' }).click()
    await expect(page.getByRole('heading', { name: 'Active sessions', exact: true })).toBeVisible()
    await expect(tabs.getByRole('link', { name: 'Security' })).toHaveAttribute('aria-current', 'page')
    // Back leaves the record for the list instead of stepping through its tabs.
    await page.getByRole('link', { name: /^Back to / }).click()
    await expect(page).toHaveURL(onPath('/app/users'))
  })

  test('opens an entity detail from the entities tree (right column)', async ({ page, requires }) => {
    await requires({ preset: 'EnterpriseRBAC', surfaces: ['entities'] })
    await page.goto('/app/entities')
    // Selecting a tree row opens it in the right-hand detail column via ?entity=<id>.
    await treeRow(page, 'ACME Realty').click()
    await expect(page).toHaveURL(/\/app\/entities\?(.*&)?entity=[0-9a-f-]+/)
    await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Children' })).toBeVisible()
  })
})
