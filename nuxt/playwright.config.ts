import { defineConfig, devices } from '@playwright/test'

// Playwright is the port's acceptance gate — the carried-over React suites are the
// behavioral spec (P0). Defaults here become the Outlabs boilerplate defaults (P5).
const appPort = Number(process.env.E2E_PORT ?? 3000)
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${appPort}`

// The disposable outlabsAuth backend the seeded suites talk to. Unset in a bare checkout —
// backend-gated specs skip themselves; the guest render smoke still runs.
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://localhost:8004'
const authApiPrefix = process.env.E2E_AUTH_API_PREFIX ?? '/v1'

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    // Unauthenticated flows (login, invite, reset) run with no stored session.
    {
      name: 'chromium-guest',
      testMatch: /e2e\/auth\//,
      use: { ...devices['Desktop Chrome'] }
    },
    // Logs in once, persists storageState for the authenticated matrix.
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] }
    },
    // Authenticated app suites reuse the setup session.
    {
      name: 'chromium',
      testIgnore: [/e2e\/auth\//, /.*\.setup\.ts/],
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/admin.json' }
    }
    // Weekly CI adds firefox / webkit projects; the inner loop stays chromium-only.
  ],
  webServer: {
    // Inner loop boots the dev server. P1 close switches this to `nuxt generate` + preview
    // so E2E exercises the exact static output that ships to Cloudflare.
    command: `bun run dev -- --port ${appPort}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      NUXT_PUBLIC_API_BASE_URL: apiBaseUrl,
      NUXT_PUBLIC_AUTH_API_PREFIX: authApiPrefix
    }
  }
})
