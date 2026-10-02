import { describe, expect, it } from 'vitest'
import {
  checkBackendConfig,
  checkReleaseGate,
  e2eCounts,
  e2eEnvironment,
  e2ePassed,
  GATE_KIND,
  GATE_VERSION,
  normalizeBaseUrl,
  parseBrowsers,
  REQUIRED_STEPS,
  resolveReseedCommand
} from '../../scripts/lib/release-gate.mjs'

// The release gate: `bun run release:check` writes .release/gate.json and the deploy
// (scripts/deploy-with-env.sh → deploy-preflight.mjs --require-release-gate) accepts HEAD only
// with a passing, clean, recent record for that exact commit on both presets. The preflight's
// own handling of git and the record file is in deploy-preflight.test.ts.

const SHA = 'a'.repeat(40)
const OTHER_SHA = 'b'.repeat(40)
const NOW = new Date('2026-10-02T12:00:00Z')

function gateRecord(overrides: Record<string, unknown> = {}) {
  return {
    kind: GATE_KIND,
    version: GATE_VERSION,
    head_sha: SHA,
    clean: true,
    uncommitted: [],
    passed: true,
    failure: null,
    started_at: '2026-10-02T10:00:00.000Z',
    finished_at: '2026-10-02T10:30:00.000Z',
    tooling: { node: 'v22.23.1', bun: '1.3.3', playwright: '1.62.1' },
    options: { auth_api_prefix: '/v1', port: 3000, browsers: ['chromium'], reseed: { enterprise: true, simple: true }, allow_dirty: false },
    backends: {
      enterprise: { url: 'http://localhost:8004', preset: 'EnterpriseRBAC', library_version: '0.1.0a34', api_contract_version: 'outlabs-auth.api/v1' },
      simple: { url: 'http://localhost:8003', preset: 'SimpleRBAC', library_version: '0.1.0a34', api_contract_version: 'outlabs-auth.api/v1' }
    },
    steps: REQUIRED_STEPS.map(name => ({ name, ok: true, duration_ms: 1000 })),
    e2e: {
      enterprise: { ok: true, browsers: ['chromium'], passed: 506, failed: 0, flaky: 0, skipped: 10 },
      simple: { ok: true, browsers: ['chromium'], passed: 327, failed: 0, flaky: 0, skipped: 189 }
    },
    ...overrides
  }
}

const check = (record: unknown, options: Partial<{ headSha: string, now: Date, maxAgeDays: number }> = {}) =>
  checkReleaseGate(record, { headSha: SHA, now: NOW, ...options })

function problems(result: ReturnType<typeof checkReleaseGate>) {
  return result.ok ? [] : result.problems
}

