import { expect, type Page } from '@playwright/test'

// Search the users list and wait until the table shows only the search result. The search is
// debounced: a row that is already visible before the filtered response arrives is re-rendered
// when it lands, which closes a row menu opened in between. Wait for the filtered answer and
// for every other row to leave before opening a row's menu.
export async function searchUsersList(page: Page, term: string) {
  const filtered = page.waitForResponse(response => response.request().method() === 'GET'
    && /\/users\/?$/.test(new URL(response.url()).pathname)
    && new URL(response.url()).searchParams.get('search') === term)
  await page.getByPlaceholder('Search users...').fill(term)
  await filtered
  const rows = page.locator('tbody tr')
  await expect(rows.filter({ hasText: term })).toHaveCount(1)
  await expect(rows).toHaveCount(1)
}

// Open a row's action menu by its trigger's name. A click that lands while the table re-renders
// (a list answer arriving) opens nothing, or a menu that closes at once: click again until the
// menu stays open. Returns the open menu.
export async function openRowMenu(page: Page, name: string) {
  const trigger = page.getByRole('button', { name, exact: true })
  const menu = page.getByRole('menu')
  await expect(async () => {
    if (!(await menu.isVisible())) await trigger.click()
    await expect(menu).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 15_000 })
  return menu
}
