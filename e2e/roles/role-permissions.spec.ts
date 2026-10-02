import type { Page } from '@playwright/test'
import { backendConfigured, expect, test } from '../support/fixtures'
import { cardByHeading } from '../support/entities'

// A role's permission set (F-069, F-070): the selection reads as removable chips, an edit sends
// only the changed fields and applies the permission DIFF (DELETE, PATCH, then POST),
// never the whole set, so a description edit works while an attached permission is inactive and
// the picker never offers an inactive permission. Runs on every preset (as the superuser).

type Captured = { method: string, path: string, body: unknown }

async function captureRoleWrites(page: Page) {
  const writes: Captured[] = []
  await page.route(/\/roles\/[^?]*$/, async (route) => {
    const request = route.request()
    if (['POST', 'PATCH', 'DELETE'].includes(request.method())) {
      writes.push({ method: request.method(), path: new URL(request.url()).pathname.replace(/^.*\/roles/, '/roles'), body: request.postDataJSON() })
    }
    await route.fallback()
  })
  return writes
}

test.describe('role permission assignment', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('creates a role with permissions, then edits the set as a diff (F-070)', async ({ page, api, testData }) => {
    const [first, second, third] = await Promise.all([
      api.createPermission({ kind: 'set-a' }),
      api.createPermission({ kind: 'set-b' }),
      api.createPermission({ kind: 'set-c' })
    ])
    const writes = await captureRoleWrites(page)
    const displayName = testData.displayName('perms')
    const name = testData.name('perms')

    await page.goto('/app/roles')
    await page.getByRole('button', { name: 'Add role' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add role' })
    await dialog.getByLabel('Display name').fill(displayName)
    await dialog.getByLabel('Name', { exact: true }).fill(name)
    // The first type the superuser may create is system-wide: no entity needed.
    const search = dialog.getByPlaceholder('Search permissions...')
    for (const permission of [first, second]) {
      await search.fill(permission.name)
      await dialog.getByRole('option', { name: new RegExp(permission.display_name ?? permission.name) }).click()
    }
    // The selection is visible as removable chips.
    await expect(dialog.getByTestId('permission-selection').getByRole('button')).toHaveCount(2)
    await dialog.getByRole('button', { name: 'Create role' }).click()

    // The new role opens.
    await expect(page.getByRole('heading', { name: displayName })).toBeVisible()
    const create = writes.find(w => w.method === 'POST' && w.path === '/roles/')!
    expect(create.body).toEqual(expect.objectContaining({ name, display_name: displayName }))
    expect([...(create.body as { permissions: string[] }).permissions].sort()).toEqual([first.name, second.name].sort())

    // Edit: remove one, add one, change the description. Only the diff is sent, removals first
    // (a PATCH that widens a role is checked against its current set), additions last.
    writes.length = 0
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const edit = page.getByRole('dialog', { name: `Edit role ${displayName}` })
    await edit.getByRole('button', { name: `Remove ${first.name}` }).click()
    await edit.getByPlaceholder('Search permissions...').fill(third.name)
    await edit.getByRole('option', { name: new RegExp(third.display_name ?? third.name) }).click()
    await edit.getByLabel('Description').fill('Edited with its permissions')
    await edit.getByRole('button', { name: 'Save changes' }).click()
    await expect(edit).toBeHidden()
    await expect(page.getByText('Role updated', { exact: true })).toBeVisible()

    expect(writes.map(w => `${w.method} ${w.path.replace(/[0-9a-f-]{36}/, ':id')}`)).toEqual(['DELETE /roles/:id/permissions', 'PATCH /roles/:id', 'POST /roles/:id/permissions'])
    expect(writes.find(w => w.method === 'DELETE')!.body).toEqual([first.name])
    expect(writes.find(w => w.method === 'PATCH')!.body).toEqual({ description: 'Edited with its permissions' })
    expect(writes.find(w => w.method === 'POST')!.body).toEqual([third.name])
    // The detail shows the new set.
    const permissionsCard = cardByHeading(page, 'Permissions')
    await expect(permissionsCard).toContainText(third.display_name ?? third.name)
    await expect(permissionsCard).not.toContainText(first.display_name ?? first.name)
  })

  test('a description edit succeeds while an attached permission is inactive, which reads flagged and is never offered (F-070)', async ({ page, api }) => {
    const [kept, retired] = await Promise.all([api.createPermission({ kind: 'kept' }), api.createPermission({ kind: 'retired' })])
    const role = await api.createRole({ permissions: [kept.name, retired.name] })
    await api.patch(`/permissions/${retired.id}`, { is_active: false })
    const other = await api.createPermission({ kind: 'other' })
    await api.patch(`/permissions/${other.id}`, { is_active: false })
    const writes = await captureRoleWrites(page)

    await page.goto(`/app/roles/${role.id}`)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `Edit role ${role.display_name}` })
    // The attached inactive permission is flagged and removable.
    await expect(dialog.getByRole('button', { name: `Remove ${retired.name}` })).toContainText('(inactive)')
    await expect(dialog.getByRole('button', { name: `Remove ${kept.name}` })).not.toContainText('inactive')
    // An inactive permission the role does not carry is not offered.
    await dialog.getByPlaceholder('Search permissions...').fill(other.name)
    await expect(dialog.getByRole('option', { name: new RegExp(other.display_name ?? other.name) })).toHaveCount(0)
    await dialog.getByPlaceholder('Search permissions...').fill('')

    const save = dialog.getByRole('button', { name: 'Save changes' })
    await expect(save).toBeDisabled()
    await dialog.getByLabel('Description').fill('Now with a description')
    await save.click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('Role updated', { exact: true })).toBeVisible()
    expect(writes).toEqual([{ method: 'PATCH', path: `/roles/${role.id}`, body: { description: 'Now with a description' } }])
    await expect(page.getByText('Now with a description')).toBeVisible()
  })

  test('each permission on a role links to its page, and that page\'s resource to the resource\'s list', async ({ page, api }) => {
    // An admin who can read permissions; the delegated admin who cannot sees plain text
    // (persona-matrix.spec). The resource is unique to this permission, so its list holds one row.
    const permission = await api.createPermission({ kind: 'link' })
    const role = await api.createRole({ kind: 'link', permissions: [permission.name] })
    const label = permission.display_name ?? permission.name
    const resource = permission.name.split(':')[0]!

    await page.goto(`/app/roles/${role.id}`)
    const link = cardByHeading(page, 'Permissions').getByRole('link', { name: label, exact: true })
    await expect(link).toHaveAttribute('href', `/app/permissions/${permission.id}`)
    await link.click()
    await expect(page).toHaveURL(new RegExp(`/app/permissions/${permission.id}$`))
    await expect(page.getByRole('heading', { name: label, exact: true }).first()).toBeVisible()

    const all = page.getByRole('link', { name: `All ${resource} permissions`, exact: true })
    await expect(all).toHaveAttribute('href', `/app/permissions?resource=${resource}`)
    await all.click()
    await expect(page).toHaveURL(new RegExp(`/app/permissions\\?resource=${resource}$`))
    await expect(page.getByLabel('Filter by resource', { exact: true })).toHaveText(resource)
    const rows = page.locator('tbody tr')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText(permission.name)
  })
})
