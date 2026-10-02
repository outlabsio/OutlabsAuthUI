import { mkdirSync, writeFileSync } from 'node:fs'
import { defineConfig, devices, type ReporterDescription } from '@playwright/test'
import { apiBaseUrl, appPort, authApiPrefix, baseURL, e2eTarget, releaseMode, reportDir } from './e2e/support/env'
import type { HarnessOptions } from './e2e/support/fixtures'
import { personaState } from './e2e/support/personas'

// Playwright is the acceptance gate. How to run it (targets, personas, variables):
// e2e/README.md. In short:
//   - E2E_API_BASE_URL selects the backend; its preset (EnterpriseRBAC / SimpleRBAC) is
//     detected and persona credentials follow the preset's seed.
//   - globalSetup signs each persona in once through the API (no UI logins in setup) and
//     globalTeardown removes the run's test data when E2E_ALLOW_DESTRUCTIVE_CLEANUP=1.
//   - E2E_TARGET=static tests the shipped artifact: `nuxt generate` served with its _headers.
//   - E2E_RELEASE=1 is release mode, the settings `bun run release:check` runs with (below).

const staticAppConfig = 'e2e/.static/app-config.json'
const staticServer = `bun run generate && node scripts/deploy-preflight.mjs --local --config ${staticAppConfig} `
  + `&& node scripts/serve-static.mjs --dir .output/public --port ${appPort}`
const devServer = `bun run dev -- --port ${appPort}`

// E2E_TARGET=static runs the shipped artifact: `bun run generate` (nuxt generate + CSP script
// hashes), the deploy preflight in --local mode (stages this app-config.json and pins the
// CSP's connect-src to the E2E API), then scripts/serve-static.mjs, which applies the
// generated _headers with the Workers asset semantics. The production build ignores
// NUXT_PUBLIC_* by design, so the staged config is what the artifact boots with.
if (e2eTarget === 'static') {
  mkdirSync('e2e/.static', { recursive: true })
  writeFileSync(staticAppConfig, `${JSON.stringify({
    apiBaseUrl,
    authApiPrefix,
    ...(process.env.E2E_FRONTEND_PROFILE_KEY ? { frontendProfileKey: process.env.E2E_FRONTEND_PROFILE_KEY } : {})
  }, null, 2)}\n`)
}

// Cross-browser lanes (F-148), opt-in: E2E_BROWSERS=firefox,webkit,mobile-chrome adds a project
// per browser that runs the cross-browser smoke below (`bun run release:check --browsers ...`
// sets it). Chromium runs the whole suite in every lane.
const extraBrowsers = new Set((process.env.E2E_BROWSERS ?? '').split(',').map(name => name.trim()).filter(Boolean))
const crossBrowserSmoke = [
  /e2e\/app\/(app-shell|personas|nav-parity|persona-matrix|browser-lifecycle)\.spec\.ts/,
  /e2e\/a11y\//
]
// The phone-specific tests wherever they live (titles that name the phone, 390px or a drawer;
// not "mobile", which the project name itself would match).
const mobileSmoke = /on a phone|phone width|at 390|390px|drawer|slideover/i
const browserProjects = [
  { name: 'firefox', testMatch: crossBrowserSmoke, use: { ...devices['Desktop Firefox'], storageState: personaState('admin') } },
  { name: 'webkit', testMatch: crossBrowserSmoke, use: { ...devices['Desktop Safari'], storageState: personaState('admin') } },
  // Phone-sized Chromium with touch: the drawer, stacked filters and slideovers.
  {
    name: 'mobile-chrome',
    testIgnore: [/e2e\/auth\//, /e2e\/session\//, /e2e\/static\//],
    grep: mobileSmoke,
    use: { ...devices['Pixel 7'], storageState: personaState('admin') }
  }
].filter(project => extraBrowsers.has(project.name))

// Reusing a running server is an inner-loop convenience only: release mode and the static target
// always start their own (a stale server would test a stale build).
const reuseExistingServer = !releaseMode && (process.env.E2E_REUSE_SERVER
  ? process.env.E2E_REUSE_SERVER === '1'
  : e2eTarget === 'dev')

// E2E_REPORT_DIR (set per preset by the release check) collects the HTML report, the JSON
// results the release record counts, and the traces, screenshots and videos of failures.
const reporter: ReporterDescription[] = reportDir
  ? [['list'], ['html', { open: 'never', outputFolder: `${reportDir}/report` }], ['json', { outputFile: `${reportDir}/results.json` }]]
  : [['list'], ['html', { open: 'never' }]]

export default defineConfig<HarnessOptions>({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: releaseMode,
  // Eight simultaneous Nuxt SPA boots can leave pages on the pre-mount splash past the
  // assertion timeout on a local dev server. Four keeps the inner loop parallel and stable;
  // release mode (static build) uses Playwright's default, half the machine's cores.
  workers: releaseMode ? undefined : 4,
  // No retries in the inner loop (a flake should be seen); one in release mode, and a test that
  // only passes on retry still fails the run.
  retries: releaseMode ? 1 : 0,
  failOnFlakyTests: releaseMode,
  reporter,
  ...(reportDir ? { outputDir: `${reportDir}/test-results` } : {}),
  globalSetup: './e2e/support/global-setup.ts',
  globalTeardown: './e2e/support/global-teardown.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    // Unauthenticated flows (sign-in, invite, reset, recovery) — no stored session. The
    // dedicated UI-login coverage lives here.
    {
      name: 'chromium-guest',
      testMatch: /e2e\/auth\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] }
    },
    // Shipped-artifact smoke (CSP, hosting headers, bundled icons). Its specs skip unless
    // E2E_TARGET=static and read the real staged app-config.json (no harness override).
    {
      name: 'chromium-static',
      testMatch: /e2e\/static\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] }
    },
    // Authenticated app suites, as the admin persona (switch per spec with
    // `test.use({ storageState: personaState('agent') })`).
    {
      name: 'chromium',
      testIgnore: [/e2e\/auth\//, /e2e\/session\//, /e2e\/static\//],
      use: { ...devices['Desktop Chrome'], storageState: personaState('admin') }
    },
    // Session-lifecycle lane: every test owns a fresh session and simulates access-token
    // expiry client-side (e2e/support/sessions.ts), so refresh/rotation/logout run for real.
    {
      name: 'session',
      testMatch: /e2e\/session\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] }
    },
    ...browserProjects
  ],
  webServer: {
    command: e2eTarget === 'static' ? staticServer : devServer,
    url: baseURL,
    reuseExistingServer,
    timeout: e2eTarget === 'static' ? 300_000 : 120_000,
    // Added to the runner's own environment, which Playwright passes on anyway. Only these two are
    // listed: the config (with this object) is written into the JSON report, which must not carry
    // the whole shell environment.
    env: {
      NUXT_PUBLIC_API_BASE_URL: apiBaseUrl,
      NUXT_PUBLIC_AUTH_API_PREFIX: authApiPrefix
    }
  }
})
