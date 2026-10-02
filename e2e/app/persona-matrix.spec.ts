import { expect, expectSeeded, personaState, test, type Page } from '../support/fixtures'
import { cardByHeading, entityOption, pickEntity } from '../support/entities'
import { searchUsersList } from '../support/lists'
import { userDetailPath } from '../support/users'

// Persona x preset scenarios (F-037). Nav parity for every persona lives in nav-parity.spec.ts;
// this file checks what each persona's grants mean inside the pages: the second organization's
// admin never sees the first one's records, the auditor can change nothing, a delegated admin
// without permission read sees a role's permissions as plain text, the permission-catalog admin's
// Audit offers no entity filter, the non-superuser global admin works like an admin (across every
// organization, entities included, as the backend lets them), and seeded account states read
// correctly. Every persona runs
// from its storage state minted in globalSetup (no login here).
test.use({ errorGuardMode: 'strict' })

type Named = { id: string, name?: string, email?: string, display_name?: string, root_entity_id?: string | null }

// A control that changes something. The auditor must not be offered one anywhere.
const MUTATING = /^(Add|Create|Invite|New|Edit|Delete|Archive|Remove|Suspend|Reactivate|Revoke|Rotate|Reset|Move|Change|Duplicate|Save|Deactivate|Restore|Finish|Assign|Grant|Sign out everywhere|Resend)\b/

async function mutatingControls(page: Page): Promise<string[]> {
  await page.waitForLoadState('networkidle')
  const names = await page.getByRole('main').getByRole('button').evaluateAll(buttons => buttons
    .filter(b => !(b as HTMLButtonElement).disabled && b.getAttribute('aria-disabled') !== 'true' && (b as HTMLElement).offsetParent !== null)
    .map(b => (b.getAttribute('aria-label') || b.textContent || '').trim()))
  return names.filter(name => MUTATING.test(name))
}

// Opens the first row menu matching `name` and returns its item labels.
async function rowMenuItems(page: Page, name: RegExp): Promise<string[]> {
  await page.getByRole('button', { name }).first().click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  const items = (await menu.getByRole('menuitem').allInnerTexts()).map(t => t.trim())
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  return items
}

test.describe('second organization admin (summitAdmin)', () => {
  test.use({ storageState: personaState('summitAdmin') })

  test('deep links to the first organization\'s records show not-found or outside-your-organization, never their data', async ({ page, api, requires, errorGuard }) => {
    await requires({ personas: ['summitAdmin'], surfaces: ['entities'] })
    // The backend answers records outside the actor's organization with 404.
    errorGuard.allow({ status: 404, url: /\/(users|roles)\/[0-9a-f-]{36}$/ })
    const agent = (await api.listAll<Named>('/users/', { search: 'agent@sf.acme.com' })).find(u => u.email === 'agent@sf.acme.com')
    const role = (await api.listAll<Named>('/roles/')).find(r => r.name === 'acme_org_admin')
    const acme = (await api.me()).root_entity_id
    expectSeeded(agent && role && acme, 'the first organization, its agent and its acme_org_admin role')

    await page.goto(`/app/users/${agent!.id}`)
    await expect(page.getByRole('heading', { name: 'User not found' })).toBeVisible()
    await expect(page.getByRole('main').getByText('agent@sf.acme.com')).toHaveCount(0)

    await page.goto(`/app/roles/${role!.id}`)
    await expect(page.getByRole('heading', { name: 'Role not found' })).toBeVisible()
    await expect(page.getByRole('main').getByText('ACME Org Admin')).toHaveCount(0)

    // GET /entities/{id} still answers across organizations (a backend boundary gap); the
    // console must not show the foreign entity's name or details.
    await page.goto(`/app/entities?entity=${acme}`)
    await expect(page.getByRole('heading', { name: 'Outside your organization' })).toBeVisible()
    await expect(page.getByRole('main').getByText('ACME Realty')).toHaveCount(0)
    // Its own tree is still there.
    await expect(page.getByRole('main').getByText('Summit Commercial').first()).toBeVisible()
  })

  test('lists hold only the second organization\'s accounts and roles', async ({ page, requires }) => {
    await requires({ personas: ['summitAdmin'] })
    await page.goto('/app/users')
    await expect(page.getByRole('button', { name: /^User actions for / }).first()).toBeVisible()
    await expect(page.getByRole('main').getByText(/@(sf\.)?acme\.com/)).toHaveCount(0)
    await page.goto('/app/roles')
    await expect(page.getByRole('button', { name: /^Role actions for / }).first()).toBeVisible()
    await expect(page.getByRole('main').getByText(/^ACME /)).toHaveCount(0)
  })
})

