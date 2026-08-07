import { backendConfigured, expect, test } from '../support/fixtures'
import { adminAccessToken } from '../support/admin-token'

// Entity governance: child class/type limits, max members, and child naming-pattern regexes, saved
// via PATCH /entities/{id}. Runs on a fresh pw- entity (auto-purged by the cleanup teardown).
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://localhost:8004'
const authApiPrefix = process.env.E2E_AUTH_API_PREFIX ?? '/v1'

async function createEntityViaApi(): Promise<{ id: string }> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const slug = `pw-gov-${stamp}`
  const res = await fetch(`${apiBaseUrl}${authApiPrefix}/entities/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminAccessToken()}` },
    body: JSON.stringify({ name: slug, display_name: `PW Gov ${stamp}`, slug, entity_class: 'structural', entity_type: 'organization' })
  })
  if (!res.ok) throw new Error(`Seed entity failed: ${res.status}`)
  return res.json() as Promise<{ id: string }>
}

test.describe('entity governance', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('sets child limits + naming patterns', async ({ page }) => {
    const entity = await createEntityViaApi()

    const patches: Array<Record<string, unknown>> = []
    // PATCH /entities/{id} (the detail GET is a GET, move is /{id}/move — neither is recorded).
    await page.route(/\/entities\/[^/]+$/, async (route) => {
      if (route.request().method() === 'PATCH') patches.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await page.goto(`/app/entities?entity=${entity.id}`)
    await page.getByRole('button', { name: 'Governance' }).click()
    const dialog = page.getByRole('dialog')

    await dialog.getByLabel('Structural').check()
    await dialog.locator('#gov-child-types').fill('region, office')
    await dialog.getByLabel('Max members').fill('50')
    await dialog.getByLabel('System-name pattern').fill('^[a-z0-9-]+$')
    await dialog.getByRole('button', { name: 'Save governance' }).click()

    await expect.poll(() => patches.length).toBe(1)
    expect(patches[0]).toEqual(expect.objectContaining({
      max_members: 50,
      child_name_pattern: '^[a-z0-9-]+$'
    }))
    expect(patches[0]!.allowed_child_types).toEqual(['region', 'office'])
    expect(patches[0]!.allowed_child_classes).toContain('structural')
    await expect(dialog).toBeHidden()
  })
})
