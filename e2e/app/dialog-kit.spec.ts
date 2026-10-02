import type { Page } from '@playwright/test'
import { backendConfigured, expect, test, type ApiClient } from '../support/fixtures'
import { shownDay, typeDay } from '../support/date-field'
import { searchUsersList } from '../support/lists'
import { openUserMenuPage, sidebarNav } from '../support/shell'

// The forms-and-dialogs kit (AppFormDialog, AppConfirmDialog, useDialogGuard, useDirtyPatch,
// AppDateField). Runs on both presets: permissions, users and direct roles exist everywhere.
//
//   F-121  a dirty dialog asks before discarding (ESC, overlay, X, Cancel, browser Back); Back
//          closes a dialog instead of leaving the page; a one-time secret is held the same way.
//   F-206  a dialog whose request is running cannot be dismissed.
//   F-113  "valid until" days end at the end of the day in the admin's time zone; the date field
//          is labelled and typeable.
//   F-158  an edit sends only the fields that changed, and nothing when nothing changed.
//   A field is not flagged by the focus hand-off while a dialog opens (menus return focus to
//   their trigger as they close), and a partly typed date is flagged, never saved as "not set".
//   Enter in a tags field adds the tag and never submits the dialog, empty or filled (it once
//   saved the F-019 permission edit half-way); a click on the submit button right after still
//   submits. A flagged field follows the typing, so the footer does not move under the click that
//   comes straight after a correction.

test.use({ errorGuardMode: 'strict' })

const DISCARD = 'Discard changes?'

