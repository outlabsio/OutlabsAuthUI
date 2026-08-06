import { backendConfigured, expect, test } from '../support/fixtures'
import { adminAccessToken } from '../support/admin-token'

// ABAC conditions editor (chromium project, admin storageState — superuser, so role:update /
// permission:update pass; the enterprise backend has the abac capability on). Full lifecycle
// is exercised on a freshly-seeded permission; the role side shares the same component, so a
// render check is enough there.
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://localhost:8004'
const authApiPrefix = process.env.E2E_AUTH_API_PREFIX ?? '/v1'
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

async function createPermissionViaApi(): Promise<{ id: string }> {
  // Permission names follow resource:action (one colon, no hyphens) — keep the suffix numeric.
  const stamp = `${Date.now()}${Math.floor(Math.random() * 100000)}`
  const res = await fetch(`${apiBaseUrl}${authApiPrefix}/permissions/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminAccessToken()}` },
    body: JSON.stringify({ name: `pwabac${stamp}:read`, display_name: `PW ABAC ${stamp}`, description: '' })
  })
  if (!res.ok) throw new Error(`Seed permission failed: ${res.status}`)
  return res.json() as Promise<{ id: string }>
}

async function firstNonSystemRoleId(): Promise<string> {
  const res = await fetch(`${apiBaseUrl}${authApiPrefix}/roles/?limit=50`, {
    headers: { Authorization: `Bearer ${adminAccessToken()}` }
  })
  const data = (await res.json()) as { items: Array<{ id: string, is_system_role: boolean }> }
  const role = data.items.find(r => !r.is_system_role)
  if (!role) throw new Error('No non-system role available')
  return role.id
}

test.describe('abac conditions', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('permission: add a condition group + condition, then delete both', async ({ page }) => {
    const perm = await createPermissionViaApi()
    await page.goto(`/app/permissions/${perm.id}`)
    await expect(page.getByRole('heading', { name: 'ABAC conditions' })).toBeVisible()

    // Add a condition group.
    await page.getByRole('button', { name: 'Add condition group' }).click()
    await expect(page.locator('#abac-group-operator')).toBeVisible()
    await page.locator('#abac-group-description').fill('env checks')
    await page.getByRole('button', { name: 'Add group' }).click()
    await expect(page.locator('#abac-group-operator')).toBeHidden()
    await expect(page.getByText('env checks')).toBeVisible()

    // Add a condition inside it.
    await page.getByRole('button', { name: 'Add condition', exact: true }).click()
    await expect(page.locator('#abac-attribute')).toBeVisible()
    await page.locator('#abac-attribute').fill('user.department')
    await page.locator('#abac-operator').fill('eq')
    await page.locator('#abac-value').fill('sales')
    await page.getByRole('button', { name: 'Save condition' }).click()
    await expect(page.locator('#abac-attribute')).toBeHidden()
    await expect(page.getByText('user.department')).toBeVisible()

    // Delete the condition (row text is unique vs the confirm-modal's attribute label).
    await page.getByRole('button', { name: 'Delete condition user.department' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText('user.department eq sales')).toBeHidden()

    // Delete the group (exact match avoids the confirm-modal's "AND · env checks" label).
    await page.getByRole('button', { name: /Delete condition group/ }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText('env checks', { exact: true })).toBeHidden()
  })

  test('role: the ABAC editor renders on a non-system role', async ({ page }) => {
    const roleId = await firstNonSystemRoleId()
    await page.goto(`/app/roles/${roleId}`)
    await expect(page.getByRole('heading', { name: 'ABAC conditions' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add condition group' })).toBeVisible()
  })
})
