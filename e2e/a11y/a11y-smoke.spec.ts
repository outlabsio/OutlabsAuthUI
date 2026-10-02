import { backendConfigured, expect, expectSeeded, test, type Page } from '../support/fixtures'
import { expectAccessible } from '../support/a11y'
import { backendHasSurface } from '../support/capabilities'
import { searchUsersList } from '../support/lists'

// The accessibility sweep (F-138, F-148): every console route, the record pages behind them and
// the main dialogs, as the admin, in light and dark at 1440 and 390px (support/a11y.ts). Each
// page boots once; the variants change in place. Guest pages: e2e/auth/auth-a11y.spec.ts.
test.use({ errorGuardMode: 'strict' })

test.describe.configure({ timeout: 90_000 })

async function settled(page: Page) {
  // Below lg some record pages show the record in a slideover over the list, so any heading.
  await expect(page.getByRole('heading').first()).toBeVisible()
  await page.waitForLoadState('networkidle')
}

test.describe('accessibility: console pages', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  const routes = [
    '/app/dashboard',
    '/app/users',
    '/app/roles',
    '/app/permissions',
    '/app/entities',
    '/app/service-accounts',
    '/app/audit',
    '/app/api-keys',
    '/app/settings',
    '/app/account',
    '/app/account/security',
    '/app/account/access'
  ]

  for (const route of routes) {
    test(`${route}`, async ({ page }) => {
      await page.goto(route)
      // Routes the preset does not mount redirect to the dashboard; that page is checked too.
      await settled(page)
      await expectAccessible(page, { ready: () => settled(page) })
    })
  }

  test('a user\'s pages: overview, access and activity', async ({ page, apiAs }) => {
    const user = await apiAs('agent').me()
    for (const tab of ['', '?tab=access', '?tab=activity']) {
      await page.goto(`/app/users/${user.id}${tab}`)
      await settled(page)
      await expectAccessible(page, { ready: () => settled(page) })
    }
  })

  test('a role and a permission', async ({ page, api }) => {
    const [role] = await api.listAll<{ id: string }>('/roles/')
    const [permission] = await api.listAll<{ id: string }>('/permissions/')
    for (const path of [`/app/roles/${role!.id}`, `/app/permissions/${permission!.id}`]) {
      await page.goto(path)
      await settled(page)
      await expectAccessible(page, { ready: () => settled(page) })
    }
  })

  test('an entity', async ({ page, api, requires }) => {
    await requires({ surfaces: ['entities'] })
    const me = await api.me()
    expectSeeded(me.root_entity_id, 'the admin persona belongs to an organization')
    await page.goto(`/app/entities?entity=${me.root_entity_id}`)
    await settled(page)
    await expectAccessible(page, { ready: () => settled(page) })
  })

  test('a service account', async ({ page, api, requires, testData }) => {
    await requires({ surfaces: ['integration_principals'] })
    const account = await api.post<{ id: string }>('/admin/system/integration-principals', {
      name: testData.name('a11y-sa'),
      allowed_scopes: ['user:read'],
      role_ids: []
    })
    for (const tab of ['', '?tab=access', '?tab=keys']) {
      await page.goto(`/app/service-accounts/${account.id}${tab}`)
      await settled(page)
      await expectAccessible(page, { ready: () => settled(page) })
    }
  })
})

test.describe('accessibility: dialogs', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  // The page, the control that opens the dialog, and the dialog's name. Opening by the real
  // trigger from the keyboard also checks that Escape returns focus there (keyboard smoke).
  const dialogs = [
    { path: '/app/users', trigger: 'Add user', dialog: 'Add user' },
    { path: '/app/users', trigger: 'Invite', dialog: 'Invite user' },
    { path: '/app/roles', trigger: 'Add role', dialog: 'Add role' },
    { path: '/app/permissions', trigger: 'Create permission', dialog: 'Create permission' },
    { path: '/app/entities', trigger: 'New entity', dialog: 'Create entity', surface: 'entities' },
    { path: '/app/service-accounts', trigger: 'New service account', dialog: 'New service account', surface: 'integration_principals' },
    { path: '/app/api-keys', trigger: 'Create API key', dialog: 'Create personal API key' }
  ]

  for (const { path, trigger, dialog: name, surface } of dialogs) {
    test(`${name} (${path})`, async ({ page }) => {
      test.skip(Boolean(surface) && !(await backendHasSurface(surface!)), `The backend does not mount ${surface}.`)
      await page.goto(path)
      await settled(page)
      // Opened from the keyboard, the way focus return matters (Safari never focuses a clicked
      // button, so a mouse-opened dialog has nothing to return to there).
      // The navbar's button (an empty list repeats it in its empty state).
      const opener = page.getByRole('button', { name: trigger, exact: true }).first()
      await opener.focus()
      await page.keyboard.press('Enter')
      const dialog = page.getByRole('dialog', { name })
      await expect(dialog).toBeVisible()
      await expectAccessible(page, { scope: dialog, include: '[role="dialog"]' })
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(opener).toBeFocused()
    })
  }

  // The sweep above may scan a dialog while its pickers still load. A picker with nothing to list
  // yet says so in place of its palette, whose listbox may hold options only: its own empty
  // message sits inside the listbox (aria-required-children). Here the role pool is held until
  // the scan is done, so that state is checked every run.
  test('a role picker still loading its roles (New service account)', async ({ page }) => {
    test.skip(!(await backendHasSurface('integration_principals')), 'The backend does not mount integration_principals.')
    await page.goto('/app/service-accounts')
    await settled(page)
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(/\/roles\/\?/, async (route) => {
      if (route.request().method() === 'GET') await held
      await route.continue().catch(() => {})
    })
    await page.getByRole('button', { name: 'New service account', exact: true }).first().click()
    const dialog = page.getByRole('dialog', { name: 'New service account' })
    await expect(dialog.getByText('Loading roles...')).toBeVisible()
    await expectAccessible(page, { scope: dialog, include: '[role="dialog"]' })
    release()
    await expect(dialog.getByPlaceholder('Search roles...')).toBeVisible()
  })

  test('a confirmation (delete a user from its row menu)', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'a11y-confirm' })
    await page.goto('/app/users')
    // The search's own answer first: the row menu is opened on the row it lists.
    await searchUsersList(page, user.email)
    const actions = page.getByRole('button', { name: `User actions for ${user.email}` })
    await actions.click()
    await page.getByRole('menuitem', { name: /^Delete/ }).click()
    const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog')).first()
    await expect(dialog).toBeVisible()
    await expectAccessible(page, { scope: dialog, include: '[role="dialog"], [role="alertdialog"]' })
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(actions).toBeFocused()
  })
})