test.describe('read-only auditor (auditor)', () => {
  test.use({ storageState: personaState('auditor') })

  test('no list, detail or row menu offers a change', async ({ page, api, requires }) => {
    await requires({ personas: ['auditor'], surfaces: ['entities'] })
    const agent = (await api.listAll<Named>('/users/', { search: 'agent@sf.acme.com' })).find(u => u.email === 'agent@sf.acme.com')
    const role = (await api.listAll<Named>('/roles/')).find(r => r.name === 'acme_auditor')
    const acme = (await api.me()).root_entity_id
    expectSeeded(agent && role && acme, 'the first organization, its agent and its acme_auditor role')

    const pages = [
      '/app/users',
      `/app/users/${agent!.id}`,
      `/app/users/${agent!.id}?tab=access`,
      '/app/roles',
      `/app/roles/${role!.id}`,
      `/app/entities?entity=${acme}`,
      '/app/dashboard'
    ]
    for (const path of pages) {
      await page.goto(path)
      await expect(page.getByRole('main').getByRole('heading').first()).toBeVisible()
      expect(await mutatingControls(page), `${path} offers no change`).toEqual([])
    }

    await page.goto('/app/users')
    for (const item of await rowMenuItems(page, /^User actions for /)) expect(item).not.toMatch(MUTATING)
    await page.goto('/app/roles')
    for (const item of await rowMenuItems(page, /^Role actions for /)) expect(item).not.toMatch(MUTATING)
  })
})

test.describe('delegated org admin (orgAdmin)', () => {
  test.use({ storageState: personaState('orgAdmin') })

  test('a role\'s permissions read as plain text: no links to permission pages the admin cannot open', async ({ page, apiAs, requires }) => {
    // The delegated admin reads roles but holds no permission:read (nav-parity pins no Permissions).
    await requires({ personas: ['orgAdmin'] })
    const roles = await apiAs('orgAdmin').listAll<Named & { permissions?: string[] }>('/roles/')
    const role = roles.find(r => (r.permissions?.length ?? 0) > 0)
    expectSeeded(role, 'the org admin sees a role with permissions')

    await page.goto(`/app/roles/${role!.id}`)
    const card = cardByHeading(page, 'Permissions')
    // Without the catalogue the names themselves are shown.
    for (const name of role!.permissions!) await expect(card.getByText(name, { exact: true })).toBeVisible()
    await expect(card.getByRole('link')).toHaveCount(0)
  })
})

