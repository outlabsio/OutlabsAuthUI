// The release gate: what `bun run release:check` (scripts/release-check.mjs) records in
// .release/gate.json, and what the deploy preflight's --require-release-gate accepts
// (scripts/deploy-preflight.mjs, passed by scripts/deploy-with-env.sh). Pure functions only, so
// test/unit/release-gate.test.ts can pin every accept and reject; the scripts do the I/O.
//
// Importing the .ts module needs a TypeScript-aware runtime: Bun, Vitest, or Node >= 22.18
// (type stripping is on by default there).

import { checkApiContract, SUPPORTED_API_CONTRACT } from '../../app/utils/capabilities.ts'

export const GATE_KIND = 'outlabs-auth-ui.release-gate'
export const GATE_VERSION = 1
export const DEFAULT_GATE_FILE = '.release/gate.json'
export const DEFAULT_MAX_AGE_DAYS = 7

/** Both presets gate a release: the E2E suite adapts to each backend's preset and capabilities. */
export const GATE_PRESETS = [
  { key: 'enterprise', preset: 'EnterpriseRBAC', flag: '--enterprise', urlEnv: 'RELEASE_ENTERPRISE_API_BASE_URL', reseedEnv: 'RELEASE_ENTERPRISE_RESEED_CMD' },
  { key: 'simple', preset: 'SimpleRBAC', flag: '--simple', urlEnv: 'RELEASE_SIMPLE_API_BASE_URL', reseedEnv: 'RELEASE_SIMPLE_RESEED_CMD' }
]

/** Every step a passing record must hold, in run order. */
export const REQUIRED_STEPS = [
  'clean-tree',
  'install',
  'typecheck',
  'typecheck:tests',
  'lint',
  'test:unit',
  'check:api-types',
  'audit',
  'generate',
  'backends',
  ...GATE_PRESETS.map(({ key }) => `e2e:${key}`),
  'tree-unchanged'
]

/** Optional Playwright projects (playwright.config.ts, E2E_BROWSERS). Chromium always runs. */
export const EXTRA_BROWSERS = ['firefox', 'webkit', 'mobile-chrome']

/** Inherited E2E_* variables the release run keeps; every other one is dropped (see e2eEnvironment). */
const KEPT_E2E_VARIABLES = new Set(['E2E_BACKEND_TIMEOUT_MS'])

const SHA = /^[0-9a-f]{40}$/
const HOUR_MS = 60 * 60_000
// A record "finished" this far in the future is a clock problem or an edit, not a run.
const CLOCK_SKEW_MS = 5 * 60_000
const DAY_MS = 24 * HOUR_MS

function formatAge(ms) {
  if (ms >= DAY_MS) return `${(ms / DAY_MS).toFixed(1)} days`
  if (ms >= HOUR_MS) return `${(ms / HOUR_MS).toFixed(1)} hours`
  return `${Math.max(0, Math.round(ms / 60_000))} minutes`
}

/**
 * Parse --browsers / E2E_BROWSERS style input.
 * @param {string | undefined} value  comma list
 * @returns {{ browsers: string[], errors: string[] }}  extra browsers, deduplicated, in EXTRA_BROWSERS order
 */
export function parseBrowsers(value) {
  const names = (value ?? '').split(',').map(name => name.trim()).filter(Boolean)
  const errors = names.filter(name => !EXTRA_BROWSERS.includes(name))
    .map(name => `unknown browser "${name}" (choose from ${EXTRA_BROWSERS.join(', ')}; Chromium always runs)`)
  return { browsers: EXTRA_BROWSERS.filter(name => names.includes(name)), errors }
}

/**
 * A backend base URL as the E2E harness takes it (E2E_API_BASE_URL): http(s), no trailing slash.
 * @param {string | undefined} value
 * @returns {{ url: string } | { error: string }}
 */
export function normalizeBaseUrl(value) {
  const text = (value ?? '').trim()
  if (!text) return { error: 'is not set' }
  let url
  try {
    url = new URL(text)
  } catch {
    return { error: `"${text}" is not a URL` }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { error: `"${text}" is not an http(s) URL` }
  if (url.search || url.hash) return { error: `"${text}" must not carry a query or fragment` }
  return { url: text.replace(/\/+$/, '') }
}

/**
 * Check one backend's GET <url><prefix>/auth/config answer against the preset it must gate.
 * @param {unknown} config  the parsed response body
 * @param {string} expectedPreset  'EnterpriseRBAC' | 'SimpleRBAC'
 * @returns {{ ok: true, library_version: string, api_contract_version: string } | { ok: false, problems: string[] }}
 */
export function checkBackendConfig(config, expectedPreset) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return { ok: false, problems: ['/auth/config did not answer a JSON object'] }
  const problems = []
  if (config.preset !== expectedPreset) problems.push(`reports preset ${JSON.stringify(config.preset ?? null)}, expected ${expectedPreset}`)
  const library = typeof config.library_version === 'string' ? config.library_version.trim() : ''
  if (!library) problems.push('reports no library_version')
  const contract = typeof config.api_contract_version === 'string' ? config.api_contract_version.trim() : ''
  const check = checkApiContract({ api_contract_version: contract })
  if (!contract) problems.push('reports no api_contract_version')
  else if (check.status !== 'supported') problems.push(`reports api_contract_version ${contract}; this console speaks ${SUPPORTED_API_CONTRACT}`)
  return problems.length ? { ok: false, problems } : { ok: true, library_version: library, api_contract_version: contract }
}

