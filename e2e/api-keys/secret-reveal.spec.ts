import { expect, test } from '../support/fixtures'
import { apiUrl } from '../support/env'
import { piniaPathsTo } from '../support/pinia-probe'
import { createApiKeyButton, grantableScope, pickScope } from '../support/api-keys'
import { chooseSelect, field } from '../support/ui-select'

// AppSecretReveal (F-183), exercised through the personal API keys page: the dialog names the
// key, cannot be dismissed by accident (no close button, Escape ignored, Done gated on "I have
// stored this key"), copies with visible feedback, shows the X-API-Key usage and drops the
// secret from the page once closed — from the markup and from the Pinia stores, where Pinia
// Colada's mutation cache would otherwise keep the create response.

type CreatedKey = { name: string, prefix: string, api_key: string }

test.describe('one-time secret reveal', () => {
  test.use({ errorGuardMode: 'strict', permissions: ['clipboard-read', 'clipboard-write'] })

  test('names the key, blocks accidental dismissal, copies and clears the secret', async ({ page, requires, testData, api, browserName }) => {
    await requires({ backend: true, surfaces: ['api_keys'] })
    test.skip(browserName !== 'chromium', 'Clipboard permissions are granted in Chromium only.')
    const name = testData.name('secret-key')
    const scope = await grantableScope(api)
    expect(scope, 'the admin can grant at least one scope').toBeTruthy()
    const me = await api.me()

    await page.goto('/app/api-keys')
    await createApiKeyButton(page).click()
    await page.getByLabel('Name', { exact: true }).fill(name)
    await pickScope(page.getByRole('dialog', { name: 'Create personal API key' }), scope!)
    // A key that never expires, so the reveal's expiry reads Never.
    await chooseSelect(page, field(page, 'Expires after'), 'Never')
    const created = page.waitForResponse(r => r.request().method() === 'POST' && r.url() === apiUrl('/api-keys/') && r.ok())
    await page.getByRole('button', { name: 'Create key' }).click()
    const key = await (await created).json() as CreatedKey

    const dialog = page.getByRole('dialog', { name: 'Store the new API key now' })
    await expect(dialog).toBeVisible()
    // Which key this is.
    await expect(dialog).toContainText(key.name)
    await expect(dialog).toContainText(key.prefix)
    await expect(dialog).toContainText('Never')
    // A personal key acts as the signed-in user, who is named as its owner.
    await expect(dialog).toContainText(me.email)
    await expect(dialog.getByText(`X-API-Key: ${key.prefix}…`)).toBeVisible()
    await expect(dialog.getByLabel('API key secret')).toHaveValue(key.api_key)

    // Not dismissible by accident.
    await expect(dialog.getByRole('button', { name: 'Close' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Done' })).toBeDisabled()

    // Copy with visible feedback.
    await dialog.getByRole('button', { name: 'Copy API key' }).click()
    await expect(dialog.getByRole('button', { name: 'Copied to clipboard' })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(key.api_key)

    await dialog.getByRole('checkbox', { name: 'I have stored this key somewhere safe' }).check()
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(dialog).toBeHidden()
    // The plaintext is gone from the page once the dialog has closed.
    await expect.poll(() => page.evaluate(secret => document.body.innerHTML.includes(secret), key.api_key)).toBe(false)
    await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible()
    // Nor does any store keep it. The walk does reach the Colada caches: it finds the new key's
    // name in the refetched list.
    expect(await page.evaluate(piniaPathsTo, name)).not.toEqual([])
    expect(await page.evaluate(piniaPathsTo, key.api_key)).toEqual([])
  })
})
