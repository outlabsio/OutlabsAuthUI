import type { Locator, Page } from '@playwright/test'

// Helpers for the app shell (layouts/default.vue): the user menu in the sidebar footer, the
// command palette and the mobile drawer. Selectors are role-first, like the rest of the suite.

// The sidebar footer's user menu trigger ("<name>, user menu").
export function userMenuButton(page: Page): Locator {
  return page.getByRole('button', { name: /user menu$/i })
}

// Open the user menu. The trigger is focused and opened from the keyboard: at 390px the dev
// target's Nuxt devtools launcher sits over the drawer footer and would swallow a pointer click.
export async function openUserMenu(page: Page): Promise<Locator> {
  const trigger = userMenuButton(page)
  await trigger.focus()
  await page.keyboard.press('Enter')
  const menu = page.getByRole('menu')
  await menu.first().waitFor()
  return menu.first()
}

// Sign out from the shell (user menu > Sign out).
export async function signOutFromShell(page: Page): Promise<void> {
  const menu = await openUserMenu(page)
  await menu.getByRole('menuitem', { name: 'Sign out' }).click()
}

// Open one of the user menu's pages (Account, My API keys).
export async function openUserMenuPage(page: Page, name: string): Promise<void> {
  const menu = await openUserMenu(page)
  await menu.getByRole('menuitem', { name, exact: true }).click()
}

// The user menu's page links, as { name, href }; the menu is closed again afterwards.
export async function userMenuLinks(page: Page): Promise<{ name: string, href: string }[]> {
  const menu = await openUserMenu(page)
  const links = menu.locator('a[role="menuitem"]')
  const result = await links.evaluateAll(nodes => nodes.map(node => ({
    name: (node.textContent ?? '').trim(),
    href: node.getAttribute('href') ?? ''
  })))
  await page.keyboard.press('Escape')
  await menu.waitFor({ state: 'detached' })
  return result
}

// The sidebar's navigation landmarks (main sections and the bottom list).
export function sidebarNav(page: Page): Locator {
  return page.getByRole('navigation', { name: /^Console / })
}

// Cmd/Ctrl+K as the console reads it: Nuxt UI treats "meta" as Ctrl unless the user agent is
// macOS (Playwright's Desktop Chrome device reports Windows), whatever the host OS is.
export async function pressPaletteShortcut(page: Page): Promise<void> {
  const mac = await page.evaluate(() => /Macintosh;/.test(navigator.userAgent))
  await page.keyboard.press(mac ? 'Meta+k' : 'Control+k')
}

// The command palette dialog (UDashboardSearch).
export function commandPalette(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Search the console' })
}

// The furthest any element inside the main landmark is scrolled (panel bodies, or a table that
// scrolls inside its panel).
export async function mainScrollOffset(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('#main-content *')].map(element => element.scrollTop)))
}

// Navigate inside the running SPA through its router (a client-side push, like a page's own
// query-driven tab or anchor link). Only for shell behaviour no shipped page triggers yet;
// prefer clicking real links. Nuxt mounts the app on #__nuxt.
export async function routerPush(page: Page, location: string): Promise<void> {
  await page.evaluate(async (to) => {
    type Router = { push: (location: string) => Promise<unknown> }
    const root = document.querySelector('#__nuxt') as (Element & { __vue_app__?: { config: { globalProperties: { $router?: Router } } } }) | null
    const router = root?.__vue_app__?.config.globalProperties.$router
    if (!router) throw new Error('The console router is not mounted on #__nuxt.')
    await router.push(to)
  }, location)
}

// A dashboard panel's scroll container. UDashboardPanel renders it as "dashboard-panel-<id>", and
// the console's scroll and focus memory (app/navigation/panel-memory.ts) keys on that id, so the
// id is the contract under test here, not a stand-in for an accessible name.
export function dashboardPanel(page: Page, id: string) {
  return page.locator(`[id="dashboard-panel-${id}"]`)
}
