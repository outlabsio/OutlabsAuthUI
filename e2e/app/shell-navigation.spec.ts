import type { Page } from '@playwright/test'
import type { ApiClient } from '../support/api-client'
import { backendConfigured, expect, personaState, test } from '../support/fixtures'
import { apiRoot, sidebarLinks } from '../support/capabilities'
import { onPath } from '../support/session'
import { treeRow } from '../support/entities'
import { mintFreshSession } from '../support/sessions'
import { commandPalette, dashboardPanel, mainScrollOffset, openUserMenu, pressPaletteShortcut, routerPush, sidebarNav, userMenuButton, userMenuLinks } from '../support/shell'

// WP-08: the app shell (layouts/default.vue, app.vue, router.options.ts). Titles, landmarks and
// the skip link (F-130), the active section on detail pages (F-211), the command palette
// (F-212), the user menu with colour mode and sign-out (F-213), grouped navigation (F-214),
// history-aware back links (F-216), scroll and focus restoration (F-217), reduced motion and
// loading announcements (F-224), and the 390px drawer toggle on every route (F-129).
// Admin persona unless a test says otherwise; nothing here mutates seed data.

// The first record of a list endpoint (a detail page to open).
async function firstId(api: ApiClient, path: string): Promise<string> {
  const list = await api.get<{ items: { id: string }[] }>(path, { query: { page: 1, limit: 1 } })
  const id = list.items[0]?.id
  if (!id) throw new Error(`No record at ${path} to open.`)
  return id
}

async function panelHeading(page: Page, name: string | RegExp) {
  await expect(page.locator('[data-slot="title"]').filter({ hasText: name }).first()).toBeVisible()
}

test.describe('app shell: routes, titles and landmarks', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('/app redirects to the dashboard', async ({ page }) => {
    await page.goto('/app')
    await expect(page).toHaveURL(onPath('/app/dashboard'))
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })

  test('every route has its own document title and the route change is announced', async ({ page }) => {
    const titles: string[] = []
    for (const path of ['/app/dashboard', '/app/users', '/app/roles', '/app/permissions', '/app/settings', '/app/account']) {
      await page.goto(path)
      await expect(page).toHaveTitle(/ · /)
      titles.push(await page.title())
    }
    expect(new Set(titles).size, titles.join(' | ')).toBe(titles.length)
    expect(titles[1]).toMatch(/^Users · /)

    // A record page is titled after the record, under its section; the route announcer (a
    // polite live region) reads the new title after the client-side navigation.
    await page.goto('/app/roles')
    await page.getByRole('link', { name: 'Administrator' }).click()
    await expect(page).toHaveTitle(/^Administrator · Roles · /)
    await expect(page.locator('.nuxt-route-announcer [aria-live="polite"]')).toHaveText(await page.title())
  })

  test('the skip link moves focus to the single main landmark', async ({ page }) => {
    await page.goto('/app/users')
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
    await expect(page.getByRole('main')).toHaveCount(1)

    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to main content' })
    await expect(skip).toBeFocused()
    expect((await skip.boundingBox())?.width ?? 0, 'the focused skip link is visible').toBeGreaterThan(40)

    await page.keyboard.press('Enter')
    await expect(page.getByRole('main')).toBeFocused()
    // No fragment navigation, and the next Tab lands inside the page, past the sidebar.
    await expect(page).toHaveURL(onPath('/app/users'))
    expect(new URL(page.url()).hash).toBe('')
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => document.getElementById('main-content')?.contains(document.activeElement) ?? false)).toBe(true)
  })

  test('detail pages keep their section active in the sidebar', async ({ page, api }) => {
    await page.goto('/app/roles')
    const roles = sidebarNav(page).getByRole('link', { name: 'Roles', exact: true })
    await expect(roles).toHaveAttribute('aria-current', 'page')

    await page.getByRole('link', { name: 'Administrator' }).click()
    await expect(page).toHaveURL(/\/app\/roles\/[0-9a-f-]+$/)
    await expect(roles).toHaveAttribute('aria-current', 'true')
    await expect(sidebarNav(page).locator('[aria-current]')).toHaveCount(1)

    await page.goto(`/app/users/${await firstId(api, '/users/')}`)
    await panelHeading(page, /@/)
    await expect(sidebarNav(page).getByRole('link', { name: 'Users', exact: true })).toHaveAttribute('aria-current', 'true')
    await expect(roles).not.toHaveAttribute('aria-current', /./)
  })
})

