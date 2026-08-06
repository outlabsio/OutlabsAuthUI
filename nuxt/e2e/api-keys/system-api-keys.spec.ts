import { backendConfigured, expect, test } from '../support/fixtures'
import { adminAccessToken } from '../support/admin-token'
import { chooseSelect, chooseSelectMenu } from '../support/ui-select'
import type { Page } from '@playwright/test'

// System API Keys — service accounts + machine keys, platform-global and entity-scoped
// (chromium project, admin storageState — superuser, so apikey:read passes). Machine-key
// create + rotate surface the one-time secret; revoke soft-deletes (the row stays as revoked).
const SCOPE = 'entity:read'
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://localhost:8004'
const authApiPrefix = process.env.E2E_AUTH_API_PREFIX ?? '/v1'

// Unique per call — Date.now() alone collides across parallel workers (same-named principals
// then match two master-list buttons).
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// Seed an entity to scope service accounts to (reuses the setup-minted admin token).
async function createEntityViaApi(): Promise<{ id: string, display_name: string }> {
  const slug = `pw-esc-${uid()}`
  const res = await fetch(`${apiBaseUrl}${authApiPrefix}/entities/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminAccessToken()}` },
    body: JSON.stringify({ name: slug, display_name: `PW ESC ${slug}`, slug, entity_class: 'structural', entity_type: 'organization' })
  })
  if (!res.ok) throw new Error(`Seed entity failed: ${res.status}`)
  return res.json() as Promise<{ id: string, display_name: string }>
}

async function createServiceAccount(page: Page, name: string) {
  await page.goto('/app/users/api-keys')
  await page.getByRole('button', { name: 'Create service account' }).click()
  await expect(page.locator('#sa-name')).toBeVisible()
  await page.locator('#sa-name').fill(name)
  await page.getByRole('checkbox', { name: SCOPE, exact: true }).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.locator('#sa-name')).toBeHidden()
  // It appears in the master list and auto-selects (detail pane ready for machine keys).
  await expect(page.getByRole('button').filter({ hasText: name })).toBeVisible()
}

async function createMachineKey(page: Page, keyName: string) {
  await page.getByRole('button', { name: 'Create machine key' }).click()
  await expect(page.locator('#machine-key-name')).toBeVisible()
  await page.locator('#machine-key-name').fill(keyName)
  await page.getByRole('checkbox', { name: SCOPE, exact: true }).check()
  await page.getByRole('button', { name: 'Create key' }).click()
  await expect(page.getByText('Store the new API key now')).toBeVisible()
  await expect(page.getByLabel('Machine key secret')).not.toHaveValue('')
  await page.getByRole('button', { name: 'Done' }).click()
}

function keyRow(page: Page, name: string) {
  return page.getByRole('row').filter({ hasText: name })
}

test.describe('system api keys workspace', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('renders the system api keys workspace', async ({ page }) => {
    await page.goto('/app/users/api-keys')
    await expect(page).toHaveURL(/\/app\/users\/api-keys$/)
    await expect(page.getByRole('heading', { name: 'System API Keys' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open System API Keys guide' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create service account' })).toBeVisible()
  })

  test('creates a platform-global service account', async ({ page }) => {
    const name = `pw-sa-${uid()}`
    await createServiceAccount(page, name)
    await expect(page.getByRole('button').filter({ hasText: name })).toBeVisible()
  })

  test('mints a machine key with a one-time secret', async ({ page }) => {
    const saName = `pw-sa-${uid()}`
    const keyName = `pw-mk-${uid()}`
    await createServiceAccount(page, saName)
    await createMachineKey(page, keyName)
    await expect(keyRow(page, keyName)).toBeVisible()
  })

  test('rotates a machine key (fresh secret)', async ({ page }) => {
    const saName = `pw-sa-${uid()}`
    const keyName = `pw-mk-${uid()}`
    await createServiceAccount(page, saName)
    await createMachineKey(page, keyName)

    await keyRow(page, keyName).getByRole('button', { name: 'Machine key actions' }).click()
    await page.getByRole('menuitem', { name: 'Rotate' }).click()
    await expect(page.getByText('Rotate machine key')).toBeVisible()
    await page.getByRole('button', { name: 'Rotate key' }).click()

    await expect(page.getByText('Store the new API key now')).toBeVisible()
    await expect(page.getByLabel('Machine key secret')).not.toHaveValue('')
    await page.getByRole('button', { name: 'Done' }).click()
  })

  test('revokes a machine key', async ({ page }) => {
    const saName = `pw-sa-${uid()}`
    const keyName = `pw-mk-${uid()}`
    await createServiceAccount(page, saName)
    await createMachineKey(page, keyName)

    await keyRow(page, keyName).getByRole('button', { name: 'Machine key actions' }).click()
    await page.getByRole('menuitem', { name: 'Revoke' }).click()
    await expect(page.getByText('Revoke machine key')).toBeVisible()
    await page.getByRole('button', { name: 'Revoke key' }).click()

    await expect(keyRow(page, keyName).getByText('revoked')).toBeVisible()
  })

  test('entity scope: create an account + key, and the inventory lists it', async ({ page }) => {
    const entity = await createEntityViaApi()
    const saName = `pw-esc-sa-${uid()}`
    const keyName = `pw-esc-mk-${uid()}`

    await page.goto('/app/users/api-keys')
    await chooseSelect(page, 'scope-kind', 'Entity')
    await expect(page.locator('#scope-entity')).toBeVisible()
    await chooseSelectMenu(page, 'scope-entity', entity.display_name)

    // Create an entity-scoped service account.
    await page.getByRole('button', { name: 'Create service account' }).click()
    await expect(page.locator('#sa-name')).toBeVisible()
    await page.locator('#sa-name').fill(saName)
    await page.getByRole('checkbox', { name: SCOPE, exact: true }).check()
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.locator('#sa-name')).toBeHidden()
    await expect(page.getByRole('button').filter({ hasText: saName })).toBeVisible()

    // Mint a machine key under it.
    await createMachineKey(page, keyName)
    await expect(keyRow(page, keyName)).toBeVisible()

    // The entity inventory tab lists the key.
    await page.getByRole('button', { name: 'Inventory' }).click()
    await expect(keyRow(page, keyName)).toBeVisible()
  })

  test('creates a role-backed service account (role envelope)', async ({ page }) => {
    const name = `pw-role-sa-${uid()}`
    const posts: Array<Record<string, unknown>> = []
    await page.route(/\/integration-principals$/, async (route) => {
      if (route.request().method() === 'POST') posts.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await page.goto('/app/users/api-keys')
    await page.getByRole('button', { name: 'Create service account' }).click()
    await expect(page.locator('#sa-name')).toBeVisible()
    await page.locator('#sa-name').fill(name)
    // Back it with a global role instead of raw scopes (platform-global shows global roles).
    const role = page.getByRole('checkbox', { name: 'Service Reader', exact: true })
    await expect(role).toBeVisible()
    await role.check()
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.locator('#sa-name')).toBeHidden()
    expect(posts).toHaveLength(1)
    const roleIds = posts[0].role_ids as string[]
    expect(Array.isArray(roleIds)).toBe(true)
    expect(roleIds.length).toBeGreaterThan(0)
  })
})
