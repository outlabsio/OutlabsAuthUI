import type { BrowserContext } from '@playwright/test'
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
