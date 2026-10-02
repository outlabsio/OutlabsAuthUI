import { backendConfigured, expect, test } from '../support/fixtures'
import { TEST_PASSWORD } from '../support/api-client'
import { mintAnotherSession } from '../support/sessions'
import { captureAvailable } from '../support/capabilities'
import { openUserAction, userActionsButton } from '../support/users'

// Change status and Reset password on another account's detail (WP-12: F-062, F-208, F-014).
// Accounts are fresh run-marked users created through the API; every change goes through the
// navbar's More user actions menu and is checked against the API.

type ApiUserRecord = { id: string, email: string, status: string, suspended_until?: string | null, locked_until?: string | null }

test.describe('user status and password (admin)', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ errorGuardMode: 'strict' })

  test('suspends from the status options, then resets the password and signs the account out everywhere', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'status-reset' })
    // A live session, so the reset has something to end. Only where the magic-link capture makes
    // it without a password login: the run's login budget belongs to the session lane.
    const withSession = await captureAvailable('magic-link')
    if (withSession) {
      await mintAnotherSession(user, TEST_PASSWORD)
      expect((await api.get<unknown[]>(`/users/${user.id}/sessions`)).length).toBeGreaterThan(0)
    }

    const statusPatches: Array<Record<string, unknown>> = []
    await page.route(/\/users\/[^/]+\/status$/, async (route) => {
      if (route.request().method() === 'PATCH') statusPatches.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await page.goto(`/app/users/${user.id}`)
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()

    // --- Suspend: the dialog shows where the account is, and names the transition ---
    await openUserAction(page, 'Change status')
    const statusDialog = page.getByRole('dialog', { name: `Change status of ${user.email}` })
    await expect(statusDialog.getByTestId('current-status')).toContainText('Active')
    const save = statusDialog.getByRole('button', { name: 'Save changes' })
    await expect(save).toBeDisabled()
    await statusDialog.getByRole('radio', { name: /^Suspended/ }).check()
    await statusDialog.getByLabel('Reason').fill('Policy review')
    await statusDialog.getByRole('button', { name: 'Suspend account' }).click()
    await expect(statusDialog).toBeHidden()
    await expect(page.getByText('Account suspended', { exact: true })).toBeVisible()
    expect(statusPatches).toEqual([{ status: 'suspended', reason: 'Policy review' }])
    await expect(page.getByTestId('user-status')).toHaveText('Suspended')

    // --- Reset password: says it signs the account out everywhere ---
    await openUserAction(page, 'Reset password')
    const resetDialog = page.getByRole('dialog', { name: `Reset password of ${user.email}` })
    await expect(resetDialog.getByTestId('confirm-effects')).toContainText('signed out everywhere')
    await resetDialog.getByLabel('New password', { exact: true }).fill('Newpass1!')
    await resetDialog.getByLabel('Confirm password', { exact: true }).fill('Newpass1!')
    await resetDialog.getByRole('button', { name: 'Reset password' }).click()
    await expect(resetDialog).toBeHidden()
    await expect(page.getByText('Password reset', { exact: true })).toBeVisible()
    if (withSession) await expect.poll(async () => (await api.get<unknown[]>(`/users/${user.id}/sessions`)).length).toBe(0)
  })

  test('a timed suspension keeps its end when only a reason is added (F-062)', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'status-timed' })
    // An end that is not at the end of a day: the dialog must send it back as stored.
    const until = new Date(Date.now() + 5 * 86_400_000)
    until.setUTCHours(15, 30, 0, 0)
    await api.patch(`/users/${user.id}/status`, { status: 'suspended', suspended_until: until.toISOString() })
    const before = await api.get<ApiUserRecord>(`/users/${user.id}`)

    const patches: Array<Record<string, unknown>> = []
    await page.route(/\/users\/[^/]+\/status$/, async (route) => {
      if (route.request().method() === 'PATCH') patches.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })
    await page.goto(`/app/users/${user.id}`)
    await openUserAction(page, 'Change status')
    const dialog = page.getByRole('dialog', { name: `Change status of ${user.email}` })
    await expect(dialog.getByRole('radio', { name: /^Suspended/ })).toBeChecked()
    await expect(dialog.getByText(/^Currently ends /)).toBeVisible()
    // Nothing changed yet: no save.
    await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled()

    await dialog.getByLabel('Reason').fill('Reviewed by the support lead')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()
    expect(patches).toHaveLength(1)
    expect(patches[0]).toMatchObject({ status: 'suspended', reason: 'Reviewed by the support lead' })
    expect(Date.parse(String(patches[0]!.suspended_until))).toBe(Date.parse(String(before.suspended_until)))
    const after = await api.get<ApiUserRecord>(`/users/${user.id}`)
    expect(Date.parse(String(after.suspended_until))).toBe(until.getTime())
  })

  test('reactivating a suspended account clears its end and is named for what it does', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'status-reactivate' })
    await api.patch(`/users/${user.id}/status`, { status: 'banned' })
    await page.goto(`/app/users/${user.id}`)
    await openUserAction(page, 'Change status')
    const dialog = page.getByRole('dialog', { name: `Change status of ${user.email}` })
    await dialog.getByRole('radio', { name: /^Active/ }).check()
    await expect(dialog.getByLabel('Suspended until')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Reactivate account' }).click()
    await expect(dialog).toBeHidden()
    await expect.poll(async () => (await api.get<ApiUserRecord>(`/users/${user.id}`)).status).toBe('active')
    // The menu is rebuilt from the new state.
    await userActionsButton(page).click()
    await expect(page.getByRole('menuitem', { name: 'Change status' })).toBeVisible()
    await page.keyboard.press('Escape')
  })
})