// An in-app (client-side) navigation from the dashboard through the sidebar, so browser Back is
// a same-document traversal the console handles, as it is for an admin clicking through. (A
// router.push awaited inside page.evaluate can fail with "Resulting promise was garbage
// collected" while the dashboard is still loading its counts.)
async function openPermissionsInApp(page: Page) {
  await page.goto('/app/dashboard')
  await sidebarNav(page).getByRole('link', { name: 'Permissions', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/permissions$/)
  await expect(page.getByRole('button', { name: 'Create permission' })).toBeVisible()
}

async function keepEditing(page: Page) {
  const prompt = page.getByRole('dialog', { name: DISCARD })
  await expect(prompt).toBeVisible()
  await prompt.getByRole('button', { name: 'Keep editing' }).click()
  await expect(prompt).toBeHidden()
}

test.describe('dialog guard (F-121)', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('a dirty dialog asks before discarding on ESC, overlay click, X, Cancel and Back', async ({ page }) => {
    await openPermissionsInApp(page)
    await page.getByRole('button', { name: 'Create permission' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create permission' })
    const displayName = dialog.getByLabel('Display name', { exact: true })
    await displayName.fill('Unsaved work')

    await page.keyboard.press('Escape')
    await keepEditing(page)
    await expect(displayName).toHaveValue('Unsaved work')

    await page.mouse.click(4, 4)
    await keepEditing(page)

    await dialog.getByRole('button', { name: 'Close' }).click()
    await keepEditing(page)

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await keepEditing(page)

    // Browser Back asks too, and stays on the page.
    await page.goBack()
    await keepEditing(page)
    await expect(page).toHaveURL(/\/app\/permissions$/)
    await expect(displayName).toHaveValue('Unsaved work')

    // Discarding from Back closes the dialog, not the page.
    await page.goBack()
    const prompt = page.getByRole('dialog', { name: DISCARD })
    await prompt.getByRole('button', { name: 'Discard changes' }).click()
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/\/app\/permissions$/)

    // With no dialog open, Back navigates as usual.
    await page.goBack()
    await expect(page).toHaveURL(/\/app\/dashboard$/)
  })

  test('a clean dialog closes on ESC, and Back closes it instead of leaving the page', async ({ page }) => {
    await openPermissionsInApp(page)
    const dialog = page.getByRole('dialog', { name: 'Create permission' })

    await page.getByRole('button', { name: 'Create permission' }).click()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('dialog', { name: DISCARD })).toHaveCount(0)

    await page.getByRole('button', { name: 'Create permission' }).click()
    await expect(dialog).toBeVisible()
    await page.goBack()
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/\/app\/permissions$/)
  })

  test('reopening a create dialog starts from a blank form', async ({ page }) => {
    await page.goto('/app/permissions')
    await page.getByRole('button', { name: 'Create permission' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create permission' })
    await dialog.getByLabel('Display name', { exact: true }).fill('Draft')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('dialog', { name: DISCARD }).getByRole('button', { name: 'Discard changes' }).click()
    await expect(dialog).toBeHidden()

    await page.getByRole('button', { name: 'Create permission' }).click()
    await expect(dialog.getByLabel('Display name', { exact: true })).toHaveValue('')
  })

  test('the page warns before unloading while a dialog holds unsaved input', async ({ page }) => {
    await page.goto('/app/permissions')
    await page.getByRole('button', { name: 'Create permission' }).click()
    await page.getByRole('dialog', { name: 'Create permission' }).getByLabel('Display name', { exact: true }).fill('Unsaved work')

    const dialogEvent = page.waitForEvent('dialog')
    await page.close({ runBeforeUnload: true })
    const beforeUnload = await dialogEvent
    expect(beforeUnload.type()).toBe('beforeunload')
    await beforeUnload.accept()
  })

  test('a one-time secret asks before Back closes it', async ({ page, api, requires, testData }) => {
    await requires({ surfaces: ['api_keys'] })
    const [scope] = await api.grantableScopes()
    test.skip(!scope, 'The admin persona has no grantable API key scope.')
    const name = testData.name('secret')
    await api.post('/api-keys/', { name, scopes: [scope], key_kind: 'personal', rate_limit_per_minute: 60 })

    // In-app, as an admin gets there: the user menu's My API keys link (a client-side push).
    await page.goto('/app/dashboard')
    await openUserMenuPage(page, 'My API keys')
    await expect(page).toHaveURL(/\/app\/api-keys$/)
    await page.getByRole('row').filter({ hasText: name }).getByRole('button', { name: 'API key actions' }).click()
    await page.getByRole('menuitem', { name: 'Rotate' }).click()
    await page.getByRole('dialog', { name: `Rotate API key ${name}` }).getByRole('button', { name: 'Rotate key' }).click()
    const secret = page.getByRole('dialog', { name: 'Store the new API key now' })
    await expect(secret.getByLabel('API key secret')).not.toHaveValue('')

    await page.goBack()
    const prompt = page.getByRole('dialog', { name: 'Close without storing the key?' })
    await expect(prompt).toBeVisible()
    await prompt.getByRole('button', { name: 'Keep it open' }).click()
    await expect(secret).toBeVisible()
    await expect(page).toHaveURL(/\/app\/api-keys$/)

    // AppSecretReveal ignores Escape outright (no prompt, no close): only Back and Done close it.
    await page.keyboard.press('Escape')
    await expect(prompt).toBeHidden()
    await expect(secret).toBeVisible()

    // Done, once the key is marked as stored, is the acknowledgement: it closes without asking.
    await secret.getByRole('checkbox', { name: 'I have stored this key somewhere safe' }).check()
    await secret.getByRole('button', { name: 'Done' }).click()
    await expect(secret).toBeHidden()
    await expect(prompt).toBeHidden()
  })
})

test.describe('validation while a dialog opens', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('a field blurred while the dialog opens is not flagged; leaving it once open is', async ({ page }) => {
    await page.goto('/app/permissions')
    const trigger = page.getByRole('button', { name: 'Create permission' })
    await expect(trigger).toBeVisible()
    // What a dropdown menu does to a dialog opened from one of its items: while the dialog opens,
    // the menu hands focus back to its trigger (outside the dialog) and the dialog's focus trap
    // takes it back. Replay it on the first field as soon as the dialog renders.
    const handOff = page.evaluate(() => new Promise<void>((resolve) => {
      const step = () => {
        const field = document.querySelector<HTMLInputElement>('[role="dialog"] input[name="display_name"]')
        const outside = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
          .find(button => button.textContent?.trim() === 'Create permission' && !button.closest('[role="dialog"]'))
        if (!field || !outside) {
          requestAnimationFrame(step)
          return
        }
        field.focus()
        outside.focus()
        resolve()
      }
      step()
    }))
    await trigger.click()
    await handOff
    const dialog = page.getByRole('dialog', { name: 'Create permission' })
    const required = dialog.getByText('Display name is required.')
    await expect(dialog.getByLabel('Display name', { exact: true })).toBeFocused()
    // Past the open transition, the field is still clean.
    await page.waitForTimeout(400)
    await expect(required).toHaveCount(0)

    // Once the dialog is open, leaving the empty required field flags it as usual.
    await page.keyboard.press('Tab')
    await expect(required).toBeVisible()
  })
})

