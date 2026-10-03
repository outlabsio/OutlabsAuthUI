#!/usr/bin/env node
// `bun run check:bundle`: after `bun run generate`, fail when the shipped JavaScript is over
// bundle-budget.json (scripts/lib/bundle-budget.mjs). `bun run release:check` runs the same check.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BUDGET_FILE,
  BUILD_ASSETS_DIR,
  checkBundleBudget,
  describeBundle,
  measureJavaScript,
  parseBudget
} from './lib/bundle-budget.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const assets = path.join(root, BUILD_ASSETS_DIR)
if (!existsSync(assets)) {
  console.error(`[bundle] ${BUILD_ASSETS_DIR} is missing: run \`bun run generate\` first`)
  process.exit(2)
}

const budget = parseBudget(JSON.parse(readFileSync(path.join(root, BUDGET_FILE), 'utf8')))
const measured = measureJavaScript(assets)
const result = checkBundleBudget(measured, budget)
console.log(`[bundle] ${describeBundle(measured, budget, result)}`)
if (!result.ok) {
  console.error(`[bundle] over budget: trim the bundle, or raise javascript.baselineBytes in ${BUDGET_FILE} as a reviewed change`)
  process.exit(1)
}
