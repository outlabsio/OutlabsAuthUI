import { defineConfig, devices } from '@playwright/test'

const appPort = Number(process.env.E2E_PORT ?? 3000)
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${appPort}`
const apiBaseURL = process.env.E2E_API_BASE_URL ?? 'http://localhost:8004'
const authApiPrefix = process.env.E2E_AUTH_API_PREFIX ?? '/v1'
const reuseExistingServer =
  process.env.E2E_REUSE_EXISTING_SERVER === '0' ? false : !process.env.CI

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: process.env.PWDEBUG ? false : true,
  },
  globalSetup: './e2e/support/global-setup.ts',
  webServer: {
    command: `bun run dev -- --host localhost --port ${appPort}`,
    url: baseURL,
    reuseExistingServer,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_API_BASE_URL: apiBaseURL,
      VITE_AUTH_API_PREFIX: authApiPrefix,
      VITE_RUNTIME_CONFIG_PRIORITY: 'env',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
})
