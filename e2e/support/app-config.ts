import type { BrowserContext, Page } from '@playwright/test'
import { apiBaseUrl, authApiPrefix } from './env'

// The runtime config every E2E page boots with. Pointing at the harness backend here keeps
// runs independent of an operator's gitignored public/app-config.json (and of whatever a
// static build baked in). Tests can still override pieces through
// window.__OUTLABS_AUTH_UI_CONFIG__ (it wins over the file).
export const harnessAppConfig = {
  apiBaseUrl,
  authApiPrefix,
  authUi: {
    signup: true,
    identifier: 'email-or-phone',
    defaultCountry: 'AR',
    channels: ['whatsapp', 'sms'],
    oauthProviders: [],
    magicLink: true
  }
}

// Apply the harness app-config to a context (also for contexts a test creates itself).
export async function prepareContext(context: BrowserContext): Promise<void> {
  await context.route('**/app-config.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(harnessAppConfig)
  }))
}

// The deployment's OAuth providers (authUi.oauthProviders) and, optionally, its frontend profile
// key, served through window.__OUTLABS_AUTH_UI_CONFIG__. Register before page.goto. Linking needs
// the backend's oauth_associate router as well (withExtraSurfaces), which no example mounts.
export async function withOAuthProviders(page: Page, providers: string[], frontendProfileKey?: string): Promise<void> {
  await page.addInitScript(({ providers, key }) => {
    ;(window as unknown as { __OUTLABS_AUTH_UI_CONFIG__?: Record<string, unknown> }).__OUTLABS_AUTH_UI_CONFIG__ = {
      ...(key ? { frontendProfileKey: key } : {}),
      authUi: { oauthProviders: providers }
    }
  }, { providers, key: frontendProfileKey })
}
