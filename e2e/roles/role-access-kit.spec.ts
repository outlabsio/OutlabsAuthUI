import type { Locator, Page } from '@playwright/test'
import { expect, expectSeeded, persona, personaState, test } from '../support/fixtures'
import type { ApiEntity, ApiUser } from '../support/api-client'
import { jsonResponse } from '../support/mocks'
import { detailItem, userTabs } from '../support/users'

// The shared role/access kit (WP-05) against the live seed:
// - F-017 role pools hold only roles the backend accepts for the target (NYC Office excludes the
//   West Coast / SF roles; the pool equals GET /roles/entity/{id}, also when the console has to
//   apply the rules itself because that endpoint is refused). A capped pool says so.
// - F-031 the selection shows as removable chips and the validity/reason fields stay in view.
// - F-009 a system-wide role in a DIRECT grant warns about cross-organization access; the type
//   badge shows on every role; user detail states the access scope.
// - F-178 the preview flags conditional and entity-only roles, looking each role up once.
// - F-131 embedded pickers never take the focus from the dialog's first field.
// - F-067 / F-132 the delegated org admin sees names (never ids) in role chips, and a chip's
//   permissions open from the keyboard.
// Nothing here is saved: every dialog is cancelled.

test.use({ errorGuardMode: 'strict' })

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

type ApiRoleRow = { id: string, name: string, display_name: string, status: string }

// The audit's desktop size: the whole access dialog fits, so "in view" is meaningful.
const DESKTOP = { width: 1440, height: 900 }

async function seededEntity(api: { listAll: <T extends { id: string }>(path: string) => Promise<T[]> }, name: string): Promise<ApiEntity> {
  const entities = await api.listAll<ApiEntity>('/entities/')
  const entity = entities.find(e => e.name === name)
  if (!entity) throw new Error(`seed entity ${name} not found`)
  return entity
}

// Option labels of the dialog's role picker (the label is the first text run of each row).
async function roleOptionLabels(editor: Locator): Promise<string[]> {
  return editor.getByRole('option').evaluateAll(options => options.map((option) => {
    const label = option.querySelector('[data-slot="itemLabelBase"]')
    return (label?.textContent ?? '').trim()
  }))
}

// One role's option, by its exact label: a label that is part of another ("Team Lead" in the
// seed's "ACME Team Lead Baseline") must not match both.
function roleOption(editor: Locator, label: string): Locator {
  return editor.getByRole('option').filter({ has: editor.page().locator('[data-slot="itemLabelBase"]').getByText(label, { exact: true }) })
}

