import { backendConfigured, expect, test } from '../support/fixtures'
import { onPath } from '../support/session'
import { detailItem, userActionsButton } from '../support/users'
import { isEnterpriseBackend } from '../support/capabilities'
import { openRowMenu } from '../support/lists'

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

  // outlabs-auth refuses to clear a name once set ('first_name is required') and caps names at
  // 100 characters; the dialog says so on the field instead of sending it (v-users-01).
  test('a name the account has can be changed but not removed; one it lacks stays optional', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'profile-name', first_name: 'Before', last_name: undefined })
    const patches: Array<Record<string, unknown>> = []
    await page.route(new RegExp(`/users/${user.id}$`), async (route) => {
      if (route.request().method() === 'PATCH') patches.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await page.goto(`/app/users/${user.id}`)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `Edit ${user.email}` })
    const first = dialog.getByLabel('First name')
    await expect(first).toHaveValue('Before')
    // Optional only where the account has no name yet.
    await expect(dialog.getByText('Optional', { exact: true })).toHaveCount(2)
    await first.fill('')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog.getByText('Enter a first name. It can be changed but not removed.')).toBeVisible()
    await expect(first).toHaveAttribute('aria-invalid', 'true')
    await first.fill('x'.repeat(101))
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog.getByText('First name must be 100 characters or fewer.')).toBeVisible()
    expect(patches).toEqual([])
    // Leave the field as a keyboard user does: its message clears before Save is pressed (a click
    // whose press removes the message moves the dialog's footer under the pointer).
    await first.fill('After')
    await first.press('Tab')
    await expect(dialog.getByText('First name must be 100 characters or fewer.')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()
    expect(patches).toEqual([{ first_name: 'After' }])
  })

  // Self-service email change is read-only by owner decision (F-193): outlabs-auth changes the
  // sign-in email without re-authentication. Edit profile on one's own record keeps the names
  // and the phone editable and shows the email read-only (v-users-02).
  test('on the admin\'s own record, Edit profile shows the sign-in email read-only', async ({ page, api }) => {
    const me = await api.me()
    await page.goto(`/app/users/${me.id}`)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `Edit ${me.email}` })
    const email = dialog.getByLabel('Email')
    await expect(email).toHaveValue(me.email)
    await expect(email).toBeDisabled()
    await expect(dialog.getByText('Your own sign-in email is read-only.')).toBeVisible()
    await expect(dialog.getByLabel('Phone')).toBeEditable()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()

    // The users list's own row offers the same dialog.
    await page.goto('/app/users')
    await page.getByPlaceholder('Search users...').fill(me.email)
    const menu = await openRowMenu(page, `User actions for ${me.email}`)
    await menu.getByRole('menuitem', { name: 'Edit profile' }).click()
    await expect(page.getByRole('dialog', { name: `Edit ${me.email}` }).getByLabel('Email')).toBeDisabled()
  })

  test('another account\'s email stays editable', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'profile-email' })
    await page.goto(`/app/users/${user.id}`)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `Edit ${user.email}` })
    await expect(dialog.getByLabel('Email')).toBeEditable()
    await expect(dialog.getByText('Your own sign-in email is read-only.')).toHaveCount(0)
  })

  // The Profile card uses the users list's words, pairs First name with Last name, and keeps each
  // explanation with its own row (v-users-05, v-users-06).
  test('the Profile card reads like the list: Organization, Last sign-in, explanations by their rows', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'profile-card' })
    await page.goto(`/app/users/${user.id}`)
    const card = page.getByRole('heading', { name: 'Profile', exact: true }).locator('xpath=ancestor::*[@data-slot="root"][1]')
    await expect(detailItem(card, 'Last sign-in')).toContainText('Never')
    await expect(card.getByText('Last login', { exact: true })).toHaveCount(0)
    await expect(card.getByText('Root entity', { exact: true })).toHaveCount(0)
    // Email spans the row, so the names pair up beside each other.
    const [email, first, last] = await Promise.all(['Email', 'First name', 'Last name'].map(label => detailItem(card, label).boundingBox()))
    expect(Math.round(first!.y)).toBe(Math.round(last!.y))
    expect(first!.y).toBeGreaterThan(email!.y)
    if (await isEnterpriseBackend()) {
      await expect(detailItem(card, 'Organization')).toBeVisible()
      // The access scope's explanation is in its own row (the direct roles load first).
      await expect(detailItem(card, 'Access scope')).toContainText(/organization/i, { timeout: 20_000 })
    } else {
      await expect(detailItem(card, 'Organization')).toHaveCount(0)
    }
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
    // The badges' explanations are readable without hovering (keyboard and touch), each in the
    // row it explains (v-users-06).
    await expect(detailItem(page, 'Locked until')).toContainText('An admin password reset clears the lockout.')
    // outlabs-auth records the end but does not lift a suspension by itself.
    await expect(detailItem(page, 'Suspension end')).toContainText('The end date is recorded only: the account stays suspended until it is reactivated.')
    // Change status is offered for another account.
    await userActionsButton(page).click()
    await expect(page.getByRole('menuitem', { name: 'Change status' })).toBeVisible()
  })
})
