#!/usr/bin/env node
// The release check: every gate a release of the console must pass, run on this machine against
// the two seeded outlabsAuth example backends, recorded in .release/gate.json for the deploy
// (scripts/deploy-with-env.sh runs scripts/deploy-preflight.mjs --require-release-gate).
//
//   bun run release:check --enterprise <url> --simple <url> [options]
//
//   --enterprise <url>   EnterpriseRBAC backend (default RELEASE_ENTERPRISE_API_BASE_URL)
//   --simple <url>       SimpleRBAC backend (default RELEASE_SIMPLE_API_BASE_URL)
//   --auth-prefix <path> prefix both backends mount the auth routes under
//                        (default E2E_AUTH_API_PREFIX, else /v1)
//   --port <n>           port the static build is served on during E2E (default 3000; both
//                        backends' CORS allowlists must accept it)
//   --browsers <list>    also run firefox, webkit and/or mobile-chrome (E2E_BROWSERS)
//   --allow-dirty        run on uncommitted changes: the record is marked dirty and never
//                        satisfies the deploy gate
//
// Reseeding is optional: RELEASE_ENTERPRISE_RESEED_CMD / RELEASE_SIMPLE_RESEED_CMD, or
// RELEASE_RESEED_CMD for both, reaches the E2E harness as E2E_RESEED_CMD and runs before that
// preset's suite. Other inherited E2E_* settings are dropped (scripts/lib/release-gate.mjs).
//
// Steps, in order, stopping at the first failure: a clean tree; bun install --frozen-lockfile;
// typecheck; typecheck:tests; lint; test:unit; check:api-types; audit; generate; both backends
// answer /auth/config with their preset; the whole Playwright suite on the static target per
// preset in release mode (E2E_RELEASE=1: one retry, a flaky test fails, .only fails); HEAD and
// the tree unchanged. The record is written whatever the outcome (passed: false on any failure);
// the exit code is 0 only when everything passed.

import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { headSha, uncommittedPaths } from './lib/git-state.mjs'
import {
  checkBackendConfig,
  DEFAULT_GATE_FILE,
  e2eCounts,
  e2eEnvironment,
  e2ePassed,
  GATE_KIND,
  GATE_PRESETS,
  GATE_VERSION,
  normalizeBaseUrl,
  parseBrowsers,
  resolveReseedCommand
} from './lib/release-gate.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const gateFile = path.join(root, DEFAULT_GATE_FILE)
const releaseDir = path.dirname(gateFile)

const USAGE = 'usage: bun run release:check --enterprise <url> --simple <url> [--auth-prefix /v1] [--port 3000] [--browsers firefox,webkit,mobile-chrome] [--allow-dirty]'

const HELP = `${USAGE}

Runs every release gate on this machine and records the result in ${DEFAULT_GATE_FILE}:
clean tree, frozen install, typecheck, typecheck:tests, lint, test:unit, check:api-types,
audit, generate, a backend preflight, and the full Playwright suite on the static build
against a seeded EnterpriseRBAC and a seeded SimpleRBAC backend. Deploys require a passing
record for the exact commit (scripts/deploy-preflight.mjs --require-release-gate).

  --enterprise <url>  EnterpriseRBAC backend base URL (or RELEASE_ENTERPRISE_API_BASE_URL)
  --simple <url>      SimpleRBAC backend base URL (or RELEASE_SIMPLE_API_BASE_URL)
  --auth-prefix <p>   auth API prefix (default /v1, or E2E_AUTH_API_PREFIX)
  --port <n>          port for the static build under test (default 3000)
  --browsers <list>   extra Playwright projects: firefox, webkit, mobile-chrome
  --allow-dirty       run with uncommitted changes (the record can never satisfy a deploy)
  -h, --help          show this help

Environment: RELEASE_RESEED_CMD (or RELEASE_ENTERPRISE_RESEED_CMD / RELEASE_SIMPLE_RESEED_CMD)
runs before each preset's E2E run to reseed that backend.`

function usageError(message) {
  console.error(`[release] ${message}`)
  console.error(`[release] ${USAGE}`)
  process.exit(2)
}

