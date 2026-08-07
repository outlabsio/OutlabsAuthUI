import { backendConfigured, expect, test } from '../support/fixtures'
import { adminAccessToken } from '../support/admin-token'

// Direct role assignment on the user-detail page. Runs on a freshly API-seeded pw- user (auto-purged
// by the cleanup teardown) so the roundtrip touches no seeded data. A rootless user's assignable pool
// is the global roles. Also guards against real console errors on this page (the long-lived preview
// tab shows a cached-module `defaultPlaceholder.copy` phantom; a fresh runtime must be clean).
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://localhost:8004'
const authApiPrefix = process.env.E2E_AUTH_API_PREFIX ?? '/v1'

async function createUserViaApi(): Promise<{ id: string }> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const res = await fetch(`${apiBaseUrl}${authApiPrefix}/users/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminAccessToken()}` },
    body: JSON.stringify({ email: `pw-role-${stamp}@example.com`, password: 'Testpass1!' })
  })
  if (!res.ok) throw new Error(`Seed user failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<{ id: string }>
}

test.describe('user direct role assignment', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('assigns then removes a direct role', async ({ page }) => {
    const user = await createUserViaApi()

    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    const posts: Array<Record<string, unknown>> = []
    let deleted = false
    await page.route(/\/users\/[^/]+\/roles\/?$/, async (route) => {
      if (route.request().method() === 'POST') posts.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })
    await page.route(/\/users\/[^/]+\/roles\/[^/]+$/, async (route) => {
      if (route.request().method() === 'DELETE') deleted = true
      await route.continue()
    })

    await page.goto(`/app/users/${user.id}`)
    await expect(page.getByRole('heading', { name: 'Direct roles' })).toBeVisible()

    // --- Assign a role (role options carry a "perms" count chip) ---
    await page.getByRole('button', { name: 'Assign roles' }).click()
    const dialog = page.getByRole('dialog')
    const firstRole = dialog.getByRole('option').filter({ hasText: 'perms' }).first()
    const roleName = ((await firstRole.textContent()) ?? '').replace(/\d+\s*perms.*/is, '').trim()
    await firstRole.click()
    await dialog.getByRole('button', { name: 'Assign' }).click()

    await expect.poll(() => posts.length).toBeGreaterThan(0)
    expect(typeof posts[0]!.role_id).toBe('string')
    await expect(dialog).toBeHidden()

    const row = page.getByRole('row').filter({ hasText: roleName })
    await expect(row).toBeVisible()

    // --- Remove it (self-clean) ---
    await row.getByRole('button', { name: 'Role actions' }).click()
    await page.getByRole('menuitem', { name: 'Remove' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
    await expect.poll(() => deleted).toBe(true)
    await expect(page.getByRole('row').filter({ hasText: roleName })).toHaveCount(0)

    // No real runtime errors on this page (rules out defaultPlaceholder.copy being genuine).
    const realErrors = consoleErrors.filter(e => /defaultPlaceholder|is not a function|is not defined|Cannot read/i.test(e))
    expect(realErrors, realErrors.join('\n')).toHaveLength(0)
  })
})