/**
 * The reseed command for one preset: its own RELEASE_<PRESET>_RESEED_CMD, else RELEASE_RESEED_CMD.
 * @param {Record<string, string | undefined>} env
 * @param {string} key  'enterprise' | 'simple'
 * @returns {string | null}
 */
export function resolveReseedCommand(env, key) {
  const own = GATE_PRESETS.find(gate => gate.key === key)?.reseedEnv
  return (own && env[own]?.trim()) || env.RELEASE_RESEED_CMD?.trim() || null
}

/**
 * The environment of one preset's Playwright run. Inherited E2E_* settings are dropped (they
 * could restrict personas, relax the error guard, reuse a stale server or point at another
 * backend), except E2E_BACKEND_TIMEOUT_MS; the release settings are then set explicitly.
 * @param {{ baseEnv: Record<string, string | undefined>, apiBaseUrl: string, authApiPrefix: string, port: number, browsers: string[], reseedCmd: string | null, reportDir: string }} options
 * @returns {{ env: Record<string, string>, dropped: string[] }}
 */
export function e2eEnvironment({ baseEnv, apiBaseUrl, authApiPrefix, port, browsers, reseedCmd, reportDir }) {
  /** @type {Record<string, string>} */
  const env = {}
  const dropped = []
  for (const [name, value] of Object.entries(baseEnv)) {
    if (value === undefined) continue
    if (name.startsWith('E2E_') && !KEPT_E2E_VARIABLES.has(name)) {
      dropped.push(name)
      continue
    }
    env[name] = value
  }
  Object.assign(env, {
    E2E_RELEASE: '1',
    E2E_TARGET: 'static',
    E2E_ALLOW_DESTRUCTIVE_CLEANUP: '1',
    E2E_API_BASE_URL: apiBaseUrl,
    E2E_AUTH_API_PREFIX: authApiPrefix,
    E2E_PORT: String(port),
    E2E_REPORT_DIR: reportDir
  })
  if (browsers.length) env.E2E_BROWSERS = browsers.join(',')
  if (reseedCmd) env.E2E_RESEED_CMD = reseedCmd
  return { env, dropped: dropped.sort() }
}

/**
 * Counts from Playwright's JSON reporter (results.json): `stats` plus run-level errors (a failed
 * globalSetup, for example, runs no test at all).
 * @param {unknown} report
 * @returns {{ passed: number, failed: number, flaky: number, skipped: number, errors: number } | null}
 */
export function e2eCounts(report) {
  const stats = report && typeof report === 'object' ? report.stats : null
  if (!stats || typeof stats !== 'object') return null
  const count = value => (Number.isInteger(value) && value >= 0 ? value : null)
  const counts = {
    passed: count(stats.expected),
    failed: count(stats.unexpected),
    flaky: count(stats.flaky),
    skipped: count(stats.skipped),
    errors: Array.isArray(report.errors) ? report.errors.length : 0
  }
  return Object.values(counts).includes(null) ? null : counts
}

/**
 * Whether one preset's E2E result passes the gate: the run exited 0, ran tests, and none failed
 * or passed only on retry.
 * @param {{ passed: number, failed: number, flaky: number, errors?: number } | null} counts
 * @param {number | null} exitCode
 */
export function e2ePassed(counts, exitCode) {
  return exitCode === 0 && counts !== null && counts.passed > 0 && counts.failed === 0 && counts.flaky === 0 && !counts.errors
}

const isCount = value => Number.isInteger(value) && value >= 0

/**
 * Decide whether a release-gate record lets HEAD deploy.
 * @param {unknown} input  the record, as JSON text or parsed
 * @param {{ headSha: string, now: Date, maxAgeDays?: number }} options
 * @returns {{ ok: true, record: any, summary: string } | { ok: false, problems: string[] }}
 */
