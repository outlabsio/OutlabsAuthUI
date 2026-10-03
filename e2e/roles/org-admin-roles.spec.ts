import { backendConfigured, expect, expectSeeded, personaState, test } from '../support/fixtures'
import { jsonResponse } from '../support/mocks'
import { pickPermission } from '../support/ui-select'

// Delegated role administration (F-016, F-054, F-177): the seeded organization admin holds
// role:create/update/delete and permission:read and has no global scope. The console offers
// them organization and entity roles in their own organization and only permissions they hold:
// the catalog is listed with the ones they do not hold disabled, and the note says so. It names
// the permissions a refusal is about and marks the role they hold. Strict error guard: no
// refused request on the way.

type ApiRole = { id: string, name: string, display_name: string, permissions: string[], root_entity_id: string | null, is_global: boolean }

test.describe('roles as a delegated organisation admin', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ storageState: personaState('orgAdmin'), errorGuardMode: 'strict' })

  test.beforeEach(async ({ requires }) => {
    await requires({ preset: 'EnterpriseRBAC', personas: ['orgAdmin'] })
  })

  test('creates an organization role with permissions they hold, then edits it (F-016)', async ({ page, apiAs, testData }) => {
    const orgAdmin = apiAs('orgAdmin')
    const me = await orgAdmin.me() as { root_entity_id?: string | null, root_entity_name?: string | null }
    expectSeeded(me.root_entity_id, 'the org admin belongs to an organization')
    const held = await orgAdmin.get<string[]>('/permissions/me')
    expect(held).toEqual(expect.arrayContaining(['user:read', 'entity:read', 'permission:read']))
    expect(held).not.toContain('permission:create')
    const posts: Array<Record<string, unknown>> = []
    const additions: unknown[] = []
    await page.route(/\/roles\/[^?]*$/, async (route) => {
      const request = route.request()
      if (request.method() === 'POST' && /\/roles\/$/.test(request.url())) posts.push(request.postDataJSON() as Record<string, unknown>)
      if (request.method() === 'POST' && /\/permissions$/.test(request.url())) additions.push(request.postDataJSON())
      await route.fallback()
    })

    await page.goto('/app/roles')
    await page.getByRole('button', { name: 'Add role' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add role' })
    // No system-wide type (superusers and global admins only); Organization first, theirs chosen.
    await expect(dialog.getByRole('radio', { name: /^System-wide/ })).toHaveCount(0)
    await expect(dialog.getByRole('radio', { name: /^Organization/ })).toBeChecked()
    await expect(dialog.getByRole('button', { name: 'Organization', exact: true })).toContainText(me.root_entity_name ?? '')
    const note = dialog.getByTestId('role-delegation-note')
    await expect(note).toContainText('You can grant only permissions you hold')
    // They read the catalog, so it is listed; the note says the rest can't be added.
    await expect(note).toContainText('Permissions you don\'t hold are listed but can\'t be added. You can always remove one.')

    const displayName = testData.displayName('orgrole')
    await dialog.getByLabel('Display name').fill(displayName)
    const picker = dialog.getByTestId('permission-picker')
    await pickPermission(picker, 'user:read')
    // A permission they do not hold is listed, disabled, with the reason (the exact name ranks
    // first).
    const search = dialog.getByPlaceholder('Search permissions...')
    await search.fill('permission:create')
    const option = picker.getByRole('option').first()
    await expect(option).toContainText('You don\'t hold this permission, so you can\'t grant it.')
    await expect(option).toBeDisabled()
    await search.fill('')
    await dialog.getByRole('button', { name: 'Create role' }).click()

    await expect(page.getByRole('heading', { name: displayName })).toBeVisible()
    expect(posts).toHaveLength(1)
    expect(posts[0]).toEqual(expect.objectContaining({ is_global: false, root_entity_id: me.root_entity_id, scope_entity_id: null, permissions: ['user:read'] }))
    await expect(page.getByText('Defined at')).toBeVisible()

    // Edit: add another permission they hold; only the addition is sent.
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const edit = page.getByRole('dialog', { name: `Edit role ${displayName}` })
    await pickPermission(edit.getByTestId('permission-picker'), 'entity:read')
    await edit.getByRole('button', { name: 'Save changes' }).click()
    await expect(edit).toBeHidden()
    expect(additions).toEqual([['entity:read']])
    const role = (await orgAdmin.listAll<ApiRole>('/roles/', { search: displayName })).find(r => r.display_name === displayName)!
    expect([...role.permissions].sort()).toEqual(['entity:read', 'user:read'])
  })

  test('a containment refusal names the permissions they may not grant (F-016)', async ({ page, errorGuard, testData }) => {
    errorGuard.allow({ kind: 'api', status: 403, url: /\/roles\/$/ })
    errorGuard.allow({ kind: 'console', console: /403/ })
    await page.route(/\/roles\/?$/, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      return route.fulfill(jsonResponse(403, {
        error: 'PERMISSION_DENIED',
        message: 'You cannot grant permissions you do not hold',
        details: { missing_permissions: ['user:read'] }
      }))
    })
    await page.goto('/app/roles')
    await page.getByRole('button', { name: 'Add role' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add role' })
    await dialog.getByLabel('Display name').fill(testData.displayName('refused'))
    await pickPermission(dialog.getByTestId('permission-picker'), 'user:read')
    await dialog.getByRole('button', { name: 'Create role' }).click()
    const alert = dialog.getByTestId('api-error-alert')
    await expect(alert).toContainText('Missing permissions')
    await expect(alert.getByLabel('Missing permissions')).toContainText('user:read')
    await expect(dialog).toBeVisible()
  })

  test('the role they hold is marked, and archiving it warns they lose its access (F-177)', async ({ page, apiAs }) => {
    const roles = await apiAs('orgAdmin').listAll<ApiRole>('/roles/')
    const own = roles.find(role => role.name === 'acme_org_admin')
    expectSeeded(own, 'the org admin sees the acme_org_admin role they hold')
    await page.goto(`/app/roles?q=${own!.name}`)
    const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: own!.display_name, exact: true }) })
    await expect(row.getByText('You hold this role')).toBeVisible()
    await row.getByRole('button', { name: `Role actions for ${own!.display_name}`, exact: true }).click()
    await page.getByRole('menuitem', { name: 'Archive' }).click()
    const confirm = page.getByRole('dialog', { name: `Archive role ${own!.display_name}` })
    await expect(confirm.getByTestId('confirm-effects')).toContainText('You hold this role: you lose the access it gives you too')
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect(confirm).toBeHidden()

    // Removing permissions from it in Edit warns the same way.
    await page.goto(`/app/roles/${own!.id}`)
    await expect(page.getByText('You hold this role')).toBeVisible()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const edit = page.getByRole('dialog', { name: `Edit role ${own!.display_name}` })
    await expect(edit.getByTestId('role-self-demotion')).toHaveCount(0)
    await edit.getByRole('button', { name: 'Remove role:delete' }).click()
    await expect(edit.getByTestId('role-self-demotion')).toContainText('Removing role:delete also takes it away from you')
  })
})
