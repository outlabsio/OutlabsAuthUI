// The shipped-JavaScript budget (PRODUCTION.md section 6). `bun run release:check` (and
// `bun run check:bundle` after `bun run generate`) measures every .js file the static build ships
// under .output/public/_nuxt and fails when their raw size grows past bundle-budget.json's
// baseline by more than its allowance. Raising the baseline is a reviewed change to that file.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

export const BUDGET_FILE = 'bundle-budget.json'
export const BUILD_ASSETS_DIR = '.output/public/_nuxt'

/** Count, raw bytes and gzip bytes (summed per file) of every .js file under `dir`. */
export function measureJavaScript(dir) {
  let files = 0
  let rawBytes = 0
  let gzipBytes = 0
  for (const entry of readdirSync(dir, { recursive: true })) {
    const file = path.join(dir, String(entry))
    if (!file.endsWith('.js') || !statSync(file).isFile()) continue
    const bytes = readFileSync(file)
    files += 1
    rawBytes += bytes.length
    gzipBytes += gzipSync(bytes).length
  }
  return { files, rawBytes, gzipBytes }
}

/** The budget from bundle-budget.json's parsed content; throws on a malformed file. */
export function parseBudget(input) {
  const javascript = input?.javascript
  if (!Number.isInteger(javascript?.baselineBytes) || javascript.baselineBytes <= 0) {
    throw new Error(`${BUDGET_FILE}: javascript.baselineBytes must be a positive integer`)
  }
  if (typeof javascript.allowedGrowth !== 'number' || !(javascript.allowedGrowth >= 0 && javascript.allowedGrowth <= 1)) {
    throw new Error(`${BUDGET_FILE}: javascript.allowedGrowth must be a number from 0 to 1`)
  }
  return { baselineBytes: javascript.baselineBytes, allowedGrowth: javascript.allowedGrowth }
}

/** Whether a measurement is within the budget, the byte limit and the growth over the baseline. */
export function checkBundleBudget(measured, budget) {
  const limitBytes = Math.floor(budget.baselineBytes * (1 + budget.allowedGrowth))
  return {
    ok: measured.files > 0 && measured.rawBytes <= limitBytes,
    limitBytes,
    growth: measured.rawBytes / budget.baselineBytes - 1
  }
}

const megabytes = bytes => `${(bytes / 1_000_000).toFixed(2)} MB`
const kilobytes = bytes => `${Math.round(bytes / 1000)} KB`

/** One line for the release summary and the CLI. */
export function describeBundle(measured, budget, result) {
  const sign = result.growth >= 0 ? '+' : ''
  return `${megabytes(measured.rawBytes)} JavaScript in ${measured.files} files (${sign}${(result.growth * 100).toFixed(1)}% on the ${megabytes(budget.baselineBytes)} baseline, limit ${megabytes(result.limitBytes)}; about ${kilobytes(measured.gzipBytes)} gzip)`
}
