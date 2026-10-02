import { expect, test } from '../support/fixtures'
import { apiUrl } from '../support/env'
import type { ApiClient } from '../support/api-client'

// AppEntityPicker (F-072), through user detail > Add membership. Scoped to the user's
// organisation, every option carries its path and nothing from another organisation appears.
// For a user without an organisation, a superuser searches every entity on the server and the
// results still show their path.

type Entity = { id: string, display_name: string, parent_entity_id?: string | null, status: string }

// A root organisation with an active grandchild, so the path has two levels to show.
async function rootWithGrandchild(api: ApiClient) {
  const roots = await api.get<{ items: Entity[] }>('/entities/', { query: { root_only: true, limit: 100 } })
  for (const root of roots.items) {
    const descendants = await api.get<Entity[]>(`/entities/${root.id}/descendants`)
    const byId = new Map(descendants.map(e => [e.id, e]))
    const grandchild = descendants.find(e => e.status === 'active' && e.parent_entity_id && byId.has(e.parent_entity_id))
    if (grandchild) return { root, parent: byId.get(grandchild.parent_entity_id!)!, grandchild, otherRoots: roots.items.filter(r => r.id !== root.id) }
  }
  return null
}

test.describe('entity picker', () => {
  test.use({ errorGuardMode: 'strict' })

  test.beforeEach(async ({ requires }) => {
    await requires({ backend: true, preset: 'EnterpriseRBAC', surfaces: ['entities', 'memberships'] })
  })

  test('scoped to the user\'s organisation, options show their path', async ({ page, api }) => {
    const tree = await rootWithGrandchild(api)
    test.skip(!tree, 'The seed has no organisation with a grandchild entity.')
    const { root, parent, grandchild, otherRoots } = tree!
    const user = await api.createUser({ kind: 'picker-scoped', root_entity_id: root.id })

    await page.goto(`/app/users/${user.id}?tab=access`)
    await page.getByRole('button', { name: 'Add membership' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add membership' })
    await dialog.getByLabel('Entity', { exact: true }).click()

    const option = page.getByRole('option').filter({ has: page.locator('[data-slot="itemLabel"]', { hasText: grandchild.display_name }) })
    await expect(option).toHaveCount(1)
    await expect(option.locator('[data-slot="itemDescription"]')).toContainText(`${root.display_name} / ${parent.display_name}`)
    // Nothing from another organisation.
    for (const other of otherRoots) {
      await expect(page.getByRole('option', { name: new RegExp(`^${other.display_name}`) })).toHaveCount(0)
    }

    // Local filtering matches the path too.
    await page.getByRole('combobox', { name: 'Search entities' }).fill(parent.display_name)
    await expect(option).toBeVisible()
    await option.click()
    await expect(dialog.getByLabel('Entity', { exact: true })).toContainText(grandchild.display_name)
  })

  test('an inactive entity is offered disabled, with "Inactive" leading its description', async ({ page, api }) => {
    const root = await api.createEntity({ kind: 'picker-root' })
    const inactive = await api.createEntity({ kind: 'picker-inactive', entity_type: 'office', parent_entity_id: root.id, status: 'inactive' })
    const user = await api.createUser({ kind: 'picker-inactive', root_entity_id: root.id })

    await page.goto(`/app/users/${user.id}?tab=access`)
    await page.getByRole('button', { name: 'Add membership' }).click()
    await page.getByRole('dialog', { name: 'Add membership' }).getByLabel('Entity', { exact: true }).click()

    const option = page.getByRole('option').filter({ has: page.locator('[data-slot="itemLabel"]', { hasText: inactive.display_name }) })
    await expect(option).toHaveCount(1)
    // Reka marks a disabled option with data-disabled (and a disabled attribute).
    await expect(option).toHaveAttribute('data-disabled', '')
    // The reason it is disabled comes first, so a long path cannot truncate it away.
    await expect(option.locator('[data-slot="itemDescription"]')).toHaveText(`Inactive · ${root.display_name} · office`)
  })

  test('without an organisation, a superuser searches every entity on the server', async ({ page, api }) => {
    const tree = await rootWithGrandchild(api)
    test.skip(!tree, 'The seed has no organisation with a grandchild entity.')
    const { root, parent, grandchild } = tree!
    const user = await api.createUser({ kind: 'picker-global' })

    const searches: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'GET' && request.url().startsWith(apiUrl('/entities/?'))) {
        const search = new URL(request.url()).searchParams.get('search')
        if (search) searches.push(search)
      }
    })
    await page.goto(`/app/users/${user.id}?tab=access`)
    await page.getByRole('button', { name: 'Add membership' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add membership' })
    await dialog.getByLabel('Entity', { exact: true }).click()
    // With no term the organisations are listed.
    await expect(page.getByRole('option', { name: new RegExp(`^${root.display_name}`) })).toBeVisible()

    await page.getByRole('combobox', { name: 'Search entities' }).pressSequentially(grandchild.display_name, { delay: 30 })
    await expect.poll(() => searches.at(-1)).toBe(grandchild.display_name)
    // Debounced: one request for the whole term, not one per keystroke.
    expect(searches.length).toBeLessThanOrEqual(2)
    const option = page.getByRole('option').filter({ has: page.locator('[data-slot="itemLabel"]', { hasText: grandchild.display_name }) })
    await expect(option.first().locator('[data-slot="itemDescription"]')).toContainText(`${root.display_name} / ${parent.display_name}`)
  })
})
