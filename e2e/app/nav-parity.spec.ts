import type { Page } from '@playwright/test'
import { expect, personaState, test, type PersonaKey } from '../support/fixtures'
import { apiRoot, GATE_STATE_TITLES, sidebarLinks } from '../support/capabilities'
import type { Preset } from '../support/personas'
import { readRunManifest } from '../support/run-manifest'
import { userMenuLinks } from '../support/shell'

// Nav visibility == page visibility (F-007/F-052). For each persona, every sidebar item must
// open a USABLE page in place — no redirect, no "No access to …" lock, no "Not available" state,
// no "Could not load …" alert and no failed (4xx/5xx) API call while it loads — because the
// sidebar, the route guard and AppPermissionGate read one requirement table and every query on
// the page is gated on the same grants.
// Every persona of the preset x persona matrix (F-037) runs this on the preset that has it, from
// its minted storage state (no login here); the expected nav pins what each grant set unlocks.

// Nav label (sidebar or user menu) -> the page's navbar title.
const PAGE_TITLE: Record<string, string> = {
  'Dashboard': 'Dashboard',
  'Users': 'Users',
  'Roles': 'Roles',
  'Permissions': 'Permissions',
  'My API keys': 'My API keys',
  'Service accounts': 'Service accounts',
  'Entities': 'Entities',
  'Audit': 'Audit',
  'Settings': 'Settings',
  'Account': 'Account'
}

// Each visit boots the SPA; a full sidebar is ~10 page loads.
test.describe.configure({ timeout: 120_000 })

// The error UAlert every workspace/card renders when its query fails.
const LOAD_ERROR_TITLE = /^Could not load /

async function expectEveryNavItemOpens(page: Page) {
  // Every failed auth-API response, attributed to the nav item being opened. A page that renders
  // but whose list query is denied (e.g. an ungated catalog fetch) is not usable.
  const failedCalls: string[] = []
  let opening = 'Dashboard'
  page.on('response', (response) => {
    const url = response.url()
    if (response.status() < 400 || !url.startsWith(apiRoot)) return
    failedCalls.push(`${opening}: ${response.request().method()} ${url.slice(apiRoot.length)} -> ${response.status()}`)
  })

  await page.goto('/app/dashboard')
  // Sidebar sections, then the user menu's own pages (Account, My API keys).
  const links = [...await sidebarLinks(page), ...await userMenuLinks(page)]
  expect(links.length).toBeGreaterThan(0)
  for (const { name, href } of links) {
    opening = name
    await page.goto(href)
    await expect(page, `${name} must not redirect`).toHaveURL(new RegExp(`${href.replace(/\//g, '\\/')}$`))
    await expect(page.getByRole('heading', { name: PAGE_TITLE[name] ?? name, exact: true }).first()).toBeVisible()
    // Let the page's queries settle before judging it.
    await page.waitForLoadState('networkidle')
    expect(failedCalls, `no auth-API call may fail while opening ${name}`).toEqual([])
    await expect(page.getByRole('heading', { name: GATE_STATE_TITLES }), `${name} must not render a gate state`).toHaveCount(0)
    await expect(page.getByText(LOAD_ERROR_TITLE), `${name} must not render a load error`).toHaveCount(0)
  }
  expect(failedCalls, 'no auth-API call may fail while opening the visible nav items').toEqual([])
  return links.map(l => l.name)
}

// Each persona's sidebar + user-menu items, per preset (null = the preset has no such persona).
// The user menu reads Account, My API keys (v-auth-shell-07).
const SECTIONS_ALL = ['Dashboard', 'Users', 'Entities', 'Roles', 'Permissions', 'Service accounts', 'Audit', 'Settings', 'Account', 'My API keys']
const SECTIONS_SIMPLE_ADMIN = ['Dashboard', 'Users', 'Roles', 'Permissions', 'Service accounts', 'Settings', 'Account', 'My API keys']
const MINIMAL = ['Dashboard', 'Account', 'My API keys']

const MATRIX: Array<{ key: PersonaKey, who: string, nav: Record<Preset, string[] | null> }> = [
  { key: 'admin', who: 'superuser', nav: { EnterpriseRBAC: SECTIONS_ALL, SimpleRBAC: SECTIONS_SIMPLE_ADMIN } },
  // Settings is for admins (F-186).
  { key: 'agent', who: 'low-privilege agent', nav: { EnterpriseRBAC: MINIMAL, SimpleRBAC: MINIMAL } },
  { key: 'writer', who: 'SimpleRBAC writer', nav: { EnterpriseRBAC: null, SimpleRBAC: MINIMAL } },
  // membership:read_tree / api_key:read_tree / entity:read_tree count as the base grants. The
  // organization admins read the permission catalog (permission:read) too.
  { key: 'orgAdmin', who: 'delegated org admin', nav: { EnterpriseRBAC: SECTIONS_ALL, SimpleRBAC: null } },
  { key: 'summitAdmin', who: 'second-organization admin', nav: { EnterpriseRBAC: SECTIONS_ALL, SimpleRBAC: null } },
  // Reads every section (api_key:read and permission:read included) and changes nothing.
  { key: 'auditor', who: 'read-only auditor', nav: { EnterpriseRBAC: SECTIONS_ALL, SimpleRBAC: null } },
  // The permission catalog and role reads only: no user:read, so no Users and no Audit (whose
  // search needs user:read).
  {
    key: 'permissionsAdmin',
    who: 'permission-catalog admin',
    nav: { EnterpriseRBAC: ['Dashboard', 'Roles', 'Permissions', 'Settings', 'Account', 'My API keys'], SimpleRBAC: null }
  },
  { key: 'globalAdmin', who: 'non-superuser global admin', nav: { EnterpriseRBAC: SECTIONS_ALL, SimpleRBAC: SECTIONS_SIMPLE_ADMIN } }
]

for (const { key, who, nav } of MATRIX) {
  test.describe(`nav parity: ${who} (${key})`, () => {
    test.use({ storageState: personaState(key) })

    test('every nav item opens a usable page and the nav is exactly the persona\'s', async ({ page, requires }) => {
      await requires({ personas: [key] })
      const preset = readRunManifest()?.preset
      const expected = preset ? nav[preset] : undefined
      test.skip(!expected, `No ${key} persona on ${preset ?? 'this backend'}.`)
      const names = await expectEveryNavItemOpens(page)
      expect(names).toEqual(expected)
    })
  })
}
