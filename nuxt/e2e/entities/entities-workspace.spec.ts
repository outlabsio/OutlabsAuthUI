import { backendConfigured, expect, test } from '../support/fixtures'
import { adminAccessToken } from '../support/admin-token'
import type { Page } from '@playwright/test'

// Entities vertical — hierarchy-aware create + move + edit (chromium project, admin
// storageState — superuser, so entity:create/update pass). Create/move payloads are asserted
// via route interception; edit is asserted through the refetched detail.
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://localhost:8004'
const authApiPrefix = process.env.E2E_AUTH_API_PREFIX ?? '/v1'

type SeededEntity = { id: string, display_name: string, parent_entity_id: string | null }

// Seed an entity through the API, reusing the setup-minted admin token (no extra logins).
// Pass allowedChildTypes to make it a governed parent.
async function createEntityViaApi(parentId?: string, allowedChildTypes?: string[]): Promise<SeededEntity> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const slug = `pw-api-${stamp}`
  const res = await fetch(`${apiBaseUrl}${authApiPrefix}/entities/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminAccessToken()}` },
    body: JSON.stringify({
      name: slug,
      display_name: `PW API ${stamp}`,
      slug,
      entity_class: 'structural',
      entity_type: 'organization',
      ...(parentId ? { parent_entity_id: parentId } : {}),
      ...(allowedChildTypes ? { allowed_child_types: allowedChildTypes, allowed_child_classes: ['structural'] } : {})
    })
  })
  if (!res.ok) throw new Error(`Seed entity failed: ${res.status}`)
  return res.json() as Promise<SeededEntity>
}

async function fillCreateForm(page: Page, slug: string, display: string) {
  await page.getByRole('button', { name: 'New entity' }).click()
  await expect(page.locator('#entity-name')).toBeVisible()
  await page.locator('#entity-name').fill(slug)
  await page.locator('#entity-slug').fill(slug)
  await page.locator('#entity-display-name').fill(display)
  await page.locator('#entity-type').fill('organization')
}

test.describe('entities workspace', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('lists the entity hierarchy', async ({ page }) => {
    await page.goto('/app/entities')
    await expect(page.getByRole('heading', { name: 'Entities' })).toBeVisible()
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.getByRole('button', { name: 'New entity' })).toBeVisible()
  })

  test('creates a root entity (no parent in the payload)', async ({ page }) => {
    const stamp = Date.now()
    const slug = `pw-root-${stamp}`
    const posts: Array<Record<string, unknown>> = []
    await page.route(/\/entities\/?$/, async (route) => {
      if (route.request().method() === 'POST') posts.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await page.goto('/app/entities')
    await fillCreateForm(page, slug, `PW Root ${stamp}`)
    await page.getByRole('button', { name: 'Create entity' }).click()

    // The dialog closes only on a successful create.
    await expect(page.locator('#entity-name')).toBeHidden()
    expect(posts).toHaveLength(1)
    expect(posts[0]).toEqual(
      expect.objectContaining({ name: slug, slug, display_name: `PW Root ${stamp}`, entity_class: 'structural', entity_type: 'organization' })
    )
    expect(posts[0].parent_entity_id).toBeUndefined()
  })

  test('creates a child entity under a chosen parent', async ({ page }) => {
    // Seed a permissive parent (a plain root has no child-type constraints).
    const parent = await createEntityViaApi()
    const stamp = Date.now()
    const slug = `pw-child-${stamp}`
    const posts: Array<Record<string, unknown>> = []
    await page.route(/\/entities\/?$/, async (route) => {
      if (route.request().method() === 'POST') posts.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await page.goto('/app/entities')
    await fillCreateForm(page, slug, `PW Child ${stamp}`)
    await expect(page.locator(`#entity-parent option[value="${parent.id}"]`)).toHaveCount(1)
    await page.locator('#entity-parent').selectOption(parent.id)
    await page.getByRole('button', { name: 'Create entity' }).click()

    await expect(page.locator('#entity-name')).toBeHidden()
    expect(posts).toHaveLength(1)
    expect(posts[0]).toEqual(expect.objectContaining({ parent_entity_id: parent.id }))
  })

  test('edits an entity display name', async ({ page }) => {
    const entity = await createEntityViaApi()
    const renamed = `${entity.display_name} Renamed`

    await page.goto(`/app/entities/${entity.id}`)
    await expect(page.getByRole('heading', { name: entity.display_name })).toBeVisible()

    await page.getByRole('button', { name: 'Edit' }).click()
    await expect(page.getByText('Edit entity')).toBeVisible()
    await page.locator('#entity-edit-display-name').fill(renamed)
    await page.getByRole('button', { name: 'Save changes' }).click()

    // The detail refetches after PATCH — the title reflects the new name.
    await expect(page.getByRole('heading', { name: renamed })).toBeVisible()
  })

  test('moves an entity under a new parent', async ({ page }) => {
    const parent = await createEntityViaApi()
    const child = await createEntityViaApi()

    const moves: Array<Record<string, unknown>> = []
    await page.route(/\/entities\/[0-9a-f-]+\/move$/, async (route) => {
      if (route.request().method() === 'POST') moves.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await page.goto(`/app/entities/${child.id}`)
    await page.getByRole('button', { name: 'Move' }).click()
    await expect(page.locator('#entity-move-parent')).toBeVisible()
    await expect(page.locator(`#entity-move-parent option[value="${parent.id}"]`)).toHaveCount(1)
    await page.locator('#entity-move-parent').selectOption(parent.id)
    await page.getByRole('button', { name: 'Move entity' }).click()

    await expect(page.locator('#entity-move-parent')).toBeHidden()
    expect(moves).toHaveLength(1)
    expect(moves[0]).toEqual(expect.objectContaining({ new_parent_id: parent.id }))
  })

  test('sends child-governance in the create payload', async ({ page }) => {
    const stamp = Date.now()
    const slug = `pw-gov-${stamp}`
    const posts: Array<Record<string, unknown>> = []
    await page.route(/\/entities\/?$/, async (route) => {
      if (route.request().method() === 'POST') posts.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await page.goto('/app/entities')
    await fillCreateForm(page, slug, `PW Gov ${stamp}`)
    await page.getByRole('checkbox', { name: 'Structural', exact: true }).check()
    await page.locator('#entity-allowed-child-types').fill('region, office')
    await page.getByRole('button', { name: 'Create entity' }).click()

    await expect(page.locator('#entity-name')).toBeHidden()
    expect(posts).toHaveLength(1)
    expect(posts[0]).toEqual(
      expect.objectContaining({ allowed_child_types: ['region', 'office'], allowed_child_classes: ['structural'] })
    )
  })

  test('surfaces the parent governance guidance when a governed parent is selected', async ({ page }) => {
    const parent = await createEntityViaApi(undefined, ['region'])

    await page.goto('/app/entities')
    await page.getByRole('button', { name: 'New entity' }).click()
    await expect(page.locator('#entity-parent')).toBeVisible()
    await expect(page.locator(`#entity-parent option[value="${parent.id}"]`)).toHaveCount(1)
    await page.locator('#entity-parent').selectOption(parent.id)

    const guidance = page.getByTestId('parent-governance')
    await expect(guidance).toBeVisible()
    await expect(guidance).toContainText('region')
  })
})