test.describe('a corrected field and the click straight after', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  // The dialog is centred, so a field message that appears or clears changes its height and moves
  // the footer (here 13 px for a one-line message; more when one wraps). When a corrected field's
  // message cleared only as focus left the field, which the press on the submit button itself
  // does, the button moved between press and release: a click on its lower part was released
  // beside it and submitted nothing. A flagged field follows the typing now, so the footer is
  // already where it stays when the click comes. Both ways a field gets flagged: leaving it, and a
  // refused submit while it was never visited (no message of its own would follow the typing).
  for (const flaggedBy of ['leaving it', 'a refused submit'] as const) {
    test(`a field flagged by ${flaggedBy}, then corrected, is saved by the very next click`, async ({ page, testData }) => {
      const posts: Array<Record<string, unknown>> = []
      await page.route(/\/permissions\/?$/, async (route) => {
        if (route.request().method() === 'POST') posts.push(route.request().postDataJSON() as Record<string, unknown>)
        await route.fallback()
      })

      await page.goto('/app/permissions')
      await page.getByRole('button', { name: 'Create permission' }).click()
      const dialog = page.getByRole('dialog', { name: 'Create permission' })
      // Fields validate on blur once the open transition has finished.
      await dialog.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)))
      const save = dialog.getByRole('button', { name: 'Create permission' })
      const resource = dialog.getByLabel('Resource', { exact: true })
      await dialog.getByLabel('Display name', { exact: true }).fill('PW corrected field')
      await dialog.getByLabel('Action', { exact: true }).fill('read')
      if (flaggedBy === 'leaving it') {
        await resource.fill('Not a resource')
        await resource.press('Tab')
        await expect(dialog.getByText('Use lowercase letters, numbers, _ and - (or *).')).toBeVisible()
      } else {
        await save.click()
        await expect(dialog.getByText('Resource is required.')).toBeVisible()
      }
      expect(posts).toHaveLength(0)

      const name = testData.resource('corrected')
      await resource.fill(name)
      // Straight after the correction, near the bottom edge of the button.
      const box = await save.boundingBox()
      if (!box) throw new Error('The submit button has no box.')
      await save.click({ position: { x: box.width / 2, y: box.height - 4 } })
      await expect(dialog).toBeHidden()
      await expect(page.getByText('Permission created', { exact: true })).toBeVisible()
      expect(posts).toHaveLength(1)
      expect(posts[0]).toMatchObject({ name: `${name}:read` })
    })
  }
})

