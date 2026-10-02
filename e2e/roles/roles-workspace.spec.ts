import type { Page } from '@playwright/test'
import { backendConfigured, expect, test } from '../support/fixtures'
import { isEnterpriseBackend } from '../support/capabilities'
import { openRowMenu } from '../support/lists'

// The roles list and role detail (WP-14): the shared list kit (route query, server pages, true
// total), one Type column (EnterpriseRBAC), Origin and Permissions columns, row menus built
// from permission and state (system roles: View + Duplicate only), Archive with a typed name,
// and the detail's not-found state. Runs on every preset.

type ApiRole = { id: string, name: string, display_name: string, is_system_role?: boolean, permissions?: string[], root_entity_id?: string | null }

// Search the roles list and wait until the table shows the search's answer. The rows already on
// screen re-render when the filtered answer lands, which closes a row menu opened in between.
async function searchRoles(page: Page, term: string) {
  const filtered = page.waitForResponse(response => response.request().method() === 'GET'
    && /\/roles\/?$/.test(new URL(response.url()).pathname)
    && new URL(response.url()).searchParams.get('search') === term)
  await page.getByRole('searchbox', { name: 'Search roles' }).fill(term)
  await expect(page).toHaveURL(new RegExp(`[?&]q=${encodeURIComponent(term).replace(/%20/g, '\\+')}`))
  const { items } = await (await filtered).json() as { items: unknown[] }
  await expect(page.locator('tbody tr')).toHaveCount(items.length)
}

