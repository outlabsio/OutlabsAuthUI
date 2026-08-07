import { backendConfigured, expect, test } from '../support/fixtures'
import { chooseSelect, chooseSelectMenu } from '../support/ui-select'

// Role type/scope on the create form: a root-scoped (organization) role. The role_type selector maps
// to is_global + root_entity_id + scope on submit. pw- role auto-purged by the cleanup teardown.
test.describe('role type / scope', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('creates a root-scoped (organization) role', async ({ page }) => {
    const stamp = Date.now()
    const name = `pw-rootrole-${stamp}`

    const posts: Array<Record<string, unknown>> = []
    await page.route(/\/roles\/?$/, async (route) => {
      if (route.request().method() === 'POST') posts.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await page.goto('/app/roles')
    await page.getByRole('button', { name: 'Add role' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Display name', { exact: true }).fill(`PW Root Role ${stamp}`)
    await dialog.getByLabel('Name', { exact: true }).fill(name)

    // Type: Organization (root) -> reveals the root-organization picker.
    await chooseSelect(page, 'role-type', 'Organization (root)')
    await chooseSelectMenu(page, 'role-root-entity', 'ACME Realty')

    await dialog.getByRole('button', { name: 'Create' }).click()

    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0]).toEqual(expect.objectContaining({ name, is_global: false, scope: 'hierarchy' }))
    expect(typeof posts[0]!.root_entity_id).toBe('string')
    expect(posts[0]!.scope_entity_id).toBeNull()
  })
})
