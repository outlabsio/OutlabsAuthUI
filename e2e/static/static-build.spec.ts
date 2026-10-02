import { expect, test, type Page } from '@playwright/test'
import { openEmailForm } from '../support/sign-in'
import { personaState } from '../support/personas'
import { commandPalette, openUserMenu } from '../support/shell'

// Shipped-artifact smoke. Runs only with E2E_TARGET=static, where Playwright serves the
// generated .output/public through scripts/serve-static.mjs with the generated _headers and
// the app-config.json staged by the deploy preflight — the same bytes and headers a
// Cloudflare deployment serves. Deliberately uses @playwright/test directly: the shared
// fixtures mock /app-config.json, and this spec must exercise the real one.

const staticTarget = process.env.E2E_TARGET === 'static'
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://localhost:8004'

test.skip(!staticTarget, 'Static-build smoke: run with E2E_TARGET=static (bun run test:e2e:static e2e/static).')

type Watch = { violations: string[], foreignRequests: string[], iconWarnings: string[] }

// Fail on ANY Content-Security-Policy violation, and on any request that leaves the console
// origin other than to the configured API (icons are bundled; nothing else is external).
async function watchPage(page: Page, baseURL: string): Promise<Watch> {
  const watch: Watch = { violations: [], foreignRequests: [], iconWarnings: [] }
  const allowedOrigins = new Set([new URL(baseURL).origin, new URL(apiBaseUrl).origin])
  await page.exposeFunction('__reportCspViolation', (entry: string) => watch.violations.push(entry))
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = (window as unknown as { __reportCspViolation: (entry: string) => void }).__reportCspViolation
      void report(`${event.effectiveDirective} blocked ${event.blockedURI || 'inline'} (${event.sourceFile}:${event.lineNumber})`)
    })
  })
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) watch.violations.push(message.text())
    // Nuxt Icon's "failed to load icon" / "timed out" warnings: a name outside the bundle.
    if (message.text().startsWith('[Icon]')) watch.iconWarnings.push(message.text())
  })
  page.on('request', (request) => {
    const url = request.url()
    if (url.startsWith('data:') || url.startsWith('blob:')) return
    if (!allowedOrigins.has(new URL(url).origin)) watch.foreignRequests.push(url)
  })
  return watch
}

// Production uses icon provider 'none': an icon name missing from the client bundle makes no
// request (the foreign-request check cannot see it) and renders an empty <span class="iconify">
// that never receives its mask or background image. Every rendered icon must have one.
// `requireIcons` guards against a vacuous pass where a page is known to show icons (the
// signed-in shell always does; an email-only sign-in page may show none).
async function expectIconsRendered(page: Page, where: string, { requireIcons = true } = {}) {
  const icons = page.locator('span.iconify')
  if (requireIcons) await expect(icons.filter({ visible: true }).first(), `${where} renders icons`).toBeVisible()
  await expect.poll(() => icons.evaluateAll(spans => spans
    .filter((span) => {
      const style = getComputedStyle(span)
      return [style.maskImage, style.webkitMaskImage, style.backgroundImage].every(image => !image || image === 'none')
    })
    .map(span => span.className)), { message: `${where}: icons missing from the client bundle render blank` }).toEqual([])
}

