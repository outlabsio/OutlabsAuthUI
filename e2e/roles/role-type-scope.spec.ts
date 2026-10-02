import { backendConfigured, expect, test } from '../support/fixtures'
import { chooseSelect, chooseSelectMenu, field } from '../support/ui-select'
import { cardByHeading, pickEntity } from '../support/entities'

// Role type on the create form (F-068, F-069): Type first, as cards; an organization role needs
// its organization, an entity role its entity (searchable picker with paths), and only an
// entity role has a scope and auto-assignment. EnterpriseRBAC only (SimpleRBAC roles are flat).
test.describe('role type / scope', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test.beforeEach(async ({ requires }) => {
    await requires({ preset: 'EnterpriseRBAC' })
  })

  function capturePosts(page: import('@playwright/test').Page) {
    const posts: Array<Record<string, unknown>> = []
    return page.route(/\/roles\/?$/, async (route) => {
      if (route.request().method() === 'POST') posts.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fallback()
    }).then(() => posts)
  }

  test('creates a root-scoped (organization) role', async ({ page, testData }) => {
    const posts = await capturePosts(page)
    await page.goto('/app/roles')
    await page.getByRole('button', { name: 'Add role' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add role' })
    // Type is the first decision (F-069).
    await dialog.getByLabel('Display name').fill(testData.displayName('rootrole'))
    await dialog.getByRole('radio', { name: /^Organization/ }).check()
    await chooseSelectMenu(page, dialog.getByRole('button', { name: 'Organization', exact: true }), 'ACME Realty')
    // Scope and auto-assignment mean nothing for an organization role (F-068).
    await expect(dialog.getByLabel('Applies to', { exact: true })).toHaveCount(0)
    await expect(dialog.getByRole('switch', { name: 'Auto-assign' })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Create role' }).click()

    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0]).toEqual(expect.objectContaining({ is_global: false, scope: 'hierarchy', is_auto_assigned: false }))
    expect(typeof posts[0]!.root_entity_id).toBe('string')
    expect(posts[0]!.scope_entity_id).toBeNull()
    // The new role opens and says where it lives.
    const details = cardByHeading(page, 'Details')
    await expect(details).toContainText('Defined at')
    await expect(details).toContainText('ACME Realty')
  })

  test('creates an entity-local role limited to its entity, with entity types from a list (F-069, F-116)', async ({ page, testData }) => {
    const posts = await capturePosts(page)
    await page.goto('/app/roles')
    await page.getByRole('button', { name: 'Add role' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add role' })
    await dialog.getByLabel('Display name').fill(testData.displayName('entityrole'))
    await dialog.getByRole('radio', { name: /^Entity/ }).check()
    await pickEntity(page, dialog.getByRole('button', { name: 'Entity', exact: true }), 'East Coast Region', { search: true })
    await chooseSelect(page, field(page, 'Applies to'), 'Only the entity itself')
    // Entity types are a multi-select of known types, with "create" for a new one.
    await dialog.getByLabel('Assignable at', { exact: true }).click()
    await page.getByRole('option', { name: 'region', exact: true }).click()
    await page.keyboard.press('Escape')

    // An auto-assigned role must be active.
    await dialog.getByRole('switch', { name: 'Auto-assign' }).click()
    await dialog.getByRole('switch', { name: 'Active' }).click()
    await dialog.getByRole('button', { name: 'Create role' }).click()
    await expect(dialog.getByText('An auto-assigned role must be active.')).toBeVisible()
    expect(posts).toHaveLength(0)
    await dialog.getByRole('switch', { name: 'Auto-assign' }).click()
    await dialog.getByRole('button', { name: 'Create role' }).click()

    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0]).toEqual(expect.objectContaining({
      is_global: false,
      scope: 'entity_only',
      status: 'inactive',
      is_auto_assigned: false,
      root_entity_id: null,
      assignable_at_types: ['region']
    }))
    expect(typeof posts[0]!.scope_entity_id).toBe('string')
    const details = cardByHeading(page, 'Details')
    await expect(details).toContainText('East Coast Region')
    await expect(details).toContainText('Entity only')
  })
})
