import { backendConfigured, expect, test } from '../support/fixtures'
import { pickDay } from '../support/date-field'
import { chooseSelect, field } from '../support/ui-select'
import type { Page } from '@playwright/test'

// Direct role assignment on the user-detail page. Runs on a freshly API-seeded, run-marked user
// (removed by the run's cleanup) so the roundtrip touches no seeded data. A rootless user's assignable pool
// is the global roles. Also guards against real console errors on this page (the long-lived preview
// tab shows a cached-module `defaultPlaceholder.copy` phantom; a fresh runtime must be clean).
// Assign the first assignable role (role options carry a "perms" count chip) and return its display
// name — shared by the assign/remove roundtrip and the validity-edit tests below.
async function assignFirstRole(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Assign roles' }).click()
  const dialog = page.getByRole('dialog')
  const editor = dialog.getByTestId('role-access-editor')
  await expect(editor).toBeVisible()
  const firstRole = editor.getByRole('option').filter({ hasText: 'perms' }).first()
  const roleName = ((await firstRole.textContent()) ?? '').replace(/\d+\s*perms.*/is, '').trim()
  await firstRole.click()
  // The selection shows as a removable chip above the picker (F-031).
  await expect(editor.getByTestId('role-access-selection').getByRole('button', { name: `Remove ${roleName}` })).toBeVisible()
  await dialog.getByRole('button', { name: 'Assign roles' }).click()
  await expect(dialog).toBeHidden()
  return roleName
}