test.describe('static build', () => {
  test('sign-in boots under the shipped headers with no CSP violation', async ({ page, baseURL }) => {
    const watch = await watchPage(page, baseURL!)
    const response = await page.goto('/auth/login')
    expect(response?.status()).toBe(200)

    const headers = response!.headers()
    const csp = headers['content-security-policy'] ?? ''
    const scriptSrc = csp.split(';').map(part => part.trim()).find(part => part.startsWith('script-src')) ?? ''
    expect(scriptSrc).toContain('\'self\'')
    expect(scriptSrc).toMatch(/'sha256-[A-Za-z0-9+/]+=*'/)
    expect(scriptSrc).not.toContain('unsafe-inline')
    expect(csp).toContain(`connect-src 'self' ${new URL(apiBaseUrl).origin}`)
    expect(headers['x-robots-tag']).toBe('noindex, nofollow')
    expect(headers['cross-origin-opener-policy']).toBe('same-origin')
    expect(headers['strict-transport-security']).toContain('max-age=')

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await openEmailForm(page)
    await expect(page.getByLabel('Email')).toBeVisible()
    await expectIconsRendered(page, '/auth/login', { requireIcons: false })
    expect(watch.violations).toEqual([])
    expect(watch.foreignRequests).toEqual([])
    expect(watch.iconWarnings).toEqual([])
  })

  test.describe('signed in', () => {
    // The setup project's admin session (signed in through this same static build).
    test.use({ storageState: personaState('admin') })

    test('every workspace loads without CSP violations, third-party requests or blank icons', async ({ page, baseURL }) => {
      const watch = await watchPage(page, baseURL!)
      // Hard loads (not client navigations): each one re-runs the inline boot scripts under
      // the CSP, calls the API under the pinned connect-src and renders a different set of icons.
      for (const path of ['/app/dashboard', '/app/users', '/app/roles', '/app/permissions', '/app/api-keys', '/app/settings', '/app/account']) {
        const response = await page.goto(path)
        expect(response?.status(), path).toBe(200)
        await page.waitForLoadState('networkidle')
        await expect(page, `${path} stays signed in`).toHaveURL(new RegExp(`${path}$`))
        await expectIconsRendered(page, path)
      }
      expect(watch.violations).toEqual([])
      expect(watch.foreignRequests).toEqual([])
      expect(watch.iconWarnings).toEqual([])
    })

    test('the shell\'s user menu and command palette render their icons under the CSP', async ({ page, baseURL }) => {
      const watch = await watchPage(page, baseURL!)
      await page.goto('/app/dashboard')
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

      // User menu, with the Appearance submenu open.
      const menu = await openUserMenu(page)
      await menu.getByRole('menuitem', { name: 'Appearance' }).press('ArrowRight')
      await expect(page.getByRole('menuitemcheckbox', { name: 'Light' })).toBeVisible()
      await expectIconsRendered(page, 'user menu')
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')

      // Command palette with server results (section, record, theme and action icons).
      await page.getByRole('button', { name: /^Search/ }).click()
      await expect(commandPalette(page)).toBeVisible()
      await page.keyboard.type('ad')
      await expect(commandPalette(page).getByRole('option').filter({ hasText: '@' }).first()).toBeVisible()
      await expectIconsRendered(page, 'command palette')
      expect(watch.violations).toEqual([])
      expect(watch.foreignRequests).toEqual([])
      expect(watch.iconWarnings).toEqual([])
    })
  })

  test('a deployment without app-config.json shows the configuration error, not a blank page', async ({ page, baseURL }) => {
    const watch = await watchPage(page, baseURL!)
    await page.route('**/app-config.json', route => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found\n' }))
    await page.goto('/auth/login')
    await expect(page.getByRole('heading', { name: 'Configuration error' })).toBeVisible()
    await expect(page.getByText('apiBaseUrl: apiBaseUrl is required.')).toBeVisible()
    expect(watch.violations).toEqual([])
  })

  test('the production build refuses a plain-http remote API', async ({ page, baseURL }) => {
    await watchPage(page, baseURL!)
    await page.route('**/app-config.json', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ apiBaseUrl: 'http://auth.example.com', authApiPrefix: '/v1' })
    }))
    await page.goto('/auth/login')
    await expect(page.getByRole('heading', { name: 'Configuration error' })).toBeVisible()
    await expect(page.getByText(/apiBaseUrl must use https:\/\//)).toBeVisible()
  })

  test('serves assets with the Workers semantics the deployment relies on', async ({ request }) => {
    // Prerendered routes are served directly, without a trailing-slash redirect.
    const users = await request.get('/app/users', { maxRedirects: 0 })
    expect(users.status()).toBe(200)
    expect(users.headers()['content-type']).toContain('text/html')
    const slashed = await request.get('/app/users/', { maxRedirects: 0 })
    expect(slashed.status()).toBe(307)
    expect(slashed.headers().location).toBe('/app/users')

    // Content-hashed chunks are immutable; build manifests always revalidate.
    const html = await (await request.get('/')).text()
    const chunk = html.match(/\/_nuxt\/[\w-]+\.js/)?.[0]
    expect(chunk).toBeTruthy()
    const chunkResponse = await request.get(chunk!)
    expect(chunkResponse.status()).toBe(200)
    expect(chunkResponse.headers()['cache-control']).toBe('public, max-age=31536000, immutable')
    const manifest = await request.get('/_nuxt/builds/latest.json')
    expect(manifest.status()).toBe(200)
    expect(manifest.headers()['cache-control']).toBe('no-cache')

    // Misses that are not page navigations get a real 404, never the SPA shell: a stale
    // chunk or build manifest must look missing to Nuxt's newer-deployment check.
    for (const path of ['/_nuxt/does-not-exist.js', '/_nuxt/builds/meta/does-not-exist.json', '/200.html', '/404.html', '/app-config.template.json', '/_headers']) {
      const miss = await request.get(path, { maxRedirects: 0 })
      expect(miss.status(), path).toBe(404)
      expect(miss.headers()['content-type'], path).not.toContain('text/html')
    }

    // Browser navigations to client-side routes still get the SPA shell.
    const deepLink = await request.get('/app/users/00000000-0000-0000-0000-000000000000', {
      headers: { 'sec-fetch-mode': 'navigate', 'accept': 'text/html' },
      maxRedirects: 0
    })
    expect(deepLink.status()).toBe(200)
    expect(deepLink.headers()['content-type']).toContain('text/html')

    const robots = await request.get('/robots.txt')
    expect(robots.status()).toBe(200)
    expect(await robots.text()).toContain('Disallow: /')
  })
})
