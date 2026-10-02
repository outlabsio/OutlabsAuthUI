#!/usr/bin/env node
// Deploy preflight: stage one deployment's config into the generated artifact and refuse to
// continue when anything about the artifact or the config is wrong.
//
//   node scripts/deploy-preflight.mjs --config <path/to/app-config.json> [options]
//
//   --config <file>        the deployment's app-config.json (required; never committed)
//   --dir <dir>            artifact directory (default .output/public)
//   --local                allow an http://localhost API: local preview and the static E2E
//                          target only, never a deployment
//   --connect-src <origin> extra connect-src origin (repeatable)
//   --img-src <origin>     extra img-src origin (repeatable)
//   --require-release-gate require a clean HEAD that passed `bun run release:check` (the
//                          record in .release/gate.json: same commit, clean tree, passed on
//                          both presets, not older than the maximum age)
//   --release-gate-file <file>          the record to check (default .release/gate.json)
//   --release-gate-max-age-days <days>  maximum age of that record (default 7)
//
// Steps: validate the config with the console's production resolver; verify the artifact
// (inline-script hashes, no excluded files, no build-time config); check the release record
// when asked; pin connect-src to the API origin and img-src to a hosted logo; write
// app-config.json into the artifact.
// Run with Bun or Node >= 22.18 (it imports app/utils/runtime-config.ts).

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { verifyArtifact } from './lib/artifact.mjs'
import { pinDeploymentPolicy, validateDeploymentConfig } from './lib/deployment-config.mjs'
import { headSha, remoteBranchesContaining, uncommittedPaths } from './lib/git-state.mjs'
import { checkReleaseGate, DEFAULT_GATE_FILE, DEFAULT_MAX_AGE_DAYS } from './lib/release-gate.mjs'
import { parseHeadersFile, rewriteCspInHeaders } from './lib/static-site.mjs'

const HELP = `usage: node scripts/deploy-preflight.mjs --config <path/to/app-config.json> [options]

  --config <file>                     the deployment's app-config.json (required; never committed)
  --dir <dir>                         artifact directory (default .output/public)
  --local                             allow an http://localhost API (local preview and the static E2E target only)
  --connect-src <origin>              extra connect-src origin (repeatable)
  --img-src <origin>                  extra img-src origin (repeatable)
  --require-release-gate              require a clean HEAD that passed \`bun run release:check\`
  --release-gate-file <file>          the release record to check (default ${DEFAULT_GATE_FILE})
  --release-gate-max-age-days <days>  maximum age of that record (default ${DEFAULT_MAX_AGE_DAYS})
  -h, --help                          show this help`

let values
try {
  ({ values } = parseArgs({
    options: {
      'config': { type: 'string' },
      'dir': { type: 'string', default: '.output/public' },
      'local': { type: 'boolean', default: false },
      'connect-src': { type: 'string', multiple: true, default: [] },
      'img-src': { type: 'string', multiple: true, default: [] },
      'require-release-gate': { type: 'boolean', default: false },
      'release-gate-file': { type: 'string', default: DEFAULT_GATE_FILE },
      'release-gate-max-age-days': { type: 'string', default: String(DEFAULT_MAX_AGE_DAYS) },
      'help': { type: 'boolean', short: 'h', default: false }
    }
  }))
} catch (error) {
  console.error(`[preflight] ${error.message}`)
  console.error(HELP)
  process.exit(2)
}
if (values.help) {
  console.log(HELP)
  process.exit(0)
}

const failures = []
const log = message => console.log(`[preflight] ${message}`)
function fail(message) {
  failures.push(message)
}
function finish() {
  if (!failures.length) return
  console.error('[preflight] refusing to continue:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

async function checkReleaseRecord() {
  const sha = headSha(process.cwd())
  if (!sha) return fail('--require-release-gate: not inside a git checkout')
  const dirty = uncommittedPaths(process.cwd())
  if (dirty.length) {
    fail(`--require-release-gate: the working tree has ${dirty.length} uncommitted path(s); deploy committed code that passed \`bun run release:check\` only`)
  }
  const maxAgeDays = Number(values['release-gate-max-age-days'])
  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) {
    return fail(`--release-gate-max-age-days ${values['release-gate-max-age-days']} is not a positive number of days`)
  }
  const file = path.resolve(values['release-gate-file'])
  if (!existsSync(file)) {
    return fail(`--require-release-gate: no release record at ${values['release-gate-file']}; run \`bun run release:check --enterprise <url> --simple <url>\` at this commit (README, "Releasing")`)
  }
  const result = checkReleaseGate(await readFile(file, 'utf8'), { headSha: sha, now: new Date(), maxAgeDays })
  if (!result.ok) {
    for (const problem of result.problems) fail(`--require-release-gate: ${problem}`)
    return
  }
  // The record is fine, but a dirty tree is not what it verified: say nothing that reads as a pass.
  if (dirty.length) return
  if (!remoteBranchesContaining(sha, process.cwd()).length) {
    console.warn(`[preflight] warning: ${sha.slice(0, 12)} is on no remote branch; push it so the deployed commit can be found again`)
  }
  log(result.summary)
}

const dir = path.resolve(values.dir)

// 1. Config.
if (!values.config) {
  fail('--config <path/to/app-config.json> is required')
  finish()
}
const configPath = path.resolve(values.config)
if (!existsSync(configPath)) {
  fail(`${configPath} does not exist (start from public/app-config.template.json)`)
  finish()
}
let raw
try {
  raw = JSON.parse(await readFile(configPath, 'utf8'))
} catch (error) {
  fail(`${configPath} is not valid JSON (${error.message})`)
  finish()
}
const { config, errors, warnings } = validateDeploymentConfig(raw, { local: values.local })
for (const error of errors) fail(`app-config.json ${error}`)
for (const warning of warnings) console.warn(`[preflight] warning: ${warning}`)
for (const key of ['authLogoUrl', 'authLogoDarkUrl']) {
  const logo = config?.[key]
  if (logo && logo.startsWith('/') && !existsSync(path.join(dir, logo))) {
    console.warn(`[preflight] warning: ${key} ${logo} is not in the artifact; it must be served from this origin`)
  }
}

// 2. Artifact.
for (const problem of await verifyArtifact(dir, { allowAppConfig: true })) fail(problem)

// 3. Release record.
if (values['require-release-gate']) await checkReleaseRecord()

finish()

// 4. Pin the policy and stage the config.
const headersPath = path.join(dir, '_headers')
const { text } = rewriteCspInHeaders(await readFile(headersPath, 'utf8'), policy => pinDeploymentPolicy(policy, {
  config,
  extraConnectSrc: values['connect-src'],
  extraImgSrc: values['img-src']
}))
const parsed = parseHeadersFile(text)
for (const issue of parsed.invalid) fail(`pinned _headers line ${issue.lineNumber}: ${issue.message}`)
finish()

await writeFile(headersPath, text)
await writeFile(path.join(dir, 'app-config.json'), `${JSON.stringify(raw, null, 2)}\n`)

log(`config ${values.config} validated and staged as app-config.json`)
log(`connect-src pinned to ${new URL(config.apiBaseUrl).origin}${values['connect-src'].length ? ` + ${values['connect-src'].join(' ')}` : ''}`)
log(values.local ? 'local mode: loopback API allowed; do not deploy this artifact' : 'ready to deploy')
