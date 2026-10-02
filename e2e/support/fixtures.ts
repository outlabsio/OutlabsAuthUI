import { test as base, type BrowserContext } from '@playwright/test'
import { ApiClient } from './api-client'
import { prepareContext } from './app-config'
import { type Requirement, requireBackend } from './capabilities'
import { baseURL, runId } from './env'
import { ErrorGuard, type ErrorGuardMode } from './error-guard'
import type { PersonaKey } from './personas'
import { type SessionTokens, storageStateFor } from './sessions'
import { type TestData, testData } from './test-data'

// The harness fixtures every spec imports (`import { test, expect } from '../support/fixtures'`).
//
//   context / page  — every context serves the harness app-config (app-config.ts), not a local
//                     public/app-config.json, and is watched by the error guard. Their routes
//                     are dropped at teardown, so a handler still in flight can't fail the run.
//   errorGuard      — auto fixture; `errorGuard.allow(...)` for expected failures (error-guard.ts).
//   requires        — `await requires({ surfaces: ['entities'] })` skips unless the backend has it.
//   api / apiAs     — typed API client as the admin persona / any persona (api-client.ts).
//   testData        — run-marked names and emails for anything the test creates (test-data.ts).
//   sessionContext  — an extra context signed in with tokens the test minted itself (a session
//                     it may expire, rotate or revoke) or a persona's storage state; prepared and
//                     guarded like `context`, closed after the test.
//
// Sessions: projects pick a persona's storage state in playwright.config.ts; a spec switches
// persona with `test.use({ storageState: personaState('agent') })` (personas.ts).

export type HarnessOptions = {
  errorGuardMode: ErrorGuardMode
}

type HarnessFixtures = {
  errorGuard: ErrorGuard
  requires: (req: Requirement) => Promise<void>
  api: ApiClient
  apiAs: (persona: PersonaKey) => ApiClient
  testData: TestData
  sessionContext: (session: SessionTokens | string) => Promise<BrowserContext>
}

// Strict by default (F-036): an unexpected API error, console error or page error fails the test.
// E2E_ERROR_GUARD=report only records them (e.g. while triaging a new backend).
const defaultGuardMode = (['off', 'report', 'strict'] as const).find(m => m === process.env.E2E_ERROR_GUARD) ?? 'strict'

export const test = base.extend<HarnessFixtures & HarnessOptions>({
  errorGuardMode: [defaultGuardMode, { option: true }],

  errorGuard: [async ({ errorGuardMode }, use, testInfo) => {
    const guard = new ErrorGuard(errorGuardMode)
    await use(guard)
    await guard.finish(testInfo)
  }, { auto: true }],

  context: async ({ context, errorGuard }, use) => {
    await prepareContext(context)
    await errorGuard.attach(context)
    await use(context)
    await context.unrouteAll({ behavior: 'ignoreErrors' })
  },

  // A route handler still awaiting route.fetch() when its test ends would otherwise fail the
  // run with "route.fetch: Test ended" outside any test.
  page: async ({ page }, use) => {
    await use(page)
    await page.unrouteAll({ behavior: 'ignoreErrors' })
  },

  // eslint-disable-next-line no-empty-pattern -- Playwright resolves fixture deps via destructuring.
  requires: async ({}, use) => {
    await use(requireBackend)
  },

  // eslint-disable-next-line no-empty-pattern -- Playwright resolves fixture deps via destructuring.
  api: async ({}, use) => {
    await use(ApiClient.forPersona('admin'))
  },

  // eslint-disable-next-line no-empty-pattern -- Playwright resolves fixture deps via destructuring.
  apiAs: async ({}, use) => {
    await use(persona => ApiClient.forPersona(persona))
  },

  // eslint-disable-next-line no-empty-pattern -- Playwright resolves fixture deps via destructuring.
  testData: async ({}, use) => {
    await use(testData(runId))
  },

  sessionContext: async ({ browser, errorGuard }, use) => {
    const contexts: BrowserContext[] = []
    // Tokens the test minted, or a storage-state path (e.g. personaState('agent')).
    await use(async (session) => {
      const storageState = typeof session === 'string' ? session : storageStateFor(session)
      const context = await browser.newContext({ storageState, baseURL })
      await prepareContext(context)
      await errorGuard.attach(context)
      contexts.push(context)
      return context
    })
    for (const context of contexts) await context.close()
  }
})

export { expect, type Page } from '@playwright/test'
export { backendConfigured } from './env'
export { authMethodOn, backendCapabilities, expectSeeded, requireBackend, type Requirement } from './capabilities'
export { persona, personaState, personaToken, type PersonaKey } from './personas'
export { ApiClient } from './api-client'
export { harnessAppConfig, prepareContext } from './app-config'
