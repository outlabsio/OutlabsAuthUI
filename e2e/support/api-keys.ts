import { expect, type Locator, type Page, type Route } from '@playwright/test'
import type { ApiClient } from './api-client'

// Helpers for API-key specs (personal keys, service-account keys, the key inventory and the
// user detail's Personal API keys card).

export type ApiKeyRow = {
  id: string
  name: string
  prefix: string
  status: string
  scopes: string[]
  expires_at?: string | null
  created_at?: string
  is_currently_effective?: boolean | null
  ineffective_reasons?: string[] | null
  entity_ids?: string[] | null
  inherit_from_tree?: boolean
  rate_limit_per_minute?: number
  ip_whitelist?: string[] | null
}

/**
 * The My API keys page's "Create API key" button in the navbar. An empty list repeats the same
 * action in its empty state, so the name alone is not unique there; the navbar's comes first.
 */
export function createApiKeyButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Create API key' }).first()
}

/** A scope this actor may grant on every preset: user:read where offered, else the first one. */
export async function grantableScope(api: ApiClient): Promise<string | undefined> {
  const scopes = await api.grantableScopes()
  return scopes.includes('user:read') ? 'user:read' : scopes[0]
}

/** Pick a scope in AppScopePicker (searched by its name), checking it lands in the selection. */
export async function pickScope(container: Locator, name: string) {
  const picker = container.getByTestId('scope-picker')
  // The search box is announced by its field's label (F-086).
  const search = picker.getByRole('textbox', { name: 'Scopes', exact: true })
  await search.fill(name)
  await picker.getByRole('option').first().click()
  await expect(picker.getByTestId('scope-selection').getByRole('button', { name: `Remove ${name}`, exact: true })).toBeVisible()
  await search.fill('')
}

/** AppSecretReveal only closes once the admin confirms the key is stored; returns the secret. */
export async function storeSecret(page: Page): Promise<string> {
  const dialog = page.getByRole('dialog', { name: 'Store the new API key now' })
  await expect(dialog).toBeVisible()
  const secret = await dialog.getByLabel('API key secret').inputValue()
  expect(secret).not.toBe('')
  await dialog.getByRole('checkbox', { name: 'I have stored this key somewhere safe' }).check()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog).toBeHidden()
  return secret
}

/** What a key past its expiry date looks like on the wire: still 'active', refused as expired. */
export function pastExpiry<T extends ApiKeyRow>(key: T): T {
  // Expired yesterday after the lifetime it was created with (30 days when it had none).
  const created = key.created_at ? Date.parse(key.created_at) : Number.NaN
  const expires = key.expires_at ? Date.parse(key.expires_at) : Number.NaN
  const lifetime = Number.isFinite(created) && Number.isFinite(expires) && expires > created ? expires - created : 30 * 86_400_000
  const expiredAt = Date.now() - 86_400_000
  return {
    ...key,
    status: 'active',
    created_at: new Date(expiredAt - lifetime).toISOString(),
    expires_at: new Date(expiredAt).toISOString(),
    is_currently_effective: false,
    ineffective_reasons: ['key_expired']
  }
}

/**
 * Serve a key list (a JSON array or a page envelope `{ items }`) with some keys rewritten: the
 * real response is fetched and `edit` applied to every key it returns. Use it for states the
 * backend cannot be put in quickly (an expiry date in the past, an owner who cannot sign in).
 */
export async function rewriteKeys(page: Page, url: RegExp, edit: (key: ApiKeyRow) => ApiKeyRow) {
  await page.route(url, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.continue()
    try {
      const response = await route.fetch()
      const body = await response.json() as ApiKeyRow[] | ApiKeyRow | { items: ApiKeyRow[] }
      const json = Array.isArray(body)
        ? body.map(edit)
        : 'items' in body ? { ...body, items: body.items.map(edit) } : edit(body)
      await route.fulfill({ response, json })
    } catch {
      // The console aborted the request (a newer read replaced it) or the page closed.
    }
  })
}