test.describe('permission-catalog admin (permissionsAdmin)', () => {
  test.use({ storageState: personaState('permissionsAdmin'), viewport: { width: 1440, height: 900 } })

  test('Audit offers no entity filter without entity read, and an entity link narrows nothing', async ({ page, requires }) => {
    // The strict error guard fails this test on any refused call (the entity picker asked for
    // entities this admin cannot read before 946496d).
    await requires({ personas: ['permissionsAdmin'], surfaces: ['audit'] })
    await page.goto('/app/audit')
    const filters = page.getByRole('group', { name: 'Audit filters' })
    await expect(filters.getByRole('button', { name: 'Actor', exact: true })).toBeVisible()
    await expect(filters.getByRole('button', { name: 'Entity', exact: true })).toHaveCount(0)
    // The guide does not describe a filter the admin does not have.
    await page.getByRole('button', { name: 'Open Audit guide' }).click()
    const guide = page.getByRole('dialog', { name: 'Audit guide' })
    await expect(guide).toContainText('Every filter is kept in the address')
    await expect(guide).not.toContainText('entity filter')
    await page.keyboard.press('Escape')
    await expect(guide).toBeHidden()

    // Below xl the filters live in a slideover: no Entity field there either.
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.getByRole('button', { name: 'Filters', exact: true }).click()
    const slideover = page.getByRole('dialog', { name: 'Filters' })
    await expect(slideover.getByText('The account that did it.')).toBeVisible()
    await expect(slideover.getByText('Entity', { exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(slideover).toBeHidden()

    // A shared link with an entity filter loads unnarrowed: no entity_id sent, no Entity chip.
    const entityId = '11111111-1111-4111-8111-111111111111'
    const sent = page.waitForRequest(request => request.method() === 'GET' && new URL(request.url()).pathname.endsWith('/audit-events'))
    await page.goto(`/app/audit?entityId=${entityId}`)
    expect(new URL((await sent).url()).searchParams.has('entity_id')).toBe(false)
    await expect(page.getByRole('table').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /^Remove filter Entity/ })).toHaveCount(0)
    await expect(page.getByRole('group', { name: 'Active filters' })).toHaveCount(0)
  })
})

test.describe('non-superuser global admin (globalAdmin)', () => {
  test.use({ storageState: personaState('globalAdmin') })

  test('gets the admin dashboard and the users toolbar of an admin who sees every organization', async ({ page, apiAs, requires }) => {
    await requires({ personas: ['globalAdmin'] })
    const me = await apiAs('globalAdmin').me()
    expect(me.is_superuser).toBe(false)

    await page.goto('/app/dashboard')
    // Each tile's link is named with its count (v-auth-shell-06).
    await expect(page.getByRole('region', { name: 'Overview' }).getByRole('link', { name: /^Active users: / })).toHaveAttribute('href', /^\/app\/users/)

    await page.goto('/app/users')
    await expect(page.getByRole('button', { name: 'Add user', exact: true })).toBeVisible()
    if (me.root_entity_id) {
      // EnterpriseRBAC: a global admin inside an organization still filters by organization
      // and is offered their own organization when creating an account (WP-11).
      await expect(page.getByRole('button', { name: 'Filter by organization' })).toBeVisible()
      await page.getByRole('button', { name: 'Add user', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Add user' })
      await dialog.getByLabel('Organization').click()
      await expect(page.getByRole('option', { name: me.root_entity_name ?? '', exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
    }
  })

  // F-020: the entity scope follows the same reach as the Users and Roles lists, so a system-wide
  // admin inside an organization works with another organization's entities as the backend lets
  // them: its users' memberships are named, Add membership offers that organization's entities
  // (never their own, which the backend refuses), the tree switches organizations and Service
  // accounts reach any entity.
  test.describe('across organizations (EnterpriseRBAC)', () => {
    test.beforeEach(async ({ requires }) => {
      await requires({ personas: ['globalAdmin'], preset: 'EnterpriseRBAC', surfaces: ['entities', 'memberships'] })
    })

    test('another organization\'s user: memberships named, Add membership offers that organization only', async ({ page, api, apiAs }) => {
      const me = await apiAs('globalAdmin').me()
      expectSeeded(me.root_entity_id, 'the global admin belongs to the admin persona\'s organization')
      const root = await api.createEntity({ kind: 'ga-other' })
      const office = await api.createEntity({ kind: 'ga-office', entity_type: 'office', parent_entity_id: root.id })
      const spare = await api.createEntity({ kind: 'ga-spare', entity_type: 'office', parent_entity_id: root.id })
      const user = await api.createUser({ kind: 'ga-member', root_entity_id: root.id })
      await api.post('/memberships/', { user_id: user.id, entity_id: office.id, role_ids: [] })

      await page.goto(userDetailPath(user.id, 'access'))
      const card = cardByHeading(page, 'Memberships')
      await expect(card.getByRole('row').filter({ hasText: office.display_name })).toBeVisible()
      await expect(card.getByText('Unknown entity')).toHaveCount(0)

      await card.getByRole('button', { name: 'Add membership' }).click()
      const dialog = page.getByRole('dialog', { name: 'Add membership' })
      await dialog.getByLabel('Entity', { exact: true }).click()
      await expect(entityOption(page, spare.display_name)).toBeVisible()
      await expect(entityOption(page, root.display_name)).toBeVisible()
      await expect(entityOption(page, me.root_entity_name ?? '')).toHaveCount(0)
      // The pool only: the seed's system-wide admin role holds membership:create but not the
      // membership:create_tree the backend checks at the entity, so it cannot complete the add.
      await page.keyboard.press('Escape')
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await expect(dialog).toBeHidden()
    })

    test('the entities tree switches organizations and opens another organization\'s entity', async ({ page, api, apiAs }) => {
      const me = await apiAs('globalAdmin').me()
      expectSeeded(me.root_entity_id, 'the global admin belongs to the admin persona\'s organization')
      const root = await api.createEntity({ kind: 'ga-tree' })

      await page.goto('/app/entities')
      await expect(page.getByRole('button', { name: 'Organization' })).toContainText(me.root_entity_name ?? '')
      await page.goto(`/app/entities?entity=${root.id}`)
      await expect(page.getByRole('heading', { name: root.display_name, exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Organization' })).toContainText(root.display_name)
      await expect(page.getByRole('heading', { name: 'Outside your organization' })).toHaveCount(0)
    })

    test('Service accounts start at their organization and reach another organization\'s entity', async ({ page, api, apiAs, requires }) => {
      await requires({ surfaces: ['integration_principals'] })
      const me = await apiAs('globalAdmin').me()
      expectSeeded(me.root_entity_id, 'the global admin belongs to the admin persona\'s organization')
      const root = await api.createEntity({ kind: 'ga-sa' })

      await page.goto('/app/service-accounts')
      const picker = page.getByLabel('Entity', { exact: true })
      await expect(picker).toContainText(me.root_entity_name ?? '')
      await expect(picker).toBeEnabled()
      await expect(page.getByText('No organization', { exact: true })).toHaveCount(0)
      await pickEntity(page, picker, root.display_name, { search: true })
      await expect(page).toHaveURL(new RegExp(`entity=${root.id}`))
      await expect(page.getByText(`No active service account is anchored at ${root.display_name}.`)).toBeVisible()
    })
  })

  test('row menus follow the admin role\'s permissions, not superuser power (SimpleRBAC)', async ({ page, requires }) => {
    // The SimpleRBAC admin role has permission:read/create/update but no permission:delete.
    await requires({ personas: ['globalAdmin'], preset: 'SimpleRBAC' })
    await page.goto('/app/permissions')
    const items = await rowMenuItems(page, /^Permission actions for /)
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) expect(item).not.toMatch(/^(Delete|Archive)/)
  })
})

test.describe('seeded account states in the users list (EnterpriseRBAC)', () => {
  const STATES = [
    { email: 'suspended@ny.acme.com', text: 'Suspended' },
    { email: 'invited@acme.com', text: 'Invited' },
    { email: 'locked@la.acme.com', text: /Locked/ },
    { email: 'unverified@austin.summit.com', text: /not verified|Unverified/i }
  ]

  for (const { email, text } of STATES) {
    test(`${email} shows its state`, async ({ page, requires }) => {
      await requires({ preset: 'EnterpriseRBAC' })
      // The list shows active accounts by default.
      await page.goto('/app/users?status=all')
      await searchUsersList(page, email)
      await expect(page.locator('tbody tr').getByText(text).first()).toBeVisible()
    })
  }
})