test.describe('pending lock (F-206)', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('a form dialog cannot be dismissed while its request runs', async ({ page, testData }) => {
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let posted = false
    await page.route(/\/permissions\/?$/, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      posted = true
      await held
      await route.continue()
    })

    await openPermissionsInApp(page)
    await page.getByRole('button', { name: 'Create permission' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create permission' })
    await dialog.getByLabel('Display name', { exact: true }).fill('PW pending')
    await dialog.getByLabel('Resource', { exact: true }).fill(testData.resource('pending'))
    await dialog.getByLabel('Action', { exact: true }).fill('read')
    await dialog.getByRole('button', { name: 'Create permission' }).click()
    await expect.poll(() => posted).toBe(true)

    // Nothing closes it: ESC, overlay, X, Cancel and Back are all refused, without a prompt.
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeDisabled()
    await expect(dialog.getByLabel('Display name', { exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')
    await page.mouse.click(4, 4)
    await page.goBack()
    await expect(dialog).toBeVisible()
    await expect(page.getByRole('dialog', { name: DISCARD })).toHaveCount(0)
    await expect(page).toHaveURL(/\/app\/permissions$/)

    release()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('Permission created', { exact: true })).toBeVisible()
  })

  test('a confirmation cannot be cancelled while its request runs', async ({ page, api }) => {
    const user = await api.createUser()
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let deleting = false
    await page.route(new RegExp(`/users/${user.id}$`), async (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback()
      deleting = true
      await held
      await route.continue()
    })

    await page.goto('/app/users')
    await searchUsersList(page, user.email)
    await page.getByRole('row').filter({ hasText: user.email }).getByRole('button', { name: 'User actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    const confirm = page.getByRole('dialog', { name: `Delete user ${user.email}` })
    await confirm.getByLabel(`Type ${user.email} to confirm`).fill(user.email)
    await confirm.getByRole('button', { name: 'Delete user' }).click()
    await expect.poll(() => deleting).toBe(true)

    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(confirm).toBeVisible()

    release()
    await expect(confirm).toBeHidden()
    await expect(page.getByText('User deleted', { exact: true })).toBeVisible()
  })
})

test.describe('Enter in a tags field', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  // The form is complete and valid before any Enter, so an implicit submission would create the
  // permission: every Enter below must leave the dialog open and send nothing.
  test('Enter adds the tag and never submits, empty or filled; Save right after still saves', async ({ page, testData }) => {
    const posts: Array<Record<string, unknown>> = []
    await page.route(/\/permissions\/?$/, async (route) => {
      if (route.request().method() === 'POST') posts.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fallback()
    })

    await openPermissionsInApp(page)
    await page.getByRole('button', { name: 'Create permission' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create permission' })
    const displayName = dialog.getByLabel('Display name', { exact: true })
    await displayName.fill('PW tags enter')
    await dialog.getByLabel('Resource', { exact: true }).fill(testData.resource('tagsenter'))
    await dialog.getByLabel('Action', { exact: true }).fill('read')
    const tags = dialog.getByLabel('Tags', { exact: true })

    // Empty field: nothing to add, nothing submitted.
    await tags.press('Enter')
    // Filled: the tag is added; Enter again on the emptied field, twice.
    await tags.fill('alpha')
    await tags.press('Enter')
    await expect(tags).toHaveValue('')
    await tags.press('Enter')
    await tags.press('Enter')
    await tags.fill('beta')
    await tags.press('Enter')
    // A submit would have locked the form (pending) or closed the dialog.
    await expect(displayName).toBeEnabled()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('alpha', { exact: true })).toBeVisible()
    await expect(dialog.getByText('beta', { exact: true })).toBeVisible()
    expect(posts).toHaveLength(0)

    // The guard lasts only for the key press: a click on the submit button straight after a
    // tag Enter submits, once, with every tag.
    await tags.fill('gamma')
    await tags.press('Enter')
    await dialog.getByRole('button', { name: 'Create permission' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('Permission created', { exact: true })).toBeVisible()
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({ display_name: 'PW tags enter', tags: ['alpha', 'beta', 'gamma'] })
  })
})

test.describe('validity days and diff-only edits (F-113, F-158)', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  // A fixed UTC-3 zone without daylight saving, so the saved instants are exact.
  test.use({ timezoneId: 'America/Argentina/Buenos_Aires' })

  test('"valid until" ends at the end of the day in the admin\'s time zone; an unchanged dialog sends nothing', async ({ page, api }) => {
    const user = await api.createUser()
    const role = await api.createRole()
    await api.post(`/users/${user.id}/roles`, { role_id: role.id })
    const displayName = role.display_name ?? role.name

    const patches: Array<Record<string, unknown>> = []
    await page.route(/\/users\/[^/]+\/role-memberships\/[^/]+$/, async (route) => {
      if (route.request().method() === 'PATCH') patches.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await page.goto(`/app/users/${user.id}?tab=access`)
    const row = page.getByRole('row').filter({ hasText: displayName })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Role actions' }).click()
    await page.getByRole('menuitem', { name: 'Edit assignment' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit role assignment' })
    await expect(dialog).toContainText(`${displayName} role.`)

    // Nothing changed yet: Save is disabled. The date field is labelled and typeable.
    const save = dialog.getByRole('button', { name: 'Save changes' })
    await expect(save).toBeDisabled()
    // The help names the zone (Chromium reports this one by its canonical alias).
    await expect(dialog.getByText(/^Ends at the end of that day \(America\/(Argentina\/)?Buenos_Aires\)\.$/)).toBeVisible()
    await typeDay(page, 'Valid until', '2026-10-05')
    await expect(save).toBeEnabled()
    await save.click()
    await expect(dialog).toBeHidden()

    // Only the changed field is sent, as the last millisecond of Oct 5 in UTC-3.
    expect(patches).toEqual([{ valid_until: '2026-10-06T02:59:59.999Z' }])
    // The table shows the day through AppTimestamp (date only; the absolute date is in its text).
    await expect(row).toContainText('Oct 5, 2026')

    // Reopening shows the same day; saving without a change is not possible.
    await row.getByRole('button', { name: 'Role actions' }).click()
    await page.getByRole('menuitem', { name: 'Edit assignment' }).click()
    expect(await shownDay(page, 'Valid until')).toBe('2026-10-05')
    await expect(save).toBeDisabled()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    expect(patches).toHaveLength(1)
  })

  // Another admin edits the same assignment while the dialog is open (the API has no ETag).
  async function assignmentChangedElsewhere(api: ApiClient, userId: string, roleId: string, body: Record<string, unknown>) {
    const memberships = await api.get<Array<{ id: string, role_id: string }>>(`/users/${userId}/role-memberships`)
    const membership = memberships.find(candidate => candidate.role_id === roleId)
    if (!membership) throw new Error('The role assignment was not found.')
    await api.patch(`/users/${userId}/role-memberships/${membership.id}`, body)
  }

  test('a field someone else changed meanwhile is not silently overwritten (reload or overwrite)', async ({ page, api }) => {
    const user = await api.createUser()
    const role = await api.createRole()
    await api.post(`/users/${user.id}/roles`, { role_id: role.id })
    const displayName = role.display_name ?? role.name
    const patches: Array<Record<string, unknown>> = []
    await page.route(/\/users\/[^/]+\/role-memberships\/[^/]+$/, async (route) => {
      if (route.request().method() === 'PATCH') patches.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await page.goto(`/app/users/${user.id}?tab=access`)
    const row = page.getByRole('row').filter({ hasText: displayName })
    const openEdit = async () => {
      await row.getByRole('button', { name: 'Role actions' }).click()
      await page.getByRole('menuitem', { name: 'Edit assignment' }).click()
    }
    const dialog = page.getByRole('dialog', { name: 'Edit role assignment' })
    const save = dialog.getByRole('button', { name: 'Save changes' })
    const conflict = dialog.getByTestId('form-conflict')

    // Reload: their value replaces the edit, and nothing was written from this dialog.
    await openEdit()
    await typeDay(page, 'Valid until', '2026-10-05')
    await assignmentChangedElsewhere(api, user.id, role.id, { valid_until: '2026-12-01T02:59:59.999Z' })
    await save.click()
    await expect(conflict).toContainText('Valid until changed since you opened this dialog')
    expect(patches).toEqual([])
    await conflict.getByRole('button', { name: 'Reload' }).click()
    await expect(conflict).toBeHidden()
    await expect.poll(() => shownDay(page, 'Valid until')).toBe('2026-11-30')
    await expect(save).toBeDisabled()

    // Editing after the warning retires it (it described the previous edit); saving checks the
    // server again and raises it again.
    await typeDay(page, 'Valid until', '2026-10-04')
    await assignmentChangedElsewhere(api, user.id, role.id, { valid_until: '2027-01-01T02:59:59.999Z' })
    await save.click()
    await expect(conflict).toBeVisible()
    await typeDay(page, 'Valid until', '2026-10-05')
    await expect(conflict).toBeHidden()
    await save.click()
    await expect(conflict).toBeVisible()
    expect(patches).toEqual([])

    // Overwrite: this dialog's value is saved on purpose (after the form validates).
    await conflict.getByRole('button', { name: 'Overwrite' }).click()
    await expect(dialog).toBeHidden()
    expect(patches).toEqual([{ valid_until: '2026-10-06T02:59:59.999Z' }])
    // The table shows the day through AppTimestamp (date only; the absolute date is in its text).
    await expect(row).toContainText('Oct 5, 2026')
  })

  test('a change elsewhere to a field this dialog did not touch is kept', async ({ page, api }) => {
    const user = await api.createUser()
    const role = await api.createRole()
    await api.post(`/users/${user.id}/roles`, { role_id: role.id })
    const displayName = role.display_name ?? role.name
    const patches: Array<Record<string, unknown>> = []
    await page.route(/\/users\/[^/]+\/role-memberships\/[^/]+$/, async (route) => {
      if (route.request().method() === 'PATCH') patches.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await page.goto(`/app/users/${user.id}?tab=access`)
    const row = page.getByRole('row').filter({ hasText: displayName })
    await row.getByRole('button', { name: 'Role actions' }).click()
    await page.getByRole('menuitem', { name: 'Edit assignment' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit role assignment' })
    await typeDay(page, 'Valid until', '2026-10-05')
    // Someone else sets a start date meanwhile; this dialog only changes the end date.
    await assignmentChangedElsewhere(api, user.id, role.id, { valid_from: '2026-09-01T03:00:00.000Z' })
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()
    expect(patches).toEqual([{ valid_until: '2026-10-06T02:59:59.999Z' }])
    const memberships = await api.get<Array<{ role_id: string, valid_from: string | null }>>(`/users/${user.id}/role-memberships`)
    expect(new Date(memberships.find(m => m.role_id === role.id)!.valid_from!).toISOString()).toBe('2026-09-01T03:00:00.000Z')
  })

  test('a partly typed date is flagged instead of being saved as "not set"', async ({ page, api }) => {
    const user = await api.createUser()
    const role = await api.createRole()
    await api.post(`/users/${user.id}/roles`, { role_id: role.id })
    const displayName = role.display_name ?? role.name
    const patches: Array<Record<string, unknown>> = []
    await page.route(/\/users\/[^/]+\/role-memberships\/[^/]+$/, async (route) => {
      if (route.request().method() === 'PATCH') patches.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await page.goto(`/app/users/${user.id}?tab=access`)
    const row = page.getByRole('row').filter({ hasText: displayName })
    await row.getByRole('button', { name: 'Role actions' }).click()
    await page.getByRole('menuitem', { name: 'Edit assignment' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit role assignment' })
    const until = dialog.getByRole('group', { name: 'Valid until', exact: true })
    const incomplete = dialog.getByText('Enter the whole date, or clear it.')

    // Month and day, no year: nothing is flagged while typing, but once focus leaves the field.
    await until.getByRole('spinbutton').first().click()
    await page.keyboard.type('1005', { delay: 30 })
    // The segments took the digits before focus moves on (a busy runner can lag behind).
    await expect(until.getByRole('spinbutton').nth(1)).toHaveAttribute('aria-valuenow', '5')
    await expect(incomplete).toHaveCount(0)
    await dialog.getByRole('group', { name: 'Valid from', exact: true }).getByRole('spinbutton').first().click()
    await expect(incomplete).toBeVisible()
    // It is not a change that can be saved (the field was empty, and still means no date).
    await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(patches).toEqual([])

    // Completing the date clears the message, and the whole day is saved.
    await until.getByRole('spinbutton').nth(2).click()
    await page.keyboard.type('2026')
    await expect(incomplete).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()
    expect(patches).toEqual([{ valid_until: '2026-10-06T02:59:59.999Z' }])
    // Edit assignment is filled from the row, which the save refetches without waiting for it; until
    // the refetch lands the row still holds no end date, and the dialog would open empty.
    await expect(row).toContainText('Until')

    // Emptying one segment of a saved date is flagged the same way: it never clears the date.
    await row.getByRole('button', { name: 'Role actions' }).click()
    await page.getByRole('menuitem', { name: 'Edit assignment' }).click()
    await until.getByRole('spinbutton').nth(2).click()
    for (let digit = 0; digit < 4; digit++) await page.keyboard.press('Backspace')
    await dialog.getByRole('group', { name: 'Valid from', exact: true }).getByRole('spinbutton').first().click()
    await expect(incomplete).toBeVisible()
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(incomplete).toBeVisible()
    expect(patches).toHaveLength(1)
  })

  test('a calendar pick re-validates its field', async ({ page, api }) => {
    const user = await api.createUser()
    const role = await api.createRole()
    await api.post(`/users/${user.id}/roles`, { role_id: role.id })
    const displayName = role.display_name ?? role.name

    await page.goto(`/app/users/${user.id}?tab=access`)
    const row = page.getByRole('row').filter({ hasText: displayName })
    await row.getByRole('button', { name: 'Role actions' }).click()
    await page.getByRole('menuitem', { name: 'Edit assignment' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit role assignment' })
    await typeDay(page, 'Valid from', '2026-10-20')
    await typeDay(page, 'Valid until', '2026-10-10')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    const outOfOrder = dialog.getByText('Valid until must be on or after valid from.')
    await expect(outOfOrder).toBeVisible()

    // A pick changes the value from outside UInputDate; AppDateField reports it on Nuxt UI's
    // form-field bus so the field re-validates (this fails if that integration point changes).
    await dialog.getByRole('button', { name: 'Open calendar for Valid until', exact: true }).click()
    const day = /October 25, 2026/
    await page.getByRole('dialog').filter({ has: page.getByRole('button', { name: day }) }).last().getByRole('button', { name: day }).click()
    await expect.poll(() => shownDay(page, 'Valid until')).toBe('2026-10-25')
    await expect(outOfOrder).toHaveCount(0)
  })

  test('the calendar button picks a day and the field is announced by its label', async ({ page, api }) => {
    const user = await api.createUser()
    const role = await api.createRole()
    await api.post(`/users/${user.id}/roles`, { role_id: role.id })
    const displayName = role.display_name ?? role.name

    await page.goto(`/app/users/${user.id}?tab=access`)
    const row = page.getByRole('row').filter({ hasText: displayName })
    await row.getByRole('button', { name: 'Role actions' }).click()
    await page.getByRole('menuitem', { name: 'Edit assignment' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit role assignment' })

    await expect(dialog.getByRole('group', { name: 'Valid from', exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Open calendar for Valid until', exact: true }).click()
    const now = new Date()
    const dayLabel = new RegExp(`${now.toLocaleDateString('en-US', { month: 'long' })} 20, ${now.getFullYear()}`)
    await page.getByRole('dialog').filter({ has: page.getByRole('button', { name: dayLabel }) }).last().getByRole('button', { name: dayLabel }).click()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    await expect.poll(() => shownDay(page, 'Valid until')).toBe(`${now.getFullYear()}-${month}-20`)
    // Picking a date is a change: the dialog is dirty now, and Save is enabled.
    await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    // The calendar popover is gone (it closes just after the pick), so ESC reaches the dialog.
    await expect(page.getByRole('dialog', { name: 'Open calendar for Valid until' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: DISCARD })).toBeVisible()
  })
})