test.describe('user direct role assignment', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('assigns then removes a direct role', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'role' })

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

    await page.goto(`/app/users/${user.id}?tab=access`)
    await expect(page.getByRole('heading', { name: 'Direct roles' })).toBeVisible()

    // --- Assign a role ---
    const roleName = await assignFirstRole(page)
    await expect.poll(() => posts.length).toBeGreaterThan(0)
    expect(typeof posts[0]!.role_id).toBe('string')

    const row = page.getByRole('row').filter({ hasText: roleName })
    await expect(row).toBeVisible()

    // --- Remove it (self-clean) ---
    await row.getByRole('button', { name: 'Role actions' }).click()
    await page.getByRole('menuitem', { name: 'Remove' }).click()
    const confirm = page.getByRole('dialog', { name: `Remove role ${roleName}` })
    await expect(confirm.getByTestId('confirm-effects')).toContainText('revoked immediately')
    await confirm.getByRole('button', { name: 'Remove role' }).click()
    await expect.poll(() => deleted).toBe(true)
    await expect(page.getByRole('row').filter({ hasText: roleName })).toHaveCount(0)

    // No real runtime errors on this page (rules out defaultPlaceholder.copy being genuine).
    const realErrors = consoleErrors.filter(e => /defaultPlaceholder|is not a function|is not defined|Cannot read/i.test(e))
    expect(realErrors, realErrors.join('\n')).toHaveLength(0)
  })

  test('edits an existing role assignment\'s validity + status (PATCH role-memberships)', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'role' })
    const patches: Array<Record<string, unknown>> = []
    await page.route(/\/users\/[^/]+\/role-memberships\/[^/]+$/, async (route) => {
      if (route.request().method() === 'PATCH') patches.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await page.goto(`/app/users/${user.id}?tab=access`)
    await expect(page.getByRole('heading', { name: 'Direct roles' })).toBeVisible()
    const roleName = await assignFirstRole(page)
    const row = page.getByRole('row').filter({ hasText: roleName })
    await expect(row).toBeVisible()

    // --- Edit validity: set a window + suspend ---
    await row.getByRole('button', { name: 'Role actions' }).click()
    await page.getByRole('menuitem', { name: 'Edit validity' }).click()
    const dialog = page.getByRole('dialog', { name: /^Edit validity/ })
    await expect(dialog).toBeVisible()
    await pickDay(page, 'Valid from', 10)
    await pickDay(page, 'Valid until', 20)
    await chooseSelect(page, field(page, 'Status'), 'Suspended')
    await dialog.getByRole('button', { name: 'Save changes' }).click()

    await expect(dialog).toBeHidden()
    expect(patches).toHaveLength(1)
    expect(patches[0]).toEqual(
      expect.objectContaining({ status: 'suspended' })
    )
    expect(typeof patches[0]!.valid_from).toBe('string')
    expect(typeof patches[0]!.valid_until).toBe('string')

    // A suspension never makes the row vanish (F-058): it stays, with its status, and now offers
    // Reactivate next to Edit validity.
    await expect(row.getByText('Suspended', { exact: true })).toBeVisible()
    await row.getByRole('button', { name: 'Role actions' }).click()
    await expect(page.getByRole('menuitem', { name: 'Reactivate' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Edit validity' })).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('blocks an out-of-order validity window on edit (until before from)', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'role' })
    await page.goto(`/app/users/${user.id}?tab=access`)
    await expect(page.getByRole('heading', { name: 'Direct roles' })).toBeVisible()
    const roleName = await assignFirstRole(page)
    const row = page.getByRole('row').filter({ hasText: roleName })

    await row.getByRole('button', { name: 'Role actions' }).click()
    await page.getByRole('menuitem', { name: 'Edit validity' }).click()
    const dialog = page.getByRole('dialog', { name: /^Edit validity/ })

    let patched = false
    await page.route(/\/users\/[^/]+\/role-memberships\/[^/]+$/, async (route) => {
      if (route.request().method() === 'PATCH') patched = true
      await route.continue()
    })

    // until (10th) earlier than from (20th) — the window is invalid; the rule lands on Valid until.
    await pickDay(page, 'Valid from', 20)
    await pickDay(page, 'Valid until', 10)

    // Shown as soon as the second day is picked: a calendar pick re-validates its field.
    await expect(dialog.getByText('Valid until must be on or after valid from.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog.getByText('Valid until must be on or after valid from.')).toBeVisible()
    await expect(dialog).toBeVisible()
    expect(patched).toBe(false)
  })

  test('assign flags a partly typed day and an out-of-order window, and Clear resets the field', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'role' })
    const posts: string[] = []
    await page.route(/\/users\/[^/]+\/roles\/?$/, async (route) => {
      if (route.request().method() === 'POST') posts.push(route.request().url())
      await route.continue()
    })
    await page.goto(`/app/users/${user.id}?tab=access`)
    await expect(page.getByRole('heading', { name: 'Direct roles' })).toBeVisible()
    await page.getByRole('button', { name: 'Assign roles' }).click()
    const dialog = page.getByRole('dialog', { name: 'Assign roles' })
    // Nothing chosen: the Roles field says so, nothing is sent.
    const assign = dialog.getByRole('button', { name: 'Assign roles', exact: true })
    await assign.click()
    await expect(dialog.getByText('Choose at least one role.')).toBeVisible()
    await dialog.getByRole('option').filter({ hasText: 'perms' }).first().click()

    // Month and day only, then focus leaves the field: flagged on the field, and not sent.
    const until = dialog.getByRole('group', { name: 'Valid until', exact: true })
    await until.getByRole('spinbutton').first().click()
    await page.keyboard.type('1005')
    await dialog.getByRole('group', { name: 'Valid from', exact: true }).getByRole('spinbutton').first().click()
    const incomplete = dialog.getByText('Enter the whole date, or clear it.')
    await expect(incomplete).toBeVisible()
    await assign.click()
    await expect(incomplete).toBeVisible()
    await expect(dialog).toBeVisible()

    // Clear (in the calendar) empties the half-typed field.
    await dialog.getByRole('button', { name: 'Open calendar for Valid until', exact: true }).click()
    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(incomplete).toHaveCount(0)
    await expect(until.getByRole('spinbutton').first()).toHaveAttribute('aria-valuetext', 'Empty')

    // "until" before "from" is flagged on Valid until here too.
    await pickDay(page, 'Valid from', 20)
    await pickDay(page, 'Valid until', 10)
    await expect(dialog.getByText('Valid until must be on or after valid from.')).toBeVisible()
    await assign.click()
    await expect(dialog).toBeVisible()
    expect(posts).toEqual([])
  })
})
