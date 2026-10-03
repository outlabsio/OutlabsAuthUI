import { backendConfigured, expect, expectSeeded, personaState, test } from '../support/fixtures'
import { pickScope } from '../support/api-keys'
import { pickPermission } from '../support/ui-select'

// Service accounts as the seeded delegated organization admin (F-025, F-084): they hold
// api_key:*_tree but are not a superuser, so the platform-wide routes are closed to them. The
// console opens on their organization's entity-scoped accounts, offers no platform scope, keeps
// the entity choice and the role pool inside their organization and creates accounts and keys
// there. Strict error
// guard: no refused request on the way.

type Account = { id: string, name: string }

test.describe('service accounts as a delegated organization admin', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ storageState: personaState('orgAdmin'), errorGuardMode: 'strict' })

  test.beforeEach(async ({ requires }) => {
    await requires({ preset: 'EnterpriseRBAC', personas: ['orgAdmin'], surfaces: ['integration_principals'] })
  })

  test('opens on their organization, without the platform scope, and the old route still works', async ({ page, apiAs }) => {
    const me = await apiAs('orgAdmin').me() as { root_entity_id?: string | null, root_entity_name?: string | null }
    expectSeeded(me.root_entity_id, 'the org admin belongs to an organization')

    await page.goto('/app/users/api-keys')
    await expect(page).toHaveURL(/\/app\/service-accounts$/)
    await expect(page.getByRole('heading', { name: 'Service accounts', exact: true })).toBeVisible()
    await expect(page.getByLabel('Scope', { exact: true })).toHaveCount(0)
    await expect(page.getByLabel('Entity', { exact: true })).toContainText(me.root_entity_name ?? '')
    // The navbar action (the empty state may offer the same one).
    await expect(page.getByRole('button', { name: 'New service account' }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: /^No access to / })).toHaveCount(0)
    await page.waitForLoadState('networkidle')
  })

  test('creates an account at their organization with a scope they hold, then a key', async ({ page, apiAs, testData }) => {
    const orgAdmin = apiAs('orgAdmin')
    const me = await orgAdmin.me() as { root_entity_id?: string | null }
    expectSeeded(me.root_entity_id, 'the org admin belongs to an organization')
    const held = await orgAdmin.get<string[]>('/permissions/me')
    expect(held).toContain('user:read')
    expect(held).not.toContain('permission:create')
    const name = testData.name('org-sa')
    let created: Account | null = null

    try {
      await page.goto('/app/service-accounts')
      await page.getByRole('button', { name: 'New service account' }).first().click()
      const dialog = page.getByRole('dialog', { name: 'New service account' })
      // The role pool is their organization's (F-084): another organization's roles never show.
      const roles = dialog.getByTestId('role-access-editor')
      await expect(roles.getByRole('option', { name: /ACME Org Admin/ })).toBeVisible()
      await expect(roles.getByRole('option', { name: /Summit/ })).toHaveCount(0)
      await dialog.getByLabel('Name').fill(name)
      await dialog.getByRole('button', { name: 'Advanced: direct scopes' }).click()
      const permissions = dialog.getByTestId('permission-picker')
      await pickPermission(permissions, 'user:read')
      // A permission they do not hold is not offered: they read the catalog, so it is listed,
      // disabled, with the reason (the exact name ranks first).
      await dialog.getByPlaceholder('Search permissions...').fill('permission:create')
      await expect(permissions.getByRole('option').first()).toContainText('You don\'t hold this permission, so you can\'t grant it.')
      await expect(permissions.getByRole('option').first()).toBeDisabled()
      const response = page.waitForResponse(r => r.request().method() === 'POST' && new RegExp(`/admin/entities/${me.root_entity_id}/integration-principals$`).test(r.url()))
      await dialog.getByRole('button', { name: 'Create service account' }).click()
      created = await (await response).json() as Account
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()

      await page.getByRole('link', { name: 'Keys' }).click()
      await page.getByRole('button', { name: 'New key' }).click()
      const keyDialog = page.getByRole('dialog', { name: 'New key' })
      await keyDialog.getByLabel('Name').fill(testData.name('org-key'))
      await pickScope(keyDialog, 'user:read')
      await keyDialog.getByRole('button', { name: 'Create key' }).click()
      const reveal = page.getByRole('dialog', { name: 'Store the new API key now' })
      await expect(reveal).toContainText(name)
      await reveal.getByRole('checkbox', { name: 'I have stored this key somewhere safe' }).check()
      await reveal.getByRole('button', { name: 'Done' }).click()
      await expect(reveal).toBeHidden()
    } finally {
      // Accounts at the seeded organization are not run-scoped data: archive it here.
      if (created) await orgAdmin.delete(`/admin/entities/${me.root_entity_id}/integration-principals/${created.id}`)
    }
  })

  test('a platform-wide account link is denied without asking the server', async ({ page }) => {
    await page.goto('/app/service-accounts/0b9c1d1e-1111-4222-8333-444455556666')
    await expect(page.getByText('You can\'t view this service account')).toBeVisible()
    await expect(page.getByText('Platform-wide service accounts are managed by superusers.')).toBeVisible()
  })
})
