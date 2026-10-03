import type { Request } from '@playwright/test'
import { expect, expectSeeded, personaState, test } from '../support/fixtures'
import { apiRoot } from '../support/capabilities'
import { openEntity, treeRow } from '../support/entities'
import { commandPalette, pressPaletteShortcut } from '../support/shell'

// F-020: a delegated organisation admin works in their own organisation: the tree shows it alone
// (no organisation switcher), every entity picker and the command palette offer that
// organisation only, and a deep link to another organisation's entity shows none of its data:
// the backend answers it 404, like a nonexistent entity (DD-061), and the console says it was
// not found. Also F-022: the seeded inactive office is reachable.

type Entity = { id: string, display_name: string, parent_entity_id?: string | null }

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test.describe('entities for a delegated organisation admin', () => {
  test.use({ storageState: personaState('orgAdmin'), errorGuardMode: 'strict' })

  test.beforeEach(async ({ requires }) => {
    await requires({ backend: true, preset: 'EnterpriseRBAC', surfaces: ['entities'], personas: ['orgAdmin'] })
  })

  test('the tree is the admin\'s own organisation only', async ({ page, apiAs }) => {
    const me = await apiAs('orgAdmin').me()
    expectSeeded(me.root_entity_id, 'the org admin belongs to an organization')
    const roots = await apiAs('orgAdmin').get<{ items: Entity[] }>('/entities/', { query: { root_only: true, limit: 100 } })
    const own = roots.items.find(r => r.id === me.root_entity_id)
    const others = roots.items.filter(r => r.id !== me.root_entity_id)

    await page.goto('/app/entities')
    await expect(treeRow(page, own!.display_name)).toBeVisible()
    for (const other of others) await expect(treeRow(page, other.display_name)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Organization' })).toHaveCount(0)
    // entity:create_tree grants entity:create: they add entities inside their organisation.
    await expect(page.getByRole('button', { name: 'New entity' })).toBeVisible()
  })

  test('a deep link into another organisation shows not-found, never its data', async ({ page, api, apiAs, errorGuard }) => {
    const me = await apiAs('orgAdmin').me()
    expectSeeded(me.root_entity_id, 'the org admin belongs to an organization')
    const other = await api.createEntity({ kind: 'other-tenant' })
    const name = new RegExp(escapeRegExp(other.display_name))
    // The backend answers the record and its path 404 for an entity outside their tenant.
    errorGuard.allow({ status: 404, url: new RegExp(`/entities/${other.id}(/path)?$`) })

    // Every API request about the foreign entity other than the record and its path.
    const leaks: string[] = []
    page.on('request', (request: Request) => {
      const url = request.url()
      if (!url.startsWith(apiRoot) || !url.includes(other.id)) return
      const path = new URL(url).pathname.slice(new URL(apiRoot).pathname.length)
      if (path === `/entities/${other.id}` || path === `/entities/${other.id}/path`) return
      leaks.push(`${request.method()} ${path}${new URL(url).search}`)
    })

    await page.goto(`/app/entities?entity=${other.id}`)
    // Indistinguishable from a nonexistent entity.
    await expect(page.getByRole('heading', { name: 'Entity not found' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Details' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Users', exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name })).toHaveCount(0)
    await expect(page).not.toHaveTitle(name)
    await page.waitForLoadState('networkidle')
    // No members, audit, keys, service accounts or subtree of the foreign entity were requested.
    expect(leaks).toEqual([])
  })

  test('entity selects and the command palette offer the admin\'s own organisation only', async ({ page, api, apiAs }) => {
    const me = await apiAs('orgAdmin').me()
    expectSeeded(me.root_entity_id, 'the org admin belongs to an organization')
    const roots = await apiAs('orgAdmin').get<{ items: Entity[] }>('/entities/', { query: { root_only: true, limit: 100 } })
    const own = roots.items.find(r => r.id === me.root_entity_id)!
    // Another organization as the superuser sees it, whatever the org admin's reads return.
    const allRoots = await api.get<{ items: Entity[] }>('/entities/', { query: { root_only: true, limit: 100 } })
    const other = allRoots.items.find(r => r.id !== me.root_entity_id)
    expectSeeded(other, 'a second organization')
    const serverSearches: string[] = []
    page.on('request', (request: Request) => {
      if (request.url().startsWith(apiRoot) && /\/entities\/\?.*search=/.test(request.url())) serverSearches.push(request.url())
    })

    // Add user > Root org (a plain select over useScopedEntities).
    await page.goto('/app/users')
    await page.getByRole('button', { name: 'Add user' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add user' })
    await dialog.getByLabel('Organization', { exact: true }).click()
    await expect(page.getByRole('option', { name: own.display_name, exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: other!.display_name, exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')

    // The command palette searches the admin's organisation, never the unscoped server search.
    await page.goto('/app/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await pressPaletteShortcut(page)
    const palette = commandPalette(page)
    await expect(palette).toBeVisible()
    await page.keyboard.type(own.display_name)
    await expect(palette.getByRole('option', { name: new RegExp(`^${escapeRegExp(own.display_name)}`) })).toBeVisible()
    await palette.locator('input').first().fill(other!.display_name)
    await page.waitForTimeout(800)
    await expect(palette.getByRole('option', { name: new RegExp(`^${escapeRegExp(other!.display_name)}`) })).toHaveCount(0)
    expect(serverSearches).toEqual([])
  })

  test('Show inactive reveals the seeded inactive office under its region', async ({ page, apiAs }) => {
    const me = await apiAs('orgAdmin').me()
    expectSeeded(me.root_entity_id, 'the org admin belongs to an organization')
    const descendants = await apiAs('orgAdmin').get<Array<Entity & { status: string }>>(`/entities/${me.root_entity_id}/descendants`)
    const inactive = descendants.find(e => e.status === 'inactive')
    expectSeeded(inactive, 'the org admin\'s organization has an inactive office')
    const parent = descendants.find(e => e.id === inactive!.parent_entity_id)

    await openEntity(page, inactive!.id, inactive!.display_name)
    // Selected through a link, the inactive entity opens; the tree reveals it once shown.
    await page.getByRole('switch', { name: 'Show inactive' }).click()
    const row = treeRow(page, inactive!.display_name)
    await expect(row).toBeVisible()
    await expect(row).toContainText('Inactive')
    if (parent) await expect(treeRow(page, parent.display_name)).toHaveAttribute('aria-expanded', 'true')
  })
})