let values
try {
  ({ values } = parseArgs({
    args: process.argv.slice(2).filter(arg => arg !== '--'),
    options: {
      'enterprise': { type: 'string' },
      'simple': { type: 'string' },
      'auth-prefix': { type: 'string' },
      'port': { type: 'string', default: '3000' },
      'browsers': { type: 'string', default: '' },
      'allow-dirty': { type: 'boolean', default: false },
      'help': { type: 'boolean', short: 'h', default: false }
    }
  }))
} catch (error) {
  usageError(error.message)
}
if (values.help) {
  console.log(HELP)
  process.exit(0)
}

// ── Preconditions (usage errors exit 2 and write no record) ──

const backends = GATE_PRESETS.map((gate) => {
  const result = normalizeBaseUrl(values[gate.key] ?? process.env[gate.urlEnv])
  if ('error' in result) usageError(`the ${gate.preset} backend (${gate.flag} <url> or ${gate.urlEnv}) ${result.error}`)
  return { ...gate, url: result.url, reseedCmd: resolveReseedCommand(process.env, gate.key) }
})
if (backends[0].url === backends[1].url) usageError('--enterprise and --simple name the same backend; each preset needs its own')

const prefixInput = (values['auth-prefix'] ?? process.env.E2E_AUTH_API_PREFIX ?? '/v1').trim()
const authApiPrefix = `/${prefixInput.replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '')

const port = Number(values.port)
if (!Number.isInteger(port) || port < 1 || port > 65535) usageError(`--port ${values.port} is not a port number`)

const { browsers, errors: browserErrors } = parseBrowsers(values.browsers)
if (browserErrors.length) usageError(`--browsers: ${browserErrors.join('; ')}`)

function portInUse(n) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: 'localhost', port: n, timeout: 2_000 })
    const settle = (inUse) => {
      socket.destroy()
      resolve(inUse)
    }
    socket.once('connect', () => settle(true))
    socket.once('timeout', () => settle(false))
    socket.once('error', () => settle(false))
  })
}
if (await portInUse(port)) {
  usageError(`something already answers on http://localhost:${port}; stop it (the release check serves its own fresh build there) or pass another --port`)
}

const sha = headSha(root)
if (!sha) usageError('not inside a git checkout; the record names the commit it verified')

// ── The run ──

const startedAt = new Date()
const record = {
  kind: GATE_KIND,
  version: GATE_VERSION,
  head_sha: sha,
  clean: false,
  uncommitted: [],
  passed: false,
  failure: 'still running, or interrupted',
  started_at: startedAt.toISOString(),
  finished_at: null,
  tooling: { node: process.version, bun: toolVersion('bun', ['--version']), playwright: packageVersion('@playwright/test') },
  options: {
    auth_api_prefix: authApiPrefix,
    port,
    browsers: ['chromium', ...browsers],
    reseed: Object.fromEntries(backends.map(({ key, reseedCmd }) => [key, Boolean(reseedCmd)])),
    allow_dirty: values['allow-dirty']
  },
  backends: {},
  steps: [],
  e2e: {}
}

