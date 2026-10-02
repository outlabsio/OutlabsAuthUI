import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import type { Page, Request, Response } from '@playwright/test'
import { backendConfigured, expect, test } from '../support/fixtures'
import { backendHasSurface, isEnterpriseBackend } from '../support/capabilities'
import { ACCESS_TOKEN_KEY, apiUrl, REFRESH_TOKEN_KEY } from '../support/env'
import { persona, personaState } from '../support/personas'
import { corsHeaders, fulfillJson } from '../support/session'
import { sidebarNav, signOutFromShell } from '../support/shell'
import { openEmailForm } from '../support/sign-in'
import { userDetailPath } from '../support/users'

// Audit workspace (WP-18: F-090, F-091, F-092, F-188, F-189, F-190, F-191, F-220). The admin
// persona is a superuser, so user:read passes. Filters are typed controls kept in the route
// query; events are a table with expandable details; the export pages the filtered query.
// SimpleRBAC mounts no audit router; its redirect is covered by simple-rbac-gating.spec.

const UUID_A = '22222222-2222-4222-8222-222222222222'

// AppUserPicker's unsearched account list (GET /users/?page=1&limit=25, no search).
function isPickerList(url: URL) {
  return url.pathname.endsWith('/users/') && url.searchParams.get('limit') === '25' && !url.searchParams.has('search')
}

// The UI store's account-picker latch, read from the app's Pinia instance.
function pickerLatch(page: Page) {
  return page.evaluate(() => {
    type Pinia = { state: { value: Record<string, { userPickerOpenedBy?: string | null } | undefined> } }
    const root = document.querySelector('#__nuxt') as (Element & { __vue_app__?: { config: { globalProperties: { $pinia?: Pinia } } } }) | null
    return root?.__vue_app__?.config.globalProperties.$pinia?.state.value.ui?.userPickerOpenedBy ?? null
  })
}

// A persona's minted session, read from its storage state (no login; never rotated here).
async function personaTokens(key: 'orgAdmin') {
  const state = JSON.parse(await readFile(personaState(key), 'utf8')) as { origins?: Array<{ localStorage?: Array<{ name: string, value: string }> }> }
  const items = state.origins?.flatMap(origin => origin.localStorage ?? []) ?? []
  const read = (name: string) => items.find(item => item.name === name)?.value ?? ''
  return { access_token: read(ACCESS_TOKEN_KEY), refresh_token: read(REFRESH_TOKEN_KEY), token_type: 'bearer' }
}

function auditRequest(page: Page, predicate: (params: URLSearchParams) => boolean): Promise<Request> {
  return page.waitForRequest((request) => {
    const url = new URL(request.url())
    return url.pathname.endsWith('/audit-events') && request.method() === 'GET' && predicate(url.searchParams)
  })
}

function auditResponse(page: Page, predicate: (params: URLSearchParams) => boolean): Promise<Response> {
  return page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname.endsWith('/audit-events') && response.request().method() === 'GET' && predicate(url.searchParams)
  })
}

type AuditPage = { items: Array<{ event_category: string }>, total: number }

// The list summary (AppListPagination) of the first page of `total` events.
function firstPageSummary(total: number, pageSize: number) {
  if (total <= pageSize) return `${total.toLocaleString('en-US')} ${total === 1 ? 'event' : 'events'}`
  return `Showing 1–${pageSize} of ${total.toLocaleString('en-US')} events`
}

const table = (page: Page) => page.getByRole('table').first()
// Body rows only (the header group also holds the loading-bar row).
const bodyRows = (page: Page) => table(page).locator('tbody > tr')
const firstRow = (page: Page) => bodyRows(page).first()
const removeFilter = (page: Page, name: string | RegExp) => page.getByRole('button', { name: typeof name === 'string' ? `Remove filter ${name}` : name })
// One AppDetailList value by its label (an expanded event's details).
const detailValue = (page: Page, label: string) => page.locator('dl > div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd')

function auditEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: '7d4c9a3e-0000-4000-8000-000000000001',
    occurred_at: new Date().toISOString(),
    event_category: 'credential',
    event_type: 'user.api_key_revoked',
    event_source: 'api_keys_router.delete_api_key',
    actor_user_id: null,
    subject_user_id: UUID_A,
    subject_email_snapshot: 'someone@example.com',
    root_entity_id: null,
    entity_id: null,
    role_id: null,
    request_id: null,
    ip_address: null,
    user_agent: null,
    reason: 'Rotated by policy',
    before: { status: 'active', prefix: 'sk_live_abcd1234' },
    after: { status: 'revoked', prefix: 'sk_live_abcd1234' },
    metadata: { api_key_id: 'b4eb97ba-1de7-4a0c-9245-8fda59192bb2', api_key_prefix: 'sk_live_abcd1234', refresh_token: 'should-never-render' },
    ...overrides
  }
}

test.describe('audit workspace', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ viewport: { width: 1440, height: 900 } })
  test.beforeEach(async () => {
    test.skip(!(await backendHasSurface('audit')), 'Backend does not mount the audit router.')
  })

  test('filters are typed toolbar controls; the entity filter exists only on EnterpriseRBAC', async ({ page }) => {
    await page.goto('/app/audit')
    const filters = page.getByRole('group', { name: 'Audit filters' })
    await expect(filters.getByRole('combobox', { name: 'Category' })).toBeVisible()
    await expect(filters.getByRole('button', { name: 'Event type' })).toBeVisible()
    await expect(filters.getByRole('button', { name: 'About account' })).toBeVisible()
    await expect(filters.getByRole('button', { name: 'Actor' })).toBeVisible()
    await expect(filters.getByRole('button', { name: 'Entity' })).toHaveCount(await isEnterpriseBackend() ? 1 : 0)
    await expect(filters.getByRole('button', { name: 'Date range: Any time' })).toBeVisible()
    // No free-text UUID boxes and no native datetime inputs any more.
    await expect(page.locator('input[type="datetime-local"]')).toHaveCount(0)
    await expect(page.getByPlaceholder('Optional UUID')).toHaveCount(0)
    // Coverage is stated (F-092).
    await expect(page.getByText('Account, credential, membership and role-assignment events, newest first.')).toBeVisible()
  })

  test('a category returns rows without an error, and the pager sits below the results (F-090)', async ({ page }) => {
    await page.goto('/app/audit')
    await expect(firstRow(page)).toBeVisible()
    const summary = page.getByRole('status').filter({ hasText: /^(Showing .+ events|[\d,]+ events?)$/ })

    // Until the category's own answer is on screen the table keeps the previous result
    // (placeholderData), which holds sign-ins too. So the test waits for that answer and its
    // rows: working the pager while the old rows are still shown let the browser's scroll
    // anchoring move the panel when the new rows replaced them (a row both results share moves
    // up, and the panel follows it), carrying the open page-size menu out of view.
    const answered = auditResponse(page, params => params.get('category') === 'authentication')
    await page.getByRole('group', { name: 'Audit filters' }).getByRole('combobox', { name: 'Category' }).click()
    await page.getByRole('option', { name: 'Sign-ins and sessions' }).click()
    const response = await answered
    expect(response.ok()).toBe(true)
    const result = await response.json() as AuditPage
    // globalSetup signed the personas in, so sign-ins exist.
    expect(result.items.length).toBeGreaterThan(0)
    expect(result.items.every(item => item.event_category === 'authentication')).toBe(true)
    await expect(page).toHaveURL(/[?&]category=authentication/)
    await expect(summary).toHaveText(firstPageSummary(result.total, 25))
    await expect(bodyRows(page)).toHaveCount(result.items.length)
    await expect(bodyRows(page).filter({ hasNotText: 'Sign-ins and sessions' })).toHaveCount(0)
    await expect(table(page).getByText('Signed in', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Could not load audit events')).toHaveCount(0)
    await expect(removeFilter(page, 'Category: Sign-ins and sessions')).toBeVisible()

    const tableBox = await table(page).boundingBox()
    const summaryBox = await summary.boundingBox()
    expect(summaryBox!.y).toBeGreaterThan(tableBox!.y + tableBox!.height - 1)

    // Page size is part of the address too.
    const fifty = auditResponse(page, params => params.get('limit') === '50' && params.get('category') === 'authentication')
    await page.getByRole('combobox', { name: 'Events per page' }).click()
    await page.getByRole('option', { name: '50 per page' }).click()
    const fiftyResult = await (await fifty).json() as AuditPage
    await expect(page).toHaveURL(/[?&]limit=50/)
    await expect(summary).toHaveText(firstPageSummary(fiftyResult.total, 50))

    // Removing the chip clears the filter.
    await removeFilter(page, 'Category: Sign-ins and sessions').click()
    await expect(page).not.toHaveURL(/category=/)
  })

  test('event type: a known type by name, or a custom one typed in', async ({ page }) => {
    await page.goto('/app/audit')
    const eventType = page.getByRole('group', { name: 'Audit filters' }).getByRole('button', { name: 'Event type' })

    const known = auditRequest(page, params => params.get('event_type') === 'user.login')
    await eventType.click()
    await page.getByRole('option', { name: /^Signed in\s*user\.login$/ }).click()
    await known
    await expect(page).toHaveURL(/[?&]eventType=user\.login(?:&|$)/)
    await expect(removeFilter(page, 'Event: Signed in')).toBeVisible()

    const custom = auditRequest(page, params => params.get('event_type') === 'user.custom_thing')
    await eventType.click()
    await page.getByRole('combobox', { name: 'Search event types' }).fill('user.custom_thing')
    await page.getByRole('option', { name: /Create "user\.custom_thing"/ }).click()
    await custom
    await expect(removeFilter(page, 'Event: Custom thing')).toBeVisible()
    await expect(page.getByText('No events match these filters')).toBeVisible()
  })

  test('the actor is chosen by email from a server search, not pasted as a UUID', async ({ page, api }) => {
    const me = await api.me()
    await page.goto('/app/audit')

    const request = auditRequest(page, params => params.get('actor_user_id') === me.id)
    await page.getByRole('group', { name: 'Audit filters' }).getByRole('button', { name: 'Actor' }).click()
    const email = persona('admin').email
    const searched = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/users/') && new URL(response.url()).searchParams.get('search') === email)
    await page.getByRole('combobox', { name: 'Search accounts' }).fill(email)
    await searched
    // The option whose email is exactly the admin's (east-admin@... matches the search too).
    await page.getByRole('option').filter({ has: page.getByText(email, { exact: true }) }).click()
    await request
    await expect(page).toHaveURL(new RegExp(`actorUserId=${me.id}`))
    // The signed-in admin is named "You".
    await expect(removeFilter(page, 'Actor: You')).toBeVisible()
  })

  test('the account pickers load nothing until one opens, and another account in the same tab starts unopened', async ({ page, api, apiAs, requires }, testInfo) => {
    await requires({ preset: 'EnterpriseRBAC', personas: ['orgAdmin'], authMethods: ['password'] })
    const me = await api.me()
    const orgAdmin = await apiAs('orgAdmin').me()
    const lists: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'GET' && isPickerList(new URL(request.url()))) lists.push(request.url())
    })
    const filters = page.getByRole('group', { name: 'Audit filters' })

    // The Actor and About account pickers load no account list until one opens.
    const firstEvents = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/audit-events'))
    await page.goto('/app/audit')
    await firstEvents
    await expect(firstRow(page)).toBeVisible()
    await page.waitForTimeout(500)
    expect(lists).toEqual([])
    expect(await pickerLatch(page)).toBeNull()

    const search = page.getByRole('combobox', { name: 'Search accounts' })
    const loaded = page.waitForResponse(response => isPickerList(new URL(response.url())))
    await filters.getByRole('button', { name: 'Actor' }).click()
    await loaded
    await expect(search).toBeVisible()
    expect(lists).toHaveLength(1)
    // The latch is client state in the UI store, recorded for the account that opened it.
    expect(await pickerLatch(page)).toBe(me.id)
    await page.keyboard.press('Escape')
    await expect(search).toBeHidden()

    // Another account in this tab, without a reload. Sign-out's server-side revocation is
    // answered here, so the shared admin session survives; the sign-in is answered with the org
    // admin persona's own session, so no password login is spent.
    await page.evaluate(() => {
      (window as { __sameDocument?: boolean }).__sameDocument = true
    })
    await page.route(apiUrl('/auth/logout'), route => route.fulfill({ status: 204, headers: corsHeaders(testInfo) }))
    const orgAdminSession = await personaTokens('orgAdmin')
    await page.route(apiUrl('/auth/login'), route => fulfillJson(route, testInfo, 200, orgAdminSession))
    await signOutFromShell(page)
    await expect(page).toHaveURL(/\/auth\/login/)
    await openEmailForm(page)
    await page.getByLabel('Email').fill(persona('orgAdmin').email)
    await page.getByLabel('Password', { exact: true }).fill('not-checked-here')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/app\/dashboard/)

    const orgEvents = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/audit-events'))
    await sidebarNav(page).getByRole('link', { name: 'Audit', exact: true }).click()
    await expect(page.getByText('Showing events for your organization only')).toBeVisible()
    await orgEvents
    await page.waitForTimeout(500)
    expect(await page.evaluate(() => (window as { __sameDocument?: boolean }).__sameDocument)).toBe(true)
    // The admin's open does not carry over to the org admin: still no list until they open one.
    expect(lists).toHaveLength(1)

    const orgLoaded = page.waitForResponse(response => isPickerList(new URL(response.url())))
    await filters.getByRole('button', { name: 'Actor' }).click()
    await orgLoaded
    await expect(search).toBeVisible()
    expect(lists).toHaveLength(2)
    expect(await pickerLatch(page)).toBe(orgAdmin.id)
    await page.keyboard.press('Escape')
    await expect(search).toBeHidden()
  })

  test('a link with a malformed id is not sent; the page warns instead of failing with a 422', async ({ page, errorGuard }) => {
    errorGuard.allow({ status: 404 })
    const sent: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/audit-events')) sent.push(request.url())
    })
    await page.goto('/app/audit?actorUserId=not-a-uuid')
    await expect(page.getByText('A filter in this link is not a valid ID')).toBeVisible()
    await expect(removeFilter(page, 'Actor: invalid ID, ignored')).toBeVisible()
    await expect(firstRow(page)).toBeVisible()
    expect(sent.length).toBeGreaterThan(0)
    expect(sent.every(url => !url.includes('actor_user_id'))).toBe(true)
  })

  test('deep links prefill the filters as named chips', async ({ page, errorGuard }) => {
    // Unknown ids: the label lookups answer 404, which the chips absorb.
    errorGuard.allow({ status: 404 })
    const subject = auditRequest(page, params => params.get('subject_user_id') === UUID_A)
    await page.goto(`/app/audit?subjectUserId=${UUID_A}`)
    await subject
    await expect(removeFilter(page, /^Remove filter About: /)).toBeVisible()
    await expect(page.getByText('No events match these filters')).toBeVisible()

    if (await isEnterpriseBackend()) {
      const entityId = '11111111-1111-4111-8111-111111111111'
      const entity = auditRequest(page, params => params.get('entity_id') === entityId)
      await page.goto(`/app/audit?entityId=${entityId}`)
      await entity
      await expect(removeFilter(page, /^Remove filter Entity: /)).toBeVisible()
    }
  })

  test('date range: presets stay relative, and older date-time links still bound the search (F-191)', async ({ page }) => {
    await page.goto('/app/audit')
    const preset = auditRequest(page, params => params.has('occurred_from') && !params.has('occurred_to'))
    await page.getByRole('button', { name: 'Date range: Any time' }).click()
    await page.getByRole('group', { name: 'Date range presets' }).getByRole('button', { name: 'Last 7 days' }).click()
    const sent = await preset
    const from = Date.parse(new URL(sent.url()).searchParams.get('occurred_from')!)
    expect(Math.abs(Date.now() - 7 * 24 * 3600_000 - from)).toBeLessThan(5 * 60_000)
    await expect(page).toHaveURL(/[?&]range=7d/)
    await expect(removeFilter(page, 'When: Last 7 days')).toBeVisible()

    const window = auditRequest(page, params => params.has('occurred_from') && params.has('occurred_to'))
    await page.goto(`/app/audit?occurredFrom=${encodeURIComponent('2020-01-01T00:00')}&occurredTo=${encodeURIComponent('2099-12-31T23:45')}`)
    await window
    await expect(firstRow(page)).toBeVisible()
  })

  test('date range: two calendar days bound the search from start to end of day, and future days are out of reach (F-191)', async ({ page }) => {
    await page.goto('/app/audit')
    await expect(firstRow(page)).toBeVisible()
    await page.getByRole('button', { name: 'Date range: Any time' }).click()
    const calendar = page.locator('[aria-label="Choose days"]').first()
    await expect(calendar).toBeVisible()
    // The calendar ends today: there is no next month to page to.
    await expect(calendar.getByRole('button', { name: 'Next month' })).toBeDisabled()

    // Last month's 1st and 10th, as the browser's local calendar names them.
    const now = new Date()
    const month = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const iso = (d: number) => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    await calendar.getByRole('button', { name: 'Previous month' }).click()
    const day = (d: number) => calendar.locator(`[data-reka-calendar-cell-trigger][data-value="${iso(d)}"]:not([data-outside-view])`)

    // One click alone does not change the search.
    await day(1).click()
    await expect(page).not.toHaveURL(/occurredFrom=/)

    const bounded = auditRequest(page, params => params.has('occurred_from') && params.has('occurred_to'))
    await day(10).click()
    await expect(page).toHaveURL(new RegExp(`[?&]occurredFrom=${iso(1)}(&|$)`))
    await expect(page).toHaveURL(new RegExp(`[?&]occurredTo=${iso(10)}(&|$)`))
    const params = new URL((await bounded).url()).searchParams
    const from = new Date(params.get('occurred_from')!)
    const to = new Date(params.get('occurred_to')!)
    // Start of the 1st and end of the 10th in the admin's (browser's) time zone.
    expect(from.getTime()).toBe(new Date(month.getFullYear(), month.getMonth(), 1).getTime())
    expect(to.getTime()).toBeGreaterThan(new Date(month.getFullYear(), month.getMonth(), 10, 23, 59).getTime())
    expect(to.getTime()).toBeLessThan(new Date(month.getFullYear(), month.getMonth(), 11).getTime())

    await page.keyboard.press('Escape')
    const label = (d: number) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso(d)}T12:00:00Z`))
    await expect(removeFilter(page, `When: ${label(1)} – ${label(10)}`)).toBeVisible()
  })

  test('an event expands into changes, context, pivots and a redacted raw payload (F-091, F-188, F-220)', async ({ page, errorGuard }) => {
    // The mocked subject does not exist, so its name lookup answers 404.
    errorGuard.allow({ status: 404 })
    await page.route(/\/audit-events\?/, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [auditEvent()], total: 1, page: 1, limit: 25, pages: 1 })
    }))
    await page.goto('/app/audit')
    const row = firstRow(page)
    await expect(row.getByText('API key revoked')).toBeVisible()
    await expect(row.getByRole('link', { name: 'someone@example.com' })).toHaveAttribute('href', `/app/users/${UUID_A}`)

    const toggle = page.getByRole('button', { name: 'Show details for API key revoked' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(page.getByRole('button', { name: 'Hide details for API key revoked' })).toHaveAttribute('aria-expanded', 'true')

    // Only the field that changed, before and after.
    const changes = page.getByTestId('audit-changes')
    await expect(changes.locator('tbody > tr')).toHaveCount(1)
    await expect(changes.locator('tbody > tr')).toContainText(/Status\s*active\s*revoked/)
    await expect(page.getByText('Rotated by policy')).toBeVisible()
    // The details say who acted, even when nobody was recorded (v-keys-audit-02).
    await expect(detailValue(page, 'Actor')).toHaveText('Not recorded')

    // The raw payload keeps what identifies the key and hides the secret.
    const raw = page.getByRole('button', { name: 'Show raw payload' })
    await expect(raw).toHaveAttribute('aria-expanded', 'false')
    await raw.click()
    await expect(page.getByText(/"api_key_prefix": "sk_live_abcd1234"/)).toBeVisible()
    await expect(page.getByText(/"refresh_token": "\[REDACTED\]"/)).toBeVisible()
    await expect(page.getByText('should-never-render')).toHaveCount(0)

    // Pivots are links into this workspace.
    await expect(page.getByRole('link', { name: 'Events about someone@example.com' })).toHaveAttribute('href', `/app/audit?subjectUserId=${UUID_A}`)
    await expect(page.getByRole('link', { name: 'All "API key revoked" events' })).toHaveAttribute('href', '/app/audit?eventType=user.api_key_revoked')
  })

  test('an expanded event has no WCAG A/AA violations (F-220)', async ({ page }) => {
    await page.goto('/app/audit')
    await firstRow(page).getByRole('button', { name: /^Show details for / }).click()
    await expect(page.getByRole('button', { name: /^Hide details for / })).toBeVisible()
    // color-contrast stays out, as in the a11y smoke (F-032, an accepted limitation).
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['color-contrast']).analyze()
    expect(results.violations.map(v => ({ id: v.id, nodes: v.nodes.length }))).toEqual([])
  })

  test('a failed search shows the error, not "0 events" (F-191)', async ({ page, errorGuard }) => {
    errorGuard.allow({ status: 500 })
    await page.route(/\/audit-events\?/, route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'boom' }) }))
    await page.goto('/app/audit')
    await expect(page.getByText('Could not load audit events')).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: /^(Showing .+ events|[\d,]+ events?)$/ })).toHaveCount(0)
  })

  test('export pages the filtered query at 100 per request and redacts the file (F-190)', async ({ page, errorGuard }) => {
    errorGuard.allow({ status: 404 })
    const pages: URLSearchParams[] = []
    await page.route(/\/audit-events\?/, async (route) => {
      const params = new URL(route.request().url()).searchParams
      const limit = Number(params.get('limit'))
      const pageNo = Number(params.get('page'))
      if (limit === 100) pages.push(params)
      const total = 150
      const count = limit === 100 ? (pageNo === 1 ? 100 : 50) : Math.min(limit, total)
      const items = Array.from({ length: count }, (_, i) => auditEvent({ id: `7d4c9a3e-0000-4000-8000-${String(pageNo * 1000 + i).padStart(12, '0')}` }))
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items, total, page: pageNo, limit, pages: Math.ceil(total / limit) }) })
    })
    await page.goto('/app/audit?category=credential')
    await expect(firstRow(page)).toBeVisible()

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Export as JSON' }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^audit-events-\d{4}-\d{2}-\d{2}\.json$/)
    const json = JSON.parse(await readFile((await file.path())!, 'utf8')) as { total: number, complete: boolean, filters: Record<string, string>, events: { metadata: Record<string, string> }[] }
    expect(json.total).toBe(150)
    expect(json.complete).toBe(true)
    expect(json.filters).toEqual({ category: 'credential' })
    expect(json.events).toHaveLength(150)
    expect(json.events[0]!.metadata.refresh_token).toBe('[REDACTED]')
    expect(json.events[0]!.metadata.api_key_prefix).toBe('sk_live_abcd1234')
    // Two pages of 100, the category on both, the upper bound pinned for a stable window.
    expect(pages.map(p => p.get('page'))).toEqual(['1', '2'])
    expect(pages.every(p => p.get('category') === 'credential' && p.has('occurred_to'))).toBe(true)
    await expect(page.getByText('Audit events exported', { exact: true })).toBeVisible()

    const csvDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Export as CSV' }).click()
    const csv = await readFile((await (await csvDownload).path())!, 'utf8')
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toMatch(/^occurred_at,event_category,event_type,event,/)
    expect(lines).toHaveLength(151)
    expect(csv).not.toContain('should-never-render')
  })

  // Below md the Actor column is hidden: each row says who acted, and so do the expanded details
  // (v-keys-audit-02). A long "About" email and the changes table wrap inside their column
  // instead of running under the pinned details button or splitting a time (v-keys-audit-05).
  test('at 390px every event says who acted, and long values wrap inside their column', async ({ page, api, errorGuard }) => {
    // The mocked subject does not exist, so its name lookup answers 404.
    errorGuard.allow({ status: 404 })
    const me = await api.me()
    const longEmail = 'unverified.subject.address@austin.summit.example.com'
    const byMe = auditEvent({
      id: '7d4c9a3e-0000-4000-8000-000000000011',
      actor_user_id: me.id,
      subject_email_snapshot: longEmail,
      before: { status: 'active', expires_at: '2026-09-30T21:23:00Z' },
      after: { status: 'revoked', expires_at: '2026-10-01T03:32:00Z' }
    })
    const unattributed = auditEvent({ id: '7d4c9a3e-0000-4000-8000-000000000012', event_type: 'user.login_failed', event_category: 'authentication' })
    await page.route(/\/audit-events\?/, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [byMe, unattributed], total: 2, page: 1, limit: 25, pages: 1 })
    }))
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/app/audit')

    const rows = table(page).locator('tbody > tr')
    const first = rows.filter({ hasText: longEmail })
    await expect(page.getByRole('columnheader', { name: 'Actor' })).toBeHidden()
    await expect(first.getByTestId('audit-actor-line')).toBeVisible()
    await expect(first.getByTestId('audit-actor-line')).toHaveText('By You')
    await expect(rows.filter({ hasNotText: longEmail }).first().getByTestId('audit-actor-line')).toHaveText('Actor not recorded')

    // The long email wraps left of the pinned details button, and the table needs no sideways
    // scroll, collapsed or expanded (the pivot "Events about <email>" wraps too).
    const about = first.getByText(`About ${longEmail}`)
    await expect(about).toBeVisible()
    const toggle = first.getByRole('button', { name: /^Show details for / })
    const [aboutBox, toggleBox] = [await about.boundingBox(), await toggle.boundingBox()]
    expect(aboutBox!.x + aboutBox!.width).toBeLessThanOrEqual(toggleBox!.x)
    const sidewaysScroll = () => table(page).evaluate(t => t.parentElement!.scrollWidth - t.parentElement!.clientWidth)
    expect(await sidewaysScroll()).toBeLessThanOrEqual(0)

    await toggle.click()
    await expect(detailValue(page, 'Actor')).toHaveText('You')
    await expect(page.getByRole('link', { name: `Events about ${longEmail}` })).toBeVisible()
    expect(await sidewaysScroll()).toBeLessThanOrEqual(0)
    // A time in Before/After never breaks inside itself ("9:" / "23 PM").
    const changes = page.getByTestId('audit-changes')
    await expect(changes.locator('tbody > tr')).toHaveCount(2)
    const timeLines = await changes.locator('tbody td span').evaluateAll(spans => spans.flatMap((span) => {
      const text = span.firstChild
      const match = text?.nodeType === Node.TEXT_NODE ? /\d{1,2}:\d{2}/.exec(text.textContent ?? '') : null
      if (!text || !match) return []
      const range = document.createRange()
      range.setStart(text, match.index)
      range.setEnd(text, match.index + match[0].length)
      return [new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size]
    }))
    expect(timeLines).toHaveLength(2)
    expect(timeLines).toEqual([1, 1])
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })

  test('at 390px the filters move into a labelled slideover', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/app/audit')
    await expect(page.getByRole('group', { name: 'Audit filters' }).getByRole('combobox', { name: 'Category' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Audit filters' }).getByRole('button', { name: 'Actor' })).toBeHidden()
    await page.getByRole('button', { name: 'Filters', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Filters' })
    await expect(sheet.getByText('About account')).toBeVisible()
    await expect(sheet.getByText('Actor', { exact: true })).toBeVisible()
    await expect(sheet.getByRole('group', { name: 'Date range presets' })).toBeVisible()
    await sheet.getByRole('group', { name: 'Date range presets' }).getByRole('button', { name: 'Last 24 hours' }).click()
    await expect(page).toHaveURL(/[?&]range=24h/)
    await sheet.getByRole('button', { name: 'Show results' }).click()
    await expect(page.getByRole('button', { name: 'Filters (1 active)' })).toBeVisible()
    // No horizontal page scroll.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})

test.describe('audit scope notice (F-092)', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('a superuser is not told the log is limited', async ({ page }) => {
    test.skip(!(await backendHasSurface('audit')), 'Backend does not mount the audit router.')
    await page.goto('/app/audit')
    await expect(firstRow(page)).toBeVisible()
    await expect(page.getByText('Showing events for your organization only')).toHaveCount(0)
  })

  test.describe('delegated org admin', () => {
    test.use({ storageState: personaState('orgAdmin') })

    test('sees that only their organization\'s events are listed', async ({ page }) => {
      test.skip(!(await isEnterpriseBackend()) || !(await backendHasSurface('audit')), 'The org-admin persona exists on the EnterpriseRBAC seed only.')
      await page.goto('/app/audit')
      await expect(page.getByText('Showing events for your organization only')).toBeVisible()
    })
  })
})

test.describe('audit pivots on other pages (F-189)', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('a user\'s History event links into the filtered Audit workspace', async ({ page, api }) => {
    test.skip(!(await backendHasSurface('audit')), 'Backend does not mount the audit router.')
    const user = await api.createUser({ kind: 'audit-pivot' })
    await api.patch(`/users/${user.id}/status`, { status: 'suspended', reason: 'E2E audit pivot' })

    await page.goto(userDetailPath(user.id, 'history'))
    const event = page.getByRole('article', { name: 'Status changed' }).first()
    await expect(event).toBeVisible()
    await event.getByRole('button', { name: 'Show details' }).click()
    await event.getByRole('link', { name: `Events about ${user.email}` }).click()
    await expect(page).toHaveURL(new RegExp(`/app/audit\\?subjectUserId=${user.id}$`))
    await expect(removeFilter(page, `About: ${user.email}`)).toBeVisible()
    await expect(table(page).getByText('Status changed').first()).toBeVisible()
  })
})