test.describe('app shell: back navigation and scroll memory', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('a deep-linked detail page falls back to its list', async ({ page, api }) => {
    await page.goto(`/app/roles/${await firstId(api, '/roles/')}`)
    const back = page.getByRole('link', { name: 'Back to Roles' })
    await expect(back).toHaveAttribute('href', '/app/roles')
    await back.click()
    await expect(page).toHaveURL(onPath('/app/roles'))
  })

  test('after an in-page (query) navigation, Back leaves the record for its list', async ({ page }) => {
    await page.goto('/app/roles')
    await page.getByRole('link', { name: 'Administrator' }).click()
    await expect(page).toHaveURL(/\/app\/roles\/[0-9a-f-]+$/)
    const recordPath = new URL(page.url()).pathname
    const back = page.getByRole('link', { name: 'Back to Roles' })
    await expect(back).toBeVisible()

    // A query-driven tab of the same record (as a detail page with tabs would push). The
    // previous history entry is now the record itself, not the list: Back must not step back
    // through the record's own states.
    await routerPush(page, `${recordPath}?tab=permissions`)
    await expect(page).toHaveURL(/\?tab=permissions$/)
    await expect(back).toHaveAttribute('href', '/app/roles')
    await back.click()
    await expect(page).toHaveURL(onPath('/app/roles'))
    await expect(page.getByRole('link', { name: 'Administrator' })).toBeVisible()
  })

  test('a #hash on a console page scrolls its anchor into view inside the panel', async ({ page, requires }) => {
    await requires({ surfaces: ['permissions'] })
    await page.setViewportSize({ width: 1280, height: 600 })
    await page.goto('/app/permissions')
    const rows = dashboardPanel(page, 'permissions').locator('tbody tr')
    await expect(rows.nth(12)).toBeVisible()
    // No shipped page links to an anchor yet: mark a row far down as one.
    const anchor = rows.nth(Math.min(await rows.count() - 1, 18))
    await anchor.evaluate((row) => {
      row.id = 'e2e-anchor'
    })
    await expect(anchor).not.toBeInViewport()

    await routerPush(page, '/app/permissions#e2e-anchor')
    await expect(anchor).toBeInViewport()
    expect(await mainScrollOffset(page), 'the panel scrolled, not the window').toBeGreaterThan(100)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
  })

  test('Back returns to where the user came from: entity -> member -> Back', async ({ page, requires }) => {
    await requires({ surfaces: ['entities', 'memberships'], preset: 'EnterpriseRBAC' })
    // The San Francisco Office is a seeded entity with a direct member (manager@sf.acme.com).
    await page.goto('/app/entities')
    await page.getByPlaceholder('Search entities...').fill('San Francisco Office')
    await treeRow(page, 'San Francisco Office').click()
    await expect(page).toHaveURL(/\/app\/entities\?(.*&)?entity=[0-9a-f-]+/)
    const entityUrl = page.url()
    await page.getByRole('row').filter({ hasText: 'manager@sf.acme.com' }).getByRole('link').first().click()
    await expect(page).toHaveURL(/\/app\/users\/[0-9a-f-]+$/)

    // History, not the Users list: the link names where it goes and returns to the entity.
    const back = page.getByRole('link', { name: 'Back to Entities' })
    await expect(back).toBeVisible()
    await back.click()
    await expect(page).toHaveURL(entityUrl)
    await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible()
  })

  test('Back restores the list scroll position and focus', async ({ page, requires }) => {
    await requires({ surfaces: ['permissions'] })
    await page.setViewportSize({ width: 1280, height: 600 })
    await page.goto('/app/permissions')
    const panel = dashboardPanel(page, 'permissions')
    const links = panel.locator('tbody a[href^="/app/permissions/"]')
    await expect(links.nth(12)).toBeVisible()

    // Scroll to a row far down. The window never scrolls in the dashboard: the panel (here, the
    // table inside it) does.
    const target = links.nth(Math.min(await links.count() - 1, 18))
    await target.scrollIntoViewIfNeeded()
    const scrolled = await mainScrollOffset(page)
    expect(scrolled, 'the permissions list scrolls at this height').toBeGreaterThan(100)
    const href = (await target.getAttribute('href'))!

    // Open it from the keyboard, then use the detail page's history-aware back link.
    await target.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(onPath(href))
    await page.getByRole('link', { name: 'Back to Permissions' }).click()
    await expect(page).toHaveURL(onPath('/app/permissions'))

    await expect.poll(() => mainScrollOffset(page)).toBeGreaterThanOrEqual(scrolled - 2)
    await expect(panel.locator(`a[href="${href}"]`)).toBeFocused()

    // The browser's own Back/Forward does the same.
    await page.goForward()
    await expect(page).toHaveURL(onPath(href))
    await page.goBack()
    await expect(page).toHaveURL(onPath('/app/permissions'))
    await expect.poll(() => mainScrollOffset(page)).toBeGreaterThanOrEqual(scrolled - 2)
  })
})

