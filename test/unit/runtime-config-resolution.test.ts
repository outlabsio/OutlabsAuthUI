import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeConfigInput } from '~/utils/runtime-config'

// resolveRuntimeConfig decides whether a deployment boots at all. E2E only ever runs the dev
// branch against the dev server, so both branches are pinned here, table-driven.
// The module memoizes its first resolution, so every case imports a fresh copy.

type Scenario = {
  file?: RuntimeConfigInput | null
  inline?: RuntimeConfigInput
  env?: RuntimeConfigInput
}

async function resolve({ file = null, inline, env = {} }: Scenario, isProd: boolean) {
  vi.resetModules()
  vi.stubGlobal('fetch', vi.fn(async () => file == null
    ? new Response('not found', { status: 404 })
    : new Response(JSON.stringify(file), { status: 200, headers: { 'content-type': 'application/json' } })))
  vi.stubGlobal('window', inline ? { __OUTLABS_AUTH_UI_CONFIG__: inline } : {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const mod = await import('~/utils/runtime-config')
  const result = await mod.initializeRuntimeConfig(env, { isProd })
  return { result, current: mod.getRuntimeConfig() }
}

describe('initializeRuntimeConfig — production (fails hard)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns an error result when nothing configures the API', async () => {
    const { result } = await resolve({}, true)
    expect(result.status).toBe('error')
    if (result.status !== 'error') return
    expect(result.error.issues.join('\n')).toMatch(/apiBaseUrl/)
    expect(result.error.issues.join('\n')).toMatch(/authApiPrefix/)
  })

  it.each([
    ['a relative apiBaseUrl', { apiBaseUrl: '/api', authApiPrefix: '/v1' }, /apiBaseUrl/],
    ['a prefix without a leading slash', { apiBaseUrl: 'https://api.example.com', authApiPrefix: 'v1' }, /authApiPrefix/],
    ['an over-long frontendProfileKey', { apiBaseUrl: 'https://api.example.com', authApiPrefix: '/v1', frontendProfileKey: 'x'.repeat(65) }, /frontendProfileKey/]
  ])('rejects %s from app-config.json', async (_label, file, issue) => {
    const { result } = await resolve({ file }, true)
    expect(result.status).toBe('error')
    if (result.status !== 'error') return
    expect(result.error.issues.join('\n')).toMatch(issue)
  })

  it('boots from a valid app-config.json and normalizes it', async () => {
    const { result } = await resolve({
      file: { apiBaseUrl: 'https://api.example.com///', authApiPrefix: '/v1', authUi: { signup: 'false', channels: 'sms, carrier-pigeon' } }
    }, true)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.config.apiBaseUrl).toBe('https://api.example.com')
    expect(result.config.authApiPrefix).toBe('/v1')
    expect(result.config.authUi.signup).toBe(false)
    expect(result.config.authUi.channels).toEqual(['sms'])
  })

  it('lets the inline global override the file', async () => {
    const { result } = await resolve({
      file: { apiBaseUrl: 'https://file.example.com', authApiPrefix: '/v1' },
      inline: { apiBaseUrl: 'https://inline.example.com' }
    }, true)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.config.apiBaseUrl).toBe('https://inline.example.com')
  })
})

describe('initializeRuntimeConfig — development (falls back)', () => {
  it('falls back to the localhost defaults when nothing is configured', async () => {
    const { result } = await resolve({}, false)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.config.apiBaseUrl).toMatch(/^http:\/\/localhost:\d+$/)
    expect(result.config.authApiPrefix).toBe('/v1')
  })

  it('keeps built-in defaults when the merged config is invalid', async () => {
    const { result } = await resolve({ file: { apiBaseUrl: 'not a url' } }, false)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.config.apiBaseUrl).toMatch(/^http:\/\/localhost:\d+$/)
  })

  it('env values fill in, the file wins over env, and empty env strings never shadow the file', async () => {
    const { result } = await resolve({
      env: { apiBaseUrl: 'http://env.example.com', authApiPrefix: '', appName: 'From env' },
      file: { apiBaseUrl: 'http://file.example.com', authApiPrefix: '/api' }
    }, false)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.config.apiBaseUrl).toBe('http://file.example.com')
    expect(result.config.authApiPrefix).toBe('/api')
    expect(result.config.appName).toBe('From env')
  })

  it('deep-merges a partial authUi declaration with the defaults', async () => {
    const { result } = await resolve({ file: { authUi: { identifier: 'email-only' } } }, false)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.config.authUi.identifier).toBe('email-only')
    expect(result.config.authUi.signup).toBe(true)
    expect(result.config.authUi.magicLink).toBe(true)
  })

  it('resolves once and memoizes the result', async () => {
    const { current, result } = await resolve({ file: { apiBaseUrl: 'http://file.example.com' } }, false)
    expect(result.status).toBe('ready')
    expect(current.apiBaseUrl).toBe('http://file.example.com')
  })
})