export function checkReleaseGate(input, { headSha, now, maxAgeDays = DEFAULT_MAX_AGE_DAYS }) {
  let record = input
  if (typeof input === 'string') {
    try {
      record = JSON.parse(input)
    } catch {
      return { ok: false, problems: ['the release record is not valid JSON; run `bun run release:check` again'] }
    }
  }
  const malformed = detail => ({ ok: false, problems: [`the release record is malformed (${detail}); run \`bun run release:check\` again`] })
  if (!record || typeof record !== 'object' || Array.isArray(record)) return malformed('not a JSON object')
  if (record.kind !== GATE_KIND || record.version !== GATE_VERSION) return malformed(`not a ${GATE_KIND} v${GATE_VERSION} record`)
  if (typeof record.head_sha !== 'string' || !SHA.test(record.head_sha)) return malformed('head_sha is not a commit id')
  if (typeof record.clean !== 'boolean' || typeof record.passed !== 'boolean') return malformed('clean and passed must be booleans')
  const finished = typeof record.finished_at === 'string' ? Date.parse(record.finished_at) : Number.NaN
  if (Number.isNaN(finished)) return malformed('finished_at is not a timestamp')
  if (finished - now.getTime() > CLOCK_SKEW_MS) return malformed('finished_at is in the future')
  if (!Array.isArray(record.steps) || !record.steps.every(step => step && typeof step === 'object' && typeof step.name === 'string' && typeof step.ok === 'boolean')) {
    return malformed('steps is not a list of { name, ok }')
  }
  if (!record.backends || typeof record.backends !== 'object' || !record.e2e || typeof record.e2e !== 'object') {
    return malformed('backends or e2e is missing')
  }
  if (!(typeof maxAgeDays === 'number' && Number.isFinite(maxAgeDays) && maxAgeDays > 0)) {
    return { ok: false, problems: [`the maximum record age must be a positive number of days (got ${maxAgeDays})`] }
  }

  const problems = []
  const short = sha => String(sha).slice(0, 12)
  if (record.head_sha !== headSha) {
    problems.push(`the release check ran at ${short(record.head_sha)}, but HEAD is ${short(headSha)}; run \`bun run release:check\` at HEAD`)
  }
  if (record.clean !== true) {
    problems.push('the release check ran on uncommitted changes (--allow-dirty); such a record never deploys')
  }
  if (record.passed !== true) {
    problems.push(`the release check failed${typeof record.failure === 'string' && record.failure ? `: ${record.failure}` : ''}`)
  }
  const ageMs = now.getTime() - finished
  if (ageMs > maxAgeDays * DAY_MS) {
    problems.push(`the release check finished ${formatAge(ageMs)} ago, past the ${maxAgeDays}-day limit; run it again`)
  }

  const steps = new Map(record.steps.map(step => [step.name, step.ok]))
  for (const name of REQUIRED_STEPS) {
    if (!steps.has(name)) problems.push(`step ${name} did not run`)
    else if (steps.get(name) !== true) problems.push(`step ${name} failed`)
  }

  const results = []
  for (const { key, preset } of GATE_PRESETS) {
    const backend = record.backends[key]
    const e2e = record.e2e[key]
    if (!backend || typeof backend !== 'object' || !e2e || typeof e2e !== 'object') {
      problems.push(`no ${preset} result: both presets gate a release`)
      continue
    }
    if (backend.preset !== preset) problems.push(`the ${key} backend reported ${JSON.stringify(backend.preset ?? null)}, not ${preset}`)
    if (typeof backend.library_version !== 'string' || !backend.library_version) problems.push(`the ${preset} backend has no library_version`)
    if (typeof backend.api_contract_version !== 'string' || checkApiContract({ api_contract_version: backend.api_contract_version }).status !== 'supported') {
      problems.push(`the ${preset} backend's api_contract_version is not ${SUPPORTED_API_CONTRACT}`)
    }
    if (![e2e.passed, e2e.failed, e2e.flaky, e2e.skipped].every(isCount)) {
      problems.push(`the ${preset} E2E counts are malformed`)
      continue
    }
    if (e2e.ok !== true || e2e.failed > 0 || e2e.flaky > 0 || e2e.passed === 0) {
      problems.push(`the ${preset} E2E run did not pass (${e2e.passed} passed, ${e2e.failed} failed, ${e2e.flaky} flaky)`)
    }
    results.push(`${preset} ${backend.library_version}: ${e2e.passed} passed, ${e2e.skipped} skipped`)
  }

  if (problems.length) return { ok: false, problems }
  return {
    ok: true,
    record,
    summary: `release check passed at ${short(record.head_sha)}, finished ${record.finished_at} (${results.join('; ')})`
  }
}