test.describe('app shell: user menu', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('the collapsed sidebar keeps the user menu, with appearance and sign-out', async ({ page }) => {
    await page.goto('/app/dashboard')
    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    await expect(sidebarNav(page).getByText('Directory', { exact: true })).toHaveCount(0)
    await expect(userMenuButton(page)).toBeVisible()

    const menu = await openUserMenu(page)
    for (const name of ['Account', 'My API keys', 'Appearance', 'Sign out']) {
      await expect(menu.getByRole('menuitem', { name })).toBeVisible()
    }

    // Appearance: the choice applies at once and the browser chrome colour follows it.
    await menu.getByRole('menuitem', { name: 'Appearance' }).press('ArrowRight')
    await page.getByRole('menuitemcheckbox', { name: 'Light' }).click()
    await expect(page.locator('html')).toHaveClass(/(^|\s)light(\s|$)/)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#ffffff')
    await page.getByRole('menuitemcheckbox', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#18181b')
    await expect(page.getByRole('menuitemcheckbox', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
  })

  test('signs out from the collapsed sidebar\'s user menu', async ({ api, sessionContext }) => {
    // A fresh session: signing out revokes it server-side, never do that to a shared persona.
    const { tokens } = await mintFreshSession(api, 'shell')
    const context = await sessionContext(tokens)
    const page = await context.newPage()
    await page.goto('/app/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    const menu = await openUserMenu(page)
    await menu.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/auth\/login/)
  })
})

test.describe('app shell: command palette', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  // One order everywhere: "Go to" lists the sidebar top to bottom, then the user menu, so a
  // destination sits in the same place in all three (v-auth-shell-07).
  test('"Go to" lists the sections in the order of the sidebar and the user menu', async ({ page }) => {
    await page.goto('/app/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    const sidebar = await sidebarNav(page).getByRole('link').allTextContents()
    const userMenu = (await userMenuLinks(page)).map(link => link.name)
    await page.getByRole('button', { name: /^Search/ }).click()
    const palette = commandPalette(page)
    const goTo = palette.getByRole('group', { name: 'Go to' }).getByRole('option')
    await expect(goTo.first()).toBeVisible()
    const names = (await goTo.allTextContents()).map(name => name.trim())
    expect(names).toEqual([...sidebar.map(name => name.trim()), ...userMenu])
    expect(userMenu).toEqual(['Account', 'My API keys'])
  })

  test('jumps to a section and to a record found on the server', async ({ page, api }) => {
    const me = await api.me()
    await page.goto('/app/dashboard')
    await page.getByRole('button', { name: /^Search/ }).click()
    const palette = commandPalette(page)
    await expect(palette.getByRole('option', { name: 'Roles', exact: true })).toBeVisible()
    await expect(palette.getByRole('option', { name: 'My API keys' })).toBeVisible()

    // Keyboard only: filter, the first match is highlighted, Enter opens it.
    await page.keyboard.type('permiss')
    await expect(palette.locator('[role="option"][data-highlighted]')).toHaveText(/^Permissions/)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(onPath('/app/permissions'))
    await expect(palette).toHaveCount(0)

    // Records: the Users group searches the server (debounced) and opens the user detail.
    await pressPaletteShortcut(page)
    await expect(palette).toBeVisible()
    await page.keyboard.type(me.email)
    // Other seeded addresses contain this one (org-admin@…), so match the exact email text.
    const result = palette.getByRole('option').filter({ has: page.getByText(me.email, { exact: true }) })
    await expect(result).toBeVisible()
    await result.click()
    await expect(page).toHaveURL(onPath(`/app/users/${me.id}`))
    await expect(page).toHaveTitle(new RegExp(`^${me.email.replace(/[.+]/g, '\\$&')} · Users · `))
  })

  test('a low-privilege actor only searches what it can open', async ({ requires, sessionContext }) => {
    await requires({ personas: ['agent'] })
    const context = await sessionContext(personaState('agent'))
    const page = await context.newPage()
    const recordSearches: string[] = []
    page.on('request', (request) => {
      if (request.url().startsWith(apiRoot) && /\/(users|roles|entities)\/\?/.test(request.url())) recordSearches.push(request.url())
    })
    await page.goto('/app/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await pressPaletteShortcut(page)
    const palette = commandPalette(page)
    await expect(palette.getByPlaceholder('Search pages and actions…')).toBeVisible()
    await expect(palette.getByRole('option', { name: 'Users', exact: true })).toHaveCount(0)
    await page.keyboard.type('admin')
    await page.waitForTimeout(800)
    await expect(palette.getByText('Users', { exact: true })).toHaveCount(0)
    expect(recordSearches).toEqual([])
  })
})

test.describe('app shell: command palette (delegated org admin)', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('record search works within tree-scoped grants, with no failed API call', async ({ requires, sessionContext }) => {
    await requires({ personas: ['orgAdmin'], surfaces: ['entities'] })
    const context = await sessionContext(personaState('orgAdmin'))
    const page = await context.newPage()
    const failed: string[] = []
    page.on('response', (response) => {
      if (response.url().startsWith(apiRoot) && response.status() >= 400) failed.push(`${response.status()} ${response.url().slice(apiRoot.length)}`)
    })
    await page.goto('/app/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await pressPaletteShortcut(page)
    const palette = commandPalette(page)
    // user:read_tree, role:read and entity:read_tree, but no permission:read.
    await expect(palette.getByPlaceholder('Search pages, users, roles and entities…')).toBeVisible()
    await expect(palette.getByRole('option', { name: 'Permissions', exact: true })).toHaveCount(0)
    await page.keyboard.type('acme')
    await expect(palette.getByRole('option').filter({ hasText: '@' }).first()).toBeVisible()
    await expect(palette.getByRole('option', { name: /^ACME Realty/ })).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(failed).toEqual([])
  })
})

test.describe('app shell: motion and loading', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('dialogs skip their transitions under prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/app/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await pressPaletteShortcut(page)
    const dialog = commandPalette(page)
    await expect(dialog).toBeVisible()
    expect(await dialog.getAttribute('class')).not.toMatch(/animate-/)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)

    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await pressPaletteShortcut(page)
    await expect(dialog).toBeVisible()
    expect(await dialog.getAttribute('class')).toMatch(/animate-/)
  })

  test('a loading list is announced as a status', async ({ page, requires }) => {
    await requires({ surfaces: ['integration_principals'], features: ['system_api_keys'] })
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(/\/integration-principals/, async (route) => {
      await held
      await route.continue()
    })
    await page.goto('/app/service-accounts')
    // The service-account list's placeholder (not the boot splash, "Loading console").
    const loading = page.getByRole('status').filter({ hasText: /^\s*Loading service accounts\s*$/ })
    await expect(loading).toBeVisible()
    release()
    await expect(loading).toHaveCount(0)
  })
})

