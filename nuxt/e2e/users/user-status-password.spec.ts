import { backendConfigured, expect, test } from '../support/fixtures'
import { adminAccessToken } from '../support/admin-token'
import { chooseSelect } from '../support/ui-select'

// Admin account actions on the user-detail page: change status (suspend) + reset password. Runs on a
// freshly API-seeded pw- user (auto-purged). Both go through the header Actions menu.
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://localhost:8004'
const authApiPrefix = process.env.E2E_AUTH_API_PREFIX ?? '/v1'

async function createUserViaApi(): Promise<{ id: string }> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const res = await fetch(`${apiBaseUrl}${authApiPrefix}/users/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminAccessToken()}` },
    body: JSON.stringify({ email: `pw-acct-${stamp}@example.com`, password: 'Testpass1!' })
  })
  if (!res.ok) throw new Error(`Seed user failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<{ id: string }>
}

test.describe('user status + password (admin)', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('suspends a user then resets their password', async ({ page }) => {
    const user = await createUserViaApi()

    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    const statusPatches: Array<Record<string, unknown>> = []
    let passwordReset = false
    await page.route(/\/users\/[^/]+\/status$/, async (route) => {
      if (route.request().method() === 'PATCH') statusPatches.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })
    await page.route(/\/users\/[^/]+\/password$/, async (route) => {
      if (route.request().method() === 'PATCH') passwordReset = true
      await route.continue()
    })

    await page.goto(`/app/users/${user.id}`)
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()

    // --- Suspend ---
    await page.getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('menuitem', { name: 'Change status' }).click()
    const statusDialog = page.getByRole('dialog')
    await chooseSelect(page, 'user-status', 'Suspended')
    await statusDialog.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => statusPatches.length).toBe(1)
    expect(statusPatches[0]).toEqual(expect.objectContaining({ status: 'suspended' }))
    await expect(statusDialog).toBeHidden()

    // --- Reset password ---
    await page.getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('menuitem', { name: 'Reset password' }).click()
    const resetDialog = page.getByRole('dialog')
    await resetDialog.getByLabel('New password', { exact: true }).fill('Newpass1!')
    await resetDialog.getByLabel('Confirm password', { exact: true }).fill('Newpass1!')
    await resetDialog.getByRole('button', { name: 'Reset password' }).click()
    await expect.poll(() => passwordReset).toBe(true)
    await expect(resetDialog).toBeHidden()

    const realErrors = consoleErrors.filter(e => /defaultPlaceholder|is not a function|is not defined|Cannot read/i.test(e))
    expect(realErrors, realErrors.join('\n')).toHaveLength(0)
  })
})
