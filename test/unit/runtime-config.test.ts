import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isAcceptableProductionApiBaseUrl, resolveProductionRuntimeConfig } from '../../app/utils/runtime-config'

describe('production runtime config', () => {
  it('accepts an https API and normalizes it', () => {
    const ok = resolveProductionRuntimeConfig({ apiBaseUrl: 'https://auth.example.com/', authApiPrefix: '/v1', frontendProfileKey: ' console ' })
    expect(ok.status).toBe('ready')
    if (ok.status !== 'ready') return
    expect(ok.config.apiBaseUrl).toBe('https://auth.example.com')
    expect(ok.config.frontendProfileKey).toBe('console')
    expect(ok.config.appName).toBe('OutlabsAuth UI')
  })

  it('rejects a prefix without a leading slash', () => {
    expect(resolveProductionRuntimeConfig({ apiBaseUrl: 'https://auth.example.com', authApiPrefix: 'v1' }).status).toBe('error')
  })

  it('refuses plain http unless the API is on this machine', () => {
    const remote = resolveProductionRuntimeConfig({ apiBaseUrl: 'http://auth.example.com', authApiPrefix: '/v1' })
    expect(remote.status).toBe('error')
    if (remote.status === 'error') expect(remote.error.issues.join('\n')).toMatch(/apiBaseUrl: apiBaseUrl must use https/)
    for (const local of ['http://localhost:8101', 'http://127.0.0.1:8000', 'http://[::1]:8000', 'http://api.localhost']) {
      expect(isAcceptableProductionApiBaseUrl(local), local).toBe(true)
    }
    expect(isAcceptableProductionApiBaseUrl('ftp://auth.example.com')).toBe(false)
    expect(isAcceptableProductionApiBaseUrl('not a url')).toBe(false)
  })

  it('has no built-in fallback: an empty config is an error, not localhost', () => {
    const result = resolveProductionRuntimeConfig({})
    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.error.issues).toContain('apiBaseUrl: apiBaseUrl is required.')
      expect(result.error.issues).toContain('authApiPrefix: authApiPrefix is required.')
      expect(result.error.message).toContain('/app-config.json')
    }
  })
})

describe('initializeRuntimeConfig', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function serveAppConfig(body: unknown, status = 200) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))
  }

  it('ignores the NUXT_PUBLIC_* env layer in production builds', async () => {
    serveAppConfig({}, 404)
    const { initializeRuntimeConfig } = await import('../../app/utils/runtime-config')
    const result = await initializeRuntimeConfig({ apiBaseUrl: 'http://localhost:8004', authApiPrefix: '/v1' }, { isProd: true })
    expect(result.status).toBe('error')
  })

  it('boots production from the served app-config.json alone', async () => {
    serveAppConfig({ apiBaseUrl: 'https://auth.example.com', authApiPrefix: '/iam' })
    const { initializeRuntimeConfig, getRuntimeConfig } = await import('../../app/utils/runtime-config')
    const result = await initializeRuntimeConfig({ apiBaseUrl: 'http://localhost:8004', authApiPrefix: '/v1' }, { isProd: true })
    expect(result.status).toBe('ready')
    expect(getRuntimeConfig().apiBaseUrl).toBe('https://auth.example.com')
    expect(getRuntimeConfig().authApiPrefix).toBe('/iam')
  })

  it('still layers env under the file in development', async () => {
    serveAppConfig({}, 404)
    const { initializeRuntimeConfig, getRuntimeConfig } = await import('../../app/utils/runtime-config')
    const result = await initializeRuntimeConfig({ apiBaseUrl: 'http://localhost:8101', authApiPrefix: '/v1' }, { isProd: false })
    expect(result.status).toBe('ready')
    expect(getRuntimeConfig().apiBaseUrl).toBe('http://localhost:8101')
  })
})
