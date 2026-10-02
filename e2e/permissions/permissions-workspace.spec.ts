import { backendConfigured, expect, test } from '../support/fixtures'
import { jsonResponse } from '../support/mocks'

// P2 permissions vertical (authenticated matrix). The create form is the reference AppFormDialog:
// it splits the resource:action name into two inputs and carries tags + an active flag; the
// backend derives resource/action from the combined name. Archiving states how many roles lose it.
test.describe('permissions workspace', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('renders the permissions workspace', async ({ page }) => {
    await page.goto('/app/permissions')
    await expect(page.getByRole('heading', { name: 'Permissions' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create permission' })).toBeVisible()
    await expect(page.getByRole('table')).toBeVisible()
  })

  test('opens the create-permission dialog with the resource/action split', async ({ page }) => {
    await page.goto('/app/permissions')
    await page.getByRole('button', { name: 'Create permission' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create permission' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Resource', { exact: true })).toBeVisible()
    await expect(dialog.getByLabel('Action', { exact: true })).toBeVisible()
    // The live preview reflects the two inputs combined into resource:action.
    await dialog.getByLabel('Resource', { exact: true }).fill('lead')
    await dialog.getByLabel('Action', { exact: true }).fill('create')
    await expect(dialog.getByText('lead:create')).toBeVisible()
  })

  test('creates a custom permission with the combined name + tags (payload)', async ({ page, testData }) => {
    const resource = testData.resource('perm')
    const posts: Array<Record<string, unknown>> = []
    await page.route(/\/permissions\/?$/, async (route) => {
      if (route.request().method() === 'POST') posts.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await page.goto('/app/permissions')
    await page.getByRole('button', { name: 'Create permission' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create permission' })
    await dialog.getByLabel('Display name', { exact: true }).fill('PW create lead')
    await dialog.getByLabel('Resource', { exact: true }).fill(resource)
    await dialog.getByLabel('Action', { exact: true }).fill('create')
    const tags = dialog.getByLabel('Tags', { exact: true })
    await tags.fill('billing')
    await tags.press('Enter')
    await tags.fill('sensitive')
    await tags.press('Enter')
    // The submit button lives in the fixed footer, bound to the form (F-202).
    await dialog.getByRole('button', { name: 'Create permission' }).click()

    await expect(dialog).toBeHidden()
    expect(posts).toHaveLength(1)
    expect(posts[0]).toEqual(
      expect.objectContaining({
        name: `${resource}:create`,
        display_name: 'PW create lead',
        tags: ['billing', 'sensitive'],
        is_active: true
      })
    )
    // is_system is never sent from the create form — the API rejects `is_system: true`, so
    // admin-created permissions are always custom.
    expect(posts[0]!.is_system).toBeUndefined()
  })

  test('required fields are validated in place and focus moves to the first one', async ({ page }) => {
    await page.goto('/app/permissions')
    await page.getByRole('button', { name: 'Create permission' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create permission' })
    await dialog.getByRole('button', { name: 'Create permission' }).click()
    await expect(dialog.getByText('Display name is required.')).toBeVisible()
    await expect(dialog.getByText('Resource is required.')).toBeVisible()
    await expect(dialog.getByLabel('Display name', { exact: true })).toBeFocused()
  })

  test('a duplicate name keeps the dialog open and says why', async ({ page, api, errorGuard }) => {
    errorGuard.allow({ kind: 'api', status: 409, url: /\/permissions\/$/ })
    errorGuard.allow({ kind: 'console', console: /409/ })
    const existing = await api.createPermission({ kind: 'dup' })
    const [resource = '', action = ''] = existing.name.split(':')

    await page.goto('/app/permissions')
    await page.getByRole('button', { name: 'Create permission' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create permission' })
    await dialog.getByLabel('Display name', { exact: true }).fill('PW duplicate again')
    await dialog.getByLabel('Resource', { exact: true }).fill(resource)
    await dialog.getByLabel('Action', { exact: true }).fill(action)
    await dialog.getByRole('button', { name: 'Create permission' }).click()

    await expect(dialog.getByTestId('api-error-alert')).toContainText('already exists')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Resource', { exact: true })).toHaveValue(resource)
  })

  test('server validation lands on the field of the form dialog (useDialogForm)', async ({ page, errorGuard }) => {
    errorGuard.allow({ kind: 'api', status: 422, url: /\/permissions\/$/ })
    errorGuard.allow({ kind: 'console', console: /422/ })
    await page.route(/\/permissions\/?$/, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      return route.fulfill(jsonResponse(422, {
        error: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: {
          errors: [
            { type: 'value_error', loc: ['body', 'name'], msg: 'Value error, This permission name is reserved' },
            { type: 'string_too_long', loc: ['body', 'display_name'], msg: 'String should have at most 10 characters' }
          ]
        }
      }))
    })

    await page.goto('/app/permissions')
    await page.getByRole('button', { name: 'Create permission' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create permission' })
    await dialog.getByLabel('Display name', { exact: true }).fill('PW reserved')
    await dialog.getByLabel('Resource', { exact: true }).fill('reserved')
    await dialog.getByLabel('Action', { exact: true }).fill('read')
    await dialog.getByRole('button', { name: 'Create permission' }).click()

    // The combined `name` belongs to the Action input; display_name to its own field.
    await expect(dialog.getByText('This permission name is reserved')).toBeVisible()
    await expect(dialog.getByLabel('Action', { exact: true })).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog.getByText('String should have at most 10 characters')).toBeVisible()
    await expect(dialog.getByLabel('Display name', { exact: true })).toBeFocused()
    await expect(dialog).toBeVisible()
  })

  test('the create form offers an active switch but no system-permission toggle', async ({ page }) => {
    await page.goto('/app/permissions')
    await page.getByRole('button', { name: 'Create permission' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create permission' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('switch', { name: 'Active' })).toBeChecked()
    await expect(dialog.getByRole('switch', { name: 'System permission' })).toHaveCount(0)
    await expect(dialog.getByLabel('Tags', { exact: true })).toBeEnabled()
  })

  test('archiving says which roles stop granting it (F-112)', async ({ page, api }) => {
    const permission = await api.createPermission({ kind: 'arch' })
    const role = await api.createRole({ permissions: [permission.name] })

    await page.goto('/app/permissions')
    await page.getByPlaceholder('Search permissions...').fill(permission.name)
    // Let the debounced search land first, so the table does not re-render under the open menu.
    await expect(page).toHaveURL(/[?&]q=/)
    await page.getByRole('button', { name: `Permission actions for ${permission.name}`, exact: true }).click()
    await page.getByRole('menuitem', { name: 'Archive' }).click()

    const confirm = page.getByRole('dialog', { name: `Archive permission ${permission.name}` })
    await expect(confirm).toContainText('can\'t be restored from the console')
    await expect(confirm.getByTestId('confirm-effects')).toContainText(`1 role grants it (${role.display_name})`)
    await confirm.getByRole('button', { name: 'Archive permission' }).click()
    await expect(confirm).toBeHidden()
    await expect(page.getByText('Permission archived', { exact: true })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: permission.name })).toHaveCount(0)
  })

  test('edits a custom permission and activates an inactive one, sending only what changed (F-019)', async ({ page, api }) => {
    const permission = await api.createPermission({ kind: 'edit', description: 'Keeps its description' })
    await api.patch(`/permissions/${permission.id}`, { is_active: false })
    const patches: Array<Record<string, unknown>> = []
    await page.route(/\/permissions\/[0-9a-f-]{36}$/, async (route) => {
      if (route.request().method() === 'PATCH') patches.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fallback()
    })

    await page.goto('/app/permissions')
    await page.getByPlaceholder('Search permissions...').fill(permission.name)
    await expect(page).toHaveURL(/[?&]q=/)
    await page.getByRole('button', { name: `Permission actions for ${permission.name}`, exact: true }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit permission' })
    await expect(dialog).toContainText(permission.name)
    const active = dialog.getByRole('switch', { name: 'Active' })
    await expect(active).not.toBeChecked()
    const save = dialog.getByRole('button', { name: 'Save changes' })
    await expect(save).toBeDisabled()
    await dialog.getByLabel('Display name').fill('PW renamed permission')
    const tags = dialog.getByLabel('Tags', { exact: true })
    await tags.fill('reviewed')
    await tags.press('Enter')
    await active.click()
    await expect(dialog.getByTestId('permission-status-effect')).toContainText('grants it again')
    await save.click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('Permission updated', { exact: true })).toBeVisible()

    expect(patches).toEqual([{ display_name: 'PW renamed permission', tags: ['reviewed'], is_active: true }])
    const row = page.getByRole('row').filter({ hasText: permission.name })
    await expect(row).toContainText('PW renamed permission')
    await expect(row).toContainText('Active')

    // The detail has the same Edit, and shows the saved values.
    await row.getByRole('link', { name: 'PW renamed permission' }).click()
    await expect(page.getByRole('heading', { name: 'PW renamed permission' })).toBeVisible()
    await expect(page.getByText('reviewed', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Edit permission' }).getByLabel('Description')).toHaveValue('Keeps its description')
  })

  test('system permissions offer no Edit or Archive, and their page says why (F-053)', async ({ page, api }) => {
    const system = (await api.listAll<{ id: string, name: string, is_system: boolean }>('/permissions/')).find(p => p.is_system)
    test.skip(!system, 'No system permission on this backend.')
    await page.goto('/app/permissions')
    await page.getByPlaceholder('Search permissions...').fill(system!.name)
    // The search reaches the URL (debounced) before the menu opens, so the table settles first.
    await expect(page).toHaveURL(/[?&]q=/)
    await page.getByRole('button', { name: `Permission actions for ${system!.name}`, exact: true }).click()
    await expect(page.getByRole('menuitem', { name: 'View' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Edit' })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: 'Archive' })).toHaveCount(0)
    await page.getByRole('menuitem', { name: 'View' }).click()
    await expect(page.getByTestId('permission-locked')).toContainText('can\'t be changed')
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
  })

  test('a permission link that does not resolve shows not found with a way back (F-122)', async ({ page, errorGuard }) => {
    errorGuard.allow({ kind: 'api', status: 404, url: /\/permissions\/[0-9a-f-]{36}$/ })
    errorGuard.allow({ kind: 'console', console: /404/ })
    await page.goto('/app/permissions/nope')
    await expect(page.getByText('Permission not found')).toBeVisible()
    await page.goto('/app/permissions/00000000-0000-4000-8000-000000000000')
    await expect(page.getByText('Permission not found')).toBeVisible()
    await page.getByRole('link', { name: 'Back to permissions' }).filter({ hasText: 'Back to permissions' }).click()
    await expect(page).toHaveURL(/\/app\/permissions$/)
  })
})