function toolVersion(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

function packageVersion(name) {
  try {
    return JSON.parse(readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version ?? null
  } catch {
    return null
  }
}

function writeRecord() {
  mkdirSync(releaseDir, { recursive: true })
  const temporary = `${gateFile}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`)
  renameSync(temporary, gateFile)
}

// A previous record must not outlive a run that starts: an interrupted run leaves a failed one.
writeRecord()

const duration = (ms) => {
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  return `${Math.floor(seconds / 60)}m ${String(Math.round(seconds % 60)).padStart(2, '0')}s`
}

let interrupted = false
let child = null
function onSignal(signal) {
  if (interrupted) {
    // Second signal: give up on the child and leave now.
    record.failure = `interrupted (${signal})`
    record.finished_at = new Date().toISOString()
    writeRecord()
    process.exit(130)
  }
  interrupted = true
  console.error(`\n[release] ${signal}: stopping after the current step (send it again to stop now)`)
  child?.kill(signal)
}
process.on('SIGINT', onSignal)
process.on('SIGTERM', onSignal)

function run(command, args, env = process.env) {
  return new Promise((resolve) => {
    child = spawn(command, args, { cwd: root, env, stdio: 'inherit' })
    child.on('error', (error) => {
      console.error(`[release] could not start ${command}: ${error.message}`)
      child = null
      resolve(127)
    })
    child.on('exit', (code, signal) => {
      child = null
      resolve(signal ? 128 : code)
    })
  })
}

const stepNames = [
  'clean-tree', 'install', 'typecheck', 'typecheck:tests', 'lint', 'test:unit', 'check:api-types', 'audit', 'generate',
  'backends', ...backends.map(({ key }) => `e2e:${key}`), 'tree-unchanged'
]
const notes = new Map()
let failure = null

/**
 * Run one step: a header, the body, a footer with its duration. The body returns true, false
 * or a failure message; anything thrown fails the step.
 */
async function step(name, label, body) {
  const index = stepNames.indexOf(name) + 1
  console.log(`\n[release] ==> ${index}/${stepNames.length} ${name}: ${label}`)
  const began = Date.now()
  let ok = false
  try {
    const result = await body()
    ok = result === true
    if (!ok) failure = typeof result === 'string' ? result : `${name} failed`
  } catch (error) {
    failure = `${name}: ${error instanceof Error ? error.message : String(error)}`
  }
  if (interrupted) {
    ok = false
    failure = `interrupted during ${name}`
  }
  const durationMs = Date.now() - began
  record.steps.push({ name, ok, duration_ms: durationMs, ...(notes.has(name) ? { note: notes.get(name) } : {}) })
  console.log(`[release] <== ${name} ${ok ? 'passed' : 'FAILED'} in ${duration(durationMs)}${notes.has(name) ? ` (${notes.get(name)})` : ''}`)
  if (!ok) finish()
}

const command = (cmd, args, env) => async () => (await run(cmd, args, env)) === 0 || `\`${[cmd, ...args].join(' ')}\` failed`

function finish() {
  record.finished_at = new Date().toISOString()
  record.passed = !failure && stepNames.every(name => record.steps.find(s => s.name === name)?.ok === true)
  record.failure = record.passed ? null : (failure ?? 'a step did not run')
  writeRecord()
  printSummary()
  process.exit(record.passed ? 0 : interrupted ? 130 : 1)
}

function printSummary() {
  const total = Date.parse(record.finished_at) - startedAt.getTime()
  const state = record.clean ? 'clean tree' : 'UNCOMMITTED CHANGES: this record never deploys'
  console.log(`\n[release] ${record.passed ? 'PASSED' : 'FAILED'} at ${sha.slice(0, 12)} (${state}) in ${duration(total)}`)
  for (const name of stepNames) {
    const result = record.steps.find(s => s.name === name)
    const outcome = result ? (result.ok ? 'ok' : 'FAILED') : 'not run'
    const counts = name.startsWith('e2e:') && record.e2e[name.slice(4)]
    const detail = counts
      ? `${counts.passed} passed, ${counts.failed} failed, ${counts.flaky} flaky, ${counts.skipped} skipped (${counts.browsers.join(', ')})`
      : result?.note ?? ''
    console.log(`  ${name.padEnd(16)} ${outcome.padEnd(7)} ${(result ? duration(result.duration_ms) : '').padStart(8)}  ${detail}`.trimEnd())
  }
  for (const { key } of backends) {
    const backend = record.backends[key]
    if (backend) console.log(`  ${backend.preset}: outlabs-auth ${backend.library_version}, ${backend.api_contract_version}, ${backend.url}`)
  }
  if (record.failure) console.log(`  failure: ${record.failure}`)
  console.log(`  record: ${path.relative(process.cwd(), gateFile) || gateFile}`)
}

// a. A clean tree: the record certifies the commit, so the commit must be what was tested.
await step('clean-tree', 'no uncommitted changes', () => {
  const dirty = uncommittedPaths(root)
  record.uncommitted = dirty
  record.clean = dirty.length === 0
  if (record.clean) return true
  if (values['allow-dirty']) {
    notes.set('clean-tree', `${dirty.length} uncommitted path(s) allowed by --allow-dirty; the record cannot deploy`)
    console.warn(`[release] WARNING: --allow-dirty with ${dirty.length} uncommitted path(s):\n  ${dirty.join('\n  ')}`)
    return true
  }
  return `the tree has ${dirty.length} uncommitted path(s) (${dirty.slice(0, 5).map(line => line.slice(3)).join(', ')}${dirty.length > 5 ? ', ...' : ''}); commit them, or pass --allow-dirty for a record that cannot deploy`
})

// b. Static gates.
await step('install', 'bun install --frozen-lockfile', command('bun', ['install', '--frozen-lockfile']))
await step('typecheck', 'bun run typecheck', command('bun', ['run', 'typecheck']))
await step('typecheck:tests', 'bun run typecheck:tests', command('bun', ['run', 'typecheck:tests']))
await step('lint', 'bun run lint', command('bun', ['run', 'lint']))
await step('test:unit', 'bun run test:unit', command('bun', ['run', 'test:unit']))
await step('check:api-types', 'bun run check:api-types', command('bun', ['run', 'check:api-types']))
await step('audit', 'bun run audit (reviewed allowlist in package.json)', command('bun', ['run', 'audit']))
await step('generate', 'bun run generate (static build and CSP script hashes)', command('bun', ['run', 'generate']))

// c. Both backends answer, each with its own preset.
await step('backends', `GET <url>${authApiPrefix}/auth/config on both backends`, async () => {
  const problems = []
  for (const backend of backends) {
    const url = `${backend.url}${authApiPrefix}/auth/config`
    let body
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' } })
      if (!response.ok) {
        problems.push(`${backend.preset} at ${url}: HTTP ${response.status}`)
        continue
      }
      body = await response.json()
    } catch (error) {
      problems.push(`${backend.preset} at ${url}: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    const check = checkBackendConfig(body, backend.preset)
    if (!check.ok) {
      problems.push(`${backend.preset} at ${url} ${check.problems.join('; ')}`)
      continue
    }
    record.backends[backend.key] = {
      url: backend.url,
      preset: backend.preset,
      library_version: check.library_version,
      api_contract_version: check.api_contract_version
    }
    console.log(`[release] ${backend.preset}: outlabs-auth ${check.library_version}, ${check.api_contract_version} (${backend.url})`)
  }
  return problems.length ? `backend preflight: ${problems.join(' | ')}` : true
})

// d. The whole suite on the shipped static build, once per preset.
for (const backend of backends) {
  const reportDir = path.join(releaseDir, `e2e-${backend.key}`)
  const label = `bunx playwright test on the static build against ${backend.preset}${browsers.length ? ` (+ ${browsers.join(', ')})` : ''}${backend.reseedCmd ? ', reseeded first' : ''}`
  await step(`e2e:${backend.key}`, label, async () => {
    rmSync(reportDir, { recursive: true, force: true })
    const { env, dropped } = e2eEnvironment({
      baseEnv: process.env,
      apiBaseUrl: backend.url,
      authApiPrefix,
      port,
      browsers,
      reseedCmd: backend.reseedCmd,
      reportDir
    })
    if (dropped.length) console.warn(`[release] ignoring inherited ${dropped.join(', ')} (the release run sets its own E2E settings)`)
    const exitCode = await run('bunx', ['playwright', 'test'], env)
    const reportPath = path.join(reportDir, 'results.json')
    const counts = existsSync(reportPath) ? e2eCounts(JSON.parse(readFileSync(reportPath, 'utf8'))) : null
    record.e2e[backend.key] = {
      ok: e2ePassed(counts, exitCode),
      browsers: ['chromium', ...browsers],
      passed: counts?.passed ?? 0,
      failed: counts?.failed ?? 0,
      flaky: counts?.flaky ?? 0,
      skipped: counts?.skipped ?? 0,
      ...(counts?.errors ? { errors: counts.errors } : {}),
      report: path.relative(root, reportDir)
    }
    if (record.e2e[backend.key].ok) return true
    if (!counts) return `${backend.preset} E2E produced no readable results (exit ${exitCode}); see the output above`
    return `${backend.preset} E2E: ${counts.passed} passed, ${counts.failed} failed, ${counts.flaky} flaky${counts.errors ? `, ${counts.errors} run error(s)` : ''} (exit ${exitCode}); report in ${path.relative(root, reportDir)}/report`
  })
}

// e. Nothing moved underneath the run.
await step('tree-unchanged', 'HEAD and the tree are as they were at the start', () => {
  const now = headSha(root)
  if (now !== sha) return `HEAD moved from ${sha.slice(0, 12)} to ${String(now).slice(0, 12)} during the run`
  if (record.clean) {
    const dirty = uncommittedPaths(root)
    if (dirty.length) return `the run changed tracked files: ${dirty.map(line => line.slice(3)).join(', ')}`
  }
  return true
})

finish()
