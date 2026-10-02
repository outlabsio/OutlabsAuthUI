import { backendConfigured, expect, expectSeeded, personaState, test } from '../support/fixtures'
import { jsonResponse } from '../support/mocks'

// Delegated role administration (F-016, F-054, F-177): the seeded organization admin holds
// role:create/update/delete but not permission:read and has no global scope. The console offers
// them organization and entity roles in their own organization, permissions they hold (their
// own grants, as they cannot read the catalog), says so, names the permissions a refusal is
// about, and marks the role they hold. Strict error guard: no refused request on the way.

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
    expect(held).toContain('user:read')
    expect(held).toContain('entity:read')
    // They cannot read the permission catalog, so the picker falls back to what they hold.
    expect(held.filter(name => name.startsWith('permission:read'))).toEqual([])
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
    // They cannot read the catalog, so the picker lists only what they hold; the note says so.
    await expect(note).toContainText('Only the permissions you hold are listed. You can always remove one.')
    await expect(note).not.toContainText('listed but can\'t be added')

    const displayName = testData.displayName('orgrole')
    await dialog.getByLabel('Display name').fill(displayName)
    const search = dialog.getByPlaceholder('Search permissions...')
    await search.fill('user:read')
    await dialog.getByRole('option', { name: /user:read/ }).first().click()
    await expect(dialog.getByRole('button', { name: 'Remove user:read' })).toBeVisible()
    // A permission they do not hold (the catalog is not readable to them) is not offered.
    await search.fill('permission:create')
    await expect(dialog.getByRole('option')).toHaveCount(0)
    await search.fill('')
    await dialog.getByRole('button', { name: 'Create role' }).click()

    await expect(page.getByRole('heading', { name: displayName })).toBeVisible()
    expect(posts).toHaveLength(1)
    expect(posts[0]).toEqual(expect.objectContaining({ is_global: false, root_entity_id: me.root_entity_id, scope_entity_id: null, permissions: ['user:read'] }))
    await expect(page.getByText('Defined at')).toBeVisible()

    // Edit: add another permission they hold; only the addition is sent.
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const edit = page.getByRole('dialog', { name: `Edit role ${displayName}` })
    await edit.getByPlaceholder('Search permissions...').fill('entity:read')
    await edit.getByRole('option', { name: /entity:read/ }).first().click()
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
    await dialog.getByPlaceholder('Search permissions...').fill('user:read')
    await dialog.getByRole('option', { name: /user:read/ }).first().click()
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
