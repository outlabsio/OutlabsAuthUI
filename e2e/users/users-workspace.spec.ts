import { backendConfigured, expect, test } from '../support/fixtures'
import { chooseSelect, chooseSelectMenu, field } from '../support/ui-select'
import { searchUsersList } from '../support/lists'

// P2 users vertical — full CRUD row actions against the live backend.
test.describe('users workspace', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('creates a user, lands on it, then soft-deletes it (roundtrip)', async ({ page, testData }) => {
    const email = testData.email('crud')
    await page.goto('/app/users')

    // Create (backend requires an initial password + a matching confirmation). The new account
    // opens (F-218).
    await page.getByRole('button', { name: 'Add user' }).click()
    const createDialog = page.getByRole('dialog', { name: 'Add user' })
    await createDialog.getByLabel('Email').fill(email)
    await createDialog.getByLabel('Initial password').fill('Testpass1!')
    await createDialog.getByLabel('Confirm password').fill('Testpass1!')
    await createDialog.getByRole('button', { name: 'Create user' }).click()
    await expect(createDialog).toBeHidden()
    await expect(page).toHaveURL(/\/app\/users\/[0-9a-f-]+$/)
    await expect(page.getByRole('heading', { name: email })).toBeVisible()

    await page.goto('/app/users')
    await searchUsersList(page, email)

    // Delete via the row action menu → confirmation stating the effects → typed email →
    // retain-delete (status becomes Deleted).
    const row = page.getByRole('row').filter({ hasText: email })
    await row.getByRole('button', { name: `User actions for ${email}` }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    const confirm = page.getByRole('dialog', { name: `Delete user ${email}` })
    await expect(confirm).toContainText('It can be restored later')
    await expect(confirm.getByTestId('confirm-effects')).toContainText('every session and refresh token is revoked')
    const deleteButton = confirm.getByRole('button', { name: 'Delete user' })
    await expect(deleteButton).toBeDisabled()

    // The typed field opens clean. The menu hands focus back to its trigger as it closes and the
    // dialog takes it back, so the field is blurred once without the admin doing anything; that
    // must not flag it. Wait out the menu's close and the dialog's open transition first.
    const typed = confirm.getByLabel(`Type ${email} to confirm`)
    const mismatch = confirm.getByText(`Type ${email} exactly to confirm.`)
    await expect(page.getByRole('menu')).toHaveCount(0)
    await expect(typed).toBeFocused()
    await page.waitForTimeout(400)
    await expect(mismatch).toHaveCount(0)
    // A wrong entry submitted with Enter is flagged, and the message clears once the text matches.
    await typed.fill(email.slice(0, -1))
    await expect(mismatch).toHaveCount(0)
    await typed.press('Enter')
    await expect(mismatch).toBeVisible()
    await expect(confirm).toBeVisible()
    await typed.fill(email)
    await expect(mismatch).toHaveCount(0)
    await deleteButton.click()
    await expect(confirm).toBeHidden()

    // Soft-deleted → gone from the default Active view...
    await expect(page.getByRole('row').filter({ hasText: email })).toHaveCount(0)
    await expect(page.getByText('No users match')).toBeVisible()
    // ...but still there under the Deleted filter.
    await chooseSelect(page, field(page, 'Filter by status'), 'Deleted')
    await expect(page.getByRole('row').filter({ hasText: email })).toContainText(/deleted/i)
  })

  test('blocks create when the password confirmation does not match', async ({ page, testData }) => {
    await page.goto('/app/users')
    await page.getByRole('button', { name: 'Add user' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Email').fill(testData.email('mismatch'))
    await dialog.getByLabel('Initial password').fill('Testpass1!')
    await dialog.getByLabel('Confirm password').fill('Different1!')
    await dialog.getByRole('button', { name: 'Create user' }).click()

    // UForm blocks submit and shows the cross-field error; the dialog stays open.
    await expect(dialog.getByText('Passwords do not match.')).toBeVisible()
    await expect(dialog).toBeVisible()
  })

  test('sends the chosen organization in the create payload (and never the confirmation)', async ({ page, requires, testData }) => {
    // Organizations are an EnterpriseRBAC concept (SimpleRBAC has no picker, see simple-rbac-gating).
    await requires({ preset: 'EnterpriseRBAC', surfaces: ['entities'] })
    const email = testData.email('root')
    const posts: Array<Record<string, unknown>> = []
    await page.route(/\/users\/?$/, async (route) => {
      if (route.request().method() === 'POST') posts.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await page.goto('/app/users')
    await page.getByRole('button', { name: 'Add user' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Email').fill(email)
    await dialog.getByLabel('Initial password').fill('Testpass1!')
    await dialog.getByLabel('Confirm password').fill('Testpass1!')
    // A superuser may create an account without an organization (the default) or pick one;
    // ACME Realty is a seeded root entity.
    await expect(dialog.getByLabel('Organization', { exact: true })).toContainText('No organization')
    await chooseSelectMenu(page, field(page, 'Organization'), 'ACME Realty')
    await dialog.getByRole('button', { name: 'Create user' }).click()

    await expect(page).toHaveURL(/\/app\/users\/[0-9a-f-]+$/)
    await expect(page.getByRole('heading', { name: email })).toBeVisible()
    expect(posts).toHaveLength(1)
    expect(posts[0]).toEqual(
      expect.objectContaining({ email, is_superuser: false })
    )
    // The chosen root org is sent; the confirmation field never is.
    expect(typeof posts[0]!.root_entity_id).toBe('string')
    expect((posts[0]!.root_entity_id as string).length).toBeGreaterThan(0)
    expect(posts[0]!.confirm_password).toBeUndefined()
  })

  test('opens the edit dialog from the row menu', async ({ page }) => {
    await page.goto('/app/users')
    await page.getByRole('button', { name: 'User actions' }).first().click()
    await page.getByRole('menuitem', { name: 'Edit profile' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    // Scoped to the dialog: row menus are named after their user ("User actions for <email>"),
    // and a seeded email can contain "phone".
    await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Phone' })).toBeVisible()
  })

  test('an edit sends only the changed field and nothing when unchanged (F-158)', async ({ page, api }) => {
    const user = await api.createUser({ first_name: 'Before', last_name: 'Kept' })
    const patches: Array<Record<string, unknown>> = []
    await page.route(new RegExp(`/users/${user.id}$`), async (route) => {
      if (route.request().method() === 'PATCH') patches.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await page.goto('/app/users')
    await searchUsersList(page, user.email)
    await page.getByRole('row').filter({ hasText: user.email }).getByRole('button', { name: 'User actions' }).click()
    await page.getByRole('menuitem', { name: 'Edit profile' }).click()
    const dialog = page.getByRole('dialog', { name: `Edit ${user.email}` })
    const save = dialog.getByRole('button', { name: 'Save changes' })
    await expect(save).toBeDisabled()
    await dialog.getByLabel('First name').fill('After')
    await save.click()
    await expect(dialog).toBeHidden()
    expect(patches).toEqual([{ first_name: 'After' }])
  })

  test('an admin corrects an account\'s email; a taken email lands on the field (F-064)', async ({ page, api, testData, errorGuard }) => {
    errorGuard.allow({ kind: 'api', status: 400, url: /\/users\/[^/]+$/ })
    errorGuard.allow({ kind: 'api', status: 409, url: /\/users\/[^/]+$/ })
    errorGuard.allow({ kind: 'api', status: 422, url: /\/users\/[^/]+$/ })
    errorGuard.allow({ kind: 'console', console: /40[09]|422/ })
    const user = await api.createUser({ kind: 'email-edit' })
    const taken = await api.createUser({ kind: 'email-taken' })
    const patches: Array<Record<string, unknown>> = []
    await page.route(new RegExp(`/users/${user.id}$`), async (route) => {
      if (route.request().method() === 'PATCH') patches.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await page.goto('/app/users')
    await searchUsersList(page, user.email)
    await page.getByRole('button', { name: `User actions for ${user.email}` }).click()
    await page.getByRole('menuitem', { name: 'Edit profile' }).click()
    const dialog = page.getByRole('dialog', { name: `Edit ${user.email}` })
    const email = dialog.getByLabel('Email')
    await email.fill(taken.email)
    await expect(dialog.getByText('This becomes the sign-in email')).toBeVisible()
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog).toBeVisible()

    const corrected = testData.email('email-fixed')
    await email.fill(corrected)
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()
    expect(patches.at(-1)).toEqual({ email: corrected })
    expect((await api.get<{ email: string }>(`/users/${user.id}`)).email).toBe(corrected)
  })
})