describe('checkReleaseGate', () => {
  it('accepts a clean, passing, recent record for HEAD on both presets, as JSON text too', () => {
    const result = check(gateRecord())
    expect(result.ok).toBe(true)
    expect(result.ok && result.summary).toBe('release check passed at aaaaaaaaaaaa, finished 2026-10-02T10:30:00.000Z '
      + '(EnterpriseRBAC 0.1.0a34: 506 passed, 10 skipped; SimpleRBAC 0.1.0a34: 327 passed, 189 skipped)')
    expect(check(JSON.stringify(gateRecord())).ok).toBe(true)
  })

  it('rejects a record for another commit', () => {
    expect(problems(check(gateRecord(), { headSha: OTHER_SHA }))).toEqual([
      'the release check ran at aaaaaaaaaaaa, but HEAD is bbbbbbbbbbbb; run `bun run release:check` at HEAD'
    ])
  })

  it('rejects a dirty run, even one that passed', () => {
    expect(problems(check(gateRecord({ clean: false, uncommitted: [' M app/app.vue'] })))).toEqual([
      'the release check ran on uncommitted changes (--allow-dirty); such a record never deploys'
    ])
  })

  it('rejects a failed run and names its failure', () => {
    const failed = gateRecord({
      passed: false,
      failure: 'SimpleRBAC E2E: 320 passed, 1 failed, 0 flaky (exit 1)',
      steps: REQUIRED_STEPS.map(name => ({ name, ok: name !== 'e2e:simple', duration_ms: 1 })),
      e2e: { ...gateRecord().e2e, simple: { ok: false, browsers: ['chromium'], passed: 320, failed: 1, flaky: 0, skipped: 189 } }
    })
    expect(problems(check(failed))).toEqual([
      'the release check failed: SimpleRBAC E2E: 320 passed, 1 failed, 0 flaky (exit 1)',
      'step e2e:simple failed',
      'the SimpleRBAC E2E run did not pass (320 passed, 1 failed, 0 flaky)'
    ])
  })

  it('rejects a record missing a preset: both presets gate a release', () => {
    const { simple: _simple, ...enterpriseOnly } = gateRecord().e2e
    expect(problems(check(gateRecord({ e2e: enterpriseOnly })))).toEqual(['no SimpleRBAC result: both presets gate a release'])
    expect(problems(check(gateRecord({ steps: gateRecord().steps.filter(step => step.name !== 'e2e:simple') })))).toEqual(['step e2e:simple did not run'])
    const swapped = gateRecord({ backends: { ...gateRecord().backends, simple: { ...gateRecord().backends.simple, preset: 'EnterpriseRBAC' } } })
    expect(problems(check(swapped))).toEqual(['the simple backend reported "EnterpriseRBAC", not SimpleRBAC'])
  })

  it('rejects a stale record, with a configurable limit', () => {
    const old = gateRecord({ finished_at: '2026-09-24T12:00:00.000Z' })
    expect(problems(check(old))).toEqual(['the release check finished 8.0 days ago, past the 7-day limit; run it again'])
    expect(check(old, { maxAgeDays: 10 }).ok).toBe(true)
    expect(problems(check(gateRecord(), { maxAgeDays: 1 / 24 }))).toEqual(['the release check finished 1.5 hours ago, past the 0.041666666666666664-day limit; run it again'])
    expect(problems(check(gateRecord({ finished_at: '2026-10-02T11:50:00.000Z' }), { maxAgeDays: 0.005 })))
      .toEqual(['the release check finished 10 minutes ago, past the 0.005-day limit; run it again'])
    expect(problems(check(gateRecord(), { maxAgeDays: 0 }))).toEqual(['the maximum record age must be a positive number of days (got 0)'])
  })

  it('rejects malformed records', () => {
    const malformed = (detail: string) => [`the release record is malformed (${detail}); run \`bun run release:check\` again`]
    expect(problems(check('{ not json'))).toEqual(['the release record is not valid JSON; run `bun run release:check` again'])
    expect(problems(check([]))).toEqual(malformed('not a JSON object'))
    expect(problems(check(gateRecord({ kind: 'ci-run' })))).toEqual(malformed(`not a ${GATE_KIND} v1 record`))
    expect(problems(check(gateRecord({ version: 2 })))).toEqual(malformed(`not a ${GATE_KIND} v1 record`))
    expect(problems(check(gateRecord({ head_sha: 'aaaaaaa' })))).toEqual(malformed('head_sha is not a commit id'))
    expect(problems(check(gateRecord({ passed: 'yes' })))).toEqual(malformed('clean and passed must be booleans'))
    expect(problems(check(gateRecord({ finished_at: 'yesterday' })))).toEqual(malformed('finished_at is not a timestamp'))
    expect(problems(check(gateRecord({ finished_at: '2026-10-03T12:00:00.000Z' })))).toEqual(malformed('finished_at is in the future'))
    expect(problems(check(gateRecord({ steps: 'all green' })))).toEqual(malformed('steps is not a list of { name, ok }'))
    expect(problems(check(gateRecord({ e2e: null })))).toEqual(malformed('backends or e2e is missing'))
    const badCounts = gateRecord({ e2e: { ...gateRecord().e2e, enterprise: { ok: true, browsers: ['chromium'], passed: '506', failed: 0, flaky: 0, skipped: 10 } } })
    expect(problems(check(badCounts))).toEqual(['the EnterpriseRBAC E2E counts are malformed'])
  })

  it('does not trust a passed flag that its own counts contradict', () => {
    const flaky = gateRecord({ e2e: { ...gateRecord().e2e, enterprise: { ok: true, browsers: ['chromium'], passed: 505, failed: 0, flaky: 1, skipped: 10 } } })
    expect(problems(check(flaky))).toEqual(['the EnterpriseRBAC E2E run did not pass (505 passed, 0 failed, 1 flaky)'])
    const empty = gateRecord({ e2e: { ...gateRecord().e2e, simple: { ok: true, browsers: ['chromium'], passed: 0, failed: 0, flaky: 0, skipped: 516 } } })
    expect(problems(check(empty))).toEqual(['the SimpleRBAC E2E run did not pass (0 passed, 0 failed, 0 flaky)'])
    const contract = gateRecord({ backends: { ...gateRecord().backends, enterprise: { ...gateRecord().backends.enterprise, api_contract_version: 'outlabs-auth.api/v2' } } })
    expect(problems(check(contract))).toEqual(['the EnterpriseRBAC backend\'s api_contract_version is not outlabs-auth.api/v1'])
  })
})

