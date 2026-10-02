import { backendConfigured, expect, test } from '../support/fixtures'
import { onPath } from '../support/session'
import { userActionsButton } from '../support/users'

// The user detail's share of WP-11 and WP-12: Edit profile from the navbar's Edit button (the same
// dialog as the list, F-064), the admin's own account guarded (F-063), and holds with their end
// dates (F-061).

test.describe('user detail profile', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ errorGuardMode: 'strict' })

  test('Edit profile from the detail navbar sends only what changed (F-064)', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'profile', first_name: 'Before', last_name: 'Name' })
    const patches: Array<Record<string, unknown>> = []
    await page.route(new RegExp(`/users/${user.id}$`), async (route) => {
      if (route.request().method() === 'PATCH') patches.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await page.goto(`/app/users/${user.id}`)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `Edit ${user.email}` })
    await expect(dialog.getByLabel('Email')).toHaveValue(user.email)
    await dialog.getByLabel('Last name').fill('Changed')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()
    expect(patches).toEqual([{ last_name: 'Changed' }])
    await expect(page.getByText('Changed', { exact: true })).toBeVisible()
  })

  test('the admin\'s own page offers no status change or password reset, and points to Account (F-063)', async ({ page, api }) => {
    const me = await api.me()
    await page.goto(`/app/users/${me.id}`)
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
    await userActionsButton(page).click()
    const menu = page.getByRole('menu')
    await expect(menu.getByRole('menuitem', { name: 'Change status' })).toHaveCount(0)
    await expect(menu.getByRole('menuitem', { name: 'Reset password' })).toHaveCount(0)
    await expect(menu.getByRole('menuitem', { name: /superuser/ })).toHaveCount(0)
    await expect(menu.getByRole('menuitem', { name: 'Delete user' })).toHaveCount(0)
    await menu.getByRole('menuitem', { name: 'Your account' }).click()
    await expect(page).toHaveURL(onPath('/app/account'))
  })

  test('a timed suspension and a lockout show their end beside the status (F-061)', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'profile-hold' })
    const until = new Date(Date.now() + 4 * 24 * 3600e3).toISOString()
    await api.patch(`/users/${user.id}/status`, { status: 'suspended', suspended_until: until })
    // A lockout needs failed sign-ins (which spend the shared login budget): the detail answer
    // carries one instead.
    const lockedUntil = new Date(Date.now() + 2 * 3600e3).toISOString()
    // The API's user record only, not the console's own /app/users/<id> page.
    await page.route(url => url.pathname.endsWith(`/users/${user.id}`) && !url.pathname.startsWith('/app/'), async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const response = await route.fetch()
      return route.fulfill({ response, json: { ...(await response.json() as object), locked_until: lockedUntil } })
    })

    await page.goto(`/app/users/${user.id}`)
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible()
    // The status badge says Suspended; the end is a detail row, not also a badge that reads as an
    // automatic end. A lockout on an active account is a badge beside the status.
    await expect(page.getByTestId('user-status')).toHaveText('Suspended')
    await expect(page.getByText(/^Suspension end set for /)).toHaveCount(0)
    await expect(page.getByText(/^Locked until /)).toBeVisible()
    for (const label of ['Suspension end', 'Locked until', 'Last activity', 'Password changed']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible()
    }
    // The badges' explanations are readable without hovering (keyboard and touch).
    await expect(page.getByTestId('user-hold-locked')).toContainText('An admin password reset clears the lockout.')
    // outlabs-auth records the end but does not lift a suspension by itself.
    await expect(page.getByTestId('user-hold-suspended')).toHaveText('The end date is recorded only: the account stays suspended until it is reactivated.')
    // Change status is offered for another account.
    await userActionsButton(page).click()
    await expect(page.getByRole('menuitem', { name: 'Change status' })).toBeVisible()
  })
})