test.describe('roles workspace', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('lists the seeded roles with their type, origin, permission count and status', async ({ page, api }) => {
    const roles = await api.listAll<ApiRole>('/roles/')
    const enterprise = await isEnterpriseBackend()
    // EnterpriseRBAC seeds an organization role; SimpleRBAC seeds system roles only.
    const seeded = roles.find(role => role.name === 'acme_auditor') ?? roles.find(role => role.is_system_role)!
    await page.goto('/app/roles')
    await expect(page.getByRole('heading', { name: 'Roles' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add role' })).toBeVisible()
    await searchRoles(page, seeded.name)
    const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: seeded.display_name, exact: true }) })
    await expect(row).toContainText(seeded.name)
    await expect(row.getByRole('cell').nth(enterprise ? 2 : 1)).toHaveText(String(seeded.permissions?.length ?? 0))
    await expect(row).toContainText(seeded.is_system_role ? 'System' : 'Custom')
    await expect(row).toContainText('Active')
    if (enterprise) {
      await expect(page.getByRole('columnheader', { name: 'Type' })).toBeVisible()
      // Where an organization role lives is part of its type (F-068).
      await expect(row.getByRole('cell').nth(1)).toContainText('Organization')
      await expect(row.getByRole('cell').nth(1)).toContainText('ACME Realty')
    } else {
      // SimpleRBAC roles are flat: no type column or filter (F-008).
      await expect(page.getByRole('columnheader', { name: 'Type' })).toHaveCount(0)
      await expect(page.getByLabel('Filter by type', { exact: true })).toHaveCount(0)
    }
  })

  test('opens the create-role dialog, reset on every open (F-205)', async ({ page }) => {
    await page.goto('/app/roles')
    await page.getByRole('button', { name: 'Add role' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add role' })
    await expect(dialog.getByLabel('Display name')).toBeVisible()
    await expect(dialog.getByLabel('Name', { exact: true })).toBeVisible()
    // The name follows the display name until edited (F-069).
    await dialog.getByLabel('Display name').fill('Regional Admin (West)')
    await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('regional_admin_west')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('dialog', { name: 'Discard changes?' }).getByRole('button', { name: 'Discard' }).click()
    await expect(dialog).toBeHidden()
    await page.getByRole('button', { name: 'Add role' }).click()
    await expect(dialog.getByLabel('Display name')).toHaveValue('')
  })

  test('the list pages on the server with the true total (F-126)', async ({ page, api }) => {
    const total = (await api.get<{ total: number }>('/roles/', { query: { limit: 1 } })).total
    // Past one page of 25.
    for (let i = total; i < 27; i++) await api.createRole({ kind: 'page' })
    const pageRequests: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (request.method() === 'GET' && /\/roles\/$/.test(url.pathname) && url.searchParams.get('limit') === '25') pageRequests.push(url.searchParams.get('page') ?? '')
    })
    await page.goto('/app/roles')
    const summary = page.getByRole('status').filter({ hasText: /Showing 1–25 of \d+ roles/ })
    await expect(summary).toBeVisible()
    await page.getByRole('navigation', { name: 'Roles pages' }).getByRole('button', { name: 'Page 2' }).click()
    await expect(page).toHaveURL(/[?&]page=2/)
    await expect(page.getByRole('status').filter({ hasText: /Showing 26–/ })).toBeVisible()
    expect(pageRequests).toContain('2')
    // Back keeps the page in the route query.
    await page.reload()
    await expect(page.getByRole('status').filter({ hasText: /Showing 26–/ })).toBeVisible()
  })

  test('archiving a role states the effect and takes the typed name (F-112)', async ({ page, api }) => {
    const role = await api.createRole()
    const archived: string[] = []
    await page.route(/\/roles\/[^/]+$/, async (route) => {
      if (route.request().method() === 'DELETE') archived.push(route.request().url())
      await route.continue()
    })

    await page.goto('/app/roles')
    await searchRoles(page, role.name)
    await expect(page.getByRole('row').filter({ hasText: role.name })).toHaveCount(1)
    await openRowMenu(page, `Role actions for ${role.display_name}`)
    await page.getByRole('menuitem', { name: 'Archive' }).click()

    const confirm = page.getByRole('dialog', { name: `Archive role ${role.display_name}` })
    await expect(confirm).toContainText('can\'t be restored from the console')
    await expect(confirm.getByTestId('confirm-effects')).toContainText('loses the permissions it grants immediately')
    const archive = confirm.getByRole('button', { name: 'Archive role' })
    await expect(archive).toBeDisabled()
    const typed = confirm.getByLabel(`Type ${role.name} to confirm`)
    await typed.fill(`${role.name}-typo`)
    await expect(archive).toBeDisabled()
    await typed.fill(role.name)
    await archive.click()
    await expect(confirm).toBeHidden()
    await expect(page.getByText('Role archived', { exact: true })).toBeVisible()
    expect(archived).toHaveLength(1)
    await expect(page.getByRole('row').filter({ hasText: role.name })).toHaveCount(0)
  })

  test('system roles offer no Edit or Archive; Duplicate as custom role creates an editable copy (F-053)', async ({ page, api, testData }) => {
    const roles = await api.listAll<ApiRole>('/roles/')
    const system = roles.filter(role => role.is_system_role).sort((a, b) => (a.permissions?.length ?? 0) - (b.permissions?.length ?? 0))[0]
    test.skip(!system, 'No system role on this backend.')
    const posts: Array<Record<string, unknown>> = []
    await page.route(/\/roles\/?$/, async (route) => {
      if (route.request().method() === 'POST') posts.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fallback()
    })

    await page.goto('/app/roles')
    await searchRoles(page, system!.name)
    await openRowMenu(page, `Role actions for ${system!.display_name}`)
    await expect(page.getByRole('menuitem', { name: 'View' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Edit' })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: 'Archive' })).toHaveCount(0)
    await page.getByRole('menuitem', { name: 'Duplicate as custom role' }).click()

    const dialog = page.getByRole('dialog', { name: `Duplicate role ${system!.display_name}` })
    await expect(dialog.getByLabel('Display name')).toHaveValue(`${system!.display_name} (copy)`)
    for (const name of system!.permissions ?? []) await expect(dialog.getByRole('button', { name: `Remove ${name}` })).toBeVisible()
    const displayName = testData.displayName('dup')
    const name = testData.name('dup')
    await dialog.getByLabel('Display name').fill(displayName)
    await dialog.getByLabel('Name', { exact: true }).fill(name)
    await dialog.getByRole('button', { name: 'Create role' }).click()

    // The copy opens: custom, with the source's permissions, and editable.
    await expect(page.getByRole('heading', { name: displayName })).toBeVisible()
    expect(posts).toHaveLength(1)
    expect(posts[0]).toEqual(expect.objectContaining({ name, display_name: displayName, is_auto_assigned: false }))
    expect([...(posts[0]!.permissions as string[])].sort()).toEqual([...(system!.permissions ?? [])].sort())
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
    await expect(page.getByTestId('role-locked')).toHaveCount(0)

    // The system role's own page says why it is locked and offers no Edit.
    await page.goto(`/app/roles/${system!.id}`)
    await expect(page.getByTestId('role-locked')).toContainText('can\'t be changed')
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'More role actions' }).click()
    await expect(page.getByRole('menuitem', { name: 'Duplicate as custom role' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Archive' })).toHaveCount(0)
  })

  test('a role link that does not resolve shows not found with a way back (F-122)', async ({ page, errorGuard }) => {
    errorGuard.allow({ kind: 'api', status: 404, url: /\/roles\/[0-9a-f-]{36}$/ })
    errorGuard.allow({ kind: 'console', console: /404/ })
    await page.goto('/app/roles/not-a-role-id')
    await expect(page.getByText('Role not found')).toBeVisible()
    await page.goto('/app/roles/00000000-0000-4000-8000-000000000000')
    await expect(page.getByText('Role not found')).toBeVisible()
    await page.getByRole('link', { name: 'Back to roles' }).filter({ hasText: 'Back to roles' }).click()
    await expect(page).toHaveURL(/\/app\/roles$/)
  })
})