async function openAddMember(page: Page, entityId: string) {
  await page.goto(`/app/entities?entity=${entityId}`)
  await page.getByRole('button', { name: 'Add member' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add member' })
  const editor = dialog.getByTestId('role-access-editor')
  await expect(editor.getByRole('option').first()).toBeVisible()
  return { dialog, editor }
}

test.describe('role access kit (EnterpriseRBAC, superuser)', () => {
  test.use({ viewport: DESKTOP })

  test.beforeEach(async ({ requires }) => {
    await requires({ preset: 'EnterpriseRBAC', surfaces: ['entities', 'memberships', 'roles'] })
  })

  test('NYC Office offers exactly the roles the API accepts there, as chips, with the fields in view', async ({ page, api }) => {
    const nyc = await seededEntity(api, 'nyc_office')
    const accepted = await api.listAll<ApiRoleRow>(`/roles/entity/${nyc.id}`)
    const { dialog, editor } = await openAddMember(page, nyc.id)

    // F-017: the pool is the backend's answer — no West Coast or SF-only roles.
    const labels = await roleOptionLabels(editor)
    // Roles other specs create in parallel (run-marked or legacy "PW ..." names; system-wide ones reach NYC
    // too) may appear between the API read and the dialog's: compare the seeded roles only.
    const seeded = (names: string[]) => names.filter(name => !/^pw[ -]/i.test(name)).sort()
    expect(seeded(labels)).toEqual(seeded(accepted.map(r => r.display_name)))
    for (const outOfBranch of ['West Coast Hierarchy Admin', 'West Coast After Hours Override', 'SF Office Local Admin', 'SF Team Default Member']) {
      expect(labels).not.toContain(outOfBranch)
    }

    // F-131: the picker does not steal the focus.
    const search = editor.getByPlaceholder('Search roles...')
    await expect(search).not.toBeFocused()

    // F-009: every row names its type.
    await expect(editor.getByRole('option').filter({ hasText: 'Office Dispatch Coordinator' }).getByText('Organization')).toBeVisible()
    await expect(roleOption(editor, 'Team Lead').getByText('System-wide')).toBeVisible()

    // F-031: selections appear as removable chips; the preview updates; validity and reason
    // stay on screen.
    const selection = editor.getByTestId('role-access-selection')
    await editor.getByRole('option').filter({ hasText: 'Office Dispatch Coordinator' }).click()
    await roleOption(editor, 'Team Lead').click()
    await expect(selection.getByRole('button', { name: 'Remove Office Dispatch Coordinator' })).toBeVisible()
    await expect(selection.getByRole('button', { name: 'Remove Team Lead' })).toBeVisible()
    await expect(editor.getByTestId('grant-preview')).toContainText('Will grant')
    await expect(editor.getByText('2 roles selected')).toBeInViewport()
    await expect(dialog.getByText('Valid from')).toBeInViewport()
    await expect(dialog.getByText('Valid until')).toBeInViewport()
    await expect(dialog.getByLabel('Reason')).toBeInViewport()

    // A membership grant of a system-wide role stays inside the entity: no cross-tenant warning.
    await expect(editor.getByTestId('role-access-cross-tenant')).toHaveCount(0)

    await selection.getByRole('button', { name: 'Remove Team Lead' }).click()
    await expect(selection.getByRole('button', { name: 'Remove Team Lead' })).toHaveCount(0)
    await expect(editor.getByText('1 role selected')).toBeVisible()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
  })

  test('without GET /roles/entity/{id} the console applies the same rules and reaches the same pool', async ({ page, api, errorGuard }) => {
    // Actors without role:read_tree (or refused at this entity) get the client-side rules over
    // the role catalog and the entity path; refuse the endpoint to exercise that path.
    errorGuard.allow({ kind: 'api', status: 403, url: /\/roles\/entity\// }, { kind: 'console', console: /status of 403/ })
    let refused = 0
    await page.route(/\/roles\/entity\//, (route) => {
      refused += 1
      return route.fulfill(jsonResponse(403, { detail: 'Permission denied' }))
    })

    const nyc = await seededEntity(api, 'nyc_office')
    const accepted = await api.listAll<ApiRoleRow>(`/roles/entity/${nyc.id}`)
    const { dialog, editor } = await openAddMember(page, nyc.id)

    const labels = await roleOptionLabels(editor)
    // Roles other specs create in parallel (run-marked or legacy "PW ..." names; system-wide ones reach NYC
    // too) may appear between the API read and the dialog's: compare the seeded roles only.
    const seeded = (names: string[]) => names.filter(name => !/^pw[ -]/i.test(name)).sort()
    expect(seeded(labels)).toEqual(seeded(accepted.map(r => r.display_name)))
    for (const outOfBranch of ['West Coast Hierarchy Admin', 'West Coast After Hours Override', 'SF Office Local Admin', 'SF Team Default Member']) {
      expect(labels).not.toContain(outOfBranch)
    }
    await expect(editor.getByTestId('role-picker-truncated')).toHaveCount(0)
    expect(refused).toBeGreaterThan(0)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })

  test('a pool that could not be loaded in full says so', async ({ page, api }) => {
    // The API reports more roles than it returned (the console stops paging at its cap).
    await page.route(/\/roles\/entity\//, async (route) => {
      const response = await route.fetch()
      const body = await response.json() as { total: number } & Record<string, unknown>
      await route.fulfill(jsonResponse(200, { ...body, total: body.total + 5000, pages: 1 }))
    })
    const nyc = await seededEntity(api, 'nyc_office')
    const { dialog, editor } = await openAddMember(page, nyc.id)
    await expect(editor.getByTestId('role-picker-truncated')).toHaveText('Not every role could be loaded.')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })

  test('a pool larger than a page of search results lists every role', async ({ page, api }) => {
    // The picker is a UCommandPalette, which shows 12 results per group unless told otherwise;
    // an admin choosing roles must see the whole pool without searching.
    const extra = 14
    let served = 0
    await page.route(/\/roles\/entity\//, async (route) => {
      const response = await route.fetch()
      const body = await response.json() as { items: Array<Record<string, unknown>>, total: number } & Record<string, unknown>
      const template = body.items[0]
      const clones = Array.from({ length: extra }, (_unused, i) => ({
        ...template,
        id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        name: `pool_size_probe_${i}`,
        display_name: `Pool size probe ${String(i).padStart(2, '0')}`
      }))
      served = body.items.length + extra
      await route.fulfill(jsonResponse(200, { ...body, items: [...body.items, ...clones], total: body.total + extra }))
    })
    const nyc = await seededEntity(api, 'nyc_office')
    const { dialog, editor } = await openAddMember(page, nyc.id)
    await expect(editor.getByRole('option').filter({ hasText: 'Pool size probe 13' })).toHaveCount(1)
    const labels = await roleOptionLabels(editor)
    expect(labels).toHaveLength(served)
    expect(labels.length).toBeGreaterThan(12)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })

  test('the preview flags conditional and entity-only roles', async ({ page, api }) => {
    // Each role's conditions are looked up once, not again for every change to the selection.
    const conditionLookups: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'GET' && /\/roles\/[^/]+\/conditions$/.test(new URL(request.url()).pathname)) {
        conditionLookups.push(new URL(request.url()).pathname)
      }
    })

    const westCoast = await seededEntity(api, 'west_coast')
    const { dialog, editor } = await openAddMember(page, westCoast.id)
    const preview = editor.getByTestId('grant-preview')

    await editor.getByRole('option').filter({ hasText: 'West Coast Hierarchy Admin' }).click()
    await expect(preview).toContainText('Will grant')

    // West Coast After Hours Override carries ABAC conditions in the seed.
    await editor.getByRole('option').filter({ hasText: 'West Coast After Hours Override' }).click()
    await expect(preview).toContainText('Grants up to')
    await expect(preview.getByTestId('grant-preview-caveats').getByText('Conditional')).toBeVisible()

    // Removing and re-adding a role reuses what is already known.
    const selection = editor.getByTestId('role-access-selection')
    await selection.getByRole('button', { name: 'Remove West Coast Hierarchy Admin' }).click()
    await editor.getByRole('option').filter({ hasText: 'West Coast Hierarchy Admin' }).click()
    await expect(selection.getByRole('button', { name: 'Remove West Coast Hierarchy Admin' })).toBeVisible()
    await expect(preview.getByTestId('grant-preview-caveats').getByText('Conditional')).toBeVisible()
    expect(conditionLookups).toHaveLength(2)
    expect(new Set(conditionLookups).size).toBe(2)
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    // SF Office Local Admin is entity_only at San Francisco Office.
    const sf = await seededEntity(api, 'sf_office')
    const sfDialog = await openAddMember(page, sf.id)
    await sfDialog.editor.getByRole('option').filter({ hasText: 'SF Office Local Admin' }).click()
    const sfPreview = sfDialog.editor.getByTestId('grant-preview')
    await expect(sfPreview).toContainText('Grants up to')
    await expect(sfPreview.getByTestId('grant-preview-caveats').getByText('Entity only')).toBeVisible()
    await sfDialog.dialog.getByRole('button', { name: 'Cancel' }).click()
  })

  test('a system-wide role in a direct grant warns about access across organizations', async ({ page, api }) => {
    const acme = await seededEntity(api, 'acme_realty')
    const user = await api.createUser({ kind: 'role-kit', root_entity_id: acme.id })

    await page.goto(`/app/users/${user.id}`)
    // F-009: the page states where the account reaches (once the direct roles have loaded; a
    // cold dev server can take a while to answer them).
    await expect(detailItem(page, 'Access scope')).toContainText('Limited to this organization', { timeout: 20_000 })

    await userTabs(page).getByRole('link', { name: 'Access' }).click()
    await page.getByRole('button', { name: 'Assign roles' }).click()
    const dialog = page.getByRole('dialog', { name: 'Assign roles' })
    const editor = dialog.getByTestId('role-access-editor')
    await expect(editor.getByRole('option').first()).toBeVisible()

    // Direct pool: the user's organization roles and system-wide roles, never entity-local ones.
    const labels = await roleOptionLabels(editor)
    expect(labels).toContain('ACME Auditor')
    expect(labels).toContain('Team Lead')
    expect(labels).not.toContain('West Coast Hierarchy Admin')
    expect(labels).not.toContain('Summit Org Admin')

    await editor.getByRole('option').filter({ hasText: 'ACME Auditor' }).click()
    await expect(editor.getByTestId('role-access-cross-tenant')).toHaveCount(0)

    await roleOption(editor, 'Team Lead').click()
    const warning = editor.getByTestId('role-access-cross-tenant')
    await expect(warning).toContainText('Access across all organizations')
    await expect(warning).toContainText('Team Lead')

    await editor.getByTestId('role-access-selection').getByRole('button', { name: 'Remove Team Lead' }).click()
    await expect(warning).toHaveCount(0)

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
  })

  test('roles the actor cannot delegate are listed but disabled, with the reason', async ({ page, api }) => {
    // Present the superuser as a delegated admin holding lead:*, user, entity, role and
    // membership grants only (the console decides delegation from /users/me and /permissions/me;
    // the backend enforces the same rule on submit).
    await page.route(/\/users\/me$/, async (route) => {
      const response = await route.fetch()
      const me = await response.json() as Record<string, unknown>
      await route.fulfill(jsonResponse(200, { ...me, is_superuser: false }))
    })
    await page.route(/\/permissions\/me$/, route => route.fulfill(jsonResponse(200, [
      'lead:*', 'user:read_tree', 'entity:read_tree', 'role:read_tree', 'membership:read_tree',
      'membership:create_tree', 'membership:update_tree'
    ])))

    const nyc = await seededEntity(api, 'nyc_office')
    const { dialog, editor } = await openAddMember(page, nyc.id)

    const administrator = editor.getByRole('option').filter({ hasText: 'Administrator' })
    await expect(administrator).toBeDisabled()
    await expect(administrator).toContainText('You can\'t grant this role: you don\'t hold api_key:create')

    const agent = editor.getByRole('option').filter({ hasText: /^Agent/ })
    await expect(agent).toBeEnabled()
    await agent.click()
    await expect(editor.getByTestId('role-access-selection').getByRole('button', { name: 'Remove Agent' })).toBeVisible()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })

  test('Invite follows the actor\'s reach and membership:create_tree (F-012)', async ({ page, requires }) => {
    await requires({ features: ['invitations'], preset: 'EnterpriseRBAC' })
    // The signed-in admin, seen as a non-superuser with these grants. The invite endpoint needs
    // membership:create_tree at the entity, and a delegated (non-global) admin only sees an
    // invited account through that membership.
    let granted = ['user:read_tree', 'user:create', 'entity:read_tree', 'role:read_tree', 'membership:read_tree', 'membership:create']
    // Global scope comes from an active direct system-wide role.
    const systemWide = [{ id: 'm1', status: 'active', is_currently_valid: true, role: { id: 'r1', name: 'platform_ops', display_name: 'Platform ops', is_global: true, root_entity_id: null, scope_entity_id: null, status: 'active', permissions: [] } }]
    let directRoles: unknown[] = systemWide
    await page.route(/\/users\/me$/, async (route) => {
      const response = await route.fetch()
      const me = await response.json() as Record<string, unknown>
      await route.fulfill(jsonResponse(200, { ...me, is_superuser: false }))
    })
    await page.route(/\/permissions\/me$/, route => route.fulfill(jsonResponse(200, granted)))
    await page.route(/\/users\/[^/]+\/role-memberships(\?.*)?$/, route => route.fulfill(jsonResponse(200, directRoles)))

    // Global admin with plain membership:create: direct roles only.
    await page.goto('/app/users')
    await page.getByRole('button', { name: 'Invite', exact: true }).click()
    let dialog = page.getByRole('dialog', { name: 'Invite user' })
    await expect(dialog.getByLabel('Email')).toBeFocused()
    await expect(dialog.getByLabel('Entity', { exact: true })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    // Delegated admin with membership:create_tree: the entity is required.
    granted = [...granted.filter(name => name !== 'membership:create'), 'membership:create_tree']
    directRoles = []
    await page.reload()
    await page.getByRole('button', { name: 'Invite', exact: true }).click()
    dialog = page.getByRole('dialog', { name: 'Invite user' })
    await expect(dialog.getByLabel('Entity', { exact: true })).toBeVisible()
    await dialog.getByLabel('Email').fill('nobody@example.com')
    await dialog.getByRole('button', { name: 'Send invite' }).click()
    await expect(dialog.getByText('Choose the entity the account joins.')).toBeVisible()

    // Delegated admin without membership:create_tree: an invite would create an account they
    // could never see again, so there is none.
    granted = [...granted.filter(name => name !== 'membership:create_tree'), 'membership:create']
    await page.reload()
    await expect(page.getByRole('button', { name: 'Add user' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Invite', exact: true })).toHaveCount(0)
  })

  test('a role chip opens its permissions from the keyboard without popping a tooltip', async ({ page, api }) => {
    const target = await api.findUserByEmail(persona('agent').email)
    expectSeeded(target, 'the agent persona\'s account exists')
    await page.goto(`/app/users/${target!.id}?tab=access`)
    const chip = page.getByTestId('role-chip').first()
    await expect(chip).toBeVisible()
    // The name and permissions arrive with the role catalog: open the chip once they have.
    await expect(chip).not.toHaveAttribute('aria-busy', 'true')
    const label = (await chip.textContent())?.trim() ?? ''
    await chip.focus()
    await page.keyboard.press('Enter')
    const popover = page.getByRole('dialog').filter({ hasText: label })
    await expect(popover).toBeVisible()
    // The list is shown in full (names and descriptions) and takes the focus itself.
    await expect(popover.getByTestId('role-chip-permissions')).toBeFocused()
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(popover).toBeHidden()
  })

  test('Add membership keeps the picker disabled until an entity is chosen', async ({ page, api }) => {
    const acme = await seededEntity(api, 'acme_realty')
    const user = await api.createUser({ kind: 'role-kit-mem', root_entity_id: acme.id })

    await page.goto(`/app/users/${user.id}?tab=access`)
    await page.getByRole('button', { name: 'Add membership' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add membership' })
    const editor = dialog.getByTestId('role-access-editor')
    await expect(editor.getByText('Choose an entity to see the roles you can grant there.')).toBeVisible()
    await expect(editor.getByRole('option')).toHaveCount(0)

    await dialog.getByLabel('Entity', { exact: true }).click()
    await page.getByRole('option', { name: 'New York City Office' }).click()
    await expect(editor.getByRole('option').filter({ hasText: 'East Coast Hierarchy Admin' })).toBeVisible()
    expect(await roleOptionLabels(editor)).not.toContain('West Coast Hierarchy Admin')

    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })
})

test.describe('role access kit (delegated org admin)', () => {
  test.use({ storageState: personaState('orgAdmin') })

  test.beforeEach(async ({ requires }) => {
    await requires({ preset: 'EnterpriseRBAC', personas: ['orgAdmin'], surfaces: ['memberships', 'roles'] })
  })

  test('role chips show names, never ids, and open from the keyboard', async ({ page, api }) => {
    // Seeded users whose memberships carry system-wide roles the org admin cannot read.
    const targets: ApiUser[] = []
    for (const email of ['agent@sf.acme.com', 'lead@sf.acme.com', persona('orgAdmin').email]) {
      const found = await api.findUserByEmail(email)
      if (found) targets.push(found)
    }
    expect(targets.length).toBeGreaterThan(0)

    let chipsSeen = 0
    for (const target of targets) {
      await page.goto(`/app/users/${target.id}?tab=access`)
      await expect(page.getByRole('heading', { name: 'Memberships', exact: true })).toBeVisible()
      const chips = page.getByTestId('role-chip')
      await expect(chips.first()).toBeVisible()
      // Names arrive with the role catalog and the membership history; read them once settled.
      await expect(page.locator('[data-testid="role-chip"][aria-busy="true"]')).toHaveCount(0)
      const texts = await chips.allTextContents()
      chipsSeen += texts.length
      for (const text of texts) expect(text, `chip text on ${target.email}`).not.toMatch(UUID)
    }
    expect(chipsSeen).toBeGreaterThan(0)

    // F-132: the chip is a button: focus it and press Enter to see what it grants.
    const chip = page.getByTestId('role-chip').first()
    const label = (await chip.textContent())?.trim() ?? ''
    await chip.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog').filter({ hasText: label })).toBeVisible()
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    await page.keyboard.press('Escape')
  })

  test('a membership chip says it is loading, never that the role is unreadable, until its name arrives', async ({ page, api }) => {
    const me = await api.findUserByEmail(persona('orgAdmin').email)
    expect(me, 'org admin account').toBeTruthy()
    // Hold both sources of a membership role's name: the role catalog and the membership history.
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const holding: string[] = []
    await page.route(url => (url.pathname.endsWith('/roles/') && url.searchParams.has('page')) || url.pathname.endsWith('/membership-history'), async (route) => {
      holding.push(new URL(route.request().url()).pathname)
      await held
      await route.continue()
    })

    await page.goto(`/app/users/${me!.id}?tab=access`)
    const memberships = page.getByTestId('role-chip')
    const chip = memberships.first()
    await expect(chip).toHaveText('Loading role...')
    await expect(chip).toHaveAttribute('aria-busy', 'true')
    expect(holding.some(path => path.endsWith('/membership-history'))).toBe(true)
    await chip.click()
    const popover = page.getByRole('dialog').filter({ hasText: 'Loading this role...' })
    await expect(popover).toBeVisible()
    await expect(page.getByText('This role is outside the roles you can read.')).toHaveCount(0)
    await expect(page.getByText('Unknown role')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(popover).toBeHidden()

    release()
    await expect(page.locator('[data-testid="role-chip"][aria-busy="true"]')).toHaveCount(0)
    await expect(chip).not.toHaveText(/^(Loading role\.\.\.|Unknown role)$/)
    await expect(chip).not.toHaveText(UUID)
  })
})

// A global admin who is not a superuser, simulated on the org admin's session: /permissions/me
// gains membership:create_tree and their direct roles gain a system-wide one, so they are seen
// as global (useActorReach). The real org admin gets no Invite at all (org-admin-users.spec.ts).
test.describe('role access kit (global non-superuser admin, simulated)', () => {
  test.use({ storageState: personaState('orgAdmin') })

  test.beforeEach(async ({ requires }) => {
    await requires({ preset: 'EnterpriseRBAC', personas: ['orgAdmin'], surfaces: ['memberships', 'roles'] })
  })

  test('Invite states in one line that no roles can be granted directly', async ({ page, requires }) => {
    await requires({ features: ['invitations'] })
    // Their own grants still reach no system-wide role, so the direct-roles pool stays empty.
    await page.route(/\/permissions\/me$/, async (route) => {
      const response = await route.fetch()
      const granted = await response.json() as string[]
      await route.fulfill(jsonResponse(200, [...granted, 'membership:create_tree']))
    })
    await page.route(/\/users\/[^/]+\/role-memberships(\?.*)?$/, route => route.fulfill(jsonResponse(200, [
      { id: 'm1', status: 'active', is_currently_valid: true, role: { id: 'r1', name: 'platform_ops', display_name: 'Platform ops', is_global: true, root_entity_id: null, scope_entity_id: null, status: 'active', permissions: [] } }
    ])))
    await page.goto('/app/users')
    await page.getByRole('button', { name: 'Invite', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Invite user' })
    // System-wide roles are the only direct grants for a user without an organization, and the
    // org admin can grant none of them: no empty picker and preview, just the reason.
    await expect(dialog.getByTestId('role-access-empty')).toHaveText('No roles can be granted directly.')
    await expect(dialog.getByTestId('role-access-editor')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })
})

test.describe('role access kit (any preset)', () => {
  test('Invite puts the focus on Email, not on the role search (F-131)', async ({ page, requires }) => {
    await requires({ features: ['invitations'], surfaces: ['users', 'roles'] })
    await page.goto('/app/users')
    await page.getByRole('button', { name: 'Invite', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Invite user' })
    await expect(dialog.getByLabel('Email')).toBeFocused()
    // Still on Email once the role picker has rendered.
    await expect(dialog.getByTestId('role-access-editor').getByRole('option').first()).toBeVisible()
    await expect(dialog.getByLabel('Email')).toBeFocused()
    await expect(dialog.getByPlaceholder('Search roles...')).not.toBeFocused()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })

  test('SimpleRBAC: direct roles have no type badges and no cross-tenant warning', async ({ page, api, requires }) => {
    await requires({ preset: 'SimpleRBAC', surfaces: ['users', 'roles'] })
    const user = await api.createUser({ kind: 'role-kit-simple' })
    // The seeded roles (other specs create and archive run-marked roles in parallel, so those
    // may come and go while this test runs).
    const roles = (await api.listAll<ApiRoleRow>('/roles/')).filter(r => !r.display_name.startsWith('PW E2E'))
    const active = roles.filter(r => r.status === 'active').map(r => r.display_name).sort()
    const inactive = roles.filter(r => r.status !== 'active').map(r => r.display_name)

    await page.goto(`/app/users/${user.id}?tab=access`)
    await page.getByRole('button', { name: 'Assign roles' }).click()
    const dialog = page.getByRole('dialog', { name: 'Assign roles' })
    const editor = dialog.getByTestId('role-access-editor')
    await expect(editor.getByRole('option').first()).toBeVisible()
    const labels = await roleOptionLabels(editor)
    expect(labels.filter(label => !label.startsWith('PW E2E')).sort()).toEqual(active)
    for (const name of inactive) expect(labels).not.toContain(name)
    await expect(editor.getByText('System-wide')).toHaveCount(0)

    await editor.getByRole('option').first().click()
    await expect(editor.getByTestId('role-access-selection').getByRole('button', { name: /^Remove / })).toHaveCount(1)
    await expect(editor.getByTestId('role-access-cross-tenant')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })
})
