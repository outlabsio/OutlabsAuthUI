#!/usr/bin/env node
// Wire types for the outlabs-auth API, generated from the checked-in OpenAPI snapshot.
//
//   node scripts/gen-api-types.mjs            regenerate app/types/api.gen.ts from the snapshot
//   node scripts/gen-api-types.mjs --check    exit 1 when app/types/api.gen.ts is out of date
//   node scripts/gen-api-types.mjs --refresh --version <x.y.z> \
//        --spec EnterpriseRBAC=<openapi.json path or URL> --spec SimpleRBAC=<...> [--prefix /v1]
//                                            rebuild the snapshot from each example backend's
//                                            /openapi.json, then regenerate the types
//
// The snapshot (openapi/outlabs-auth.openapi.json) is the contract the console targets: a
// library release that changes a route or schema shows up as a diff here and in the generated
// types, and the unit contract test (test/unit/api-contract.test.ts) fails when the client
// calls a route the snapshot does not have.

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { buildSnapshot, renderApiTypes } from './lib/openapi-snapshot.mjs'

const root = path.resolve(import.meta.dirname, '..')
const SNAPSHOT_PATH = path.join(root, 'openapi/outlabs-auth.openapi.json')
const TYPES_PATH = path.join(root, 'app/types/api.gen.ts')

const { values } = parseArgs({
  options: {
    check: { type: 'boolean', default: false },
    refresh: { type: 'boolean', default: false },
    version: { type: 'string' },
    prefix: { type: 'string', default: '/v1' },
    spec: { type: 'string', multiple: true, default: [] }
  }
})

async function loadSpec(source) {
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source)
    if (!response.ok) throw new Error(`${source} answered HTTP ${response.status}`)
    return response.json()
  }
  return JSON.parse(await readFile(path.resolve(source), 'utf8'))
}

if (values.refresh) {
  if (!values.version) throw new Error('--refresh needs --version (the outlabs-auth release the specs come from)')
  if (!values.spec.length) throw new Error('--refresh needs at least one --spec <Preset>=<path or URL>')
  const sources = []
  for (const entry of values.spec) {
    const [preset, source] = entry.includes('=') ? [entry.slice(0, entry.indexOf('=')), entry.slice(entry.indexOf('=') + 1)] : ['default', entry]
    sources.push({ preset, spec: await loadSpec(source) })
  }
  const { snapshot, conflicts } = buildSnapshot(sources, {
    prefix: values.prefix,
    version: values.version,
    source: `example apps: ${sources.map(s => s.preset).join(', ')}`
  })
  if (conflicts.length) console.warn(`[gen-api-types] presets disagree on ${conflicts.length} definition(s); kept the first: ${conflicts.join(', ')}`)
  await writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`)
  console.log(`[gen-api-types] snapshot: ${Object.keys(snapshot.paths).length} paths, ${Object.keys(snapshot.components.schemas).length} schemas -> ${path.relative(root, SNAPSHOT_PATH)}`)
}

const snapshot = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8'))
const rendered = await renderApiTypes(snapshot)

if (values.check) {
  const current = await readFile(TYPES_PATH, 'utf8').catch(() => '')
  if (current !== rendered) {
    console.error(`[gen-api-types] ${path.relative(root, TYPES_PATH)} is out of date; run \`bun run gen:api-types\``)
    process.exit(1)
  }
  console.log('[gen-api-types] generated types are up to date')
} else {
  await writeFile(TYPES_PATH, rendered)
  console.log(`[gen-api-types] wrote ${path.relative(root, TYPES_PATH)} (outlabs-auth ${snapshot.info.version})`)
}
