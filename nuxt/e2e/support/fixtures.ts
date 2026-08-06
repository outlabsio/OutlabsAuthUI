import { test as base, type APIRequestContext, request } from '@playwright/test'

// Base fixtures (P1 skeleton, extended in P2). Tests arrange state through the API, not the
// UI. `api` is a request context pointed at the disposable outlabsAuth backend; seeded-DB
// reset + per-worker personas land here as the suites are carried over.
type Fixtures = {
  api: APIRequestContext
}

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://localhost:8004'
const authApiPrefix = process.env.E2E_AUTH_API_PREFIX ?? '/v1'

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright resolves fixture deps via destructuring; `api` depends on none.
  api: async ({}, use) => {
    const context = await request.newContext({ baseURL: `${apiBaseUrl}${authApiPrefix}` })
    await use(context)
    await context.dispose()
  }
})

export { expect } from '@playwright/test'
export const backendConfigured = Boolean(process.env.E2E_API_BASE_URL)