describe('release check helpers', () => {
  it('parses --browsers into the optional Playwright projects', () => {
    expect(parseBrowsers('')).toEqual({ browsers: [], errors: [] })
    expect(parseBrowsers(' webkit, firefox ,mobile-chrome,firefox')).toEqual({ browsers: ['firefox', 'webkit', 'mobile-chrome'], errors: [] })
    expect(parseBrowsers('chromium,safari').errors).toEqual([
      'unknown browser "chromium" (choose from firefox, webkit, mobile-chrome; Chromium always runs)',
      'unknown browser "safari" (choose from firefox, webkit, mobile-chrome; Chromium always runs)'
    ])
  })

  it('normalizes backend base URLs', () => {
    expect(normalizeBaseUrl(' http://localhost:8004/ ')).toEqual({ url: 'http://localhost:8004' })
    expect(normalizeBaseUrl(undefined)).toEqual({ error: 'is not set' })
    expect(normalizeBaseUrl('localhost:8004')).toEqual({ error: '"localhost:8004" is not an http(s) URL' })
    expect(normalizeBaseUrl('not a url')).toEqual({ error: '"not a url" is not a URL' })
    expect(normalizeBaseUrl('http://localhost:8004/?x=1')).toEqual({ error: '"http://localhost:8004/?x=1" must not carry a query or fragment' })
  })

  it('checks a backend\'s /auth/config against the preset it gates', () => {
    const enterprise = { preset: 'EnterpriseRBAC', library_version: '0.1.0a34', api_contract_version: 'outlabs-auth.api/v1' }
    expect(checkBackendConfig(enterprise, 'EnterpriseRBAC')).toEqual({ ok: true, library_version: '0.1.0a34', api_contract_version: 'outlabs-auth.api/v1' })
    expect(checkBackendConfig(enterprise, 'SimpleRBAC')).toEqual({ ok: false, problems: ['reports preset "EnterpriseRBAC", expected SimpleRBAC'] })
    expect(checkBackendConfig({ preset: 'SimpleRBAC' }, 'SimpleRBAC')).toEqual({ ok: false, problems: ['reports no library_version', 'reports no api_contract_version'] })
    expect(checkBackendConfig({ ...enterprise, api_contract_version: 'outlabs-auth.api/v2' }, 'EnterpriseRBAC'))
      .toEqual({ ok: false, problems: ['reports api_contract_version outlabs-auth.api/v2; this console speaks outlabs-auth.api/v1'] })
    expect(checkBackendConfig('<html>', 'EnterpriseRBAC')).toEqual({ ok: false, problems: ['/auth/config did not answer a JSON object'] })
  })

  it('takes a preset\'s own reseed command over the shared one', () => {
    expect(resolveReseedCommand({}, 'enterprise')).toBeNull()
    expect(resolveReseedCommand({ RELEASE_RESEED_CMD: ' ./reseed-both ' }, 'simple')).toBe('./reseed-both')
    expect(resolveReseedCommand({ RELEASE_RESEED_CMD: './both', RELEASE_SIMPLE_RESEED_CMD: './simple' }, 'simple')).toBe('./simple')
    expect(resolveReseedCommand({ RELEASE_RESEED_CMD: './both', RELEASE_SIMPLE_RESEED_CMD: './simple' }, 'enterprise')).toBe('./both')
  })

  it('runs Playwright in release mode with only its own E2E settings', () => {
    const { env, dropped } = e2eEnvironment({
      baseEnv: { PATH: '/bin', HOME: '/home/x', E2E_PERSONAS: 'admin', E2E_ERROR_GUARD: 'report', E2E_REUSE_SERVER: '1', E2E_RESEED_CMD: './other', E2E_BACKEND_TIMEOUT_MS: '60000', UNSET: undefined },
      apiBaseUrl: 'http://localhost:8003',
      authApiPrefix: '/v1',
      port: 3001,
      browsers: ['firefox', 'mobile-chrome'],
      reseedCmd: './reseed',
      reportDir: '.release/e2e-simple'
    })
    expect(dropped).toEqual(['E2E_ERROR_GUARD', 'E2E_PERSONAS', 'E2E_RESEED_CMD', 'E2E_REUSE_SERVER'])
    expect(env).toEqual({
      PATH: '/bin',
      HOME: '/home/x',
      E2E_BACKEND_TIMEOUT_MS: '60000',
      E2E_RELEASE: '1',
      E2E_TARGET: 'static',
      E2E_ALLOW_DESTRUCTIVE_CLEANUP: '1',
      E2E_API_BASE_URL: 'http://localhost:8003',
      E2E_AUTH_API_PREFIX: '/v1',
      E2E_PORT: '3001',
      E2E_REPORT_DIR: '.release/e2e-simple',
      E2E_BROWSERS: 'firefox,mobile-chrome',
      E2E_RESEED_CMD: './reseed'
    })
    const plain = e2eEnvironment({ baseEnv: {}, apiBaseUrl: 'http://x', authApiPrefix: '/v1', port: 3000, browsers: [], reseedCmd: null, reportDir: 'r' }).env
    expect(plain).not.toHaveProperty('E2E_BROWSERS')
    expect(plain).not.toHaveProperty('E2E_RESEED_CMD')
  })

  it('counts a Playwright JSON report and decides whether it passes', () => {
    const report = { stats: { expected: 506, unexpected: 0, flaky: 0, skipped: 10, duration: 1 }, errors: [] }
    const counts = e2eCounts(report)
    expect(counts).toEqual({ passed: 506, failed: 0, flaky: 0, skipped: 10, errors: 0 })
    expect(e2ePassed(counts, 0)).toBe(true)
    expect(e2ePassed(counts, 1)).toBe(false)
    expect(e2ePassed(e2eCounts({ ...report, stats: { ...report.stats, flaky: 1 } }), 0)).toBe(false)
    expect(e2ePassed(e2eCounts({ stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 0 }, errors: [{ message: 'globalSetup failed' }] }), 1)).toBe(false)
    expect(e2eCounts({})).toBeNull()
    expect(e2eCounts({ stats: { expected: -1, unexpected: 0, flaky: 0, skipped: 0 } })).toBeNull()
    expect(e2ePassed(null, 0)).toBe(false)
  })
})