// Section titles still truncated at 390px by a labelled primary action (none today).
const TITLE_TRUNCATION_PENDING = new Set<string>()

test.describe('app shell at 390px', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ viewport: { width: 390, height: 844 } })
  test.describe.configure({ timeout: 120_000 })

  test('the drawer toggle and page title stay on screen on every route', async ({ page, api }) => {
    // Every page the admin can open: the sidebar, the user menu and a record page.
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/app/dashboard')
    const paths = [
      ...(await sidebarLinks(page)).map(link => link.href),
      ...(await userMenuLinks(page)).map(link => link.href),
      `/app/roles/${await firstId(api, '/roles/')}`,
      `/app/users/${await firstId(api, '/users/')}`
    ]
    const sectionPaths = new Set(paths.slice(0, -2))
    await page.setViewportSize({ width: 390, height: 844 })

    for (const path of paths) {
      await page.goto(path)
      const toggle = page.getByRole('button', { name: 'Open sidebar' })
      await expect(toggle, `${path}: drawer toggle`).toBeVisible()
      const box = (await toggle.boundingBox())!
      expect(box.x, `${path}: toggle on screen`).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, `${path}: toggle on screen`).toBeLessThanOrEqual(390)
      const title = page.locator('[data-slot="title"]').first()
      await expect(title, `${path}: navbar title`).toBeVisible()
      expect((await title.boundingBox())!.width, `${path}: title not squeezed out`).toBeGreaterThan(30)
      // A section's own name must be readable in full (a record's name may truncate).
      if (sectionPaths.has(path) && !TITLE_TRUNCATION_PENDING.has(path)) {
        const truncated = await title.evaluate(element => element.scrollWidth > element.clientWidth)
        expect(truncated, `${path}: section title is not truncated`).toBe(false)
      }
    }
  })

  test('the drawer holds the grouped navigation and the user menu', async ({ page }) => {
    await page.goto('/app/dashboard')
    await page.getByRole('button', { name: 'Open sidebar' }).click()
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByRole('link', { name: 'Users', exact: true })).toBeVisible()
    await expect(drawer.getByText('Directory', { exact: true })).toBeVisible()
    const menu = await openUserMenu(page)
    await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeVisible()
    await page.keyboard.press('Escape')

    // Navigating closes the drawer.
    await drawer.getByRole('link', { name: 'Roles', exact: true }).click()
    await expect(page).toHaveURL(onPath('/app/roles'))
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

test.describe('guest pages: window scrolling', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 180 } })

  test('a same-page #hash scrolls the window to its anchor, and clearing it returns to the top', async ({ page }) => {
    await page.goto('/auth/login')
    // The sign-in card's last method: the email form's submit or a "Continue with ..." choice,
    // depending on the server's sign-in methods.
    const anchor = page.getByRole('button', { name: /^(Continue with .+|Sign in)$/ }).last()
    await expect(anchor).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight), 'the sign-in page scrolls at this height').toBe(true)
    // No guest page links to an anchor yet: mark that button as one.
    await anchor.evaluate((button) => {
      button.id = 'e2e-anchor'
    })
    await expect(anchor).not.toBeInViewport()
    expect(await page.evaluate(() => window.scrollY)).toBe(0)

    await routerPush(page, '/auth/login#e2e-anchor')
    await expect(anchor).toBeInViewport()
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

    await routerPush(page, '/auth/login')
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  })
})
