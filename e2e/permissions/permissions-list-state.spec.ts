import type { Page, Request } from '@playwright/test'
import { expect, test } from '../support/fixtures'
import { apiUrl } from '../support/env'
import { chooseSelect, field } from '../support/ui-select'

// The permissions list is the reference for the shared list conventions (useListQueryState +
// AppQueryState + AppListPagination): filters in the route query, a debounced search, server
// pages with the true total, previous rows kept while the next page loads, and "no matches"
// distinct from "none". Runs on both presets; the backend always has a permissions catalogue.

const PAGE_SIZE = 25

type PermissionPage = { total: number, items: Array<{ id: string, name: string, resource?: string | null }> }

const isListRequest = (request: Request) => request.method() === 'GET' && request.url().startsWith(apiUrl('/permissions/?'))
const pageParam = (request: Request) => new URL(request.url()).searchParams

// The list footer's total (AppListPagination), not the "Loading permissions" status.
function summary(page: Page) {
  return page.getByRole('status').filter({ hasText: /^(Showing \d|\d+ permissions?$|No permissions)/ })
}

test.describe('permissions list state', () => {
  test.use({ errorGuardMode: 'strict' })

  test.beforeEach(async ({ requires }) => {
    await requires({ backend: true, surfaces: ['permissions'] })
  })

  test('pages on the server with the true total and keeps rows while the next page loads', async ({ page, api }) => {
    // Make sure there is a second page (the SimpleRBAC seed has fewer than 26 permissions).
    let { total } = await api.get<PermissionPage>('/permissions/', { query: { page: 1, limit: 1 } })
    while (total <= PAGE_SIZE) {
      await api.createPermission({ kind: 'listpage' })
      total += 1
    }

    const pageRequests: URLSearchParams[] = []
    page.on('request', (request) => {
      if (isListRequest(request)) pageRequests.push(pageParam(request))
    })
    // The total a page was served with. Other tests add permissions while this one runs, so the
    // summary is compared with the answer the page got, not with a count read before it.
    const servedTotal = (pageNumber: number) => page.waitForResponse((response) => {
      const request = response.request()
      return isListRequest(request) && pageParam(request).get('page') === String(pageNumber) && pageParam(request).get('limit') === String(PAGE_SIZE)
    }).then(async response => (await response.json() as PermissionPage).total)
    const firstServed = servedTotal(1)
    await page.goto('/app/permissions')
    total = await firstServed
    await expect(summary(page)).toHaveText(`Showing 1–${PAGE_SIZE} of ${total} permissions`)
    expect(pageRequests.some(p => p.get('page') === '1' && p.get('limit') === String(PAGE_SIZE))).toBe(true)
    await expect(page.locator('tbody tr')).toHaveCount(PAGE_SIZE)
    const firstPageFirstRow = (await page.locator('tbody tr').first().textContent()) ?? ''

    // Hold page 2 so the in-between state is observable: the old rows stay, never an empty table.
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const isPageTwo = (url: URL) => url.href.startsWith(apiUrl('/permissions/?')) && url.searchParams.get('page') === '2' && url.searchParams.get('limit') === String(PAGE_SIZE)
    await page.route(isPageTwo, async (route) => {
      await held
      await route.continue()
    })
    const secondServed = servedTotal(2)
    await page.getByRole('navigation', { name: 'Permissions pages' }).getByRole('button', { name: 'Page 2' }).click()
    await expect(page).toHaveURL(/[?&]page=2\b/)
    await expect(page.locator('[data-query-state="success"]')).toBeVisible()
    await expect(page.locator('tbody tr').first()).toHaveText(firstPageFirstRow)
    release()

    total = await secondServed
    await expect(summary(page)).toHaveText(`Showing ${PAGE_SIZE + 1}–${Math.min(total, PAGE_SIZE * 2)} of ${total} permissions`)
    await expect(page.locator('tbody tr').first()).not.toHaveText(firstPageFirstRow)
    expect(pageRequests.some(p => p.get('page') === '2')).toBe(true)

    // Reload lands on the same page.
    const reloadServed = servedTotal(2)
    await page.reload()
    total = await reloadServed
    await expect(summary(page)).toHaveText(`Showing ${PAGE_SIZE + 1}–${Math.min(total, PAGE_SIZE * 2)} of ${total} permissions`)
    // Browsing pages never downloads the whole catalogue (it loads only for a local search or
    // an origin filter, or when the resource filter opens).
    expect(pageRequests.filter(p => p.get('limit') !== String(PAGE_SIZE)).map(p => p.toString())).toEqual([])
  })

  test('resource filter goes to the API and survives reload and Back from a detail page', async ({ page, api }) => {
    const { items } = await api.get<PermissionPage>('/permissions/', { query: { page: 1, limit: 1000 } })
    const resource = items.map(p => p.resource ?? p.name.split(':')[0]).find(r => r === 'user') ?? items[0]!.name.split(':')[0]!
    const expected = items.filter(p => (p.resource ?? p.name.split(':')[0]) === resource).length

    const resourceRequests: string[] = []
    page.on('request', (request) => {
      if (isListRequest(request) && pageParam(request).get('resource')) resourceRequests.push(pageParam(request).get('resource')!)
    })
    await page.goto('/app/permissions')
    await expect(page.locator('tbody tr').first()).toBeVisible()
    await chooseSelect(page, field(page, 'Filter by resource'), resource)

    await expect(page).toHaveURL(new RegExp(`[?&]resource=${resource}\\b`))
    await expect.poll(() => resourceRequests).toContain(resource)
    await expect(summary(page)).toHaveText(`${expected} permission${expected === 1 ? '' : 's'}`)

    await page.reload()
    await expect(page.getByLabel('Filter by resource', { exact: true })).toHaveText(resource)
    await expect(summary(page)).toHaveText(`${expected} permission${expected === 1 ? '' : 's'}`)

    await page.locator('tbody tr').first().getByRole('link').click()
    await expect(page).toHaveURL(/\/app\/permissions\/[0-9a-f-]+$/)
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/app/permissions\\?resource=${resource}$`))
    await expect(page.getByLabel('Filter by resource', { exact: true })).toHaveText(resource)
    await expect(summary(page)).toHaveText(`${expected} permission${expected === 1 ? '' : 's'}`)
  })

  test('search is debounced into the URL and filters the whole catalogue', async ({ page, api }) => {
    const { items } = await api.get<PermissionPage>('/permissions/', { query: { page: 1, limit: 1000 } })
    const term = 'permission:'
    const matches = items.filter(p => p.name.toLowerCase().includes(term)).length
    expect(matches, 'seed: permission management permissions exist').toBeGreaterThan(0)

    const searchStates = new Set<string>()
    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame()) return
      const q = new URL(frame.url()).searchParams.get('q')
      if (q !== null) searchStates.add(q)
    })
    await page.goto('/app/permissions')
    await expect(page.locator('tbody tr').first()).toBeVisible()
    const search = page.getByRole('searchbox', { name: 'Search permissions' })
    await search.pressSequentially(term, { delay: 40 })

    await expect(page).toHaveURL(/[?&]q=permission(%3A|:)/)
    // One committed term, not one URL change per keystroke.
    expect([...searchStates]).toEqual([term])
    await expect(summary(page)).toHaveText(`${matches} permission${matches === 1 ? '' : 's'}`)
    for (const row of await page.locator('tbody tr').all()) {
      await expect(row).toContainText(term)
    }

    await page.reload()
    await expect(search).toHaveValue(term)
    await expect(summary(page)).toHaveText(`${matches} permission${matches === 1 ? '' : 's'}`)
  })

  test('no matches is distinct from an empty catalogue and clears back to the full list', async ({ page }) => {
    await page.goto('/app/permissions?q=zz-no-such-permission-zz')
    await expect(page.getByRole('heading', { name: 'No permissions match' })).toBeVisible()
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(page).toHaveURL(/\/app\/permissions$/)
    await expect(page.getByRole('searchbox', { name: 'Search permissions' })).toHaveValue('')
    await expect(page.locator('tbody tr').first()).toBeVisible()
  })

  test('a failed page shows the error with Retry, not an empty table', async ({ page, errorGuard }) => {
    errorGuard.allow({ status: 503, url: /\/permissions\/\?page=1&limit=25/ }, { kind: 'console', console: /status of 503/ })
    let fail = true
    // Only the table's page (limit 25); the catalogue request (limit 1000) is left alone.
    const isTablePage = (url: URL) => url.href.startsWith(apiUrl('/permissions/?')) && url.searchParams.get('limit') === String(PAGE_SIZE)
    await page.route(isTablePage, async (route) => {
      if (!fail) return route.continue()
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Service unavailable' }) })
    })
    await page.goto('/app/permissions')
    const alert = page.getByRole('alert').filter({ hasText: 'Could not load permissions' })
    await expect(alert).toBeVisible()
    await expect(page.getByRole('table')).toHaveCount(0)
    await expect(page.getByText('No permissions yet')).toHaveCount(0)

    fail = false
    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(page.locator('tbody tr').first()).toBeVisible()
    await expect(alert).toHaveCount(0)
  })
})
